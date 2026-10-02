import { useState, useEffect } from 'react';
import { Plus, Search, Filter, Package, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import api from '../utils/api';
import { formatCOP, formatDate } from '../utils/formatters';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { Input, Select, FormError } from '../components/FormComponents';
import toast from '../utils/toast';

const MOVEMENT_TYPES = [
  { value: 'entrada', label: 'Entrada', icon: ArrowUp, color: 'text-green-600' },
  { value: 'salida', label: 'Salida', icon: ArrowDown, color: 'text-red-600' },
  { value: 'ajuste', label: 'Ajuste', icon: Minus, color: 'text-yellow-600' }
];

const REFERENCE_TYPES = [
  { value: 'compra', label: 'Compra' },
  { value: 'venta', label: 'Venta' },
  { value: 'ajuste_manual', label: 'Ajuste manual' },
  { value: 'devolucion', label: 'Devolución' },
  { value: 'otro', label: 'Otro' }
];

export function InventoryPage() {
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [movementPagination, setMovementPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ search: '', category: '', low_stock: '' });
  const [movementFilters, setMovementFilters] = useState({ product_id: '', movement_type: '', start_date: '', end_date: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [showMovementFilters, setShowMovementFilters] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [movementForm, setMovementForm] = useState({
    product_id: '',
    movement_type: 'entrada',
    quantity: '',
    reason: '',
    reference_type: 'otro',
    reference_id: ''
  });
  const [movementErrors, setMovementErrors] = useState({});
  const [selectedProductForMovement, setSelectedProductForMovement] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [productsRes, movementsRes] = await Promise.all([
        api.get(`/products?page=${pagination.page}&limit=${pagination.limit}&search=${filters.search}&category=${filters.category}&low_stock=${filters.low_stock}`),
        api.get(`/inventory/movements?page=${movementPagination.page}&limit=${movementPagination.limit}&product_id=${movementFilters.product_id}&movement_type=${movementFilters.movement_type}&start_date=${movementFilters.start_date}&end_date=${movementFilters.end_date}`)
      ]);
      setProducts(productsRes.data.data);
      setMovements(movementsRes.data.data);
      setPagination(prev => ({
        ...prev,
        total: productsRes.data.pagination.total,
        totalPages: productsRes.data.pagination.totalPages
      }));
      setMovementPagination(prev => ({
        ...prev,
        total: movementsRes.data.pagination.total,
        totalPages: movementsRes.data.pagination.totalPages
      }));
    } catch (error) {
      toast.error('Error', 'No se pudieron cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [pagination.page, movementPagination.page, filters, movementFilters]);

  const validateMovement = () => {
    const newErrors = {};
    if (!movementForm.product_id) newErrors.product_id = 'Seleccione un producto';
    if (!movementForm.quantity || parseInt(movementForm.quantity) <= 0) newErrors.quantity = 'Cantidad inválida';
    if (!movementForm.reason.trim()) newErrors.reason = 'El motivo es obligatorio';
    setMovementErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const openMovementModal = (product = null) => {
    setMovementForm({
      product_id: product?.id || '',
      movement_type: 'entrada',
      quantity: '',
      reason: '',
      reference_type: 'otro',
      reference_id: ''
    });
    setMovementErrors({});
    setSelectedProductForMovement(product);
    setModalOpen(true);
  };

  const handleMovementSubmit = async (e) => {
    e.preventDefault();
    if (!validateMovement()) return;

    setSubmitting(true);
    try {
      await api.post('/inventory/movement', {
        product_id: parseInt(movementForm.product_id),
        movement_type: movementForm.movement_type,
        quantity: parseInt(movementForm.quantity),
        reason: movementForm.reason,
        reference_type: movementForm.reference_type,
        reference_id: movementForm.reference_id || null
      });
      toast.success('Movimiento registrado', 'El movimiento de inventario se ha guardado');
      setModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Error', error.response?.data?.error || 'No se pudo registrar el movimiento');
    } finally {
      setSubmitting(false);
    }
  };

  const productColumns = [
    { key: 'name', label: 'Producto', sortable: true },
    { key: 'unit', label: 'Unidad' },
    { key: 'category', label: 'Categoría', render: (v) => <span className="badge badge-gray">{v}</span> },
    { key: 'current_price', label: 'Precio', render: (v) => formatCOP(v) },
    { key: 'current_stock', label: 'Stock actual', render: (v, row) => (
      <span className={v <= row.min_stock && v > 0 ? 'text-yellow-600 font-medium' : v === 0 ? 'text-red-600 font-medium' : 'font-medium'}>
        {v} {row.unit}
      </span>
    ), sortable: true },
    { key: 'min_stock', label: 'Stock mínimo' },
    { key: 'is_active', label: 'Estado', render: (v) => <span className={`badge ${v ? 'badge-success' : 'badge-gray'}`}>{v ? 'Activo' : 'Inactivo'}</span> }
  ];

  const movementColumns = [
    { key: 'product_name', label: 'Producto' },
    { key: 'movement_type', label: 'Tipo', render: (v) => {
      const type = MOVEMENT_TYPES.find(t => t.value === v);
      if (!type) return v;
      const Icon = type.icon;
      return (
        <span className={`badge ${v === 'entrada' ? 'badge-success' : v === 'salida' ? 'badge-danger' : 'badge-warning'} flex items-center gap-1`}>
          <Icon className="w-3 h-3" /> {type.label}
        </span>
      );
    }},
    { key: 'quantity', label: 'Cantidad', render: (v, row) => (
      <span className={row.movement_type === 'entrada' ? 'text-green-600' : row.movement_type === 'salida' ? 'text-red-600' : 'text-yellow-600'}>
        {row.movement_type === 'entrada' ? '+' : row.movement_type === 'salida' ? '-' : ''}{v}
      </span>
    )},
    { key: 'previous_stock', label: 'Stock anterior' },
    { key: 'new_stock', label: 'Stock nuevo', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'reason', label: 'Motivo' },
    { key: 'reference_type', label: 'Referencia', render: (v) => {
      const ref = REFERENCE_TYPES.find(r => r.value === v);
      return ref ? ref.label : v;
    }},
    { key: 'created_by_name', label: 'Registrado por' },
    { key: 'created_at', label: 'Fecha', render: (v) => formatDate(v), sortable: true }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-unal-secondary">Inventario</h1>
          <p className="text-unal-secondary-light">Control de stock y movimientos de inventario</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4 mr-2" /> Filtros
          </button>
          <button className="btn-primary" onClick={() => openMovementModal()}>
            <Plus className="w-4 h-4 mr-2" /> Registrar movimiento
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="card p-4 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Input
              label="Buscar"
              placeholder="Nombre, descripción..."
              value={filters.search}
              onChange={(e) => { setFilters(prev => ({ ...prev, search: e.target.value })); setPagination(prev => ({ ...prev, page: 1 })); }}
            />
            <Select
              label="Categoría"
              value={filters.category}
              onChange={(e) => { setFilters(prev => ({ ...prev, category: e.target.value })); setPagination(prev => ({ ...prev, page: 1 })); }}
              options={[{ value: '', label: 'Todas' }, ...['Avícola', 'Piscícola', 'Apícola', 'Porcino', 'Otro'].map(c => ({ value: c, label: c }))]}
            />
            <Select
              label="Stock"
              value={filters.low_stock}
              onChange={(e) => { setFilters(prev => ({ ...prev, low_stock: e.target.value })); setPagination(prev => ({ ...prev, page: 1 })); }}
              options={[{ value: '', label: 'Todos' }, { value: 'true', label: 'Stock bajo' }]}
            />
            <div className="flex items-end">
              <button
                onClick={() => { setFilters({ search: '', category: '', low_stock: '' }); setPagination(prev => ({ ...prev, page: 1 })); }}
                className="btn-outline w-full"
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="lg:col-span-2">
          <DataTable
            columns={productColumns}
            data={products}
            keyField="id"
            loading={loading}
            pagination={true}
            pageSize={pagination.limit}
            onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
            totalPages={pagination.totalPages}
            currentPage={pagination.page}
            emptyMessage="No se encontraron productos"
            renderActions={(row) => (
              <button
                onClick={() => openMovementModal(row)}
                className="p-2 text-unal-primary hover:bg-unal-primary/10 rounded-lg transition-colors"
                title="Registrar movimiento"
              >
                <Package className="w-4 h-4" />
              </button>
            )}
          />
        </div>

        <div className="lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-unal-secondary">Historial de movimientos</h2>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => setShowMovementFilters(!showMovementFilters)}>
                <Filter className="w-4 h-4 mr-2" />
              </button>
            </div>
          </div>

          {showMovementFilters && (
            <div className="card p-4 animate-fade-in mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                <Select
                  label="Producto"
                  value={movementFilters.product_id}
                  onChange={(e) => { setMovementFilters(prev => ({ ...prev, product_id: e.target.value })); setMovementPagination(prev => ({ ...prev, page: 1 })); }}
                  options={[{ value: '', label: 'Todos' }, ...products.map(p => ({ value: p.id, label: p.name }))]}
                />
                <Select
                  label="Tipo"
                  value={movementFilters.movement_type}
                  onChange={(e) => { setMovementFilters(prev => ({ ...prev, movement_type: e.target.value })); setMovementPagination(prev => ({ ...prev, page: 1 })); }}
                  options={[{ value: '', label: 'Todos' }, ...MOVEMENT_TYPES.map(t => ({ value: t.value, label: t.label }))]}
                />
                <Input
                  label="Fecha inicio"
                  type="date"
                  value={movementFilters.start_date}
                  onChange={(e) => { setMovementFilters(prev => ({ ...prev, start_date: e.target.value })); setMovementPagination(prev => ({ ...prev, page: 1 })); }}
                />
                <Input
                  label="Fecha fin"
                  type="date"
                  value={movementFilters.end_date}
                  onChange={(e) => { setMovementFilters(prev => ({ ...prev, end_date: e.target.value })); setMovementPagination(prev => ({ ...prev, page: 1 })); }}
                />
                <div className="flex items-end">
                  <button
                    onClick={() => { setMovementFilters({ product_id: '', movement_type: '', start_date: '', end_date: '' }); setMovementPagination(prev => ({ ...prev, page: 1 })); }}
                    className="btn-outline w-full"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            </div>
          )}

          <DataTable
            columns={movementColumns}
            data={movements}
            keyField="id"
            loading={loading}
            pagination={true}
            pageSize={movementPagination.limit}
            onPageChange={(page) => setMovementPagination(prev => ({ ...prev, page }))}
            totalPages={movementPagination.totalPages}
            currentPage={movementPagination.page}
            emptyMessage="No hay movimientos registrados"
          />
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Registrar movimiento de inventario"
        size="lg"
      >
        <form onSubmit={handleMovementSubmit} className="space-y-4">
          <FormError message={movementErrors.general} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Producto *"
              id="movement_product_id"
              value={movementForm.product_id}
              onChange={(e) => setMovementForm(prev => ({ ...prev, product_id: e.target.value }))}
              error={movementErrors.product_id}
              required
              options={[{ value: '', label: 'Seleccionar producto...' }, ...products.map(p => ({ value: p.id, label: `${p.name} (Stock: ${p.current_stock} ${p.unit})` }))]}
            />
            <Select
              label="Tipo de movimiento *"
              id="movement_type"
              value={movementForm.movement_type}
              onChange={(e) => setMovementForm(prev => ({ ...prev, movement_type: e.target.value }))}
              options={MOVEMENT_TYPES.map(t => ({ value: t.value, label: t.label }))}
            />
            <Input
              label="Cantidad *"
              id="movement_quantity"
              type="number"
              min="1"
              value={movementForm.quantity}
              onChange={(e) => setMovementForm(prev => ({ ...prev, quantity: e.target.value }))}
              error={movementErrors.quantity}
              required
            />
            <Select
              label="Referencia"
              id="reference_type"
              value={movementForm.reference_type}
              onChange={(e) => setMovementForm(prev => ({ ...prev, reference_type: e.target.value }))}
              options={REFERENCE_TYPES.map(r => ({ value: r.value, label: r.label }))}
            />
            <Input
              label="ID Referencia (opcional)"
              id="reference_id"
              type="number"
              min="1"
              value={movementForm.reference_id}
              onChange={(e) => setMovementForm(prev => ({ ...prev, reference_id: e.target.value }))}
            />
            <div className="md:col-span-2">
              <Input
                label="Motivo *"
                id="reason"
                value={movementForm.reason}
                onChange={(e) => setMovementForm(prev => ({ ...prev, reason: e.target.value }))}
                error={movementErrors.reason}
                required
                placeholder="Ej: Compra a proveedor, Venta al cliente, Ajuste por conteo físico..."
              />
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-gray-200">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Registrando...' : 'Registrar movimiento'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}