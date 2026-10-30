// ============================================================================
// CONTROLADOR DE INVENTARIO — SIVEP
// ----------------------------------------------------------------------------
// Expone tres operaciones:
//   GET  /api/inventory           → productos con stock (paginado/filtrable).
//   POST /api/inventory/movements → entrada, salida o ajuste manual.
//   GET  /api/inventory/movements → historial de movimientos.
//
// Las escrituras delegan en `inventoryService`, que bloquea la fila del producto
// y evita condiciones de carrera. Después del commit se publica el cambio por
// WebSocket para que el escaparate y el panel se actualicen solos.
// ============================================================================

import pool from '../config/database.js';
import { inventoryMovementSchema } from '../validators/index.js';
import { calculatePagination, buildPaginatedResponse } from '../utils/helpers.js';
import { applyStockMovement, InventoryError } from '../services/inventoryService.js';
import { publishCatalogUpdate } from '../services/catalogEvents.js';

// Lista de productos de la organización con filtros de búsqueda, categoría y
// stock bajo. Solo devuelve productos activos.
export async function getInventory(request, reply) {
  const { page, limit, offset } = calculatePagination(request.query.page, request.query.limit);
  const { search, category, low_stock } = request.query;
  
  let whereClause = 'WHERE is_active = TRUE AND organization_id = ?';
  const params = [request.organizationId];
  
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

// Registra un movimiento manual de inventario dentro de una transacción.
// El servicio valida el stock real con la fila bloqueada; así dos salidas
// simultáneas no pueden dejar el inventario en negativo.
export async function createInventoryMovement(request, reply) {
  const { error, value } = inventoryMovementSchema.validate(request.body);
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }
  
  const { product_id, movement_type, quantity, reason, reference_type, reference_id } = value;
  const created_by = request.user.id;
  const organizationId = request.organizationId;
  
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Operación atómica: valida, actualiza products y escribe el movimiento.
    const change = await applyStockMovement(connection, {
      organizationId,
      productId: product_id,
      movementType: movement_type,
      quantity,
      reason,
      referenceType: reference_type || 'ajuste_manual',
      referenceId: reference_id || null,
      createdBy: created_by,
    });

    await connection.commit();

    // Fuera de la transacción: caché y WebSocket solo ven datos confirmados.
    await publishCatalogUpdate(organizationId, [change], { connection });

    const [newMovement] = await connection.query(
      `SELECT im.*, p.name as product_name, p.unit as product_unit, u.full_name as created_by_name
       FROM inventory_movements im
       JOIN products p ON im.product_id = p.id
       JOIN users u ON im.created_by = u.id
       WHERE im.id = ? AND im.organization_id = ?`,
      [change.movementId, organizationId]
    );
    
    return reply.code(201).send({ movement: newMovement[0] });
  } catch (error) {
    await connection.rollback();

    // Los errores de stock tienen status propio (404/409) y un mensaje claro
    // para el operador; el resto se deja al manejador global.
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

// Historial de movimientos con filtros por producto, tipo y fechas.
export async function getInventoryMovements(request, reply) {
  const { page, limit, offset } = calculatePagination(request.query.page, request.query.limit);
  const { product_id, movement_type, start_date, end_date } = request.query;
  
  let whereClause = 'WHERE im.organization_id = ?';
  const params = [request.organizationId];
  
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
