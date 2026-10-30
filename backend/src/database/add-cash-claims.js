import pool from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// SOLICITUDES DE COMPRA EN EFECTIVO — validación manual
// ----------------------------------------------------------------------------
// La caja es de la Universidad y la granja NO controla los códigos que entrega.
// Por eso una compra en efectivo no se registra como venta directa:
//
//   1. El comprador paga en caja y recibe un recibo físico con un código.
//   2. En SIVEP llena una SOLICITUD con sus datos, los productos del catálogo
//      y una foto/PDF del recibo.
//   3. Un administrador compara la solicitud con el recibo y decide.
//   4. Solo al APROBAR se crea la venta, se descuenta stock y se genera el
//      código de reclamo. Hasta ese momento el inventario no se toca.
//
// `cash_purchase_claims` guarda la solicitud y su estado; los productos
// declarados viven en `cash_purchase_claim_items` con precio y nombre
// congelados (snapshot), para que un cambio posterior del catálogo no altere
// lo que el administrador revisó.
//
// La migración es idempotente: se puede ejecutar varias veces sin duplicar.
// ============================================================================

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return rows.length > 0;
}

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

// Un recibo de caja solo puede sustentar UNA solicitud activa (pendiente o
// aprobada). Si la solicitud se rechaza, el código queda libre para que el
// comprador corrija y reenvíe. MySQL permite varios NULL en un índice único,
// así que una columna generada resuelve la regla sin lógica adicional.
async function ensureActiveReceiptConstraint(connection) {
  if (
    !(await columnExists(
      connection,
      "cash_purchase_claims",
      "active_receipt_code",
    ))
  ) {
    await connection.query(`
      ALTER TABLE cash_purchase_claims
      ADD COLUMN active_receipt_code VARCHAR(50)
        GENERATED ALWAYS AS (
          CASE WHEN status IN ('pendiente', 'aprobada') THEN cash_receipt_code ELSE NULL END
        ) STORED
    `);
    console.log("Columna generada active_receipt_code agregada");
  }

  if (
    !(await indexExists(
      connection,
      "cash_purchase_claims",
      "uk_cash_claims_active_receipt",
    ))
  ) {
    await connection.query(`
      ALTER TABLE cash_purchase_claims
      ADD UNIQUE KEY uk_cash_claims_active_receipt (organization_id, active_receipt_code)
    `);
    console.log("Índice único de recibo activo agregado");
  }
}

async function run() {
  const connection = await pool.getConnection();

  try {
    if (await tableExists(connection, 'cash_purchase_claims')) {
      console.log('La tabla cash_purchase_claims ya existe');
    } else {
      await connection.query(`
        CREATE TABLE cash_purchase_claims (
          id INT AUTO_INCREMENT PRIMARY KEY,
          organization_id INT NOT NULL,
          claim_code VARCHAR(20) NOT NULL UNIQUE,
          cash_receipt_code VARCHAR(50) NOT NULL,
          document_type ENUM('CC', 'CE', 'TI', 'NIT', 'PASSPORT') NOT NULL DEFAULT 'CC',
          document_number VARCHAR(50) NOT NULL,
          full_name VARCHAR(255) NOT NULL,
          phone VARCHAR(50) NULL,
          email VARCHAR(255) NULL,
          purchase_date DATE NOT NULL,
          declared_total DECIMAL(15,2) NOT NULL DEFAULT 0.00,
          computed_total DECIMAL(15,2) NOT NULL DEFAULT 0.00,
          receipt_url VARCHAR(500) NOT NULL,
          receipt_filename VARCHAR(255) NULL,
          notes TEXT NULL,
          status ENUM('pendiente', 'aprobada', 'rechazada') NOT NULL DEFAULT 'pendiente',
          rejection_reason TEXT NULL,
          reviewed_by INT NULL,
          reviewed_at TIMESTAMP NULL,
          sale_id INT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL,
          INDEX idx_cash_claims_org (organization_id),
          INDEX idx_cash_claims_status (status),
          INDEX idx_cash_claims_receipt (cash_receipt_code),
          INDEX idx_cash_claims_document (document_number)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('Tabla cash_purchase_claims creada');
    }

    if (await tableExists(connection, 'cash_purchase_claim_items')) {
      console.log('La tabla cash_purchase_claim_items ya existe');
    } else {
      await connection.query(`
        CREATE TABLE cash_purchase_claim_items (
          id INT AUTO_INCREMENT PRIMARY KEY,
          claim_id INT NOT NULL,
          product_id INT NOT NULL,
          product_name VARCHAR(255) NOT NULL,
          product_unit VARCHAR(50) NULL,
          unit_price DECIMAL(15,2) NOT NULL,
          quantity INT NOT NULL,
          total DECIMAL(15,2) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (claim_id) REFERENCES cash_purchase_claims(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
          INDEX idx_cash_claim_items_claim (claim_id),
          INDEX idx_cash_claim_items_product (product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('Tabla cash_purchase_claim_items creada');
    }

    await ensureActiveReceiptConstraint(connection);

    console.log('Migración de solicitudes de efectivo completada');
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
