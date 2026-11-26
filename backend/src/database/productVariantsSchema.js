// ============================================================================
// PRESENTACIONES DE PRODUCTO (variantes) — esquema idempotente
// ----------------------------------------------------------------------------
// ¿POR QUÉ existe este módulo?
//   Un mismo producto se vende en varias presentaciones con precios distintos:
//   huevos por cubeta o media cubeta, miel por tarro de 465 g / 650 g o por
//   kilo, cachama con o sin escamas, porcino por kilo vivo. Si se crearan
//   productos separados por presentación, el inventario se duplicaría y los
//   reportes dejarían de sumar por producto.
//
// MODELO:
//   `products`       → ítem de inventario. `current_stock` está en su unidad
//                      base (`unit`) y es decimal (kg, cubetas...).
//   `product_variants` → presentación comprable. `price` es el precio de la
//                      presentación y `stock_factor` cuántas unidades base
//                      descuenta una unidad vendida de esa presentación.
//
// Ejemplos:
//   Huevos (stock en cubetas) → Cubeta (factor 1, $12.000),
//                               Media cubeta (factor 0,5, $6.000).
//   Miel (stock en kg)        → Tarro 465 g (factor 0,465, $22.000),
//                               Tarro 650 g (factor 0,65, $30.000),
//                               Kilo (factor 1, $45.000).
//
// Se ejecuta desde `migrate.js` y desde `add-product-variants.js` (bases ya
// existentes). Todas las operaciones comprueban antes para poder repetirse.
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

async function constraintExists(connection, table, constraintName) {
  const [rows] = await connection.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [table, constraintName],
  );
  return rows.length > 0;
}

// Cambia una columna a DECIMAL(12,3) solo si todavía es entera. Evita repetir
// el ALTER (que es costoso) en cada arranque.
async function ensureDecimalColumn(connection, table, column) {
  if (!(await tableExists(connection, table))) return false;
  if (!(await columnExists(connection, table, column))) return false;

  const [rows] = await connection.query(
    `SELECT DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  const info = rows[0];
  if (!info) return false;
  if (info.DATA_TYPE === "decimal" && Number(info.NUMERIC_SCALE) >= 3) {
    return false;
  }

  await connection.query(
    `ALTER TABLE ${table} MODIFY COLUMN ${column} DECIMAL(12,3) NOT NULL`,
  );
  return true;
}

async function addColumn(connection, table, column, definition) {
  if (!(await tableExists(connection, table))) return false;
  if (await columnExists(connection, table, column)) return false;
  await connection.query(
    `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
  );
  return true;
}

