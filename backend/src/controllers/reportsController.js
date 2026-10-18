import pool from "../config/database.js";
import { reportFiltersSchema } from "../validators/index.js";
import { formatCOP } from "../utils/helpers.js";
// Módulo de álgebra lineal propio de SIVEP (ver src/math/linearAlgebra.js):
// forecastNext() usa regresión por mínimos cuadrados (ecuaciones normales con
// matrices) para proyectar ventas; productAffinity() usa similitud coseno
// entre vectores de compra para hallar productos que se venden juntos.
import { forecastNext, productAffinity } from "../math/linearAlgebra.js";
// Módulo de cálculo diferencial propio de SIVEP (ver src/math/calculus.js):
// rateSummary() obtiene por diferencias finitas la velocidad (1ª derivada) y
// aceleración (2ª derivada) de las ventas; eoq()/isMinimum() resuelven por
// derivadas el tamaño de pedido que minimiza el costo de inventario.
import {
  rateSummary,
  eoq,
  isMinimum,
  inventoryTotalCost,
} from "../math/calculus.js";

export async function getSalesReport(request, reply) {
  const { error, value } = reportFiltersSchema.validate(request.query);
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }

  const { start_date, end_date } = value;

  let whereClause = "WHERE s.organization_id = ?";
  const params = [request.organizationId];

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
     FROM products WHERE is_active = TRUE AND organization_id = ?`,
    [request.organizationId],
  );

  const [byCategory] = await pool.query(
    `SELECT 
       category,
       COUNT(*) as product_count,
       SUM(current_stock) as total_stock,
       COALESCE(SUM(current_stock * current_price), 0) as category_value
     FROM products WHERE is_active = TRUE AND organization_id = ?
     GROUP BY category
     ORDER BY category_value DESC`,
    [request.organizationId],
  );

  const [lowStockProducts] = await pool.query(
    `SELECT 
       id, name, unit, current_stock, min_stock, current_price,
       (current_stock * current_price) as stock_value
     FROM products 
     WHERE is_active = TRUE AND current_stock <= min_stock AND organization_id = ?
     ORDER BY current_stock ASC`,
    [request.organizationId],
  );

  const [movementsSummary] = await pool.query(
    `SELECT 
       movement_type,
       COUNT(*) as count,
       SUM(quantity) as total_quantity
     FROM inventory_movements
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND organization_id = ?
     GROUP BY movement_type`,
    [request.organizationId],
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

  let whereClause = "WHERE c.organization_id = ?";
  const params = [request.organizationId];

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

  let whereClause = "WHERE s.organization_id = ?";
  const params = [request.organizationId];

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
     FROM products WHERE is_active = TRUE AND organization_id = ?
     ORDER BY category, name`,
    [request.organizationId],
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
     WHERE organization_id = ?
     ORDER BY created_at DESC`,
    [request.organizationId],
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
// Clave de fecha local "YYYY-MM-DD" (evita el desfase de zona horaria de
// toISOString, que podría correr un día la serie).
const toDayKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

// Construye la serie DIARIA de ventas de los últimos `historyDays` días.
//
// ¿POR QUÉ un helper compartido? El pronóstico (álgebra) y el ritmo de ventas
// (cálculo) necesitan EXACTAMENTE la misma serie. Centralizarla aquí evita
// duplicar el SQL y garantiza que ambas analíticas "miren" los mismos datos.
//
// ¿CÓMO? Se suman las ventas por día en SQL y luego se rellenan con 0 los días
// sin ventas, de modo que la serie quede EQUIESPACIADA (requisito tanto para
// numerar x = 1..n en mínimos cuadrados como para usar h = 1 día en las
// diferencias finitas del cálculo).
async function buildDailySalesHistory(historyDays, organizationId) {
  const [rows] = await pool.query(
    `SELECT DATE(sale_date) as date, COALESCE(SUM(total), 0) as total
     FROM sales
     WHERE sale_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       AND organization_id = ?
     GROUP BY DATE(sale_date)
     ORDER BY date ASC`,
    [historyDays, organizationId],
  );

  const totalsByDate = new Map(
    rows.map((r) => [toDayKey(r.date), Number(r.total)]),
  );
  const history = [];
  for (let i = historyDays - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = toDayKey(d);
    history.push({ date: key, total: totalsByDate.get(key) || 0 });
  }
  return history;
}

export async function getSalesForecast(request, reply) {
  // Días a pronosticar (parámetro ?days=, limitado entre 1 y 30).
  const days = Math.min(Math.max(parseInt(request.query.days) || 7, 1), 30);
  const historyDays = 30;

  // Serie diaria compartida con el módulo de cálculo (ver helper arriba).
  const history = await buildDailySalesHistory(historyDays, request.organizationId);

  // Sin al menos 2 puntos no existe recta: se informa en vez de fallar.
  if (history.length < 2) {
    return reply
      .code(400)
      .send({ error: "No hay suficientes datos para pronosticar" });
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
    return { date: toDayKey(d), predicted: Math.round(predicted) };
  });

  return reply.send({
    history,
    forecast,
    slope, // pendiente m: cuánto suben (+) o bajan (−) las ventas por día, en $/día
    intercept, // intercepto b: nivel base de ventas diarias
    r2, // R² (0 a 1): confianza del ajuste; cerca de 1 = tendencia fiable
    totalForecast: forecast.reduce((a, f) => a + f.predicted, 0),
    totalForecastFormatted: formatCOP(
      forecast.reduce((a, f) => a + f.predicted, 0),
    ),
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
    "SELECT id, name FROM products WHERE is_active = TRUE AND organization_id = ? ORDER BY id",
    [request.organizationId],
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
       AND s.organization_id = ?
     GROUP BY s.customer_id, si.product_id`,
    [request.organizationId],
  );
  if (rows.length === 0) {
    return reply.send({ pairs: [] });
  }

  // Matriz compras: FILAS = clientes, COLUMNAS = productos, celda = cantidad.
  // Se usa un mapa para ubicar cada (cliente, producto) en O(1).
  const customerIds = [...new Set(rows.map((r) => r.customer_id))];
  const productIds = products.map((p) => p.id);
  const qtyByKey = new Map(
    rows.map((r) => [`${r.customer_id}:${r.product_id}`, Number(r.qty)]),
  );
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

