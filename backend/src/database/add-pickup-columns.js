import pool from '../config/database.js';
import dotenv from 'dotenv';
import { generatePickupCode } from '../utils/pickup.js';

dotenv.config();

async function ensureColumn(connection, column, definition) {
  const [cols] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales' AND COLUMN_NAME = ?`,
    [column]
  );
  if (cols.length === 0) {
    await connection.query(`ALTER TABLE sales ADD COLUMN ${column} ${definition}`);
    console.log(`Columna ${column} agregada`);
  } else {
    console.log(`La columna ${column} ya existe`);
  }
}

async function backfillCodes(connection) {
  const [pending] = await connection.query('SELECT id FROM sales WHERE pickup_code IS NULL');
  for (const row of pending) {
    for (let i = 0; i < 10; i++) {
      const code = generatePickupCode();
      try {
        await connection.query('UPDATE sales SET pickup_code = ? WHERE id = ?', [code, row.id]);
        break;
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY') throw err;
      }
    }
  }
  console.log(`Códigos generados para ${pending.length} venta(s) existente(s)`);
}

async function run() {
  const connection = await pool.getConnection();
  try {
    await ensureColumn(connection, 'pickup_code', 'VARCHAR(20) NULL UNIQUE');
    await ensureColumn(connection, 'pickup_status', "ENUM('pendiente', 'entregado') NOT NULL DEFAULT 'pendiente'");
    await backfillCodes(connection);
    console.log('Migración de códigos de reclamo completada');
  } catch (error) {
    console.error('Error en migración:', error);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

run().catch(console.error);