export async function ensureProductVariants(connection) {
  // 1. Tabla de presentaciones. Se crea después de `organizations` porque la
  //    referencia; por eso este módulo corre al final de las migraciones.
  if (!(await tableExists(connection, "product_variants"))) {
    await connection.query(`
      CREATE TABLE product_variants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        organization_id INT NOT NULL,
        product_id INT NOT NULL,
        name VARCHAR(120) NOT NULL,
        unit_label VARCHAR(50) NOT NULL,
        price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        stock_factor DECIMAL(12,4) NOT NULL DEFAULT 1.0000,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        INDEX idx_product_variants_product (product_id),
        INDEX idx_product_variants_org (organization_id),
        INDEX idx_product_variants_active (product_id, is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  // 2. Stock decimal: el peso (kg) y las medias cubetas no son enteros.
  await ensureDecimalColumn(connection, "products", "current_stock");
  await ensureDecimalColumn(connection, "products", "min_stock");
  await ensureDecimalColumn(connection, "sale_items", "quantity");
  await ensureDecimalColumn(connection, "inventory_movements", "quantity");
  await ensureDecimalColumn(connection, "inventory_movements", "previous_stock");
  await ensureDecimalColumn(connection, "inventory_movements", "new_stock");

  // 3. Referencia a la presentación en las líneas de venta y en las
  //    solicitudes de efectivo. Se guarda también el nombre para que el
  //    comprobante siga siendo legible aunque la presentación se desactive.
  await addColumn(connection, "sale_items", "variant_id", "INT NULL");
  await addColumn(connection, "sale_items", "variant_name", "VARCHAR(120) NULL");
  await addColumn(connection, "sale_items", "unit_label", "VARCHAR(50) NULL");
  if (
    (await columnExists(connection, "sale_items", "variant_id")) &&
    !(await constraintExists(connection, "sale_items", "fk_sale_items_variant"))
  ) {
    await connection.query(
      `ALTER TABLE sale_items
       ADD CONSTRAINT fk_sale_items_variant
       FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL`,
    );
  }
  if (
    (await columnExists(connection, "sale_items", "variant_id")) &&
    !(await indexExists(connection, "sale_items", "idx_sale_items_variant"))
  ) {
    await connection.query(
      "ALTER TABLE sale_items ADD INDEX idx_sale_items_variant (variant_id)",
    );
  }

  if (await tableExists(connection, "cash_purchase_claim_items")) {
    await ensureDecimalColumn(
      connection,
      "cash_purchase_claim_items",
      "quantity",
    );
    await addColumn(
      connection,
      "cash_purchase_claim_items",
      "variant_id",
      "INT NULL",
    );
    await addColumn(
      connection,
      "cash_purchase_claim_items",
      "variant_name",
      "VARCHAR(120) NULL",
    );
  }

  // 4. Compatibilidad: cada producto existente sin presentaciones recibe una
  //    equivalente a su unidad actual. Así el catálogo y las ventas siguen
  //    funcionando antes de capturar los precios reales por presentación.
  await connection.query(`
    INSERT INTO product_variants
      (organization_id, product_id, name, unit_label, price, stock_factor, sort_order)
    SELECT p.organization_id, p.id,
           CONCAT(UPPER(LEFT(p.unit, 1)), SUBSTRING(p.unit, 2)),
           p.unit, p.current_price, 1, 0
    FROM products p
    LEFT JOIN product_variants v
      ON v.product_id = p.id AND v.organization_id = p.organization_id
    WHERE v.id IS NULL
  `);

  // 5. Presentaciones reales de la granja. Solo se aplican sobre productos que
  //    aún conservan la presentación genérica del paso 4 (misma unidad, mismo
  //    precio y factor 1). Si el administrador ya las personalizó, no se
  //    sobrescriben. El stock numérico NO se convierte: queda en la unidad base
  //    nueva para que el administrador lo ajuste con un conteo físico.
  await ensureRealPresentations(connection);

  // 6. Conversión de Huevos a base en huevos individuales (30 por cubeta,
  //    15 por media cubeta). Solo se aplica una vez: detecta la presentación
  //    anterior (factor 1 / 0,5) y la convierte. Después el producto queda con
  //    unidad "huevo" y no vuelve a entrar aquí.
  await convertPorcinoToUnits(connection);

  return true;
}

const REAL_PRESENTATIONS = {
  huevos: {
    unit: "huevo",
    price: 400,
    variants: [
      { name: "Cubeta", unit_label: "cubeta", price: 12000, stock_factor: 30 },
      {
        name: "Media cubeta",
        unit_label: "media cubeta",
        price: 6000,
        stock_factor: 15,
      },
    ],
  },
  peces: {
    unit: "kg",
    price: 12000,
    variants: [
      { name: "Con escamas", unit_label: "kg", price: 12000, stock_factor: 1 },
      { name: "Sin escamas", unit_label: "kg", price: 14000, stock_factor: 1 },
    ],
  },
  miel: {
    unit: "kg",
    price: 45000,
    variants: [
      {
        name: "Tarro 465 g",
        unit_label: "tarro 465 g",
        price: 22000,
        stock_factor: 0.465,
      },
      {
        name: "Tarro 650 g",
        unit_label: "tarro 650 g",
        price: 30000,
        stock_factor: 0.65,
      },
      { name: "Kilo", unit_label: "kg", price: 45000, stock_factor: 1 },
    ],
  },
  porcino: {
    unit: "unidad",
    price: 5000,
    variants: [
      { name: "Unidad", unit_label: "unidad", price: 5000, stock_factor: 1 },
    ],
  },
};

function normalizeProductName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function ensureRealPresentations(connection) {
  const [rows] = await connection.query(`
    SELECT p.id, p.organization_id, p.name, p.unit, p.current_price,
           COUNT(v.id) AS variant_count,
           MAX(v.name) AS variant_name,
           MAX(v.price) AS variant_price,
           MAX(v.stock_factor) AS variant_factor
    FROM products p
    JOIN product_variants v
      ON v.product_id = p.id AND v.organization_id = p.organization_id
    GROUP BY p.id, p.organization_id, p.name, p.unit, p.current_price
    HAVING variant_count = 1
  `);

  for (const row of rows) {
    const real = REAL_PRESENTATIONS[normalizeProductName(row.name)];
    if (!real) continue;

    const isGeneric =
      String(row.variant_name) === capitalize(String(row.unit)) &&
      Number(row.variant_price) === Number(row.current_price) &&
      Number(row.variant_factor) === 1;
    if (!isGeneric) continue;

    await connection.query(
      "UPDATE products SET unit = ?, current_price = ? WHERE id = ? AND organization_id = ?",
      [real.unit, real.price, row.id, row.organization_id],
    );
    await connection.query(
      "DELETE FROM product_variants WHERE product_id = ? AND organization_id = ?",
      [row.id, row.organization_id],
    );
    for (const [index, variant] of real.variants.entries()) {
      await connection.query(
        `INSERT INTO product_variants
           (organization_id, product_id, name, unit_label, price, stock_factor, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.organization_id,
          row.id,
          variant.name,
          variant.unit_label,
          variant.price,
          variant.stock_factor,
          index,
        ],
      );
    }
    console.log(
      `Presentaciones reales aplicadas a "${row.name}" (stock base: ${real.unit})`,
    );
  }
}

