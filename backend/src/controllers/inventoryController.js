import pool from '../config/database.js';
import { inventoryMovementSchema } from '../validators/index.js';
import { calculatePagination, buildPaginatedResponse } from '../utils/helpers.js';

export async function getInventory(request, reply) {
  const { page, limit, offset } = calculatePagination(request.query.page, request.query.limit);
  const { search, category, low_stock } = request.query;
  
  let whereClause = 'WHERE is_active = TRUE';
  const params = [];
  
  if (search) {
    whereClause += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  
  if (category) {
    whereClause += ' AND category = ?';
    params.push(category);
  }
  
  if (low_stock === 'true') {
    whereClause += ' AND current_stock <= min_stock';
  }
  
  const [products] = await pool.query(
    `SELECT * FROM products ${whereClause}
     ORDER BY name ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  
  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM products ${whereClause}`,
    params
  );
  
  return reply.send(buildPaginatedResponse(products, countResult[0].total, page, limit));
}

export async function createInventoryMovement(request, reply) {
  const { error, value } = inventoryMovementSchema.validate(request.body);
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }
  
  const { product_id, movement_type, quantity, reason, reference_type, reference_id } = value;
  const created_by = request.user.id;
  
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const [products] = await connection.query('SELECT id, name, current_stock FROM products WHERE id = ?', [product_id]);
    
    if (products.length === 0) {
      return reply.code(404).send({ error: 'Producto no encontrado' });
    }
    
    const product = products[0];
    const previousStock = product.current_stock;
    let newStock = previousStock;
    
    if (movement_type === 'entrada') {
      newStock = previousStock + quantity;
    } else if (movement_type === 'salida') {
      if (previousStock < quantity) {
        throw new Error(`Stock insuficiente. Disponible: ${previousStock}, Solicitado: ${quantity}`);
      }
      newStock = previousStock - quantity;
    } else if (movement_type === 'ajuste') {
      newStock = quantity;
    }
    
    await connection.query('UPDATE products SET current_stock = ? WHERE id = ?', [newStock, product_id]);
    
    const [movementResult] = await connection.query(
      `INSERT INTO inventory_movements (product_id, movement_type, quantity, previous_stock, new_stock, reason, reference_type, reference_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [product_id, movement_type, quantity, previousStock, newStock, reason, reference_type, reference_id || null, created_by]
    );
    
    await connection.commit();
    
    const [newMovement] = await connection.query(
      `SELECT im.*, p.name as product_name, p.unit as product_unit, u.full_name as created_by_name
       FROM inventory_movements im
       JOIN products p ON im.product_id = p.id
       JOIN users u ON im.created_by = u.id
       WHERE im.id = ?`,
      [movementResult.insertId]
    );
    
    return reply.code(201).send({ movement: newMovement[0] });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getInventoryMovements(request, reply) {
  const { page, limit, offset } = calculatePagination(request.query.page, request.query.limit);
  const { product_id, movement_type, start_date, end_date } = request.query;
  
  let whereClause = 'WHERE 1=1';
  const params = [];
  
  if (product_id) {
    whereClause += ' AND im.product_id = ?';
    params.push(product_id);
  }
  
  if (movement_type) {
    whereClause += ' AND im.movement_type = ?';
    params.push(movement_type);
  }
  
  if (start_date) {
    whereClause += ' AND im.created_at >= ?';
    params.push(start_date);
  }
  
  if (end_date) {
    whereClause += ' AND im.created_at <= ?';
    params.push(end_date);
  }
  
  const [movements] = await pool.query(
    `SELECT im.*, p.name as product_name, p.unit as product_unit, u.full_name as created_by_name
     FROM inventory_movements im
     JOIN products p ON im.product_id = p.id
     JOIN users u ON im.created_by = u.id
     ${whereClause}
     ORDER BY im.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  
  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM inventory_movements im ${whereClause}`,
    params
  );
  
  return reply.send(buildPaginatedResponse(movements, countResult[0].total, page, limit));
}