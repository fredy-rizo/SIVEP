import pool from "../config/database.js";
import { publicLeadSchema } from "../validators/index.js";
import { generateInvoiceNumber } from "../utils/helpers.js";
import { generateUniquePickupCode } from "../utils/pickup.js";
import { uploadImage } from "../utils/upload.js";
import { readMultipart } from "../utils/multipart.js";
import { parseEcollectReceipt } from "../utils/ecollectReceiptParser.js";
import { buildExternalSalePlan } from "../utils/externalSaleMatching.js";
import { fetchPublicProducts } from "../services/productCatalog.js";
import {
  getCachedPublicProducts,
  getCatalogVersion,
  setCachedPublicProductsIfCurrent,
} from "../services/productCache.js";
import { applyStockMovement, InventoryError } from "../services/inventoryService.js";
import { publishCatalogUpdate } from "../services/catalogEvents.js";
// El formulario público no tiene sesión: los datos se asocian a la
// organización por defecto (la granja que publica el enlace).
import { resolveDefaultOrganizationId } from "../middleware/plan.js";
import dotenv from "dotenv";

dotenv.config();

const MAX_PROOF_BYTES = 10 * 1024 * 1024; // 10 MB

// Catálogo público con caché en memoria. El TTL es corto y además la entrada se
// invalida en cada cambio de stock (ver `catalogEvents.js`), así que el cliente
// casi siempre recibe la lista vigente sin golpear MySQL en cada visita.
export async function getPublicProducts(request, reply) {
  try {
    const organizationId = await resolveDefaultOrganizationId();
    if (!organizationId) return reply.send({ products: [] });

    const cached = getCachedPublicProducts(organizationId);
    if (cached) {
      return reply.send({
        products: cached,
        catalogVersion: getCatalogVersion(organizationId),
        cached: true,
      });
    }

    // Se captura la versión antes de consultar: si una venta invalida la caché
    // mientras esta lectura está en vuelo, no escribiremos una foto vieja.
    const version = getCatalogVersion(organizationId);
    const products = await fetchPublicProducts(organizationId);
    setCachedPublicProductsIfCurrent(organizationId, products, version);

    // La versión permite al cliente descartar respuestas HTTP que quedaron
    // obsoletas frente a un evento WebSocket más nuevo.
    return reply.send({ products, catalogVersion: version });
  } catch (error) {
    console.error("Error getting public products:", error);
    return reply.code(500).send({ error: "Error interno del servidor" });
  }
}

