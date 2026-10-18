// ============================================================================
// MIGRACIÓN MULTI-TENANT — SIVEP
// ----------------------------------------------------------------------------
// Script para BASES DE DATOS YA EXISTENTES: agrega `organization_id` a las
// tablas de negocio (products, customers, sales, inventory_movements), rellena
// los datos actuales con la organización por defecto y crea índices/claves
// foráneas. Es idempotente: puede ejecutarse varias veces sin efectos dañinos.
//
// Uso:  pnpm run db:add-multitenant
// ============================================================================

import pool from "../config/database.js";
import dotenv from "dotenv";
import { ensureUsersOrganizationColumn } from "./billingSchema.js";
import { ensureOrganizationColumns } from "./multitenantSchema.js";

dotenv.config();

async function run() {
  const connection = await pool.getConnection();
  try {
    console.log("Iniciando migración multi-tenant...");

    // La organización va en `users`; se asegura antes de poblar las tablas.
    await ensureUsersOrganizationColumn(connection);

    const { defaultOrgId, addedTables } = await ensureOrganizationColumns(connection);

    console.log(`Organización por defecto: id ${defaultOrgId}`);
    console.log(
      addedTables.length > 0
        ? `Columna organization_id agregada a: ${addedTables.join(", ")}`
        : "Las tablas de negocio ya tenían organization_id",
    );
    console.log("Migración multi-tenant completada exitosamente");
  } catch (error) {
    console.error("Error en migración multi-tenant:", error);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

run();
