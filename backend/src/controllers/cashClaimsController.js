import pool from "../config/database.js";
import { cashClaimSchema, cashClaimRejectSchema } from "../validators/index.js";
import {
  generateInvoiceNumber,
  calculatePagination,
  buildPaginatedResponse,
} from "../utils/helpers.js";
import { generateUniqueClaimCode } from "../utils/pickup.js";
import { uploadImage } from "../utils/upload.js";
import { readMultipart } from "../utils/multipart.js";
import {
  applyStockMovement,
  InventoryError,
} from "../services/inventoryService.js";
import { publishCatalogUpdate } from "../services/catalogEvents.js";
import { resolveDefaultOrganizationId } from "../middleware/plan.js";

// ============================================================================
// COMPRAS EN EFECTIVO — solicitud pública + validación manual del administrador
// ----------------------------------------------------------------------------
// La caja es de la Universidad y la granja no controla sus códigos. El recibo
// físico es la prueba real. Por eso:
//
//   - El comprador registra una SOLICITUD (no una venta) con sus datos, los
//     productos del catálogo y una foto/PDF del recibo.
//   - La solicitud NO toca el stock: si el recibo es falso o no coincide, no se
//     compromete inventario.
//   - Un administrador revisa el recibo y aprueba o rechaza.
//   - La aprobación crea la venta, descuenta stock de forma atómica y usa el
//     mismo código de la solicitud como código de reclamo.
//   - La venta nace con `pickup_status = 'entregado'`: el comprador ya pagó en
//     caja y el administrador validó el recibo físico, así que no queda una
//     entrega pendiente que nadie vaya a marcar después.
//
// Si al aprobar no alcanza el stock, TODA la aprobación se revierte y se
// responde 409 con el detalle. Nunca se aprueba a medias.
// ============================================================================

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10 MB
const RECEIPT_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp"]);
const VALID_STATUSES = new Set(["pendiente", "aprobada", "rechazada"]);

