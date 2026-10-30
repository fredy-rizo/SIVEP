import pool from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// VENTAS EXTERNAS (compras hechas en la página de la UNAL)
// ----------------------------------------------------------------------------
// El nuevo formulario público no elige productos del inventario: lee el PDF
// del comprobante y registra una venta con las descripciones pagadas. Cuando
// la descripción o el precio permiten identificar el producto, el controlador
// descuenta el stock; si no, la línea queda sin producto y con una advertencia.
// Por eso `sale_items` necesita:
//   - `description`: el texto de la descripción del comprobante.
//   - `source`: 'inventario' (venta normal) o 'externo' (venta del comprobante).
//   - `product_id` nullable: se llena solo cuando la compra se pudo emparejar.
// Además, `customers.last_purchase_at` guarda la fecha de la compra leída del
// PDF. La migración es idempotente.
// ============================================================================

async function columnInfo(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows[0] || null;
}

async function ensureColumn(connection, table, column, definition) {
  const existing = await columnInfo(connection, table, column);
  if (existing) {
    console.log(`La columna ${table}.${column} ya existe`);
    return;
  }
  await connection.query(
    `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
  );
  console.log(`Columna ${table}.${column} agregada`);
}

async function ensureNullableProductId(connection) {
  const info = await columnInfo(connection, 'sale_items', 'product_id');
  if (!info) {
    throw new Error('No existe sale_items.product_id');
  }
  if (info.IS_NULLABLE === 'YES') {
    console.log('sale_items.product_id ya permite NULL');
    return;
  }
  await connection.query(
    'ALTER TABLE sale_items MODIFY COLUMN product_id INT NULL',
  );
  console.log('sale_items.product_id ahora permite NULL');
}

async function run() {
  const connection = await pool.getConnection();
  try {
    await ensureColumn(
      connection,
      'sale_items',
      'description',
      'VARCHAR(255) NULL AFTER product_id',
    );
    await ensureColumn(
      connection,
      'sale_items',
      'source',
      "ENUM('inventario', 'externo') NOT NULL DEFAULT 'inventario' AFTER description",
    );
    await ensureNullableProductId(connection);
    await ensureColumn(
      connection,
      'customers',
      'last_purchase_at',
      'TIMESTAMP NULL',
    );

    // Índice para buscar ventas externas por su origen sin recorrer todo.
    const [indexes] = await connection.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_items'
         AND INDEX_NAME = 'idx_sale_items_source'`,
    );
    if (indexes.length === 0) {
      await connection.query(
        'ALTER TABLE sale_items ADD INDEX idx_sale_items_source (source)',
      );
      console.log('Índice idx_sale_items_source agregado');
    } else {
      console.log('El índice idx_sale_items_source ya existe');
    }

    console.log('Migración de ventas externas completada');
  } catch (error) {
    console.error('Error en migración:', error);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