function fileExtension(filename = "") {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

// ============================================================================
// COMPRA PÚBLICA EN LÍNEA — SOLO COMPROBANTE PDF
// ----------------------------------------------------------------------------
// El cliente ya pagó en la página de la UNAL y sube el PDF de eCollect. Los
// datos del cliente y de la venta salen del PDF. La venta se registra como
// externa y, cuando el producto se puede identificar por nombre o por precio,
// se descuenta el inventario automáticamente.
//
// El pago en EFECTIVO no entra por aquí: va a `cashClaimsController`, donde un
// administrador valida el recibo antes de tocar el stock. Así no existen dos
// caminos que puedan descontar inventario sin revisión.
// ============================================================================

export async function createPublicLead(request, reply) {
  let connection = null;

  try {
    const {
      error: multipartError,
      files,
      fields: rawFields,
    } = await readMultipart(request, { fileFields: ["proof_file"] });
    if (multipartError) {
      return reply.code(400).send({ error: multipartError });
    }
    const proofBuffer = files.proof_file?.buffer || null;
    const proofFilename = files.proof_file?.filename || "";

    const paymentMode = String(rawFields.payment_mode || "").trim();

    const { error } = publicLeadSchema.validate({
      payment_mode: paymentMode,
      accepts_policy: rawFields.accepts_policy,
    });
    if (error) {
      return reply.code(400).send({ error: error.details[0].message });
    }

    if (!proofBuffer) {
      return reply
        .code(400)
        .send({ error: "El comprobante de pago en PDF es obligatorio" });
    }
    if (proofBuffer.length > MAX_PROOF_BYTES) {
      return reply
        .code(400)
        .send({ error: "El comprobante no debe superar 10 MB" });
    }
    if (fileExtension(proofFilename) !== ".pdf") {
      return reply
        .code(400)
        .send({ error: "El comprobante de pago debe ser un PDF" });
    }

    // 1. Leer el PDF. Cualquier dato faltante o un comprobante no APROBADA
    //    se rechaza antes de tocar la base de datos.
    let receipt;
    try {
      receipt = await parseEcollectReceipt(proofBuffer);
    } catch (parseError) {
      return reply.code(400).send({
        error: `No pudimos leer el comprobante: ${parseError.message}`,
      });
    }

    const organizationId = await resolveDefaultOrganizationId();
    if (!organizationId) {
      return reply
        .code(500)
        .send({ error: "No hay una organización activa para registrar la compra" });
    }

    connection = await pool.getConnection();

    // 2. Deduplicación: un comprobante o un código de caja solo se usan una vez.
    const [duplicateTransaction] = await connection.query(
      "SELECT id FROM sales WHERE ecollect_transaction_id = ? LIMIT 1",
      [receipt.transaction_id],
    );
    if (duplicateTransaction.length > 0) {
      return reply.code(409).send({
        error: "Este comprobante ya fue registrado. Revisa tu código de reclamo.",
      });
    }

    // 3. Guardar el PDF como evidencia (Cloudinary o respaldo local).
    const proofImageUrl = await uploadImage(
      proofBuffer,
      proofFilename,
      "sivep/comprobantes",
    );

    await connection.beginTransaction();

    // 4. Buscar o crear el cliente con los datos del PDF.
    let customerId = null;
    const [byDocument] = await connection.query(
      `SELECT id FROM customers
       WHERE document_type = ? AND document_number = ? AND organization_id = ?`,
      [receipt.document_type, receipt.document_number, organizationId],
    );
    if (byDocument.length > 0) {
      customerId = byDocument[0].id;
    } else {
      // Mismo número con otro tipo de documento: se reutiliza el cliente.
      const [byNumber] = await connection.query(
        "SELECT id FROM customers WHERE document_number = ? AND organization_id = ?",
        [receipt.document_number, organizationId],
      );
      if (byNumber.length > 0) customerId = byNumber[0].id;
    }

    if (customerId) {
      await connection.query(
        `UPDATE customers SET
           document_type = ?,
           full_name = ?,
           phone = COALESCE(?, phone),
           email = COALESCE(?, email),
           address = COALESCE(?, address),
           has_payment_proof = TRUE,
           proof_image_url = ?,
           origin = 'formulario_publico',
           last_purchase_at = CASE
             WHEN last_purchase_at IS NULL OR last_purchase_at < ? THEN ?
             ELSE last_purchase_at
           END
         WHERE id = ? AND organization_id = ?`,
        [
          receipt.document_type,
          receipt.full_name,
          receipt.phone,
          receipt.email,
          receipt.address,
          proofImageUrl,
          receipt.paid_at,
          receipt.paid_at,
          customerId,
          organizationId,
        ],
      );
    } else {
      const [result] = await connection.query(
        `INSERT INTO customers
           (organization_id, document_type, document_number, full_name, phone, email,
            address, origin, has_payment_proof, proof_image_url, last_purchase_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'formulario_publico', TRUE, ?, ?)`,
        [
          organizationId,
          receipt.document_type,
          receipt.document_number,
          receipt.full_name,
          receipt.phone,
          receipt.email,
          receipt.address,
          proofImageUrl,
          receipt.paid_at,
        ],
      );
      customerId = result.insertId;
    }

    // 5. Usuario del sistema para registrar la venta (requerido por FK).
    const [sysUsers] = await connection.query(
      `SELECT id FROM users
       WHERE is_active = TRUE AND organization_id = ?
       ORDER BY (role = 'super_admin') DESC, id ASC LIMIT 1`,
      [organizationId],
    );
    if (sysUsers.length === 0) {
      throw {
        statusCode: 500,
        message: "No hay usuarios activos para registrar la venta",
      };
    }
    const createdBy = sysUsers[0].id;

    // 6. Cargar productos para identificar la compra por nombre o por precio.
    //    Se incluyen los que están sin stock: así se reconoce el producto y se
    //    deja una advertencia en lugar de fallar.
    const [products] = await connection.query(
      `SELECT id, name, current_price
       FROM products
       WHERE is_active = TRUE AND organization_id = ?`,
      [organizationId],
    );

    const plan = buildExternalSalePlan(receipt, products);
    const saleItems = plan.items;
    const warnings = [...plan.warnings];

    // 7. Agrupar cantidades por producto. La disponibilidad NO se decide aquí:
    //    se comprueba al descontar, dentro de la transacción y con la fila
    //    bloqueada. Así una compra simultánea no puede sobrevender.
    const stockChanges = new Map();
    for (const item of saleItems) {
      if (!item.product_id) continue;
      const quantity = Number(item.quantity) || 0;
      stockChanges.set(
        item.product_id,
        (stockChanges.get(item.product_id) || 0) + quantity,
      );
    }

    // 8. Crear la venta externa con la fecha y el valor del comprobante.
    const subtotal =
      Math.round(
        saleItems.reduce((sum, item) => sum + Number(item.total || 0), 0) * 100,
      ) / 100;
    const total = Number(receipt.amount);
    const paymentStatus = "pagado";
    const notePrefix = "Compra externa pagada en línea (eCollect).";
    const buildNotes = (list) =>
      [
        `${notePrefix} Comprobante eCollect ${receipt.transaction_id}.`,
        ...list,
      ].join(" ");
    const notes = buildNotes(warnings);

    let invoiceNumber = null;
    let pickupCode = null;
    let saleId = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      invoiceNumber = generateInvoiceNumber();
      pickupCode = await generateUniquePickupCode(connection);
      try {
        const [saleResult] = await connection.query(
          `INSERT INTO sales
             (organization_id, invoice_number, customer_id, sale_date, subtotal, tax, total,
              payment_type, payment_status, payment_mode, cash_receipt_code,
              ecollect_transaction_id, ecollect_amount, ecollect_paid_at, paid_at,
              pickup_code, pickup_status, created_by, notes)
           VALUES (?, ?, ?, ?, ?, 0, ?, 'contado', ?, 'online', NULL, ?, ?, ?, ?, ?, 'pendiente', ?, ?)`,
          [
            organizationId,
            invoiceNumber,
            customerId,
            receipt.paid_at,
            subtotal,
            total,
            paymentStatus,
            receipt.transaction_id,
            receipt.amount,
            receipt.paid_at,
            receipt.paid_at,
            pickupCode,
            createdBy,
            notes,
          ],
        );
        saleId = saleResult.insertId;
        break;
      } catch (err) {
        if (err.code === "ER_DUP_ENTRY" && attempt < 2) continue;
        throw err;
      }
    }

    // 9. Ítems externos: se conserva la descripción del comprobante y se
    //    vincula el producto cuando fue posible identificarlo.
    for (const item of saleItems) {
      await connection.query(
        `INSERT INTO sale_items
           (sale_id, product_id, description, source, quantity, unit_price, total)
         VALUES (?, ?, ?, 'externo', ?, ?, ?)`,
        [
          saleId,
          item.product_id,
          item.description,
          item.quantity,
          item.unit_price,
          item.total,
        ],
      );
    }

    // 10. Descontar inventario de forma atómica. Si un producto no tiene stock
    //     suficiente, la venta externa se registra igual (el cliente ya pagó),
    //     se deja la advertencia en `notes` y se continúa con los demás.
    const appliedChanges = [];
    const stockOrder = [...stockChanges.entries()].sort(
      ([a], [b]) => Number(a) - Number(b),
    );
    for (const [productId, quantity] of stockOrder) {
      try {
        const change = await applyStockMovement(connection, {
          organizationId,
          productId,
          movementType: "salida",
          quantity,
          reason: `Venta externa ${invoiceNumber} (comprobante eCollect)`,
          referenceType: "venta",
          referenceId: saleId,
          createdBy,
        });
        appliedChanges.push(change);
      } catch (error) {
        // Cualquier problema de inventario se registra como advertencia: el
        // cliente ya pagó y la venta externa debe quedar registrada igual.
        if (error instanceof InventoryError) {
          const label = error.productName || `producto ${productId}`;
          warnings.push(
            error.code === "INSUFFICIENT_STOCK"
              ? `Stock insuficiente de ${label}: se requieren ${quantity} y hay ${error.available}. Ajusta el inventario manualmente.`
              : `No se pudo descontar ${label}: ${error.message}. Ajusta el inventario manualmente.`,
          );
          continue;
        }
        throw error;
      }
    }

    // Las advertencias de stock se conocen después de insertar la venta; se
    // actualiza `notes` para que el operador las vea en el panel.
    if (warnings.length > plan.warnings.length) {
      await connection.query(
        "UPDATE sales SET notes = ? WHERE id = ? AND organization_id = ?",
        [buildNotes(warnings), saleId, organizationId],
      );
    }

    await connection.commit();

    // Caché + WebSocket: fuera de la transacción y solo con datos confirmados.
    await publishCatalogUpdate(organizationId, appliedChanges, { connection });

    return reply.code(201).send({
      message: "Compra registrada correctamente",
      sale_id: saleId,
      invoice_number: invoiceNumber,
      pickup_code: pickupCode,
      total,
      subtotal,
      sale_date: receipt.paid_at,
      payment_status: paymentStatus,
      payment_mode: "online",
      ecollect_transaction_id: receipt.transaction_id,
      customer: {
        document_type: receipt.document_type,
        document_number: receipt.document_number,
        full_name: receipt.full_name,
        phone: receipt.phone,
        email: receipt.email,
        address: receipt.address,
      },
      items: saleItems,
      warnings,
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (e) {
        /* sin transacción activa */
      }
    }
    console.error("Error en compra pública:", error);

    if (error.statusCode) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    if (error.code === "ER_DUP_ENTRY") {
      return reply.code(409).send({
        error: "El comprobante o el código de caja ya fue registrado.",
      });
    }
    if (error.code && String(error.code).startsWith("ER_")) {
      return reply
        .code(400)
        .send({ error: error.sqlMessage || "Error en la base de datos" });
    }
    return reply.code(500).send({ error: "Error interno del servidor" });
  } finally {
    if (connection) connection.release();
  }
}
