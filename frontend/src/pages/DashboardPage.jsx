import { useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  Package, 
  AlertTriangle, 
  Users, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Box
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import api from '../utils/api';
import { formatCOP, formatDate } from '../utils/formatters';
import { KPICard } from '../components/KPICard';
import { DataTable } from '../components/DataTable';
import toast from '../utils/toast';

const COLORS = ['#8B1E3F', '#5B8C4E', '#4A4A4A', '#A83C5A', '#7AB56B', '#6B6B6B'];

export function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [salesChartData, setSalesChartData] = useState([]);
  const [topProductsData, setTopProductsData] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [statsRes, salesRes, productsRes, recentRes] = await Promise.all([
          api.get('/reports/sales'),
          api.get('/reports/sales?start_date=' + new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]),
          api.get('/reports/inventory'),
          api.get('/sales?limit=5')
        ]);

        setStats(statsRes.data.summary);
        setSalesChartData(salesRes.data.dailySales || []);
        setTopProductsData(productsRes.data.byCategory || []);
        setRecentSales(recentRes.data.data || []);
      } catch (error) {
        console.error('Error fetching dashboard:', error);
        toast.error('Error', 'No se pudieron cargar los datos del dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-unal-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Solo cifras reales de la BD: sin porcentajes simulados.
  const kpiData = [
    {
      title: 'Ventas del mes',
      value: formatCOP(stats?.total_revenue || 0),
      icon: <DollarSign className="w-6 h-6" strokeWidth={2} />,
      iconBg: 'bg-unal-primary/10'
    },
    {
      title: 'Total ventas',
      value: stats?.total_sales || 0,
      icon: <ShoppingCart className="w-6 h-6" strokeWidth={2} />,
      iconBg: 'bg-unal-accent/10'
    },
    {
      title: 'Productos en stock',
      value: stats?.total_products || 0,
      icon: <Package className="w-6 h-6" strokeWidth={2} />,
      iconBg: 'bg-unal-secondary/10'
    },
    {
      title: 'Stock bajo',
      value: stats?.low_stock_products || 0,
      icon: <AlertTriangle className="w-6 h-6" strokeWidth={2} />,
      iconBg: 'bg-red-100'
    }
  ];

  const salesColumns = [
    { key: 'invoice_number', label: 'Factura', sortable: true },
    { key: 'customer_name', label: 'Cliente', sortable: true },
    { key: 'sale_date', label: 'Fecha', render: (v) => formatDate(v), sortable: true },
    { key: 'total', label: 'Total', render: (v) => formatCOP(v), sortable: true },
    { key: 'payment_status', label: 'Estado', render: (v) => (
      <span className={`badge ${v === 'pagado' ? 'badge-success' : 'badge-warning'}`}>
        {v === 'pagado' ? 'Pagado' : 'Pendiente'}
      </span>
    )}
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-unal-secondary">Dashboard</h1>
          <p className="text-unal-secondary-light">Resumen general de la Granja El Cairo</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiData.map((kpi, index) => (
          <KPICard key={index} {...kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-unal-secondary mb-4">Ventas diarias (últimos 30 días)</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesChartData.slice().reverse()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  tickFormatter={(v) => new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })}
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  tickFormatter={(v) => formatCOP(v).replace('$', '')}
                />
                <Tooltip 
                  formatter={(value) => [formatCOP(value), 'Total']}
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                />
                <Bar dataKey="total" fill="#8B1E3F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-unal-secondary mb-4">Productos por categoría</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={topProductsData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="category_value"
                  nameKey="category"
                  label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {topProductsData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value) => [formatCOP(value), 'Valor']}
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-unal-secondary">Últimas ventas</h2>
          <a href="/ventas" className="text-sm text-unal-primary hover:underline">Ver todas</a>
        </div>
        <DataTable
          columns={salesColumns}
          data={recentSales}
          keyField="id"
          pagination={false}
          emptyMessage="No hay ventas recientes"
        />
      </div>
    </div>
  );
}