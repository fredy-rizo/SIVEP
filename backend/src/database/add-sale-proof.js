import pool from "../config/database.js";
import dotenv from "dotenv";

dotenv.config();

// Agrega `sales.proof_url`: comprobante propio de cada venta. Antes el
// comprobante vivía solo en el cliente (`customers.proof_image_url`), así que
// todas sus compras compartían el mismo archivo.
async function addSaleProofColumn() {
  const connection = await pool.getConnection();
  try {
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'sales'
        AND COLUMN_NAME = 'proof_url'
    `);

    if (columns.length === 0) {
      await connection.query(`
        ALTER TABLE sales
        ADD COLUMN proof_url VARCHAR(500) NULL
        AFTER ecollect_paid_at
      `);
      console.log("Columna sales.proof_url agregada");
    } else {
      console.log("La columna sales.proof_url ya existe");
    }
  } finally {
    connection.release();
    await pool.end();
  }
}

addSaleProofColumn().catch((error) => {
  console.error("Error agregando sales.proof_url:", error.message);
  process.exitCode = 1;
});
