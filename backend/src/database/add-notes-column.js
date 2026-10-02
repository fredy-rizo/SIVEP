import pool from "../config/database.js";
import dotenv from "dotenv";

dotenv.config();

async function addNotesColumn() {
  const connection = await pool.getConnection();
  try {
    console.log("Agregando columna notes a customers...");

    // Check if column exists
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'customers' 
      AND COLUMN_NAME = 'notes'
    `);

    if (columns.length === 0) {
      await connection.query(`
        ALTER TABLE customers 
        ADD COLUMN notes TEXT NULL 
        AFTER proof_image_url
      `);
      console.log("Columna notes agregada exitosamente");
    } else {
      console.log("La columna notes ya existe");
    }
  } catch (error) {
    console.error("Error agregando columna notes:", error);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

addNotesColumn().catch(console.error);