async function convertHuevosToEggBase(connection) {
  const [rows] = await connection.query(`
    SELECT p.id, p.organization_id, p.current_stock, p.min_stock
    FROM products p
    WHERE p.unit = 'cubeta' AND LOWER(p.name) = 'huevos'
  `);

  for (const row of rows) {
    const [variants] = await connection.query(
      `SELECT id, name, stock_factor
       FROM product_variants
       WHERE product_id = ? AND organization_id = ?`,
      [row.id, row.organization_id],
    );
    const cubeta = variants.find((v) => v.name === "Cubeta");
    const media = variants.find((v) => v.name === "Media cubeta");
    if (!cubeta || !media) continue;
    if (Number(cubeta.stock_factor) !== 1 || Number(media.stock_factor) !== 0.5) {
      continue;
    }

    await connection.query(
      "UPDATE products SET unit = 'huevo', current_price = 400, current_stock = current_stock * 30, min_stock = min_stock * 30 WHERE id = ? AND organization_id = ?",
      [row.id, row.organization_id],
    );
    await connection.query(
      "UPDATE product_variants SET stock_factor = 30 WHERE id = ?",
      [cubeta.id],
    );
    await connection.query(
      "UPDATE product_variants SET stock_factor = 15 WHERE id = ?",
      [media.id],
    );
    console.log(
      `Huevos convertidos a base en huevos individuales (stock x30) para producto ${row.id}`,
    );
  }
}

async function convertPorcinoToUnits(connection) {
  const [rows] = await connection.query(`
    SELECT p.id, p.organization_id
    FROM products p
    WHERE p.unit = 'kg' AND LOWER(p.name) = 'porcino'
  `);

  for (const row of rows) {
    const [variants] = await connection.query(
      `SELECT id, name, stock_factor
       FROM product_variants
       WHERE product_id = ? AND organization_id = ?`,
      [row.id, row.organization_id],
    );
    const kilo = variants.find((v) => v.name === "Kilo vivo");
    if (!kilo || Number(kilo.stock_factor) !== 1) continue;

    await connection.query(
      "UPDATE products SET unit = 'unidad', current_price = 5000 WHERE id = ? AND organization_id = ?",
      [row.id, row.organization_id],
    );
    await connection.query(
      "UPDATE product_variants SET name = 'Unidad', unit_label = 'unidad' WHERE id = ?",
      [kilo.id],
    );
    console.log(`Porcino convertido a base en unidades para producto ${row.id}`);
  }
}