function fileExtension(filename = "") {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

// Joi entrega un Date en UTC. Para una columna DATE hay que conservar el día
// tal como lo escribió el comprador; usar componentes UTC evita el corrimiento
// de un día en zonas horarias negativas (Colombia, UTC-5).
function toDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

// MySQL devuelve una columna DATE como Date (con `timezone` fijo). Para armar
// un DATETIME de MySQL hay que usar "YYYY-MM-DD"; interpolar el Date completo
// produce un texto inválido. Esta función normaliza ambos casos.
function dbDateOnly(value) {
  if (value instanceof Date) return toDateOnly(value);
  return String(value || "").slice(0, 10);
}

function parseItemsField(rawItems) {
  if (Array.isArray(rawItems)) return rawItems;
  if (typeof rawItems !== "string" || !rawItems.trim()) return [];
  try {
    const parsed = JSON.parse(rawItems);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;
  }
}

function businessError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

// Agrupa líneas repetidas del mismo producto: el catálogo se consulta una sola
// vez y el total se calcula con precios de la base, nunca con los del cliente.
function groupQuantities(items) {
  const quantities = new Map();
  for (const item of items) {
    const productId = Number(item.product_id);
    const quantity = Number(item.quantity);
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  return quantities;
}

// ============================================================================
// PÚBLICO
// ============================================================================

// POST /api/public/cash-claims
// Multipart: datos del comprador + items (JSON) + receipt_file (foto o PDF).
export async function createCashClaim(request, reply) {
  let connection = null;

  try {
    const {
      error: multipartError,
      files,
      fields: rawFields,
    } = await readMultipart(request, {
      fileFields: ["receipt_file"],
      maxFileBytes: MAX_RECEIPT_BYTES,
    });
    if (multipartError) {
      return reply.code(400).send({ error: multipartError });
    }

    const receipt = files.receipt_file;
    if (!receipt) {
      return reply.code(400).send({
        error: "Debes adjuntar una foto o PDF del recibo de caja",
      });
    }
    if (receipt.buffer.length > MAX_RECEIPT_BYTES) {
      return reply
        .code(400)
        .send({ error: "El recibo no debe superar 10 MB" });
    }
    if (!RECEIPT_EXTENSIONS.has(fileExtension(receipt.filename))) {
      return reply.code(400).send({
        error: "El recibo debe ser una imagen (JPG, PNG, WEBP) o un PDF",
      });
    }

    const items = parseItemsField(rawFields.items);
    if (items === null) {
      return reply
        .code(400)
        .send({ error: "Los productos de la solicitud no tienen un formato válido" });
    }

    const { error, value } = cashClaimSchema.validate({
      cash_receipt_code: rawFields.cash_receipt_code,
      document_type: rawFields.document_type || "CC",
      document_number: rawFields.document_number,
      full_name: rawFields.full_name,
      phone: rawFields.phone,
      email: rawFields.email,
      purchase_date: rawFields.purchase_date,
      declared_total: rawFields.declared_total,
      notes: rawFields.notes,
      accepts_policy: rawFields.accepts_policy,
      items,
    });
    if (error) {
      return reply.code(400).send({ error: error.details[0].message });
    }

    const organizationId = await resolveDefaultOrganizationId();
    if (!organizationId) {
      return reply
        .code(500)
        .send({ error: "No hay una organización activa para registrar la solicitud" });
    }

    const purchaseDate = toDateOnly(value.purchase_date);
    if (!purchaseDate) {
      return reply.code(400).send({ error: "La fecha de compra no es válida" });
    }

    const quantities = groupQuantities(value.items);
    const productIds = [...quantities.keys()].sort((a, b) => a - b);

    connection = await pool.getConnection();

    // Un recibo de caja no puede sustentar dos solicitudes activas ni una venta
    // ya registrada. Si la solicitud anterior fue rechazada, el comprador puede
    // corregirla y volver a enviarla con el mismo código.
    const [duplicateClaims] = await connection.query(
      `SELECT id FROM cash_purchase_claims
       WHERE organization_id = ? AND cash_receipt_code = ?
         AND status IN ('pendiente', 'aprobada')
       LIMIT 1`,
      [organizationId, value.cash_receipt_code],
    );
    if (duplicateClaims.length > 0) {
      return reply.code(409).send({
        error: "Ese código de caja ya tiene una solicitud registrada.",
      });
    }

    const [duplicateSales] = await connection.query(
      "SELECT id FROM sales WHERE cash_receipt_code = ? LIMIT 1",
      [value.cash_receipt_code],
    );
    if (duplicateSales.length > 0) {
      return reply.code(409).send({
        error: "Ese código de caja ya fue usado en una venta registrada.",
      });
    }

    const [products] = await connection.query(
      `SELECT id, name, unit, current_price
       FROM products
       WHERE organization_id = ? AND is_active = TRUE AND id IN (?)`,
      [organizationId, productIds],
    );
    if (products.length !== productIds.length) {
      return reply.code(400).send({
        error: "Uno o más productos ya no están disponibles. Actualiza la página.",
      });
    }

    const productById = new Map(products.map((p) => [Number(p.id), p]));
    const claimItems = productIds.map((productId) => {
      const product = productById.get(productId);
      const quantity = quantities.get(productId);
      const unitPrice = roundMoney(product.current_price);
      return {
        product_id: productId,
        product_name: product.name,
        product_unit: product.unit,
        quantity,
        unit_price: unitPrice,
        total: roundMoney(unitPrice * quantity),
      };
    });
    const computedTotal = roundMoney(
      claimItems.reduce((sum, item) => sum + item.total, 0),
    );

    // Evidencia del pago. Se guarda antes de la transacción porque la venta no
    // depende del archivo, pero la solicitud debe apuntar a un recibo válido.
    const receiptUrl = await uploadImage(
      receipt.buffer,
      receipt.filename,
      "sivep/recibos-efectivo",
    );

    await connection.beginTransaction();

    const claimCode = await generateUniqueClaimCode(connection);

    const [claimResult] = await connection.query(
      `INSERT INTO cash_purchase_claims
         (organization_id, claim_code, cash_receipt_code, document_type,
          document_number, full_name, phone, email, purchase_date,
          declared_total, computed_total, receipt_url, receipt_filename, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        organizationId,
        claimCode,
        value.cash_receipt_code,
        value.document_type,
        value.document_number,
        value.full_name,
        value.phone || null,
        value.email || null,
        purchaseDate,
        roundMoney(value.declared_total),
        computedTotal,
        receiptUrl,
        receipt.filename || null,
        value.notes || null,
      ],
    );
    const claimId = claimResult.insertId;

    for (const item of claimItems) {
      await connection.query(
        `INSERT INTO cash_purchase_claim_items
           (claim_id, product_id, product_name, product_unit, unit_price, quantity, total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          claimId,
          item.product_id,
          item.product_name,
          item.product_unit,
          item.unit_price,
          item.quantity,
          item.total,
        ],
      );
    }

    await connection.commit();

    // No se emite evento de stock: la solicitud todavía no descuenta inventario.
    return reply.code(201).send({
      message:
        "Solicitud recibida. Un administrador validará tu recibo antes de descontar el inventario.",
      claim_code: claimCode,
      status: "pendiente",
      cash_receipt_code: value.cash_receipt_code,
      purchase_date: purchaseDate,
      declared_total: roundMoney(value.declared_total),
      computed_total: computedTotal,
      items: claimItems,
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        /* sin transacción activa */
      }
    }
    console.error("Error en solicitud de efectivo:", error);
    if (error.statusCode) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    if (error.code === "ER_DUP_ENTRY") {
      return reply
        .code(409)
        .send({ error: "La solicitud ya fue registrada. Revisa tu código." });
    }
    return reply.code(500).send({ error: "Error interno del servidor" });
  } finally {
    if (connection) connection.release();
  }
}

// GET /api/public/cash-claims/:code?document=...
// El documento impide consultar solicitudes ajenas adivinando códigos.
export async function getCashClaimStatus(request, reply) {
  try {
    const code = normalizeCode(request.params.code);
    const document = String(request.query.document || "").trim();

    if (!code || !document) {
      return reply.code(400).send({
        error: "Debes indicar el código de solicitud y tu número de documento",
      });
    }

    const organizationId = await resolveDefaultOrganizationId();
    if (!organizationId) {
      return reply.code(404).send({ error: "Solicitud no encontrada" });
    }

    const [claims] = await pool.query(
      `SELECT c.id, c.claim_code, c.cash_receipt_code, c.document_type,
              c.document_number, c.full_name, c.purchase_date,
              c.declared_total, c.computed_total, c.status,
              c.rejection_reason, c.created_at, c.reviewed_at, c.sale_id,
              s.invoice_number, s.pickup_code, s.pickup_status
       FROM cash_purchase_claims c
       LEFT JOIN sales s ON s.id = c.sale_id
       WHERE c.claim_code = ? AND c.document_number = ? AND c.organization_id = ?
       LIMIT 1`,
      [code, document, organizationId],
    );
    if (claims.length === 0) {
      return reply.code(404).send({
        error: "No encontramos una solicitud con ese código y documento",
      });
    }

    const claim = claims[0];
    const [items] = await pool.query(
      `SELECT product_name, product_unit, quantity, unit_price, total
       FROM cash_purchase_claim_items WHERE claim_id = ? ORDER BY id`,
      [claim.id],
    );

    return reply.send({
      claim_code: claim.claim_code,
      cash_receipt_code: claim.cash_receipt_code,
      status: claim.status,
      purchase_date: dbDateOnly(claim.purchase_date),
      declared_total: claim.declared_total,
      computed_total: claim.computed_total,
      rejection_reason: claim.rejection_reason,
      created_at: claim.created_at,
      reviewed_at: claim.reviewed_at,
      customer: {
        document_type: claim.document_type,
        document_number: claim.document_number,
        full_name: claim.full_name,
      },
      sale: claim.sale_id
        ? {
            invoice_number: claim.invoice_number,
            pickup_code: claim.pickup_code,
            pickup_status: claim.pickup_status,
          }
        : null,
      items,
    });
  } catch (error) {
    console.error("Error consultando solicitud de efectivo:", error);
    return reply.code(500).send({ error: "Error interno del servidor" });
  }
}

// ============================================================================
// ADMINISTRACIÓN
// ============================================================================

// GET /api/cash-claims?status=&search=&start_date=&end_date=&page=&limit=
export async function listCashClaims(request, reply) {
  try {
    const { page, limit, offset } = calculatePagination(
      request.query.page,
      request.query.limit,
    );
    const { status, search, start_date, end_date } = request.query;

    const where = ["c.organization_id = ?"];
    const params = [request.organizationId];

    if (status && VALID_STATUSES.has(status)) {
      where.push("c.status = ?");
      params.push(status);
    }

    if (search && String(search).trim()) {
      const term = `%${String(search).trim()}%`;
      where.push(
        `(c.claim_code LIKE ? OR c.cash_receipt_code LIKE ?
          OR c.document_number LIKE ? OR c.full_name LIKE ?)`,
      );
      params.push(term, term, term, term);
    }

    if (start_date) {
      where.push("c.created_at >= ?");
      params.push(start_date);
    }
    if (end_date) {
      where.push("c.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
      params.push(end_date);
    }

    const whereClause = `WHERE ${where.join(" AND ")}`;

    const [claims] = await pool.query(
      `SELECT c.*, s.invoice_number, s.pickup_code AS sale_pickup_code,
              s.pickup_status AS sale_pickup_status,
              (SELECT COUNT(*) FROM cash_purchase_claim_items ci
               WHERE ci.claim_id = c.id) AS items_count,
              (SELECT COALESCE(SUM(ci.quantity), 0)
               FROM cash_purchase_claim_items ci
               WHERE ci.claim_id = c.id) AS total_units
       FROM cash_purchase_claims c
       LEFT JOIN sales s ON s.id = c.sale_id
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM cash_purchase_claims c ${whereClause}`,
      params,
    );

    return reply.send(
      buildPaginatedResponse(claims, countRows[0].total, page, limit),
    );
  } catch (error) {
    console.error("Error listando solicitudes de efectivo:", error);
    return reply.code(500).send({ error: "Error interno del servidor" });
  }
}

// GET /api/cash-claims/:id
export async function getCashClaimById(request, reply) {
  try {
    const { id } = request.params;

    const [claims] = await pool.query(
      `SELECT c.*, s.invoice_number, s.pickup_code AS sale_pickup_code,
              s.pickup_status AS sale_pickup_status, s.total AS sale_total,
              s.payment_status AS sale_payment_status,
              u.full_name AS reviewed_by_name
       FROM cash_purchase_claims c
       LEFT JOIN sales s ON s.id = c.sale_id
       LEFT JOIN users u ON u.id = c.reviewed_by
       WHERE c.id = ? AND c.organization_id = ?`,
      [id, request.organizationId],
    );
    if (claims.length === 0) {
      return reply.code(404).send({ error: "Solicitud no encontrada" });
    }

    const [items] = await pool.query(
      `SELECT ci.*, p.current_stock, p.is_active
       FROM cash_purchase_claim_items ci
       LEFT JOIN products p ON p.id = ci.product_id
       WHERE ci.claim_id = ?
       ORDER BY ci.id`,
      [id],
    );

    return reply.send({ claim: claims[0], items });
  } catch (error) {
    console.error("Error obteniendo solicitud de efectivo:", error);
    return reply.code(500).send({ error: "Error interno del servidor" });
  }
}

// POST /api/cash-claims/:id/approve
//
// Secuencia transaccional:
//   1. bloquear la solicitud (dos administradores no pueden aprobarla a la vez),
//   2. crear/reutilizar el cliente,
//   3. crear la venta en efectivo ya pagada y ya entregada,
//   4. insertar los ítems y descontar stock con bloqueo de fila,
//   5. marcar la solicitud como aprobada y enlazar la venta.
// Cualquier fallo (incluido stock insuficiente) revierte TODO.
export async function approveCashClaim(request, reply) {
  const { id } = request.params;
  const organizationId = request.organizationId;
  const adminId = request.user.id;
  let connection = null;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [claims] = await connection.query(
      `SELECT * FROM cash_purchase_claims
       WHERE id = ? AND organization_id = ?
       FOR UPDATE`,
      [id, organizationId],
    );
    if (claims.length === 0) {
      throw businessError("Solicitud no encontrada", 404, "CLAIM_NOT_FOUND");
    }

    const claim = claims[0];
    const purchaseDate = dbDateOnly(claim.purchase_date);
    const purchaseTimestamp = `${purchaseDate} 12:00:00`;

    if (claim.status === "aprobada") {
      throw businessError(
        "Esta solicitud ya fue aprobada",
        409,
        "CLAIM_ALREADY_APPROVED",
      );
    }
    if (claim.status === "rechazada") {
      throw businessError(
        "Esta solicitud fue rechazada y no se puede aprobar",
        409,
        "CLAIM_REJECTED",
      );
    }

    const [duplicateSales] = await connection.query(
      "SELECT id FROM sales WHERE cash_receipt_code = ? LIMIT 1",
      [claim.cash_receipt_code],
    );
    if (duplicateSales.length > 0) {
      throw businessError(
        "El código de caja ya está asociado a otra venta registrada",
        409,
        "RECEIPT_ALREADY_USED",
      );
    }

    // El código de la solicitud también será el código de reclamo. Se comprueba
    // por si una venta normal generó el mismo valor entre la solicitud y la
    // aprobación (probabilidad mínima, pero un choque rompería el reclamo).
    const [pickupCollision] = await connection.query(
      "SELECT id FROM sales WHERE pickup_code = ? LIMIT 1",
      [claim.claim_code],
    );
    if (pickupCollision.length > 0) {
      throw businessError(
        "El código de reclamo ya está en uso. Contacta al administrador del sistema.",
        409,
        "PICKUP_CODE_COLLISION",
      );
    }

    const [items] = await connection.query(
      `SELECT ci.*, p.current_price, p.is_active
       FROM cash_purchase_claim_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.claim_id = ?
       ORDER BY ci.product_id`,
      [id],
    );
    if (items.length === 0) {
      throw businessError(
        "La solicitud no tiene productos registrados",
        409,
        "CLAIM_WITHOUT_ITEMS",
      );
    }

    const inactive = items.find((item) => !item.is_active);
    if (inactive) {
      throw businessError(
        `El producto "${inactive.product_name}" está inactivo. Reactívalo o rechaza la solicitud.`,
        409,
        "PRODUCT_INACTIVE",
      );
    }

    // 2. Cliente: se reutiliza por documento dentro de la organización. Los
    // datos de la solicitud son los que el comprador confirmó.
    let customerId = null;
    const [byDocument] = await connection.query(
      `SELECT id FROM customers
       WHERE organization_id = ? AND document_type = ? AND document_number = ?`,
      [organizationId, claim.document_type, claim.document_number],
    );
    if (byDocument.length > 0) {
      customerId = byDocument[0].id;
    } else {
      const [byNumber] = await connection.query(
        "SELECT id FROM customers WHERE organization_id = ? AND document_number = ? LIMIT 1",
        [organizationId, claim.document_number],
      );
      if (byNumber.length > 0) customerId = byNumber[0].id;
    }

    if (customerId) {
      await connection.query(
        `UPDATE customers SET
           document_type = ?,
           document_number = ?,
           full_name = ?,
           phone = COALESCE(?, phone),
           email = COALESCE(?, email),
           has_payment_proof = TRUE,
           proof_image_url = ?,
           origin = 'formulario_publico',
           last_purchase_at = CASE
             WHEN last_purchase_at IS NULL OR last_purchase_at < ? THEN ?
             ELSE last_purchase_at
           END
         WHERE id = ? AND organization_id = ?`,
        [
          claim.document_type,
          claim.document_number,
          claim.full_name,
          claim.phone,
          claim.email,
          claim.receipt_url,
          purchaseTimestamp,
          purchaseTimestamp,
          customerId,
          organizationId,
        ],
      );
    } else {
      const [customerResult] = await connection.query(
        `INSERT INTO customers
           (organization_id, document_type, document_number, full_name, phone,
            email, origin, has_payment_proof, proof_image_url, last_purchase_at)
         VALUES (?, ?, ?, ?, ?, ?, 'formulario_publico', TRUE, ?, ?)`,
        [
          organizationId,
          claim.document_type,
          claim.document_number,
          claim.full_name,
          claim.phone,
          claim.email,
          claim.receipt_url,
          purchaseTimestamp,
        ],
      );
      customerId = customerResult.insertId;
    }

    // 3. Venta. `total` usa el valor calculado del catálogo para que la factura
    // coincida exactamente con sus ítems; si el comprador declaró otro valor,
    // queda registrado en la solicitud y el administrador lo vio al aprobar.
    // Nace 'pagado' (el pago ya ocurrió en caja) y 'entregado' (el admin validó
    // el recibo físico, por lo que la compra queda cerrada en un solo paso).
    const subtotal = roundMoney(claim.computed_total);
    const saleNotes = [
      `Compra en efectivo validada manualmente.`,
      `Solicitud ${claim.claim_code}.`,
      `Código de caja ${claim.cash_receipt_code}.`,
      `Valor declarado por el comprador: ${roundMoney(claim.declared_total)}.`,
      `Total calculado del catálogo: ${subtotal}.`,
    ].join(" ");

    let invoiceNumber = null;
    let saleId = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      invoiceNumber = generateInvoiceNumber();
      try {
        const [saleResult] = await connection.query(
          `INSERT INTO sales
             (organization_id, invoice_number, customer_id, sale_date, subtotal,
              tax, total, payment_type, payment_status, payment_mode,
              cash_receipt_code, paid_at, pickup_code, pickup_status,
              created_by, notes)
           VALUES (?, ?, ?, ?, ?, 0, ?, 'contado', 'pagado', 'efectivo',
                   ?, ?, ?, 'entregado', ?, ?)`,
          [
            organizationId,
            invoiceNumber,
            customerId,
            purchaseTimestamp,
            subtotal,
            subtotal,
            claim.cash_receipt_code,
            purchaseTimestamp,
            claim.claim_code,
            adminId,
            saleNotes,
          ],
        );
        saleId = saleResult.insertId;
        break;
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY" && attempt < 2) continue;
        throw error;
      }
    }

    // 4. Ítems + descuento atómico. Si falta stock, `applyStockMovement` lanza
    // InventoryError y el catch revierte la venta completa.
    const stockChanges = [];
    for (const item of items) {
      await connection.query(
        `INSERT INTO sale_items
           (sale_id, product_id, description, source, quantity, unit_price, total)
         VALUES (?, ?, ?, 'inventario', ?, ?, ?)`,
        [
          saleId,
          item.product_id,
          item.product_name,
          item.quantity,
          item.unit_price,
          item.total,
        ],
      );

      const change = await applyStockMovement(connection, {
        organizationId,
        productId: item.product_id,
        movementType: "salida",
        quantity: item.quantity,
        reason: `Compra en efectivo ${invoiceNumber} (caja ${claim.cash_receipt_code})`,
        referenceType: "venta",
        referenceId: saleId,
        createdBy: adminId,
      });
      stockChanges.push(change);
    }

    // 5. Cerrar la solicitud.
    await connection.query(
      `UPDATE cash_purchase_claims
       SET status = 'aprobada', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
           sale_id = ?, rejection_reason = NULL
       WHERE id = ? AND organization_id = ?`,
      [adminId, saleId, id, organizationId],
    );

    await connection.commit();

    // Caché + WebSocket después del commit: el stock ya es definitivo.
    await publishCatalogUpdate(organizationId, stockChanges, { connection });

    return reply.send({
      message:
        "Solicitud aprobada. La venta quedó registrada, el stock descontado y la entrega marcada como realizada.",
      claim: {
        id: Number(id),
        claim_code: claim.claim_code,
        status: "aprobada",
        reviewed_at: new Date().toISOString(),
      },
      sale: {
        id: saleId,
        invoice_number: invoiceNumber,
        pickup_code: claim.claim_code,
        pickup_status: "entregado",
        total: subtotal,
      },
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        /* sin transacción activa */
      }
    }

    if (error instanceof InventoryError) {
      return reply.code(error.statusCode).send({
        error: error.message,
        code: error.code,
        product_id: error.productId || null,
        product_name: error.productName || null,
        available: error.available ?? null,
        requested: error.requested ?? null,
      });
    }

    if (error.statusCode) {
      return reply.code(error.statusCode).send({
        error: error.message,
        code: error.code || null,
      });
    }

    console.error("Error aprobando solicitud de efectivo:", error);
    return reply.code(500).send({ error: "Error interno del servidor" });
  } finally {
    if (connection) connection.release();
  }
}