// ============================================================================
// RITMO DE VENTAS CON CÁLCULO DIFERENCIAL (velocidad y aceleración)
// ----------------------------------------------------------------------------
// ¿POR QUÉ aquí? La recta del pronóstico indica HACIA DÓNDE van las ventas,
// pero no A QUÉ RITMO. Detectar que el crecimiento se frena (2ª derivada
// negativa) permite reaccionar antes de que el estancamiento se vea en el
// acumulado del mes.
// ¿PARA QUÉ? Entregar la velocidad (1ª derivada, $/día) y la aceleración
// (2ª derivada, $/día²) de la serie, más una clasificación cualitativa de fase.
// ¿CÓMO? Se reutiliza buildDailySalesHistory y se aplica rateSummary() de
// src/math/calculus.js (diferencias finitas con h = 1 día).
// ============================================================================
export async function getSalesRate(request, reply) {
  // Ventana de análisis (7 a 90 días): más días = tendencia más suave pero
  // menos sensible a lo reciente; menos días = lo contrario.
  const days = Math.min(Math.max(parseInt(request.query.days) || 30, 7), 90);

  const history = await buildDailySalesHistory(days, request.organizationId);

  // Se necesitan >= 3 puntos para que la 2ª derivada tenga sentido.
  if (history.length < 3) {
    return reply.code(400).send({
      error: "No hay suficientes datos para analizar el ritmo de ventas",
    });
  }

  // AQUÍ ocurre el cálculo: derivar (dos veces) la serie de ventas.
  const totals = history.map((h) => h.total);
  const {
    velocities,
    accelerations,
    averageVelocity,
    averageAcceleration,
    currentVelocity,
    currentAcceleration,
    phase,
  } = rateSummary(totals);

  // Se anexa cada derivada a su fecha para graficarlas en el tiempo. Se
  // redondea a pesos (sin centavos) para que la lectura sea legible.
  const series = history.map((h, i) => ({
    date: h.date,
    total: Math.round(h.total),
    velocity: Math.round(velocities[i]),
    acceleration: Math.round(accelerations[i]),
  }));

  return reply.send({
    days,
    series,
    // Valores de cabecera (el "ahora" y el promedio de la ventana).
    currentVelocity: Math.round(currentVelocity),
    currentAcceleration: Math.round(currentAcceleration),
    averageVelocity: Math.round(averageVelocity),
    averageAcceleration: Math.round(averageAcceleration),
    currentVelocityFormatted: formatCOP(Math.round(currentVelocity)),
    phase, // p. ej. "crecimiento acelerado", "caída desacelerada"
  });
}

// ============================================================================
// OPTIMIZACIÓN DE INVENTARIO CON CÁLCULO DIFERENCIAL (EOQ)
// ----------------------------------------------------------------------------
// ¿POR QUÉ aquí? Comprar de más inmoviliza capital y llena bodega; comprar de
// menos dispara el número de pedidos. El EOQ encuentra el equilibrio óptimo.
// ¿PARA QUÉ? Recomendar, por producto, cuántas unidades pedir por orden para
// MINIMIZAR el costo total anual de inventario, y cuánto se ahorra frente a una
// política ingenua. Ver la deducción de q* = √(2DS/H) en src/math/calculus.js.
// ¿CÓMO? Se estima la demanda anual de cada producto desde las ventas y se
// resuelven las derivadas del modelo de costo.
//
// SUPUESTOS (explícitos, porque la tabla `products` no tiene costos):
//   - H (mantener) = 25% anual del valor de la unidad (current_price como proxy
//     del costo, al no existir un campo de costo de compra).
//   - S (pedir) = constante administrativa en pesos.
// Ambos son parámetros configurables: si mañana se agregan columnas reales de
// costo a `products`, solo hay que leerlas aquí en vez de estimarlas.
// ============================================================================
const EOQ_HOLDING_RATE = 0.25; // 25% anual del valor unitario (H = tasa × precio)
const EOQ_ORDER_COST = 25000; // costo fijo por pedido en COP (S)
const EOQ_NAIVE_ORDER_DAYS = 30; // política de comparación: pedir para 30 días

