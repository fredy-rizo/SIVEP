// ============================================================================
// CATÁLOGO PÚBLICO — consulta compartida de productos disponibles
// ----------------------------------------------------------------------------
// Centraliza la consulta que alimenta el escaparate público. Tener una sola
// definición evita que el endpoint HTTP, la caché y los eventos WebSocket
// muestren listas distintas (por ejemplo, con o sin productos agotados).
// ============================================================================

import pool from "../config/database.js";

// Productos que un cliente puede comprar hoy: activos y con existencias.
// El orden es estable para que la lista no "salte" entre actualizaciones.
// `executor` permite reutilizar la conexión de una transacción recién
// confirmada (evita pedir otra conexión al pool y posibles esperas).
export async function fetchPublicProducts(organizationId, executor = pool) {
  if (!organizationId) return [];

  const [products] = await executor.query(
    `SELECT id, name, unit, current_price, current_stock, category, description, image_url
     FROM products
     WHERE is_active = TRUE AND current_stock > 0 AND organization_id = ?
     ORDER BY category, name`,
    [organizationId],
  );

  return products;
}
