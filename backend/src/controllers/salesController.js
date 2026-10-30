import pool from "../config/database.js";
import { saleSchema } from "../validators/index.js";
import {
  generateInvoiceNumber,
  calculatePagination,
  buildPaginatedResponse,
} from "../utils/helpers.js";
import {
  generateUniquePickupCode,
  normalizePickupCode,
} from "../utils/pickup.js";
import { applyStockMovement, InventoryError } from "../services/inventoryService.js";
import { publishCatalogUpdate } from "../services/catalogEvents.js";

// ============================================================================
// CONTROLADOR DE VENTAS — SIVEP
// ----------------------------------------------------------------------------
// `createSale` es la venta interna (panel). El stock se descuenta con
// `applyStockMovement`, que bloquea la fila del producto dentro de la
// transacción. Así dos ventas simultáneas del mismo producto se serializan y no
// pueden vender más unidades de las que existen.
//
// Después del commit se publica el catálogo actualizado por WebSocket y se
// invalida la caché pública (ver `catalogEvents.js`).
// ============================================================================

export async function getSales(request, reply) {
  const { page, limit, offset } = calculatePagination(
    request.query.page,
    request.query.limit,
  );
  const { start_date, end_date, payment_status, customer_id } = request.query;

  let whereClause = "WHERE s.organization_id = ?";
  const params = [request.organizationId];

  if (start_date) {
    whereClause += " AND sale_date >= ?";
    params.push(start_date);
  }

  if (end_date) {
    whereClause += " AND sale_date <= ?";
    params.push(end_date);
  }

  if (payment_status) {
    whereClause += " AND payment_status = ?";
    params.push(payment_status);
  }

  if (customer_id) {
    whereClause += " AND customer_id = ?";
    params.push(customer_id);
  }

  const [sales] = await pool.query(
    `SELECT s.*, c.full_name as customer_name, c.document_number as customer_document,
            c.proof_image_url as customer_proof_url,
            u.full_name as created_by_name
     FROM sales s
     JOIN customers c ON s.customer_id = c.id
     JOIN users u ON s.created_by = u.id
     ${whereClause}
     ORDER BY s.sale_date DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM sales s ${whereClause}`,
    params,
  );

  return reply.send(
    buildPaginatedResponse(sales, countResult[0].total, page, limit),
  );
}

export async function getSaleById(request, reply) {
  const { id } = request.params;

  const [sales] = await pool.query(
    `SELECT s.*, c.full_name as customer_name, c.document_number as customer_document,
            c.document_type as customer_document_type,
            c.phone as customer_phone, c.email as customer_email, c.address as customer_address,
            c.has_payment_proof as customer_has_proof, c.proof_image_url as customer_proof_url,
            u.full_name as created_by_name
     FROM sales s
     JOIN customers c ON s.customer_id = c.id
     JOIN users u ON s.created_by = u.id
     WHERE s.id = ? AND s.organization_id = ?`,
    [id, request.organizationId],
  );

  if (sales.length === 0) {
    return reply.code(404).send({ error: "Venta no encontrada" });
  }

  const [items] = await pool.query(
    `SELECT si.*, COALESCE(p.name, si.description, 'Venta externa') as product_name,
            COALESCE(p.unit, '') as product_unit
     FROM sale_items si
     LEFT JOIN products p ON si.product_id = p.id
     WHERE si.sale_id = ?`,
    [id],
  );

  return reply.send({ sale: sales[0], items });
}

