// ============================================================================
// MIGRACIÓN DE MONETIZACIÓN (bases de datos YA existentes)
// ----------------------------------------------------------------------------
// Ejecuta, de forma idempotente, todo lo necesario para activar planes y
// suscripciones sobre una base SIVEP que ya está en producción:
//   1) Crea las tablas nuevas (organizations, plans, features, ...).
//   2) Agrega users.organization_id si falta.
//   3) Siembra el catálogo de features, planes, plan_features y servicios.
//   4) Crea una organización por defecto y la deja con suscripción activa.
//
// Uso:  npm run db:add-billing
// ============================================================================

import pool from "../config/database.js";
import dotenv from "dotenv";
import {
  billingMigrations,
  ensureUsersOrganizationColumn,
  seedBillingCatalog,
  ensureDefaultOrganization,
} from "./billingSchema.js";

dotenv.config();

async function runBillingMigration() {
  const connection = await pool.getConnection();
  try {
    console.log("Iniciando migración de monetización...");

    await connection.beginTransaction();

    // 1) Tablas nuevas (idempotente).
    for (const migration of billingMigrations) {
      await connection.query(migration);
    }
    console.log("Tablas de monetización creadas/verificadas");

    // 2) Columna de multi-tenant en users (comprobando existencia).
    const added = await ensureUsersOrganizationColumn(connection);
    console.log(
      added
        ? "Columna users.organization_id agregada"
        : "La columna users.organization_id ya existía",
    );

    // 3) Catálogo comercial.
    await seedBillingCatalog(connection);
    console.log("Catálogo de features, planes y servicios sembrado");

    // 4) Organización por defecto con suscripción activa.
    const organizationId = await ensureDefaultOrganization(connection);
    console.log(`Organización por defecto lista (id ${organizationId})`);

    await connection.commit();
    console.log("Migración de monetización completada exitosamente");
  } catch (error) {
    await connection.rollback();
    console.error("Error en la migración de monetización:", error);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

runBillingMigration().catch((error) => {
  console.error(error);
  process.exit(1);
});
