import pool from "../config/database.js";
import { saleSchema } from "../validators/index.js";
import {
  generateInvoiceNumber,
  calculatePagination,
  buildPaginatedResponse,
  formatCOP,
} from "../utils/helpers.js";
import {
  generateUniquePickupCode,
  normalizePickupCode,
} from "../utils/pickup.js";

export async function getSales(request, reply) {
  const { page, limit, offset } = calculatePagination(
    request.query.page,
    request.query.limit,
  );
  const { start_date, end_date, payment_status, customer_id } = request.query;

  let whereClause = "WHERE 1=1";
  const params = [];

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
    `SELECT COUNT(*) as total FROM sales ${whereClause}`,
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
            c.phone as customer_phone, c.email as customer_email, c.address as customer_address,
            c.has_payment_proof as customer_has_proof, c.proof_image_url as customer_proof_url,
            u.full_name as created_by_name
     FROM sales s
     JOIN customers c ON s.customer_id = c.id
     JOIN users u ON s.created_by = u.id
     WHERE s.id = ?`,
    [id],
  );

  if (sales.length === 0) {
    return reply.code(404).send({ error: "Venta no encontrada" });
  }

  const [items] = await pool.query(
    `SELECT si.*, p.name as product_name, p.unit as product_unit
     FROM sale_items si
     JOIN products p ON si.product_id = p.id
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

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const invoice_number = generateInvoiceNumber();

    let subtotal = 0;
    const saleItems = [];

    for (const item of items) {
      const [products] = await connection.query(
        "SELECT id, name, current_stock, current_price FROM products WHERE id = ? AND is_active = TRUE",
        [item.product_id],
      );

      if (products.length === 0) {
        throw new Error(
          `Producto con ID ${item.product_id} no encontrado o inactivo`,
        );
      }

      const product = products[0];

      if (product.current_stock < item.quantity) {
        throw new Error(
          `Stock insuficiente para ${product.name}. Disponible: ${product.current_stock}, Solicitado: ${item.quantity}`,
        );
      }

      const unitPrice = item.unit_price || product.current_price;
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

    const [saleResult] = await connection.query(
      `INSERT INTO sales (invoice_number, customer_id, sale_date, subtotal, tax, total, payment_type, payment_status, pickup_code, pickup_status, created_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?)`,
      [
        invoice_number,
        customer_id,
        sale_date || new Date(),
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

    for (const item of saleItems) {
      await connection.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total)
         VALUES (?, ?, ?, ?, ?)`,
        [saleId, item.product_id, item.quantity, item.unit_price, item.total],
      );

      await connection.query(
        "UPDATE products SET current_stock = current_stock - ? WHERE id = ?",
        [item.quantity, item.product_id],
      );

      const [product] = await connection.query(
        "SELECT current_stock FROM products WHERE id = ?",
        [item.product_id],
      );
      const newStock = product[0].current_stock;
      const previousStock = newStock + item.quantity;

      await connection.query(
        `INSERT INTO inventory_movements (product_id, movement_type, quantity, previous_stock, new_stock, reason, reference_type, reference_id, created_by)
         VALUES (?, 'salida', ?, ?, ?, ?, 'venta', ?, ?)`,
        [
          item.product_id,
          item.quantity,
          previousStock,
          newStock,
          `Venta ${invoice_number}`,
          saleId,
          created_by,
        ],
      );
    }

    await connection.commit();

    const [newSale] = await connection.query(
      `SELECT s.*, c.full_name as customer_name
       FROM sales s
       JOIN customers c ON s.customer_id = c.id
       WHERE s.id = ?`,
      [saleId],
    );

    return reply.code(201).send({ sale: newSale[0] });
  } catch (error) {
    await connection.rollback();
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

  const [existing] = await pool.query("SELECT id FROM sales WHERE id = ?", [
    id,
  ]);
  if (existing.length === 0) {
    return reply.code(404).send({ error: "Venta no encontrada" });
  }

  await pool.query("UPDATE sales SET payment_status = ? WHERE id = ?", [
    payment_status,
    id,
  ]);

  const [updated] = await pool.query(
    `SELECT s.*, c.full_name as customer_name, c.document_number as customer_document,
            u.full_name as created_by_name
     FROM sales s
     JOIN customers c ON s.customer_id = c.id
     JOIN users u ON s.created_by = u.id
     WHERE s.id = ?`,
    [id],
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
     WHERE s.pickup_code = ?`,
    [code],
  );

  if (sales.length === 0) {
    return reply.code(404).send({ error: "Código no encontrado. Verifique e intente de nuevo" });
  }

  const [items] = await pool.query(
    `SELECT si.*, p.name as product_name, p.unit as product_unit
     FROM sale_items si
     JOIN products p ON si.product_id = p.id
     WHERE si.sale_id = ?`,
    [sales[0].id],
  );

  return reply.send({ sale: sales[0], items });
}

export async function markDelivered(request, reply) {
  const { id } = request.params;

  const [existing] = await pool.query("SELECT id, pickup_status FROM sales WHERE id = ?", [id]);
  if (existing.length === 0) {
    return reply.code(404).send({ error: "Venta no encontrada" });
  }

  await pool.query("UPDATE sales SET pickup_status = 'entregado' WHERE id = ?", [id]);

  return reply.send({ message: "Entrega registrada correctamente" });
}
