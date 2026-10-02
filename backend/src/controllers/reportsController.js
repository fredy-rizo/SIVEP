import pool from "../config/database.js";
import { reportFiltersSchema } from "../validators/index.js";
import { formatCOP } from "../utils/helpers.js";
// Módulo de álgebra lineal propio de SIVEP (ver src/math/linearAlgebra.js):
// forecastNext() usa regresión por mínimos cuadrados (ecuaciones normales con
// matrices) para proyectar ventas; productAffinity() usa similitud coseno
// entre vectores de compra para hallar productos que se venden juntos.
import { forecastNext, productAffinity } from "../math/linearAlgebra.js";

export async function getSalesReport(request, reply) {
  const { error, value } = reportFiltersSchema.validate(request.query);
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }

  const { start_date, end_date } = value;

  let whereClause = "WHERE 1=1";
  const params = [];

  if (start_date) {
    whereClause += " AND s.sale_date >= ?";
    params.push(start_date);
  }

  if (end_date) {
    whereClause += " AND s.sale_date <= ?";
    params.push(end_date);
  }

  const [summary] = await pool.query(
    `SELECT 
       COUNT(*) as total_sales,
       COALESCE(SUM(s.total), 0) as total_revenue,
       COALESCE(SUM(s.subtotal), 0) as total_subtotal,
       COALESCE(SUM(s.tax), 0) as total_tax,
       COUNT(CASE WHEN s.payment_status = 'pendiente' THEN 1 END) as pending_payments,
       COUNT(CASE WHEN s.payment_type = 'credito' THEN 1 END) as credit_sales
     FROM sales s ${whereClause}`,
    params,
  );

  const [dailySales] = await pool.query(
    `SELECT 
       DATE(s.sale_date) as date,
       COUNT(*) as sales_count,
       COALESCE(SUM(s.total), 0) as total
     FROM sales s ${whereClause}
     GROUP BY DATE(s.sale_date)
     ORDER BY date DESC
     LIMIT 30`,
    params,
  );

  const [topProducts] = await pool.query(
    `SELECT 
       p.name,
       p.unit,
       SUM(si.quantity) as total_quantity,
       COALESCE(SUM(si.total), 0) as total_revenue
     FROM sale_items si
     JOIN sales s ON si.sale_id = s.id
     JOIN products p ON si.product_id = p.id
     ${whereClause.replace("s.", "s.")}
     GROUP BY p.id, p.name, p.unit
     ORDER BY total_revenue DESC
     LIMIT 10`,
    params,
  );

  const [topCustomers] = await pool.query(
    `SELECT 
       c.id,
       c.full_name,
       c.document_number,
       COUNT(s.id) as total_purchases,
       COALESCE(SUM(s.total), 0) as total_spent
     FROM sales s
     JOIN customers c ON s.customer_id = c.id
     ${whereClause}
     GROUP BY c.id, c.full_name, c.document_number
     ORDER BY total_spent DESC
     LIMIT 10`,
    params,
  );

  const [paymentTypeStats] = await pool.query(
    `SELECT 
       payment_type,
       COUNT(*) as count,
       COALESCE(SUM(total), 0) as total
     FROM sales s ${whereClause}
     GROUP BY payment_type`,
    params,
  );

  return reply.send({
    summary: {
      ...summary[0],
      total_revenue_formatted: formatCOP(summary[0].total_revenue),
      total_subtotal_formatted: formatCOP(summary[0].total_subtotal),
      total_tax_formatted: formatCOP(summary[0].total_tax),
    },
    dailySales: dailySales.map((d) => ({
      ...d,
      total_formatted: formatCOP(d.total),
    })),
    topProducts: topProducts.map((p) => ({
      ...p,
      total_revenue_formatted: formatCOP(p.total_revenue),
    })),
    topCustomers: topCustomers.map((c) => ({
      ...c,
      total_spent_formatted: formatCOP(c.total_spent),
    })),
    paymentTypeStats: paymentTypeStats.map((p) => ({
      ...p,
      total_formatted: formatCOP(p.total),
    })),
  });
}

