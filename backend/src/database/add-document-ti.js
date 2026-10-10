import pool from "../config/database.js";
import dotenv from "dotenv";

dotenv.config();

// Agrega 'TI' (Tarjeta de Identidad) al ENUM document_type de customers.
// Idempotente: si la columna ya incluye 'TI', no hace nada.
async function run() {
  const connection = await pool.getConnection();
  try {
    const [cols] = await connection.query(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers'
       AND COLUMN_NAME = 'document_type'`,
    );
    const current = cols[0]?.COLUMN_TYPE || "";
    if (current.includes("'TI'")) {
      console.log("El tipo TI ya existe en customers.document_type");
    } else {
      await connection.query(
        `ALTER TABLE customers MODIFY COLUMN document_type
         ENUM('CC', 'CE', 'TI', 'NIT', 'PASSPORT') NOT NULL DEFAULT 'CC'`,
      );
      console.log("Tipo TI agregado a customers.document_type");
    }
  } catch (error) {
    console.error("Error en migración:", error);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

run().catch(console.error);
