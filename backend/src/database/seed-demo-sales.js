// ============================================================================
// DATOS DE DEMOSTRACIÓN — ventas de los últimos N meses
// ----------------------------------------------------------------------------
// Genera un historial coherente para presentaciones: clientes, ventas, ítems
// y movimientos de inventario. Todo se inserta en UNA transacción y al final
// deja un archivo JSON con los IDs creados para poder revertirlo.
//
// Uso:
//   MYSQL_HOST=... MYSQL_USER=... MYSQL_PASSWORD=... MYSQL_DATABASE=... \
//   MYSQL_PORT=... MYSQL_SSL=true node src/database/seed-demo-sales.js --dry-run
//
//   ... node src/database/seed-demo-sales.js            # inserta
//   ... node src/database/seed-demo-sales.js --clean /ruta/ids.json
//
// El stock final queda exactamente igual al actual: las entradas y salidas se
// calculan hacia atrás desde `current_stock`.
// ============================================================================

import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const CLEAN_INDEX = process.argv.indexOf("--clean");
const CLEAN_FILE = CLEAN_INDEX >= 0 ? process.argv[CLEAN_INDEX + 1] : null;
const MONTHS = Number(process.env.DEMO_MONTHS || 6);

const ORGANIZATION_ID = Number(process.env.DEMO_ORG_ID || 1);
const CREATED_BY = Number(process.env.DEMO_USER_ID || 2);

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function makeRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = makeRandom(20261123);
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (list) => list[Math.floor(rand() * list.length)];
const roundMoney = (v) => Math.round(Number(v) * 100) / 100;
const isoDay = (d) => d.toISOString().slice(0, 10);
const pad = (n, size = 2) => String(n).padStart(size, "0");

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(length = 6) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Datos base de demostración
// ---------------------------------------------------------------------------
const FIRST_NAMES = [
  "Ana María", "Carlos Andrés", "Luisa Fernanda", "Jorge Iván", "María Camila",
  "Andrés Felipe", "Sandra Patricia", "Diego Alejandro", "Laura Valentina",
  "Jhon Fredy", "Diana Marcela", "Oscar Javier", "Paula Andrea", "Wilmer",
  "Yuliana", "Nelson", "Claudia Rocío", "Julián David", "Mónica", "Edwin",
  "Liliana", "Fabián", "Angie", "Yeison", "Sara",
];

const LAST_NAMES = [
  "Rojas", "Gómez", "Martínez", "Rodríguez", "Pérez", "García", "Vargas",
  "Moreno", "Castro", "Ramírez", "Cuéllar", "Hernández", "Torres", "Silva",
  "Ortiz", "Pardo", "Rincón", "Beltrán", "Medina", "Suárez",
];

const CITIES = ["Villavicencio", "Acacías", "Restrepo", "Cumaral", "Puerto López"];

const NOTES = [
  "Venta directa en granja",
  "Pedido por WhatsApp",
  "Venta en feria campesina",
  "Pedido para restaurante",
  "Cliente frecuente de la granja",
  "Entrega programada en la sede",
];

// Cantidades por unidad de venta: [mínimo, máximo, peso relativo]
const PRODUCT_RULES = {
  1: { weight: 42, min: 1, max: 6 }, // Huevos (docena)
  2: { weight: 10, min: 1, max: 3 }, // Gallinas
  3: { weight: 24, min: 1, max: 10 }, // Peces (kg)
  4: { weight: 15, min: 1, max: 3 }, // Miel (litro)
  5: { weight: 9, min: 1, max: 1 }, // Porcino
};

function pickProducts(productIds, count) {
  const pool = productIds.map((id) => ({
    id,
    weight: PRODUCT_RULES[id]?.weight ?? 1,
  }));
  const chosen = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const total = pool.reduce((sum, p) => sum + p.weight, 0);
    let ticket = rand() * total;
    let index = 0;
    for (; index < pool.length; index++) {
      ticket -= pool[index].weight;
      if (ticket <= 0) break;
    }
    const [picked] = pool.splice(Math.min(index, pool.length - 1), 1);
    chosen.push(picked.id);
  }
  return chosen;
}

