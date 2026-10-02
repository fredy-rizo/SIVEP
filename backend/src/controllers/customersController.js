import pool from '../config/database.js';
import { customerSchema, customerUpdateSchema } from '../validators/index.js';
import { calculatePagination, buildPaginatedResponse } from '../utils/helpers.js';

export async function getCustomers(request, reply) {
  const { page, limit, offset } = calculatePagination(request.query.page, request.query.limit);
  const { search, origin, has_payment_proof } = request.query;
  
  let whereClause = 'WHERE 1=1';
  const params = [];
  
  if (search) {
    whereClause += ' AND (full_name LIKE ? OR document_number LIKE ? OR email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  
  if (origin) {
    whereClause += ' AND origin = ?';
    params.push(origin);
  }
  
  if (has_payment_proof === 'true' || has_payment_proof === 'false') {
    whereClause += ' AND has_payment_proof = ?';
    params.push(has_payment_proof === 'true');
  }
  
  const [customers] = await pool.query(
    `SELECT * FROM customers ${whereClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  
  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM customers ${whereClause}`,
    params
  );
  
  return reply.send(buildPaginatedResponse(customers, countResult[0].total, page, limit));
}

export async function getCustomerById(request, reply) {
  const { id } = request.params;
  
  const [customers] = await pool.query('SELECT * FROM customers WHERE id = ?', [id]);
  
  if (customers.length === 0) {
    return reply.code(404).send({ error: 'Cliente no encontrado' });
  }
  
  return reply.send({ customer: customers[0] });
}

export async function createCustomer(request, reply) {
  const { error, value } = customerSchema.validate(request.body);
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }
  
  const { document_type, document_number, full_name, phone, email, address, origin } = value;
  
  const [existing] = await pool.query(
    'SELECT id FROM customers WHERE document_type = ? AND document_number = ?',
    [document_type, document_number]
  );
  
  if (existing.length > 0) {
    return reply.code(409).send({ error: 'Ya existe un cliente con este documento', customer: existing[0] });
  }
  
  const [result] = await pool.query(
    `INSERT INTO customers (document_type, document_number, full_name, phone, email, address, origin)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [document_type, document_number, full_name, phone || null, email || null, address || null, origin]
  );
  
  const [newCustomer] = await pool.query('SELECT * FROM customers WHERE id = ?', [result.insertId]);
  
  return reply.code(201).send({ customer: newCustomer[0] });
}

export async function updateCustomer(request, reply) {
  const { error, value } = customerUpdateSchema.validate(request.body);
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }
  
  const { id } = request.params;
  
  const [existing] = await pool.query('SELECT id FROM customers WHERE id = ?', [id]);
  if (existing.length === 0) {
    return reply.code(404).send({ error: 'Cliente no encontrado' });
  }
  
  if (value.document_type && value.document_number) {
    const [docExists] = await pool.query(
      'SELECT id FROM customers WHERE document_type = ? AND document_number = ? AND id != ?',
      [value.document_type, value.document_number, id]
    );
    if (docExists.length > 0) {
      return reply.code(409).send({ error: 'Ya existe un cliente con este documento' });
    }
  }
  
  const fields = [];
  const params = [];
  
  Object.entries(value).forEach(([key, val]) => {
    if (val !== undefined) {
      fields.push(`${key} = ?`);
      params.push(val);
    }
  });
  
  if (fields.length === 0) {
    return reply.code(400).send({ error: 'No hay campos para actualizar' });
  }
  
  params.push(id);
  
  await pool.query(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`, params);
  
  const [updated] = await pool.query('SELECT * FROM customers WHERE id = ?', [id]);
  
  return reply.send({ customer: updated[0] });
}

export async function reviewPaymentProof(request, reply) {
  const { id } = request.params;
  const { approved } = request.body;
  
  const [existing] = await pool.query('SELECT id, has_payment_proof FROM customers WHERE id = ?', [id]);
  if (existing.length === 0) {
    return reply.code(404).send({ error: 'Cliente no encontrado' });
  }
  
  if (!existing[0].has_payment_proof) {
    return reply.code(400).send({ error: 'El cliente no tiene comprobante de pago' });
  }
  
  if (!approved) {
    await pool.query(
      'UPDATE customers SET has_payment_proof = FALSE, proof_image_url = NULL WHERE id = ?',
      [id]
    );
    return reply.send({ message: 'Comprobante rechazado y eliminado' });
  }
  
  return reply.send({ message: 'Comprobante aprobado' });
}

export async function getPendingProofCount(request, reply) {
  const [result] = await pool.query(
    'SELECT COUNT(*) as count FROM customers WHERE has_payment_proof = TRUE AND origin = "formulario_publico"'
  );
  return reply.send({ count: result[0].count });
}