export async function getInventoryReport(request, reply) {
  const { error, value } = reportFiltersSchema.validate(request.query);
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }

  const [summary] = await pool.query(
    `SELECT 
       COUNT(*) as total_products,
       COUNT(CASE WHEN current_stock <= min_stock AND is_active = TRUE THEN 1 END) as low_stock_products,
       COUNT(CASE WHEN current_stock = 0 AND is_active = TRUE THEN 1 END) as out_of_stock_products,
       COALESCE(SUM(current_stock * current_price), 0) as total_stock_value
     FROM products WHERE is_active = TRUE`,
  );

  const [byCategory] = await pool.query(
    `SELECT 
       category,
       COUNT(*) as product_count,
       SUM(current_stock) as total_stock,
       COALESCE(SUM(current_stock * current_price), 0) as category_value
     FROM products WHERE is_active = TRUE
     GROUP BY category
     ORDER BY category_value DESC`,
  );

  const [lowStockProducts] = await pool.query(
    `SELECT 
       id, name, unit, current_stock, min_stock, current_price,
       (current_stock * current_price) as stock_value
     FROM products 
     WHERE is_active = TRUE AND current_stock <= min_stock
     ORDER BY current_stock ASC`,
  );

  const [movementsSummary] = await pool.query(
    `SELECT 
       movement_type,
       COUNT(*) as count,
       SUM(quantity) as total_quantity
     FROM inventory_movements
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     GROUP BY movement_type`,
  );

  return reply.send({
    summary: {
      ...summary[0],
      total_stock_value_formatted: formatCOP(summary[0].total_stock_value),
    },
    byCategory: byCategory.map((c) => ({
      ...c,
      category_value_formatted: formatCOP(c.category_value),
    })),
    lowStockProducts: lowStockProducts.map((p) => ({
      ...p,
      stock_value_formatted: formatCOP(p.stock_value),
    })),
    movementsSummary,
  });
}

export async function getCustomersReport(request, reply) {
  const { error, value } = reportFiltersSchema.validate(request.query);
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }

  const { start_date, end_date } = value;

  let whereClause = "WHERE 1=1";
  const params = [];

  if (start_date) {
    whereClause += " AND c.created_at >= ?";
    params.push(start_date);
  }

  if (end_date) {
    whereClause += " AND c.created_at <= ?";
    params.push(end_date);
  }

  const [summary] = await pool.query(
    `SELECT 
       COUNT(*) as total_customers,
       COUNT(CASE WHEN origin = 'formulario_publico' THEN 1 END) as public_leads,
       COUNT(CASE WHEN has_payment_proof = TRUE THEN 1 END) as with_payment_proof,
       COUNT(CASE WHEN has_payment_proof = TRUE AND origin = 'formulario_publico' THEN 1 END) as pending_review
     FROM customers c ${whereClause}`,
    params,
  );

  const [byOrigin] = await pool.query(
    `SELECT 
       origin,
       COUNT(*) as count
     FROM customers c ${whereClause}
     GROUP BY origin`,
    params,
  );

  const [recentCustomers] = await pool.query(
    `SELECT 
       c.*,
       COUNT(s.id) as total_purchases,
       COALESCE(SUM(s.total), 0) as total_spent
     FROM customers c
     LEFT JOIN sales s ON c.id = s.customer_id
     ${whereClause}
     GROUP BY c.id
     ORDER BY c.created_at DESC
     LIMIT 20`,
    params,
  );

  return reply.send({
    summary: summary[0],
    byOrigin,
    recentCustomers: recentCustomers.map((c) => ({
      ...c,
      total_spent_formatted: formatCOP(c.total_spent),
    })),
  });
}