// ---------------------------------------------------------------------------
// Conexión
// ---------------------------------------------------------------------------
function buildConfig() {
  return {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl:
      String(process.env.MYSQL_SSL || "").toLowerCase() === "true"
        ? { rejectUnauthorized: false }
        : undefined,
    multipleStatements: false,
    charset: "utf8mb4",
  };
}

// ---------------------------------------------------------------------------
// Limpieza
// ---------------------------------------------------------------------------
async function clean(connection, file) {
  const index = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(
    `Eliminando ${index.sales} ventas, ${index.sale_items} ítems, ${index.movements} movimientos y ${index.customers} clientes de demostración...`,
  );
  // Se borran por rango de IDs: el seed inserta IDs consecutivos por tabla.
  await connection.beginTransaction();
  try {
    // Orden por dependencias: primero hijos (ítems, movimientos), luego
    // ventas y por último clientes (sales.customer_id los referencia).
    const order = ["sale_items", "inventory_movements", "sales", "customers"];
    const ranges = [...(index.ranges || [])].sort(
      (a, b) => order.indexOf(a.table) - order.indexOf(b.table),
    );
    for (const range of ranges) {
      await connection.query(
        `DELETE FROM ${connection.escapeId(range.table)} WHERE id BETWEEN ? AND ?`,
        [range.from, range.to],
      );
    }
    await connection.commit();
    console.log("Limpieza completada.");
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Programa principal
// ---------------------------------------------------------------------------
async function run() {
  const connection = await mysql.createConnection(buildConfig());

  try {
    if (CLEAN_FILE) {
      await clean(connection, CLEAN_FILE);
      return;
    }

    const [orgRows] = await connection.query(
      "SELECT id, name FROM organizations WHERE id = ?",
      [ORGANIZATION_ID],
    );
    if (orgRows.length === 0) throw new Error("La organización no existe");
    console.log(`Organización: ${orgRows[0].name} (id ${orgRows[0].id})`);

    const [products] = await connection.query(
      `SELECT id, name, unit, current_price, current_stock
       FROM products WHERE organization_id = ? AND is_active = TRUE ORDER BY id`,
      [ORGANIZATION_ID],
    );
    if (products.length === 0) throw new Error("No hay productos activos");
    console.log(
      `Productos: ${products.map((p) => `${p.name} (stock ${p.current_stock})`).join(", ")}`,
    );

    const [userRows] = await connection.query(
      "SELECT id FROM users WHERE id = ?",
      [CREATED_BY],
    );
    if (userRows.length === 0) throw new Error("El usuario creador no existe");

    // Rango: últimos MONTHS meses hasta hoy (fecha del servidor MySQL).
    const [[{ today }]] = await connection.query("SELECT CURDATE() AS today");
    const end = new Date(`${today instanceof Date ? isoDay(today) : today}T12:00:00Z`);
    const start = new Date(end);
    start.setUTCMonth(start.getUTCMonth() - MONTHS);
    start.setUTCDate(start.getUTCDate() + 1);
    console.log(`Rango: ${isoDay(start)} → ${isoDay(end)}`);

    // --- Clientes de demostración ------------------------------------------
    const existingCustomers = new Set(
      (
        await connection.query(
          "SELECT document_number FROM customers WHERE organization_id = ?",
          [ORGANIZATION_ID],
        )
      )[0].map((row) => row.document_number),
    );
    const demoCustomers = [];
    while (demoCustomers.length < 30) {
      const document = String(randInt(1000000000, 1099999999));
      if (existingCustomers.has(document)) continue;
      existingCustomers.add(document);
      demoCustomers.push({
        document_type: "CC",
        document_number: document,
        full_name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        phone: `3${randInt(10, 25)}${randInt(1000000, 9999999)}`,
        email: null,
        address: pick(CITIES),
        origin: "manual",
        has_payment_proof: 0,
        notes: "Cliente de demostración",
      });
    }

    // --- Ventas ------------------------------------------------------------
    const existingInvoices = new Set(
      (
        await connection.query(
          "SELECT invoice_number FROM sales WHERE organization_id = ?",
          [ORGANIZATION_ID],
        )
      )[0].map((row) => row.invoice_number),
    );

    const monthFactors = new Map();
    const monthIndex = (date) =>
      (date.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (date.getUTCMonth() - start.getUTCMonth());
    const priceFor = (product, date) => {
      const idx = monthIndex(date);
      if (!monthFactors.has(`${product.id}-${idx}`)) {
        const factor = 0.955 + idx * 0.009;
        monthFactors.set(
          `${product.id}-${idx}`,
          Math.max(500, Math.round((Number(product.current_price) * factor) / 500) * 500),
        );
      }
      return monthFactors.get(`${product.id}-${idx}`);
    };

    const sales = [];
    const dayCounters = new Map();
    const receiptCounters = new Map();

    for (
      let cursor = new Date(start);
      cursor <= end;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const day = new Date(cursor);
      const dow = day.getUTCDay();
      const monthProgress = monthIndex(day) / Math.max(MONTHS, 1);
      let salesToday = randInt(2, 4) + Math.round(monthProgress);
      if (dow === 6) salesToday += randInt(2, 4);
      if (dow === 0) salesToday += randInt(1, 3);
      if (dow === 1) salesToday = Math.max(1, salesToday - 1);

      const dayKey = isoDay(day);
      const counterKey = dayKey.replaceAll("-", "");
      let counter = dayCounters.get(counterKey) || randInt(400, 500);
      dayCounters.set(counterKey, counter);

      for (let i = 0; i < salesToday; i++) {
        let invoiceNumber;
        do {
          invoiceNumber = `FAC-${counterKey}-${pad(counter, 3)}`;
          counter += 1;
        } while (existingInvoices.has(invoiceNumber));
        existingInvoices.add(invoiceNumber);

        const productIds = pickProducts(
          products.map((p) => p.id),
          randInt(1, 3),
        );
        const items = productIds.map((productId) => {
          const product = products.find((p) => p.id === productId);
          const rule = PRODUCT_RULES[productId] || { min: 1, max: 1 };
          const quantity = randInt(rule.min, rule.max);
          const unitPrice = priceFor(product, day);
          return {
            product_id: productId,
            description: product.name,
            quantity,
            unit_price: unitPrice,
            total: roundMoney(unitPrice * quantity),
          };
        });

        const total = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
        const hour = randInt(13, 22); // 8:00–17:00 en Colombia
        const saleDate = new Date(day);
        saleDate.setUTCHours(hour, randInt(0, 59), randInt(0, 59), 0);

        const daysAgo = Math.floor((end - day) / 86400000);
        const cash = rand() < 0.28;
        const credit = rand() < 0.04;
        const paymentStatus = credit
          ? "pendiente"
          : daysAgo > 20
            ? "pagado"
            : rand() < 0.9
              ? "pagado"
              : rand() < 0.6
                ? "pendiente"
                : "revision";

        sales.push({
          organization_id: ORGANIZATION_ID,
          invoice_number: invoiceNumber,
          sale_date: saleDate,
          subtotal: total,
          tax: 0,
          total,
          payment_type: credit ? "credito" : "contado",
          payment_status: paymentStatus,
          payment_mode: cash ? "efectivo" : "online",
          cash_receipt_code: cash
            ? (() => {
                const next = (receiptCounters.get(dayKey) || 100) + 1;
                receiptCounters.set(dayKey, next);
                return `CAJA-${dayKey.replaceAll("-", "").slice(2)}-${pad(next, 3)}`;
              })()
            : null,
          paid_at: paymentStatus === "pagado" ? saleDate : null,
          pickup_code: `RC-${randomCode()}`,
          pickup_status: daysAgo > 8 ? "entregado" : "pendiente",
          created_by: CREATED_BY,
          notes: rand() < 0.55 ? pick(NOTES) : null,
          customer: pick(demoCustomers),
          items,
        });
      }
    }

    // Códigos únicos: se ajustan contra los ya existentes.
    const existingPickup = new Set(
      (
        await connection.query(
          "SELECT pickup_code FROM sales WHERE pickup_code IS NOT NULL",
        )
      )[0].map((row) => row.pickup_code),
    );
    for (const sale of sales) {
      while (existingPickup.has(sale.pickup_code)) {
        sale.pickup_code = `RC-${randomCode()}`;
      }
      existingPickup.add(sale.pickup_code);
    }

    const totalRevenue = roundMoney(sales.reduce((sum, s) => sum + s.total, 0));
    const totalUnits = sales.reduce(
      (sum, s) => sum + s.items.reduce((n, item) => n + item.quantity, 0),
      0,
    );
    console.log(
      `Generadas ${sales.length} ventas · ${totalUnits} unidades · $${totalRevenue.toLocaleString("es-CO")} COP`,
    );

    // --- Movimientos de inventario ----------------------------------------
    // Entradas mensuales ≈ 90% de lo vendido ese mes; el saldo inicial se
    // calcula para que el stock final sea el actual.
    const soldByProductMonth = new Map();
    for (const sale of sales) {
      const key = `${isoDay(sale.sale_date).slice(0, 7)}`;
      for (const item of sale.items) {
        const mapKey = `${item.product_id}|${key}`;
        soldByProductMonth.set(
          mapKey,
          (soldByProductMonth.get(mapKey) || 0) + item.quantity,
        );
      }
    }

    const movements = [];
    const productState = new Map();
    for (const product of products) {
      const calendar = [];
      for (const [mapKey, sold] of soldByProductMonth) {
        const [productId, month] = mapKey.split("|");
        if (Number(productId) !== product.id) continue;
        const qty = Math.max(0, Math.floor((sold * 0.9) / 5) * 5);
        if (qty > 0) {
          calendar.push({
            at: new Date(`${month}-01T00:30:00Z`),
            type: "entrada",
            quantity: qty,
            reason: "Reposición de inventario",
          });
        }
      }
      for (const sale of sales) {
        for (const item of sale.items) {
          if (item.product_id !== product.id) continue;
          calendar.push({
            at: sale.sale_date,
            type: "salida",
            quantity: item.quantity,
            reason: `Venta ${sale.invoice_number}`,
            sale,
          });
        }
      }
      calendar.sort((a, b) => a.at - b.at);

      const totalSold = calendar
        .filter((event) => event.type === "salida")
        .reduce((sum, event) => sum + event.quantity, 0);
      const totalIn = calendar
        .filter((event) => event.type === "entrada")
        .reduce((sum, event) => sum + event.quantity, 0);
      let stock = Number(product.current_stock) + totalSold - totalIn;
      if (stock < 0) stock = Number(product.current_stock);
      productState.set(product.id, stock);

      for (const event of calendar) {
        const previous = stock;
        stock += event.type === "entrada" ? event.quantity : -event.quantity;
        if (stock < 0) {
          // No debería ocurrir con el cálculo anterior; se ajusta para no
          // dejar stock negativo en la demostración.
          const missing = -stock + 10;
          movements.push({
            organization_id: ORGANIZATION_ID,
            product_id: product.id,
            movement_type: "entrada",
            quantity: missing,
            previous_stock: previous,
            new_stock: previous + missing,
            reason: "Ajuste de inventario",
            reference_type: "ajuste_manual",
            reference_id: null,
            created_by: CREATED_BY,
            created_at: event.at,
          });
          stock = previous + missing;
        }
        movements.push({
          organization_id: ORGANIZATION_ID,
          product_id: product.id,
          movement_type: event.type,
          quantity: event.quantity,
          previous_stock: previous,
          new_stock: stock,
          reason: event.reason,
          reference_type: event.type === "entrada" ? "compra" : "venta",
          reference_id: event.sale ? null : null,
          created_by: CREATED_BY,
          created_at: event.at,
        });
      }

      const expected = Number(product.current_stock);
      if (stock !== expected) {
        // Diferencia de redondeo: se corrige con un ajuste final.
        movements.push({
          organization_id: ORGANIZATION_ID,
          product_id: product.id,
          movement_type: stock > expected ? "salida" : "entrada",
          quantity: Math.abs(stock - expected),
          previous_stock: stock,
          new_stock: expected,
          reason: "Ajuste de inventario",
          reference_type: "ajuste_manual",
          reference_id: null,
          created_by: CREATED_BY,
          created_at: new Date(`${isoDay(end)}T23:30:00Z`),
        });
      }
    }
    console.log(`Movimientos de inventario: ${movements.length}`);
    console.log(
      `Ajustes por stock insuficiente: ${movements.filter((m) => m.reason === "Ajuste de inventario").length}`,
    );

    if (DRY_RUN) {
      console.log("Modo --dry-run: no se escribió nada.");
      const sample = sales.slice(0, 3).map((s) => ({
        factura: s.invoice_number,
        fecha: s.sale_date.toISOString(),
        total: s.total,
        items: s.items,
      }));
      console.log(JSON.stringify(sample, null, 2));
      return;
    }

    // --- Inserción en una sola transacción --------------------------------
    await connection.beginTransaction();
    try {
      // Clientes
      const [customerResult] = await connection.query(
        `INSERT INTO customers
           (organization_id, document_type, document_number, full_name, phone,
            address, origin, has_payment_proof, notes)
         VALUES ?`,
        [
          demoCustomers.map((c) => [
            ORGANIZATION_ID,
            c.document_type,
            c.document_number,
            c.full_name,
            c.phone,
            c.address,
            c.origin,
            c.has_payment_proof,
            c.notes,
          ]),
        ],
      );
      const firstCustomerId = customerResult.insertId;
      const customerIds = demoCustomers.map((_, i) => firstCustomerId + i);
      demoCustomers.forEach((c, i) => {
        c.id = customerIds[i];
      });

      // Ventas por lotes
      const CHUNK = 100;
      for (let offset = 0; offset < sales.length; offset += CHUNK) {
        const chunk = sales.slice(offset, offset + CHUNK);
        await connection.query(
          `INSERT INTO sales
             (organization_id, invoice_number, customer_id, sale_date, subtotal,
              tax, total, payment_type, payment_status, payment_mode,
              cash_receipt_code, paid_at, pickup_code, pickup_status,
              created_by, notes, proof_url)
           VALUES ?`,
          [
            chunk.map((s) => [
              s.organization_id,
              s.invoice_number,
              s.customer.id,
              s.sale_date,
              s.subtotal,
              s.tax,
              s.total,
              s.payment_type,
              s.payment_status,
              s.payment_mode,
              s.cash_receipt_code,
              s.paid_at,
              s.pickup_code,
              s.pickup_status,
              s.created_by,
              s.notes,
              `sivep-demo://sale/${s.invoice_number}`,
            ]),
          ],
        );
      }

      // Recuperar IDs de ventas por número de factura
      const invoiceNumbers = sales.map((s) => s.invoice_number);
      const idByInvoice = new Map();
      for (let offset = 0; offset < invoiceNumbers.length; offset += 500) {
        const slice = invoiceNumbers.slice(offset, offset + 500);
        const [rows] = await connection.query(
          "SELECT id, invoice_number FROM sales WHERE invoice_number IN (?)",
          [slice],
        );
        for (const row of rows) idByInvoice.set(row.invoice_number, row.id);
      }

      // Ítems
      const itemRows = [];
      for (const sale of sales) {
        const saleId = idByInvoice.get(sale.invoice_number);
        sale.id = saleId;
        for (const item of sale.items) {
          itemRows.push([
            saleId,
            item.product_id,
            item.description,
            "inventario",
            item.quantity,
            item.unit_price,
            item.total,
          ]);
        }
      }
      for (let offset = 0; offset < itemRows.length; offset += 500) {
        await connection.query(
          `INSERT INTO sale_items
             (sale_id, product_id, description, source, quantity, unit_price, total)
           VALUES ?`,
          [itemRows.slice(offset, offset + 500)],
        );
      }

      // Movimientos: se asigna reference_id a las salidas de cada venta.
      const movementRows = movements.map((m) => {
        let referenceId = null;
        if (m.movement_type === "salida") {
          const match = /^Venta (FAC-.+)$/.exec(m.reason);
          if (match) referenceId = idByInvoice.get(match[1]) ?? null;
        }
        return [
          m.organization_id,
          m.product_id,
          m.movement_type,
          m.quantity,
          m.previous_stock,
          m.new_stock,
          m.reason,
          m.reference_type,
          referenceId,
          m.created_by,
          m.created_at,
        ];
      });
      let firstMovementId = null;
      for (let offset = 0; offset < movementRows.length; offset += 500) {
        const [result] = await connection.query(
          `INSERT INTO inventory_movements
             (organization_id, product_id, movement_type, quantity,
              previous_stock, new_stock, reason, reference_type, reference_id,
              created_by, created_at)
           VALUES ?`,
          [movementRows.slice(offset, offset + 500)],
        );
        if (firstMovementId === null) firstMovementId = result.insertId;
      }

      // last_purchase_at por cliente
      const lastPurchase = new Map();
      for (const sale of sales) {
        const current = lastPurchase.get(sale.customer.id);
        if (!current || sale.sale_date > current) {
          lastPurchase.set(sale.customer.id, sale.sale_date);
        }
      }
      for (const [customerId, date] of lastPurchase) {
        await connection.query(
          "UPDATE customers SET last_purchase_at = ? WHERE id = ?",
          [date, customerId],
        );
      }

      await connection.commit();

      // --- Índice para poder revertir ------------------------------------
      const [ranges] = await connection.query(
        `SELECT 'customers' AS table_name, MIN(id) AS \`from\`, MAX(id) AS \`to\` FROM customers WHERE id BETWEEN ? AND ?
         UNION ALL
         SELECT 'sales', MIN(id), MAX(id) FROM sales WHERE invoice_number IN (?)
         UNION ALL
         SELECT 'sale_items', MIN(id), MAX(id) FROM sale_items WHERE sale_id IN (?)
         UNION ALL
         SELECT 'inventory_movements', MIN(id), MAX(id) FROM inventory_movements WHERE id BETWEEN ? AND ?`,
        [
          customerIds[0],
          customerIds[customerIds.length - 1],
          invoiceNumbers,
          [...idByInvoice.values()],
          firstMovementId,
          firstMovementId + movementRows.length - 1,
        ],
      );

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const outDir = process.env.DEMO_OUT_DIR || "/tmp/opencode";
      fs.mkdirSync(outDir, { recursive: true });
      const outFile = path.join(outDir, `sivep-demo-ids-${stamp}.json`);
      fs.writeFileSync(
        outFile,
        JSON.stringify(
          {
            created_at: new Date().toISOString(),
            organization_id: ORGANIZATION_ID,
            range: { start: isoDay(start), end: isoDay(end) },
            sales: sales.length,
            sale_items: itemRows.length,
            movements: movementRows.length,
            customers: customerIds.length,
            total_revenue: totalRevenue,
            ranges: ranges.map((r) => ({
              table: r.table_name,
              from: r.from,
              to: r.to,
            })),
          },
          null,
          2,
        ),
      );

      console.log(`\nListo. Índice para revertir: ${outFile}`);
      console.log(
        `Resumen: ${sales.length} ventas · ${itemRows.length} ítems · ${movementRows.length} movimientos · ${customerIds.length} clientes`,
      );
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error("Error:", error.message);
  console.error(error.stack);
  if (error.sqlMessage) console.error("SQL:", error.sqlMessage);
  process.exitCode = 1;
});
