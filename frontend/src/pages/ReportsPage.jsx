import { useState, useEffect } from "react";
import {
  Calendar,
  Download,
  FileText,
  TrendingUp,
  Users,
  Package,
  DollarSign,
  Brain,
  Activity,
  Calculator,
  Lock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import api from "../utils/api";
import { formatCOP, formatDate } from "../utils/formatters";
import { DataTable } from "../components/DataTable";
import { KPICard } from "../components/KPICard";
import { LockedFeature } from "../components/FeatureGate";
import { usePlan } from "../context/PlanContext";
import toast from "../utils/toast";

const COLORS = [
  "#8B1E3F",
  "#5B8C4E",
  "#4A4A4A",
  "#A83C5A",
  "#7AB56B",
  "#6B6B6B",
];

export function ReportsPage() {
  const { hasFeature } = usePlan();
  const [activeTab, setActiveTab] = useState("sales");
  const [filters, setFilters] = useState({
    start_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0],
    end_date: new Date().toISOString().split("T")[0],
  });
  const [salesReport, setSalesReport] = useState(null);
  const [inventoryReport, setInventoryReport] = useState(null);
  const [customersReport, setCustomersReport] = useState(null);
  // Pronóstico (álgebra lineal): recta de tendencia + afinidad de productos.
  const [forecast, setForecast] = useState(null);
  const [affinity, setAffinity] = useState([]);
  // Cálculo diferencial: ritmo de ventas (derivadas) y pedido óptimo (EOQ).
  const [rate, setRate] = useState(null);
  const [eoq, setEoq] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(filters);
      const [salesRes, inventoryRes, customersRes] = await Promise.all([
        api.get(`/reports/sales?${params}`),
        api.get(`/reports/inventory?${params}`),
        api.get(`/reports/customers?${params}`),
      ]);
      setSalesReport(salesRes.data);
      setInventoryReport(inventoryRes.data);
      setCustomersReport(customersRes.data);
    } catch {
      toast.error("Error", "No se pudieron cargar los reportes");
    } finally {
      setLoading(false);
    }
    // Analítica premium (álgebra y cálculo): solo se consulta si el plan del
    // usuario la incluye, para no generar 402 ni parpadeos. Se experiencia el
    // gating aquí, pero el backend es la autoridad final.
    try {
      if (hasFeature("analytics.algebra")) {
        const [forecastRes, affinityRes] = await Promise.all([
          api.get("/reports/forecast?days=7"),
          api.get("/reports/affinity?limit=5"),
        ]);
        setForecast(forecastRes.data);
        setAffinity(affinityRes.data.pairs || []);
      } else {
        setForecast(null);
        setAffinity([]);
      }

      if (hasFeature("analytics.calculus")) {
        const [rateRes, eoqRes] = await Promise.all([
          api.get("/reports/rate?days=30"),
          api.get("/reports/eoq?days=90&limit=10"),
        ]);
        setRate(rateRes.data);
        setEoq(eoqRes.data);
      } else {
        setRate(null);
        setEoq(null);
      }
    } catch (error) {
      console.error("No se pudo cargar la analítica:", error);
      setForecast(null);
      setAffinity([]);
      setRate(null);
      setEoq(null);
    }
  };

  useEffect(() => {
    fetchReports();
    // Se re-ejecuta cuando cambia el plan para cargar/descargar la analítica.
  }, [filters, hasFeature]);

  const handleExport = async (endpoint, filename) => {
    try {
      const params = new URLSearchParams(filters);
      const response = await api.get(`/reports/${endpoint}/export?${params}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `${filename}_${formatDate(new Date())}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Exportado", "El archivo CSV se ha descargado");
    } catch {
      toast.error("Error", "No se pudo exportar el reporte");
    }
  };

  const renderSalesTab = () => {
    if (!salesReport) return null;
    const { summary, dailySales, topProducts, topCustomers, paymentTypeStats } =
      salesReport;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Ventas totales"
            value={summary.total_sales}
            icon={<TrendingUp className="w-6 h-6" />}
            iconBg="bg-unal-primary/10"
          />
          <KPICard
            title="Ingresos totales"
            value={summary.total_revenue_formatted}
            icon={<DollarSign className="w-6 h-6" />}
            iconBg="bg-unal-accent/10"
          />
          <KPICard
            title="Pagos pendientes"
            value={summary.pending_payments}
            icon={<FileText className="w-6 h-6" />}
            iconBg="bg-yellow-100"
          />
          <KPICard
            title="Ventas a crédito"
            value={summary.credit_sales}
            icon={<Users className="w-6 h-6" />}
            iconBg="bg-unal-secondary/10"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-unal-secondary mb-4">
              Ventas diarias
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailySales.slice().reverse()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    tickFormatter={(v) => formatDate(v)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    tickFormatter={(v) => formatCOP(v).replace("$", "")}
                  />
                  <Tooltip
                    formatter={(value) => [formatCOP(value), "Total"]}
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #E5E7EB",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="total" fill="#8B1E3F" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-lg font-semibold text-unal-secondary mb-4">
              Tipo de pago
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentTypeStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="total"
                    nameKey="payment_type"
                    label={({ payment_type, percent }) =>
                      `${payment_type} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {paymentTypeStats.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [formatCOP(value), "Total"]}
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #E5E7EB",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-unal-secondary mb-4">
              Top productos
            </h3>
            <DataTable
              columns={[
                { key: "name", label: "Producto" },
                { key: "total_quantity", label: "Cantidad vendida" },
                { key: "total_revenue_formatted", label: "Ingresos" },
              ]}
              data={topProducts}
              keyField="name"
              pagination={false}
            />
          </div>

          <div className="card p-6">
            <h3 className="text-lg font-semibold text-unal-secondary mb-4">
              Top clientes
            </h3>
            <DataTable
              columns={[
                { key: "full_name", label: "Cliente" },
                { key: "total_purchases", label: "Compras" },
                { key: "total_spent_formatted", label: "Total gastado" },
              ]}
              data={topCustomers}
              keyField="id"
              pagination={false}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderInventoryTab = () => {
    if (!inventoryReport) return null;
    const { summary, byCategory, lowStockProducts, movementsSummary } =
      inventoryReport;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Productos totales"
            value={summary.total_products}
            icon={<Package className="w-6 h-6" />}
            iconBg="bg-unal-primary/10"
          />
          <KPICard
            title="Stock bajo"
            value={summary.low_stock_products}
            icon={<TrendingUp className="w-6 h-6" />}
            iconBg="bg-yellow-100"
          />
          <KPICard
            title="Sin stock"
            value={summary.out_of_stock_products}
            icon={<TrendingUp className="w-6 h-6" />}
            iconBg="bg-red-100"
          />
          <KPICard
            title="Valor inventario"
            value={summary.total_stock_value_formatted}
            icon={<DollarSign className="w-6 h-6" />}
            iconBg="bg-unal-accent/10"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-unal-secondary mb-4">
              Valor por categoría
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="category_value"
                    nameKey="category"
                    label={({ category, percent }) =>
                      `${category} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {byCategory.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [formatCOP(value), "Valor"]}
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #E5E7EB",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-lg font-semibold text-unal-secondary mb-4">
              Movimientos (30 días)
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={movementsSummary}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis
                    dataKey="movement_type"
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #E5E7EB",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar
                    dataKey="total_quantity"
                    fill="#8B1E3F"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-unal-secondary mb-4">
            Productos con stock bajo
          </h3>
          <DataTable
            columns={[
              { key: "name", label: "Producto" },
              { key: "unit", label: "Unidad" },
              { key: "current_stock", label: "Stock actual" },
              { key: "min_stock", label: "Stock mínimo" },
              { key: "stock_value_formatted", label: "Valor en stock" },
            ]}
            data={lowStockProducts}
            keyField="id"
            pagination={false}
            emptyMessage="No hay productos con stock bajo"
          />
        </div>
      </div>
    );
  };

  const renderCustomersTab = () => {
    if (!customersReport) return null;
    const { summary, byOrigin, recentCustomers } = customersReport;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Total clientes"
            value={summary.total_customers}
            icon={<Users className="w-6 h-6" />}
            iconBg="bg-unal-primary/10"
          />
          <KPICard
            title="Leads públicos"
            value={summary.public_leads}
            icon={<FileText className="w-6 h-6" />}
            iconBg="bg-unal-accent/10"
          />
          <KPICard
            title="Con comprobante"
            value={summary.with_payment_proof}
            icon={<TrendingUp className="w-6 h-6" />}
            iconBg="bg-green-100"
          />
          <KPICard
            title="Pendientes revisión"
            value={summary.pending_review}
            icon={<FileText className="w-6 h-6" />}
            iconBg="bg-yellow-100"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-unal-secondary mb-4">
              Clientes por origen
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byOrigin}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="origin"
                    label={({ origin, percent }) =>
                      `${origin === "formulario_publico" ? "Formulario público" : "Manual"} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {byOrigin.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #E5E7EB",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-lg font-semibold text-unal-secondary mb-4">
              Clientes recientes
            </h3>
            <DataTable
              columns={[
                { key: "full_name", label: "Nombre" },
                { key: "document_number", label: "Documento" },
                {
                  key: "origin",
                  label: "Origen",
                  render: (v) => (
                    <span
                      className={`badge ${v === "formulario_publico" ? "badge-info" : "badge-gray"}`}
                    >
                      {v === "formulario_publico"
                        ? "Formulario público"
                        : "Manual"}
                    </span>
                  ),
                },
                {
                  key: "has_payment_proof",
                  label: "Comprobante",
                  render: (v) => (
                    <span
                      className={`badge ${v ? "badge-success" : "badge-gray"}`}
                    >
                      {v ? "Sí" : "No"}
                    </span>
                  ),
                },
                { key: "created_date", label: "Registro" },
              ]}
              data={recentCustomers}
              keyField="id"
              pagination={false}
            />
          </div>
        </div>
      </div>
    );
  };

  // Pestaña "Pronóstico": visualiza los dos resultados del álgebra lineal.
  // - Gráfica de líneas: historial real (30 días) + recta proyectada (7 días).
  // - KPIs: tendencia $/día (pendiente m), confianza R² y total pronosticado.
  // - Afinidad: pares de productos que se venden juntos (similitud coseno).
  const renderForecastTab = () => {
    if (!forecast) {
      return (
        <div className="card p-8 text-center">
          <Brain className="w-10 h-10 mx-auto mb-3 text-unal-secondary-light" />
          <p className="text-unal-secondary font-medium">
            Pronóstico no disponible
          </p>
          <p className="text-sm text-unal-secondary-light mt-1">
            Reinicia el backend para activar los endpoints de pronóstico y
            afinidad.
          </p>
        </div>
      );
    }

    // Se combinan historial y pronóstico en una sola serie para la gráfica:
    // los días pasados llevan "real" y los futuros "pronóstico".
    const chartData = [
      ...(forecast.history || []).map((h) => ({
        date: h.date.slice(5),
        real: h.total,
      })),
      ...(forecast.forecast || []).map((f) => ({
        date: f.date.slice(5),
        pronóstico: f.predicted,
      })),
    ];

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KPICard
            title="Tendencia de ventas"
            value={`${forecast.slope >= 0 ? "+" : ""}${formatCOP(Math.round(forecast.slope))}/día`}
            icon={<TrendingUp className="w-6 h-6" />}
            iconBg="bg-unal-primary/10"
          />
          <KPICard
            title="Confianza del modelo (R²)"
            value={`${Math.round((forecast.r2 || 0) * 100)}%`}
            icon={<Brain className="w-6 h-6" />}
            iconBg="bg-unal-accent/10"
          />
          <KPICard
            title="Pronóstico próximos 7 días"
            value={
              forecast.totalForecastFormatted ||
              formatCOP(forecast.totalForecast || 0)
            }
            icon={<DollarSign className="w-6 h-6" />}
            iconBg="bg-unal-secondary/10"
          />
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-unal-secondary mb-1">
            Ventas reales vs pronóstico
          </h3>
          {/* <p className="text-sm text-unal-secondary-light mb-4">
            Recta de tendencia por mínimos cuadrados (y = m·x + b) ajustada a
            los últimos 30 días.
          </p> */}
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#6B7280" }}
                  interval={3}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6B7280" }}
                  tickFormatter={(v) => formatCOP(v).replace("$", "")}
                />
                <Tooltip
                  formatter={(value, name) => [formatCOP(value), name]}
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="real"
                  name="Ventas reales"
                  stroke="#4A4A4A"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="pronóstico"
                  name="Pronóstico"
                  stroke="#8B1E3F"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cálculo diferencial: ritmo de ventas (1ª y 2ª derivada). */}
        {rate && (
          <div className="card p-6">
            {/* <h3 className="text-lg font-semibold text-unal-secondary mb-1">
              Ritmo de ventas (cálculo diferencial)
            </h3> */}
            <h3 className="text-lg font-semibold text-unal-secondary mb-1">
              Ritmo de ventas
            </h3>
            {/* <p className="text-sm text-unal-secondary-light mb-4">
              Velocidad (1ª derivada, $/día) y aceleración (2ª derivada, $/día²)
              de la serie de ventas de los últimos {rate.days} días. Fase
              actual:{" "}
              <span className="font-medium text-unal-primary">
                {rate.phase}
              </span>
              .
            </p> */}
            <p className="text-sm text-unal-secondary-light mb-4">
              Fase actual:{" "}
              <span className="font-medium text-unal-primary">
                {rate.phase}
              </span>
              .
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <KPICard
                title="Velocidad actual"
                value={`${rate.currentVelocity >= 0 ? "+" : ""}${formatCOP(rate.currentVelocity)}/día`}
                icon={<Activity className="w-6 h-6" />}
                iconBg="bg-unal-primary/10"
                changeLabel="Ritmo de cambio (1ª derivada)"
              />
              <KPICard
                title="Aceleración actual"
                value={`${rate.currentAcceleration >= 0 ? "+" : ""}${formatCOP(rate.currentAcceleration)}/día²`}
                icon={<Activity className="w-6 h-6" />}
                iconBg="bg-unal-accent/10"
                changeLabel="Cambio del ritmo (2ª derivada)"
              />
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={(rate.series || []).map((s) => ({
                    date: s.date.slice(5),
                    velocidad: s.velocity,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    interval={3}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    tickFormatter={(v) => formatCOP(v).replace("$", "")}
                  />
                  <Tooltip
                    formatter={(value) => [formatCOP(value), "Velocidad"]}
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #E5E7EB",
                      borderRadius: "8px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="velocidad"
                    name="Velocidad ($/día)"
                    stroke="#5B8C4E"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-unal-secondary mb-1">
            Productos que se venden juntos
          </h3>
          <p className="text-sm text-unal-secondary-light mb-4">
            Afinidad por similitud coseno entre perfiles de compra (90 días).
            Útil para armar combos.
          </p>
          {affinity.length === 0 ? (
            <p className="text-unal-secondary-light text-sm py-4 text-center">
              Aún no hay suficientes ventas para calcular afinidades.
            </p>
          ) : (
            <div className="space-y-3">
              {affinity.map((pair, i) => (
                <div
                  key={i}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-lg bg-gray-50"
                >
                  <span className="font-medium text-unal-secondary flex-1">
                    {pair.productA}{" "}
                    <span className="text-unal-secondary-light font-normal">
                      + {pair.productB}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-unal-accent rounded-full"
                        style={{ width: `${pair.percent}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-unal-primary w-12 text-right">
                      {pair.percent}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Pestaña "Optimización": resultado del cálculo diferencial aplicado a
  // inventario (EOQ). Muestra, por producto, el pedido que minimiza el costo
  // total (q* = √(2DS/H)) y el ahorro frente a una política ingenua.
  const renderEoqTab = () => {
    if (!eoq) {
      return (
        <div className="card p-8 text-center">
          <Calculator className="w-10 h-10 mx-auto mb-3 text-unal-secondary-light" />
          <p className="text-unal-secondary font-medium">
            Optimización no disponible
          </p>
          <p className="text-sm text-unal-secondary-light mt-1">
            Reinicia el backend para activar el endpoint de pedido óptimo (EOQ).
          </p>
        </div>
      );
    }

    const { products = [], parameters = {} } = eoq;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KPICard
            title="Ahorro potencial anual"
            value={eoq.totalPotentialSavingsFormatted || formatCOP(0)}
            icon={<DollarSign className="w-6 h-6" />}
            iconBg="bg-unal-accent/10"
          />
          <KPICard
            title="Productos analizados"
            value={eoq.count || 0}
            icon={<Package className="w-6 h-6" />}
            iconBg="bg-unal-primary/10"
          />
          <KPICard
            title="Costo por pedido (S)"
            value={parameters.orderCostFormatted || formatCOP(0)}
            icon={<Calculator className="w-6 h-6" />}
            iconBg="bg-unal-secondary/10"
          />
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-unal-secondary mb-1">
            Pedido óptimo por producto (EOQ)
          </h3>
          {/* <p className="text-sm text-unal-secondary-light mb-4">
            q* = √(2·D·S / H) minimiza el costo total (criterio de la 2ª
            derivada). Costo de mantener H ={" "}
            {Math.round((parameters.holdingRate || 0) * 100)}% anual del valor
            de la unidad; costo de pedir S ={" "}
            {parameters.orderCostFormatted || formatCOP(0)}. Demanda proyectada
            desde los últimos {parameters.windowDays} días.
          </p> */}
          <DataTable
            columns={[
              { key: "name", label: "Producto" },
              {
                key: "annualDemand",
                label: "Demanda anual",
                render: (v, row) => `${v} ${row.unit || ""}`,
              },
              {
                key: "quantity",
                label: "Pedido óptimo (q*)",
                render: (v, row) => `${v} ${row.unit || ""}`,
              },
              { key: "ordersPerYear", label: "Pedidos/año" },
              {
                key: "cycleDays",
                label: "Cada",
                render: (v) => `${v} días`,
              },
              { key: "currentStock", label: "Stock actual" },
              {
                key: "suggestedOrder",
                label: "Pedir ahora",
                render: (v, row) => `${v} ${row.unit || ""}`,
              },
              { key: "savingsFormatted", label: "Ahorro anual" },
            ]}
            data={products}
            keyField="id"
            pagination={false}
            emptyMessage="Aún no hay demanda suficiente para calcular el pedido óptimo"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-unal-secondary">Reportes</h1>
          <p className="text-unal-secondary-light">
            Análisis de ventas, inventario y clientes
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-4 bg-white rounded-lg border border-gray-200 w-full sm:w-auto">
            <label className="text-sm font-medium text-unal-secondary">
              Desde:
            </label>
            <input
              type="date"
              className="input-field w-full sm:w-auto"
              value={filters.start_date}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, start_date: e.target.value }))
              }
              max={filters.end_date}
            />
            <label className="text-sm font-medium text-unal-secondary">
              Hasta:
            </label>
            <input
              type="date"
              className="input-field w-full sm:w-auto"
              value={filters.end_date}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, end_date: e.target.value }))
              }
              min={filters.start_date}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {[
          { id: "sales", label: "Ventas", icon: TrendingUp },
          { id: "inventory", label: "Inventario", icon: Package },
          { id: "customers", label: "Clientes", icon: Users },
          {
            id: "forecast",
            label: "Pronóstico",
            icon: Brain,
            feature: "analytics.algebra",
          },
          {
            id: "optimization",
            label: "Optimización",
            icon: Calculator,
            feature: "analytics.calculus",
          },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-unal-primary text-unal-primary"
                : "border-transparent text-unal-secondary-light hover:text-unal-secondary"
            }`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
            {tab.feature && !hasFeature(tab.feature) && (
              <Lock className="w-3 h-3" aria-label="Función premium" />
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-12 h-12 border-4 border-unal-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <>
          {activeTab === "sales" && renderSalesTab()}
          {activeTab === "inventory" && renderInventoryTab()}
          {activeTab === "customers" && renderCustomersTab()}
          {activeTab === "forecast" &&
            (hasFeature("analytics.algebra") ? (
              renderForecastTab()
            ) : (
              <LockedFeature
                title="Proyecciones y afinidad de productos"
                featureLabel="Álgebra lineal · Plan Profesional"
                description="El pronóstico de ventas por mínimos cuadrados y la afinidad entre productos (similitud coseno) están disponibles desde el plan Profesional."
              />
            ))}
          {activeTab === "optimization" &&
            (hasFeature("analytics.calculus") ? (
              renderEoqTab()
            ) : (
              <LockedFeature
                title="Ritmo de ventas y pedido óptimo"
                featureLabel="Cálculo diferencial · Plan Profesional"
                description="La velocidad/aceleración de ventas (derivadas) y el tamaño económico de pedido (EOQ) están disponibles desde el plan Profesional."
              />
            ))}
        </>
      )}

      <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-4 border-t border-gray-200">
        <button
          onClick={() => handleExport("sales", "reporte_ventas")}
          className="btn-secondary flex items-center gap-2"
          disabled={loading}
        >
          <Download className="w-4 h-4" /> Exportar ventas CSV
        </button>
        <button
          onClick={() => handleExport("inventory", "reporte_inventario")}
          className="btn-secondary flex items-center gap-2"
          disabled={loading}
        >
          <Download className="w-4 h-4" /> Exportar inventario CSV
        </button>
        <button
          onClick={() => handleExport("customers", "reporte_clientes")}
          className="btn-secondary flex items-center gap-2"
          disabled={loading}
        >
          <Download className="w-4 h-4" /> Exportar clientes CSV
        </button>
      </div>
    </div>
  );
}