export async function exportSalesCSV(request, reply) {
  const { start_date, end_date } = request.query;

  let whereClause = "WHERE 1=1";
  const params = [];

  if (start_date) {
    whereClause += " AND s.sale_date >= ?";
    params.push(start_date);
  }

  if (end_date) {
    whereClause += " AND s.sale_date <= ?";
    params.push(end_date);
  }

  const [sales] = await pool.query(
    `SELECT 
       s.invoice_number,
       DATE_FORMAT(s.sale_date, '%d/%m/%Y %H:%i') as sale_date,
       c.full_name as customer_name,
       c.document_number as customer_document,
       s.payment_type,
       s.payment_status,
       s.subtotal,
       s.tax,
       s.total,
       s.notes
     FROM sales s
     JOIN customers c ON s.customer_id = c.id
     ${whereClause}
     ORDER BY s.sale_date DESC`,
    params,
  );

  const headers = [
    "Factura",
    "Fecha",
    "Cliente",
    "Documento",
    "Tipo Pago",
    "Estado Pago",
    "Subtotal",
    "IVA",
    "Total",
    "Notas",
  ];

  const rows = sales.map((s) => [
    s.invoice_number,
    s.sale_date,
    s.customer_name,
    s.customer_document,
    s.payment_type,
    s.payment_status,
    s.subtotal,
    s.tax,
    s.total,
    s.notes || "",
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((r) => r.map((v) => `"${v}"`).join(",")),
  ].join("\n");

  reply.header("Content-Type", "text/csv; charset=utf-8");
  reply.header(
    "Content-Disposition",
    `attachment; filename="reporte_ventas_${new Date().toISOString().split("T")[0]}.csv"`,
  );

  return reply.send(csv);
}

export async function exportInventoryCSV(request, reply) {
  const [products] = await pool.query(
    `SELECT 
       name, unit, category, current_stock, min_stock, current_price,
       (current_stock * current_price) as stock_value,
       CASE WHEN current_stock <= min_stock THEN 'BAJO' ELSE 'OK' END as stock_status
     FROM products WHERE is_active = TRUE
     ORDER BY category, name`,
  );

  const headers = [
    "Producto",
    "Unidad",
    "Categoría",
    "Stock Actual",
    "Stock Mínimo",
    "Precio",
    "Valor Stock",
    "Estado",
  ];

  const rows = products.map((p) => [
    p.name,
    p.unit,
    p.category,
    p.current_stock,
    p.min_stock,
    p.current_price,
    p.stock_value,
    p.stock_status,
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((r) => r.map((v) => `"${v}"`).join(",")),
  ].join("\n");

  reply.header("Content-Type", "text/csv; charset=utf-8");
  reply.header(
    "Content-Disposition",
    `attachment; filename="reporte_inventario_${new Date().toISOString().split("T")[0]}.csv"`,
  );

  return reply.send(csv);
}

export async function exportCustomersCSV(request, reply) {
  const [customers] = await pool.query(
    `SELECT 
       document_type, document_number, full_name, phone, email, address,
       origin, has_payment_proof,
       DATE_FORMAT(created_at, '%d/%m/%Y') as created_date
     FROM customers
     ORDER BY created_at DESC`,
  );

  const headers = [
    "Tipo Doc",
    "Documento",
    "Nombre",
    "Teléfono",
    "Email",
    "Dirección",
    "Origen",
    "Tiene Comprobante",
    "Fecha Registro",
  ];

  const rows = customers.map((c) => [
    c.document_type,
    c.document_number,
    c.full_name,
    c.phone || "",
    c.email || "",
    c.address || "",
    c.origin,
    c.has_payment_proof ? "Sí" : "No",
    c.created_date,
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((r) => r.map((v) => `"${v}"`).join(",")),
  ].join("\n");

  reply.header("Content-Type", "text/csv; charset=utf-8");
  reply.header(
    "Content-Disposition",
    `attachment; filename="reporte_clientes_${new Date().toISOString().split("T")[0]}.csv"`,
  );

  return reply.send(csv);
}

// ============================================================================
// PRONÓSTICO DE VENTAS CON ÁLGEBRA LINEAL (mínimos cuadrados)
// ----------------------------------------------------------------------------
// ¿POR QUÉ aquí? La granja planifica producción y stock; saber cuánto se
// venderá los próximos días evita sobreproducción y desabastecimiento.
// ¿PARA QUÉ? Estimar ingresos futuros y su tendencia ($/día) con una medida
// de confianza (R²). ¿CÓMO? Se arma la serie de ventas diarias y se llama a
// forecastNext(), que ajusta la recta y = m·x + b con las ecuaciones
// normales β = (XᵀX)⁻¹Xᵀy implementadas en src/math/linearAlgebra.js.
// ============================================================================
export async function getSalesForecast(request, reply) {
  // Días a pronosticar (parámetro ?days=, limitado entre 1 y 30).
  const days = Math.min(Math.max(parseInt(request.query.days) || 7, 1), 30);
  const historyDays = 30;

  // Totales reales de venta por día de los últimos 30 días.
  const [rows] = await pool.query(
    `SELECT DATE(sale_date) as date, COALESCE(SUM(total), 0) as total
     FROM sales
     WHERE sale_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(sale_date)
     ORDER BY date ASC`,
    [historyDays],
  );

  // Los días sin ventas no vienen en el SQL; se rellenan con 0 para que la
  // serie quede uniformemente espaciada (requisito para numerar x = 1..n).
  const toKey = (d) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  };
  const totalsByDate = new Map(rows.map((r) => [toKey(r.date), Number(r.total)]));
  const history = [];
  for (let i = historyDays - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = toKey(d);
    history.push({ date: key, total: totalsByDate.get(key) || 0 });
  }

  // Sin al menos 2 puntos no existe recta: se informa en vez de fallar.
  if (history.length < 2) {
    return reply.code(400).send({ error: "No hay suficientes datos para pronosticar" });
  }

  // AQUÍ ocurre el álgebra lineal: se ajusta la recta y se proyecta.
  const { slope, intercept, r2, predictions } = forecastNext(
    history.map((h) => h.total),
    days,
  );

  // Fechas calendario para cada valor pronosticado (mañana, pasado, ...).
  const forecast = predictions.map((predicted, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return { date: toKey(d), predicted: Math.round(predicted) };
  });

  return reply.send({
    history,
    forecast,
    slope, // pendiente m: cuánto suben (+) o bajan (−) las ventas por día, en $/día
    intercept, // intercepto b: nivel base de ventas diarias
    r2, // R² (0 a 1): confianza del ajuste; cerca de 1 = tendencia fiable
    totalForecast: forecast.reduce((a, f) => a + f.predicted, 0),
    totalForecastFormatted: formatCOP(forecast.reduce((a, f) => a + f.predicted, 0)),
  });
}

// ============================================================================
// AFINIDAD ENTRE PRODUCTOS CON ÁLGEBRA LINEAL (similitud coseno)
// ----------------------------------------------------------------------------
// ¿POR QUÉ aquí? Saber qué productos se venden juntos permite armar combos,
// exhibirlos cerca y sugerirlos al vender (venta cruzada).
// ¿PARA QUÉ? Devolver los pares de productos con mayor afinidad (0 a 1).
// ¿CÓMO? Se construye la matriz compras[cliente][producto] = cantidad
// comprada (90 días) y se llama a productAffinity(), que compara los
// vectores-columna con similitud coseno (ver src/math/linearAlgebra.js).
// ============================================================================
export async function getProductAffinity(request, reply) {
  const limit = Math.min(Math.max(parseInt(request.query.limit) || 5, 1), 20);

  // Catálogo activo: define las COLUMNAS de la matriz (un vector por producto).
  const [products] = await pool.query(
    "SELECT id, name FROM products WHERE is_active = TRUE ORDER BY id",
  );
  if (products.length < 2) {
    return reply.send({ pairs: [] });
  }

  // Cantidad total que cada cliente compró de cada producto (90 días).
  const [rows] = await pool.query(
    `SELECT s.customer_id as customer_id, si.product_id as product_id,
            SUM(si.quantity) as qty
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.sale_date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
     GROUP BY s.customer_id, si.product_id`,
  );
  if (rows.length === 0) {
    return reply.send({ pairs: [] });
  }

  // Matriz compras: FILAS = clientes, COLUMNAS = productos, celda = cantidad.
  // Se usa un mapa para ubicar cada (cliente, producto) en O(1).
  const customerIds = [...new Set(rows.map((r) => r.customer_id))];
  const productIds = products.map((p) => p.id);
  const qtyByKey = new Map(rows.map((r) => [`${r.customer_id}:${r.product_id}`, Number(r.qty)]));
  const matrix = customerIds.map((cid) =>
    productIds.map((pid) => qtyByKey.get(`${cid}:${pid}`) || 0),
  );

  // AQUÍ ocurre el álgebra lineal: cosenos entre vectores-columna.
  const namesById = new Map(products.map((p) => [p.id, p.name]));
  const pairs = productAffinity(matrix)
    .slice(0, limit)
    .map((p) => ({
      productA: namesById.get(productIds[p.productA]),
      productB: namesById.get(productIds[p.productB]),
      affinity: Number(p.affinity.toFixed(3)),
      percent: Math.round(p.affinity * 100),
    }));

  return reply.send({ pairs });
}
