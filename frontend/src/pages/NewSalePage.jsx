import { useState, useEffect, useCallback } from 'react';
import { Plus, Minus, Trash2, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { formatCOP } from '../utils/formatters';
import { Input, Select, FormError } from '../components/FormComponents';
import { Modal } from '../components/Modal';
import { DataTable } from '../components/DataTable';
import toast from '../utils/toast';

export function NewSalePage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    customer_id: '',
    payment_type: 'contado',
    payment_status: 'pendiente',
    notes: '',
    sale_date: new Date().toISOString().slice(0, 16)
  });
  
  const [items, setItems] = useState([]);
  const [errors, setErrors] = useState({});
  const [showProductModal, setShowProductModal] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [filteredProducts, setFilteredProducts] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [customersRes, productsRes] = await Promise.all([
          api.get('/customers?limit=100'),
          api.get('/products?limit=100&is_active=true')
        ]);
        setCustomers(customersRes.data.data);
        setProducts(productsRes.data.data);
        setFilteredProducts(productsRes.data.data);
      } catch (error) {
        toast.error('Error', 'No se pudieron cargar los datos');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    setFilteredProducts(products.filter(p => 
      p.name.toLowerCase().includes(productSearch.toLowerCase())
    ));
  }, [productSearch, products]);

  const validate = () => {
    const newErrors = {};
    if (!formData.customer_id) newErrors.customer_id = 'Seleccione un cliente';
    if (items.length === 0) newErrors.items = 'Agregue al menos un producto';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const addItem = (product) => {
    const existingIndex = items.findIndex(i => i.product_id === product.id);
    if (existingIndex >= 0) {
      const newItems = [...items];
      if (newItems[existingIndex].quantity < product.current_stock) {
        newItems[existingIndex].quantity += 1;
        newItems[existingIndex].total = newItems[existingIndex].quantity * newItems[existingIndex].unit_price;
        setItems(newItems);
      } else {
        toast.warning('Stock insuficiente', `Solo hay ${product.current_stock} unidades disponibles`);
      }
    } else {
      setItems([...items, {
        product_id: product.id,
        product_name: product.name,
        product_unit: product.unit,
        quantity: 1,
        unit_price: product.current_price,
        total: product.current_price,
        max_stock: product.current_stock
      }]);
    }
    setShowProductModal(false);
    setProductSearch('');
  };

  const updateQuantity = (index, change) => {
    const newItems = [...items];
    const newQty = newItems[index].quantity + change;
    if (newQty > 0 && newQty <= newItems[index].max_stock) {
      newItems[index].quantity = newQty;
      newItems[index].total = newQty * newItems[index].unit_price;
      setItems(newItems);
    } else if (newQty > newItems[index].max_stock) {
      toast.warning('Stock insuficiente', `Máximo ${newItems[index].max_stock} unidades`);
    }
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const tax = 0;
  const total = subtotal + tax;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const saleData = {
        customer_id: parseInt(formData.customer_id),
        sale_date: formData.sale_date,
        payment_type: formData.payment_type,
        payment_status: formData.payment_status,
        notes: formData.notes || null,
        items: items.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price
        }))
      };

      const res = await api.post('/sales', saleData);
      const code = res.data?.sale?.pickup_code;
      toast.success('Venta registrada', code ? `Código de reclamo: ${code}` : 'La venta se ha creado correctamente');
      navigate('/ventas');
    } catch (error) {
      toast.error('Error', error.response?.data?.error || 'No se pudo crear la venta');
    } finally {
      setSubmitting(false);
    }
  };

  const productColumns = [
    { key: 'name', label: 'Producto' },
    { key: 'unit', label: 'Unidad' },
    { key: 'current_price', label: 'Precio', render: (v) => formatCOP(v) },
    { key: 'current_stock', label: 'Stock' }
  ];

  const itemColumns = [
    { key: 'product_name', label: 'Producto' },
    { key: 'product_unit', label: 'Unidad' },
    { key: 'quantity', label: 'Cantidad', render: (v, row) => (
      <div className="flex items-center justify-center gap-2">
        <button onClick={() => updateQuantity(items.indexOf(row), -1)} className="p-1 text-unal-primary hover:bg-unal-primary/10 rounded" disabled={v <= 1}><Minus className="w-4 h-4" /></button>
        <span className="font-medium w-12 text-center">{v}</span>
        <button onClick={() => updateQuantity(items.indexOf(row), 1)} className="p-1 text-unal-primary hover:bg-unal-primary/10 rounded" disabled={v >= row.max_stock}><Plus className="w-4 h-4" /></button>
      </div>
    )},
    { key: 'unit_price', label: 'Precio unit.', render: (v) => formatCOP(v) },
    { key: 'total', label: 'Total', render: (v) => <span className="font-medium">{formatCOP(v)}</span> }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-unal-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-unal-secondary">Nueva venta</h1>
          <p className="text-unal-secondary-light">Registrar una nueva venta en el sistema</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-unal-secondary mb-4">Información de la venta</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Select
              label="Cliente *"
              id="customer_id"
              value={formData.customer_id}
              onChange={(e) => setFormData(prev => ({ ...prev, customer_id: e.target.value }))}
              error={errors.customer_id}
              required
              options={[{ value: '', label: 'Seleccionar cliente...' }, ...customers.map(c => ({ value: c.id, label: `${c.full_name} - ${c.document_number}` }))]}
            />
            <Select
              label="Tipo de pago"
              id="payment_type"
              value={formData.payment_type}
              onChange={(e) => setFormData(prev => ({ ...prev, payment_type: e.target.value }))}
              options={[{ value: 'contado', label: 'Contado' }, { value: 'credito', label: 'Crédito' }]}
            />
            <Select
              label="Estado de pago"
              id="payment_status"
              value={formData.payment_status}
              onChange={(e) => setFormData(prev => ({ ...prev, payment_status: e.target.value }))}
              options={[{ value: 'pagado', label: 'Pagado' }, { value: 'pendiente', label: 'Pendiente' }]}
            />
            <Input
              label="Fecha de venta"
              id="sale_date"
              type="datetime-local"
              value={formData.sale_date}
              onChange={(e) => setFormData(prev => ({ ...prev, sale_date: e.target.value }))}
            />
            <div className="md:col-span-2">
              <label className="label-field">Notas</label>
              <textarea
                id="notes"
                rows={2}
                className="input-field"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Notas adicionales..."
              />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-unal-secondary">Productos</h2>
            <button type="button" onClick={() => setShowProductModal(true)} className="btn-primary">
              <Plus className="w-4 h-4 mr-2" /> Agregar producto
            </button>
          </div>

          {errors.items && <FormError message={errors.items} />}

          {items.length === 0 ? (
            <div className="text-center py-12 text-unal-secondary-light">
              <Search className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No hay productos agregados. Haga clic en "Agregar producto" para comenzar.</p>
            </div>
          ) : (
            <DataTable
              columns={itemColumns}
              data={items}
              keyField="product_id"
              pagination={false}
              emptyMessage="No hay productos"
              renderActions={(row) => (
                <button
                  onClick={() => removeItem(items.indexOf(row))}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            />
          )}
        </div>

        <div className="card p-6 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2"></div>
            <div className="space-y-2 text-right">
              <div className="flex justify-between text-sm">
                <span className="text-unal-secondary-light">Subtotal:</span>
                <span className="font-medium">{formatCOP(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-unal-secondary-light">IVA (0%):</span>
                <span className="font-medium">{formatCOP(tax)}</span>
              </div>
              <div className="flex justify-between text-lg border-t border-gray-300 pt-2">
                <span className="font-semibold text-unal-secondary">Total:</span>
                <span className="font-bold text-unal-primary text-xl">{formatCOP(total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <a href="/ventas" className="btn-secondary">Cancelar</a>
          <button type="submit" disabled={submitting || items.length === 0} className="btn-primary px-8">
            {submitting ? 'Registrando...' : 'Registrar venta'}
          </button>
        </div>
      </form>

      <Modal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        title="Agregar producto"
        size="xl"
      >
        <div className="space-y-4">
          <Input
            label="Buscar producto"
            placeholder="Nombre del producto..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />
          <DataTable
            columns={productColumns}
            data={filteredProducts}
            keyField="id"
            pagination={false}
            emptyMessage="No se encontraron productos"
            renderActions={(row) => (
              <button
                onClick={() => addItem(row)}
                className="btn-primary text-sm py-1 px-3"
                disabled={row.current_stock === 0}
              >
                Agregar
              </button>
            )}
          />
        </div>
      </Modal>
    </div>
  );
}