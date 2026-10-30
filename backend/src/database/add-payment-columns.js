import pool from '../config/database.js';
import dotenv from 'dotenv';

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

async function ensurePaymentStatusEnum(connection) {
  const [rows] = await connection.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales' AND COLUMN_NAME = 'payment_status'`
  );
  const currentType = rows[0]?.COLUMN_TYPE || '';
  const desiredType =
    "ENUM('pendiente', 'pagado', 'revision', 'vencido') NOT NULL DEFAULT 'pendiente'";
  if (currentType !== desiredType) {
    await connection.query(`ALTER TABLE sales MODIFY COLUMN payment_status ${desiredType}`);
    console.log('ENUM payment_status actualizado');
  } else {
    console.log('ENUM payment_status ya está configurado');
  }
}

async function run() {
  const connection = await pool.getConnection();
  try {
    // payment_mode: 'online' (comprobante eCollect leído/validado) | 'efectivo' (pago en caja).
    await ensureColumn(connection, 'payment_mode', "VARCHAR(10) NOT NULL DEFAULT 'online'");
    await ensureColumn(connection, 'cash_receipt_code', 'VARCHAR(50) NULL UNIQUE');
    await ensureColumn(connection, 'ecollect_transaction_id', 'VARCHAR(20) NULL UNIQUE');
    await ensureColumn(connection, 'ecollect_amount', 'DECIMAL(12,2) NULL');
    await ensureColumn(connection, 'ecollect_paid_at', 'TIMESTAMP NULL');
    await ensureColumn(connection, 'paid_at', 'TIMESTAMP NULL');
    await ensureColumn(connection, 'review_reason', 'TEXT NULL');
    await ensurePaymentStatusEnum(connection);
    console.log('Migración de pagos/eCollect completada');
  } catch (error) {
    console.error('Error en migración:', error);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

run().catch(console.error);
