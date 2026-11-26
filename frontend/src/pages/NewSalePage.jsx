import { useState, useEffect } from 'react';
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
  const [variantSelections, setVariantSelections] = useState({});

  const productVariants = (product) =>
    Array.isArray(product.variants) && product.variants.length > 0
      ? product.variants
      : [
          {
            id: null,
            name: product.unit,
            unit_label: product.unit,
            price: product.current_price,
            stock_factor: 1,
          },
        ];

  const selectedVariantFor = (product) => {
    const variants = productVariants(product);
    if (variants.length === 1) return variants[0];
    const chosen = variantSelections[product.id];
    return variants.find((variant) => String(variant.id) === String(chosen)) || variants[0];
  };

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
      } catch {
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

  const addItem = (product, variant) => {
    const factor = Number(variant?.stock_factor) || 1;
    const maxStock = Number(product.current_stock) / factor;
    const itemKey = variant?.id != null ? `v${variant.id}` : `p${product.id}`;
    const existingIndex = items.findIndex((item) => item.item_key === itemKey);
    if (existingIndex >= 0) {
      const newItems = [...items];
      if (newItems[existingIndex].quantity + 1 <= maxStock + 1e-9) {
        newItems[existingIndex].quantity += 1;
        newItems[existingIndex].total =
          newItems[existingIndex].quantity * newItems[existingIndex].unit_price;
        setItems(newItems);
      } else {
        toast.warning('Stock insuficiente', `Solo hay ${maxStock} disponibles`);
      }
    } else {
      setItems([
        ...items,
        {
          item_key: itemKey,
          product_id: product.id,
          variant_id: variant?.id ?? null,
          product_name: variant?.name ? `${product.name} - ${variant.name}` : product.name,
          product_unit: variant?.unit_label || product.unit,
          quantity: 1,
          unit_price: Number(variant?.price ?? product.current_price),
          total: Number(variant?.price ?? product.current_price),
          max_stock: maxStock,
          stock_factor: factor,
        },
      ]);
    }
    setShowProductModal(false);
    setProductSearch('');
  };

  const updateQuantity = (index, change) => {
    const newItems = [...items];
    const newQty = Math.round((newItems[index].quantity + change) * 1000) / 1000;
    if (newQty > 0 && newQty <= newItems[index].max_stock + 1e-9) {
      newItems[index].quantity = newQty;
      newItems[index].total = newQty * newItems[index].unit_price;
      setItems(newItems);
    } else if (newQty > newItems[index].max_stock) {
      toast.warning('Stock insuficiente', `Máximo ${newItems[index].max_stock}`);
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
          variant_id: item.variant_id,
          quantity: item.quantity
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
    { key: 'unit', label: 'Unidad base' },
    {
      key: 'variants',
      label: 'Presentación',
      render: (v, row) => {
        const variants = productVariants(row);
        if (variants.length <= 1) {
          return <span className="text-sm">{variants[0]?.name}</span>;
        }
        return (
          <select
            value={selectedVariantFor(row).id ?? ''}
            onChange={(e) =>
              setVariantSelections((prev) => ({ ...prev, [row.id]: e.target.value }))
            }
            className="input-field py-1 text-sm"
          >
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id ?? ''}>
                {variant.name} — {formatCOP(variant.price)}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      key: 'stock',
      label: 'Disponible',
      render: (v, row) => {
        const variant = selectedVariantFor(row);
        const factor = Number(variant.stock_factor) || 1;
        return `${(Number(row.current_stock) / factor).toLocaleString('es-CO', { maximumFractionDigits: 3 })} ${variant.unit_label || row.unit}`;
      },
    },
  ];

  const itemColumns = [
    { key: 'product_name', label: 'Producto' },
    { key: 'product_unit', label: 'Presentación' },
    { key: 'quantity', label: 'Cantidad', render: (v, row) => (
      <div className="flex items-center justify-center gap-2">
        <button type="button" onClick={() => updateQuantity(items.indexOf(row), -1)} className="p-1 text-unal-primary hover:bg-unal-primary/10 rounded"><Minus className="w-4 h-4" /></button>
        <input
          type="number"
          min={0.001}
          max={row.max_stock}
          step={Number(row.stock_factor) < 1 ? '0.1' : '1'}
          value={v}
          onChange={(e) => {
            const newItems = [...items];
            const index = items.indexOf(row);
            const normalized = String(e.target.value ?? '').replace(',', '.');
            const parsed = Number(normalized);
            if (Number.isNaN(parsed)) return;
            const next = Math.max(0, Math.min(parsed, row.max_stock));
            newItems[index].quantity = next;
            newItems[index].total = next * newItems[index].unit_price;
            setItems(newItems);
          }}
          className="input-field w-24 text-center py-1"
        />
        <button type="button" onClick={() => updateQuantity(items.indexOf(row), 1)} className="p-1 text-unal-primary hover:bg-unal-primary/10 rounded"><Plus className="w-4 h-4" /></button>
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
              keyField="item_key"
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
                onClick={() => addItem(row, selectedVariantFor(row))}
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