// POST /api/cash-claims/:id/reject
// No toca stock: la solicitud nunca lo descontó. El motivo queda visible para
// el comprador en la consulta pública.
export async function rejectCashClaim(request, reply) {
  const { id } = request.params;
  const { error, value } = cashClaimRejectSchema.validate(request.body || {});
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [claims] = await connection.query(
      `SELECT id, status FROM cash_purchase_claims
       WHERE id = ? AND organization_id = ? FOR UPDATE`,
      [id, request.organizationId],
    );
    if (claims.length === 0) {
      throw businessError("Solicitud no encontrada", 404, "CLAIM_NOT_FOUND");
    }
    if (claims[0].status !== "pendiente") {
      throw businessError(
        "Solo se pueden rechazar solicitudes pendientes",
        409,
        "CLAIM_NOT_PENDING",
      );
    }

    await connection.query(
      `UPDATE cash_purchase_claims
       SET status = 'rechazada', rejection_reason = ?, reviewed_by = ?,
           reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND organization_id = ?`,
      [value.reason, request.user.id, id, request.organizationId],
    );

    await connection.commit();

    return reply.send({
      message: "Solicitud rechazada. El comprador podrá consultar el motivo.",
      claim: { id: Number(id), status: "rechazada" },
    });
  } catch (error) {
    await connection.rollback();
    if (error.statusCode) {
      return reply
        .code(error.statusCode)
        .send({ error: error.message, code: error.code || null });
    }
    console.error("Error rechazando solicitud de efectivo:", error);
    return reply.code(500).send({ error: "Error interno del servidor" });
  } finally {
    connection.release();
  }
}