export async function createSale(request, reply) {
  const { error, value } = saleSchema.validate(request.body);
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }

  const { customer_id, sale_date, payment_type, payment_status, notes, items } =
    value;
  const created_by = request.user.id;
  const organizationId = request.organizationId;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // El cliente debe pertenecer a la misma organización (aislamiento).
    const [customerRows] = await connection.query(
      "SELECT id FROM customers WHERE id = ? AND organization_id = ?",
      [customer_id, organizationId],
    );
    if (customerRows.length === 0) {
      throw new InventoryError("Cliente no encontrado", {
        statusCode: 404,
        code: "CUSTOMER_NOT_FOUND",
      });
    }

    const invoice_number = generateInvoiceNumber();

    let subtotal = 0;
    const saleItems = [];

    // Se leen precios y nombres, pero NO se decide aquí si hay stock: esa
    // validación la hace `applyStockMovement` con la fila bloqueada, que es la
    // única lectura confiable cuando hay compras concurrentes.
    for (const item of items) {
      const [products] = await connection.query(
        "SELECT id, name, current_price FROM products WHERE id = ? AND is_active = TRUE AND organization_id = ?",
        [item.product_id, organizationId],
      );

      if (products.length === 0) {
        throw new InventoryError(
          `Producto con ID ${item.product_id} no encontrado o inactivo`,
          { statusCode: 404, code: "PRODUCT_NOT_FOUND" },
        );
      }

      const product = products[0];
      const unitPrice = item.unit_price ?? product.current_price;
      const total = unitPrice * item.quantity;
      subtotal += total;

      saleItems.push({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: unitPrice,
        total,
      });
    }

    const tax = 0;
    const total = subtotal + tax;
    const saleDate = sale_date || new Date();

    // Ordenar por producto reduce el riesgo de interbloqueo (deadlock) cuando
    // dos ventas tocan los mismos productos en distinto orden.
    saleItems.sort((a, b) => a.product_id - b.product_id);

    const [saleResult] = await connection.query(
      `INSERT INTO sales (organization_id, invoice_number, customer_id, sale_date, subtotal, tax, total, payment_type, payment_status, pickup_code, pickup_status, created_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?)`,
      [
        organizationId,
        invoice_number,
        customer_id,
        saleDate,
        subtotal,
        tax,
        total,
        payment_type,
        payment_status,
        await generateUniquePickupCode(connection),
        created_by,
        notes || null,
      ],
    );

    const saleId = saleResult.insertId;

    await connection.query(
      `UPDATE customers SET last_purchase_at = ?
       WHERE id = ? AND organization_id = ?
         AND (last_purchase_at IS NULL OR last_purchase_at < ?)`,
      [saleDate, customer_id, organizationId, saleDate],
    );

    const stockChanges = [];

    for (const item of saleItems) {
      await connection.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total)
         VALUES (?, ?, ?, ?, ?)`,
        [saleId, item.product_id, item.quantity, item.unit_price, item.total],
      );

      // Descuento atómico. Si no alcanza, lanza InventoryError y toda la venta
      // se revierte (no queda una factura sin stock).
      const change = await applyStockMovement(connection, {
        organizationId,
        productId: item.product_id,
        movementType: "salida",
        quantity: item.quantity,
        reason: `Venta ${invoice_number}`,
        referenceType: "venta",
        referenceId: saleId,
        createdBy: created_by,
      });
      stockChanges.push(change);
    }

    await connection.commit();

    // Caché + WebSocket: se ejecuta después del commit para que ningún cliente
    // reciba un stock que luego se revierta.
    await publishCatalogUpdate(organizationId, stockChanges, { connection });

    const [newSale] = await connection.query(
      `SELECT s.*, c.full_name as customer_name
       FROM sales s
       JOIN customers c ON s.customer_id = c.id
       WHERE s.id = ? AND s.organization_id = ?`,
      [saleId, organizationId],
    );

    return reply.code(201).send({ sale: newSale[0] });
  } catch (error) {
    await connection.rollback();

    if (error instanceof InventoryError) {
      return reply.code(error.statusCode).send({
        error: error.message,
        code: error.code,
      });
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function updatePaymentStatus(request, reply) {
  const { id } = request.params;
  const { payment_status } = request.body || {};

  if (!["pagado", "pendiente"].includes(payment_status)) {
    return reply
      .code(400)
      .send({ error: 'Estado de pago inválido. Use "pagado" o "pendiente"' });
  }

  const [existing] = await pool.query(
    "SELECT id FROM sales WHERE id = ? AND organization_id = ?",
    [id, request.organizationId],
  );
  if (existing.length === 0) {
    return reply.code(404).send({ error: "Venta no encontrada" });
  }

  await pool.query(
    "UPDATE sales SET payment_status = ? WHERE id = ? AND organization_id = ?",
    [payment_status, id, request.organizationId],
  );

  const [updated] = await pool.query(
    `SELECT s.*, c.full_name as customer_name, c.document_number as customer_document,
            u.full_name as created_by_name
     FROM sales s
     JOIN customers c ON s.customer_id = c.id
     JOIN users u ON s.created_by = u.id
     WHERE s.id = ? AND s.organization_id = ?`,
    [id, request.organizationId],
  );

  return reply.send({
    message:
      payment_status === "pagado"
        ? "Pago confirmado correctamente"
        : "Venta marcada como pendiente",
    sale: updated[0],
  });
}

export async function validatePickupCode(request, reply) {
  const code = normalizePickupCode(request.body?.code);

  if (!code) {
    return reply.code(400).send({ error: "Debe ingresar el código de reclamo" });
  }

  const [sales] = await pool.query(
    `SELECT s.*, c.full_name as customer_name, c.document_number as customer_document,
            c.phone as customer_phone, u.full_name as created_by_name
     FROM sales s
     JOIN customers c ON s.customer_id = c.id
     JOIN users u ON s.created_by = u.id
     WHERE s.pickup_code = ? AND s.organization_id = ?`,
    [code, request.organizationId],
  );

  if (sales.length === 0) {
    return reply.code(404).send({ error: "Código no encontrado. Verifique e intente de nuevo" });
  }

  const [items] = await pool.query(
    `SELECT si.*, COALESCE(p.name, si.description, 'Venta externa') as product_name,
            COALESCE(p.unit, '') as product_unit
     FROM sale_items si
     LEFT JOIN products p ON si.product_id = p.id
     WHERE si.sale_id = ?`,
    [sales[0].id],
  );

  return reply.send({ sale: sales[0], items });
}

export async function markDelivered(request, reply) {
  const { id } = request.params;

  const [existing] = await pool.query(
    "SELECT id, pickup_status FROM sales WHERE id = ? AND organization_id = ?",
    [id, request.organizationId],
  );
  if (existing.length === 0) {
    return reply.code(404).send({ error: "Venta no encontrada" });
  }

  await pool.query(
    "UPDATE sales SET pickup_status = 'entregado' WHERE id = ? AND organization_id = ?",
    [id, request.organizationId],
  );

  return reply.send({ message: "Entrega registrada correctamente" });
}