export async function getEoqOptimization(request, reply) {
  // Ventana para estimar la demanda (30 a 365 días) y nº de productos a mostrar.
  const historyDays = Math.min(
    Math.max(parseInt(request.query.days) || 90, 30),
    365,
  );
  const limit = Math.min(Math.max(parseInt(request.query.limit) || 10, 1), 50);

  // Catálogo activo: precio (para H) y stock (para el pedido sugerido).
  const [products] = await pool.query(
    `SELECT id, name, unit, current_price, current_stock, min_stock
     FROM products WHERE is_active = TRUE AND organization_id = ? ORDER BY id`,
    [request.organizationId],
  );

  const parameters = {
    holdingRate: EOQ_HOLDING_RATE,
    orderCost: EOQ_ORDER_COST,
    orderCostFormatted: formatCOP(EOQ_ORDER_COST),
    windowDays: historyDays,
  };

  if (products.length === 0) {
    return reply.send({
      parameters,
      products: [],
      count: 0,
      totalPotentialSavings: 0,
      totalPotentialSavingsFormatted: formatCOP(0),
    });
  }

  // Demanda por producto en la ventana: unidades vendidas (mismo criterio que
  // la afinidad, pero aquí interesa la CANTIDAD, no el perfil de cliente).
  const [rows] = await pool.query(
    `SELECT si.product_id, COALESCE(SUM(si.quantity), 0) as qty
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.sale_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
       AND s.organization_id = ?
     GROUP BY si.product_id`,
    [historyDays, request.organizationId],
  );
  const qtyByProduct = new Map(rows.map((r) => [r.product_id, Number(r.qty)]));

  const results = [];
  let totalPotentialSavings = 0;

  for (const p of products) {
    const soldInWindow = qtyByProduct.get(p.id) || 0;
    // Regla de tres para proyectar la ventana observada a un año (D anual).
    const annualDemand = (soldInWindow / historyDays) * 365;
    const unitValue = Number(p.current_price);

    // Costo de mantener por unidad/año; sin precio no hay modelo posible.
    const holdingCost = unitValue * EOQ_HOLDING_RATE;

    // AQUÍ ocurre la optimización: q* que resuelve C'(q) = 0.
    const optimal = eoq({
      demand: annualDemand,
      orderCost: EOQ_ORDER_COST,
      holdingCost,
    });
    if (!optimal) continue; // producto sin demanda o sin precio: se omite

    // Criterio de la 2ª derivada: confirmamos que q* es un MÍNIMO.
    const optimumConfirmed = isMinimum(
      { demand: annualDemand, orderCost: EOQ_ORDER_COST },
      optimal.quantity,
    );

    // Ahorro potencial: costo de una política ingenua (pedir para 30 días) menos
    // el costo óptimo. Demuestra, con números, por qué conviene optimizar.
    const naiveQty = Math.max(1, (annualDemand / 365) * EOQ_NAIVE_ORDER_DAYS);
    const naiveCost = inventoryTotalCost(naiveQty, {
      demand: annualDemand,
      orderCost: EOQ_ORDER_COST,
      holdingCost,
    });
    const savings = Math.max(0, naiveCost - optimal.totalCost);
    totalPotentialSavings += savings;

    results.push({
      id: p.id,
      name: p.name,
      unit: p.unit,
      unitPrice: Math.round(unitValue),
      annualDemand: Math.round(annualDemand), // D proyectada (unidades/año)
      quantity: Math.round(optimal.quantity), // q*: pedido óptimo
      ordersPerYear: Number(optimal.ordersPerYear.toFixed(2)),
      cycleDays: Math.round(optimal.cycleDays), // cada cuántos días pedir
      totalCost: Math.round(optimal.totalCost),
      totalCostFormatted: formatCOP(optimal.totalCost),
      savings: Math.round(savings),
      savingsFormatted: formatCOP(Math.round(savings)),
      currentStock: p.current_stock,
      minStock: p.min_stock,
      // Cuánto pedir AHORA para llegar al nivel óptimo q*.
      suggestedOrder: Math.max(
        0,
        Math.ceil(optimal.quantity - p.current_stock),
      ),
      optimumConfirmed, // C''(q*) > 0
    });
  }

  // Ordenados por ahorro: primero donde más plata hay en juego.
  results.sort((a, b) => b.savings - a.savings);

  return reply.send({
    parameters,
    products: results.slice(0, limit),
    count: results.length,
    totalPotentialSavings: Math.round(totalPotentialSavings),
    totalPotentialSavingsFormatted: formatCOP(totalPotentialSavings),
  });
}
