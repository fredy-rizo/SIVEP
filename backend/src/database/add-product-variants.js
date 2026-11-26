import pool from "../config/database.js";
import dotenv from "dotenv";
import { ensureProductVariants } from "./productVariantsSchema.js";

dotenv.config();

async function run() {
  const connection = await pool.getConnection();
  try {
    console.log("Agregando presentaciones de producto (product_variants)...");
    await ensureProductVariants(connection);
    console.log("Migración de presentaciones completada");
  } catch (error) {
    console.error("Error en migración de presentaciones:", error);
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
