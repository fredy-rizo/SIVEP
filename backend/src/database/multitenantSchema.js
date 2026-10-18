// ============================================================================
// ESQUEMA MULTI-TENANT DE SIVEP — aislamiento de datos por organización
// ----------------------------------------------------------------------------
// ¿POR QUÉ existe este módulo?
//   La monetización (planes, suscripciones, features) ya vive en
//   `billingSchema.js`, pero los datos de NEGOCIO (productos, clientes, ventas e
//   inventario) eran globales: cualquier usuario veía los datos de todas las
//   granjas. Para vender SIVEP a varias organizaciones, cada fila de negocio
//   debe pertenecer a una organización (`organization_id`) y todas las consultas
//   deben filtrar por ella.
//
// CÓMO funciona:
//   `ensureOrganizationColumns()` agrega la columna `organization_id` a las
//   tablas de negocio de forma IDEMPOTENTE, rellena las filas existentes con la
//   organización por defecto, la marca NOT NULL y crea índice + clave foránea.
//   Se ejecuta tanto desde `migrate.js` (instalación desde cero) como desde
//   `add-multitenant-schema.js` (bases de datos ya existentes).
// ============================================================================

import { ensureDefaultOrganization } from "./billingSchema.js";

// Tablas de negocio que deben quedar aisladas por organización.
export const TENANT_TABLES = [
  "products",
  "customers",
  "sales",
  "inventory_movements",
];

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows.length > 0;
}

async function indexExists(connection, table, indexName) {
  const [rows] = await connection.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName],
  );
  return rows.length > 0;
}

async function constraintExists(connection, table, constraintName) {
  const [rows] = await connection.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [table, constraintName],
  );
  return rows.length > 0;
}

// Agrega organization_id a todas las tablas de negocio. Devuelve la organización
// por defecto y la lista de tablas a las que se les agregó la columna.
export async function ensureOrganizationColumns(connection) {
  // Garantiza que exista la organización por defecto antes de referenciarla.
  const defaultOrgId = await ensureDefaultOrganization(connection);
  const addedTables = [];

  for (const table of TENANT_TABLES) {
    if (!(await columnExists(connection, table, "organization_id"))) {
      await connection.query(
        `ALTER TABLE ${table} ADD COLUMN organization_id INT NULL AFTER id`,
      );
      addedTables.push(table);
    }

    // Backfill: todo dato preexistente pertenece a la organización por defecto.
    await connection.query(
      `UPDATE ${table} SET organization_id = ? WHERE organization_id IS NULL`,
      [defaultOrgId],
    );

    // Reforzar NOT NULL: los datos ya tienen valor y así se evita que futuras
    // inserciones omitan la organización por descuido.
    await connection.query(
      `ALTER TABLE ${table} MODIFY COLUMN organization_id INT NOT NULL`,
    );

    const indexName = `idx_${table}_org`;
    if (!(await indexExists(connection, table, indexName))) {
      await connection.query(
        `ALTER TABLE ${table} ADD INDEX ${indexName} (organization_id)`,
      );
    }

    const fkName = `fk_${table}_org`;
    if (!(await constraintExists(connection, table, fkName))) {
      await connection.query(
        `ALTER TABLE ${table} ADD CONSTRAINT ${fkName}
         FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE`,
      );
    }
  }

  // El documento de cliente pasa a ser único por organización.
  await ensureCustomersDocumentUniquePerOrg(connection);

  return { defaultOrgId, addedTables };
}

// ---------------------------------------------------------------------------
// El documento de un cliente solo debe ser único DENTRO de su organización:
// dos granjas distintas pueden tener el mismo cliente. Se reemplaza el índice
// único global (document_type, document_number) por uno compuesto con
// organization_id. Idempotente.
// ---------------------------------------------------------------------------
export async function ensureCustomersDocumentUniquePerOrg(connection) {
  const [indexes] = await connection.query(
    `SELECT INDEX_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers'
       AND INDEX_NAME = 'uk_customers_document'
     ORDER BY SEQ_IN_INDEX`,
  );
  if (indexes.length === 0) return false;

  const columns = indexes.map((i) => i.COLUMN_NAME);
  const alreadyScoped = columns.includes("organization_id");
  if (alreadyScoped) return false;

  await connection.query(
    "ALTER TABLE customers DROP INDEX uk_customers_document",
  );
  await connection.query(
    `ALTER TABLE customers
     ADD UNIQUE KEY uk_customers_document (organization_id, document_type, document_number)`,
  );
  return true;
}
