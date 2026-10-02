import { useState, useEffect } from 'react';
import { Plus, Search, Filter, Edit, Trash2, AlertTriangle, Package, Upload, X } from 'lucide-react';
import api from '../utils/api';
import { formatCOP } from '../utils/formatters';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { Input, Select, FormError } from '../components/FormComponents';
import toast from '../utils/toast';

const CATEGORIES = ['Avícola', 'Piscícola', 'Apícola', 'Porcino', 'Otro'];

export function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ search: '', category: '', low_stock: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    unit: '',
    current_price: '',
    current_stock: '',
    min_stock: '',
    category: '',
    description: '',
    image_url: '',
    is_active: true
  });
  const [errors, setErrors] = useState({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        api.get(`/products?page=${pagination.page}&limit=${pagination.limit}&search=${filters.search}&category=${filters.category}&low_stock=${filters.low_stock}`),
        api.get('/products/categories')
      ]);
      setProducts(productsRes.data.data);
      setCategories(categoriesRes.data.categories);
      setPagination(prev => ({
        ...prev,
        total: productsRes.data.pagination.total,
        totalPages: productsRes.data.pagination.totalPages
      }));
    } catch (error) {
      toast.error('Error', 'No se pudieron cargar los productos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [pagination.page, filters]);

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'El nombre es obligatorio';
    if (!formData.unit.trim()) newErrors.unit = 'La unidad es obligatoria';
    if (!formData.current_price || parseFloat(formData.current_price) < 0) newErrors.current_price = 'Precio inválido';
    if (formData.current_stock === '' || parseInt(formData.current_stock) < 0) newErrors.current_stock = 'Stock inválido';
    if (formData.min_stock === '' || parseInt(formData.min_stock) < 0) newErrors.min_stock = 'Stock mínimo inválido';
    if (!formData.category.trim()) newErrors.category = 'La categoría es obligatoria';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resetForm = () => {
    setFormData({
      name: '',
      unit: '',
      current_price: '',
      current_stock: '0',
      min_stock: '0',
      category: '',
      description: '',
      image_url: '',
      is_active: true
    });
    setErrors({});
    setEditingProduct(null);
    setUploadingImage(false);
  };

  const openModal = (product = null) => {
    resetForm();
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        unit: product.unit,
        current_price: product.current_price,
        current_stock: product.current_stock,
        min_stock: product.min_stock,
        category: product.category,
        description: product.description || '',
        image_url: product.image_url || '',
        is_active: product.is_active
      });
    }
    setModalOpen(true);
  };

  const handleImageFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Formato no válido', 'Use JPG, PNG o WEBP');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Archivo muy grande', 'La imagen no debe superar 10MB');
      return;
    }

    setUploadingImage(true);
    try {
      const imageData = new FormData();
      imageData.append('image', file);
      const response = await api.post('/products/upload-image', imageData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setFormData(prev => ({ ...prev, image_url: response.data.image_url }));
      toast.success('Imagen subida', 'La imagen se guardó en Cloudinary');
    } catch (error) {
      toast.error('Error', error.response?.data?.error || 'No se pudo subir la imagen');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const data = {
        name: formData.name,
        unit: formData.unit,
        current_price: parseFloat(formData.current_price),
        current_stock: parseInt(formData.current_stock),
        min_stock: parseInt(formData.min_stock),
        category: formData.category,
        description: formData.description || null,
        image_url: formData.image_url || null,
        is_active: formData.is_active
      };

      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, data);
        toast.success('Producto actualizado');
      } else {
        await api.post('/products', data);
        toast.success('Producto creado');
      }
      setModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Error', error.response?.data?.error || 'No se pudo guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (product) => {
    if (!window.confirm(`¿Desactivar el producto "${product.name}"?`)) return;
    try {
      await api.delete(`/products/${product.id}`);
      toast.success('Producto desactivado');
      fetchData();
    } catch (error) {
      toast.error('Error', 'No se pudo desactivar');
    }
  };

  const columns = [
    { key: 'name', label: 'Producto', sortable: true },
    { key: 'unit', label: 'Unidad' },
    { key: 'category', label: 'Categoría', render: (v) => <span className="badge badge-gray">{v}</span> },
    { key: 'current_price', label: 'Precio', render: (v) => formatCOP(v), sortable: true },
    { key: 'current_stock', label: 'Stock', render: (v, row) => (
      <span className={v <= row.min_stock && v > 0 ? 'text-yellow-600 font-medium' : v === 0 ? 'text-red-600 font-medium' : ''}>
        {v} {row.unit}
      </span>
    ), sortable: true },
    { key: 'min_stock', label: 'Stock Mín' },
    { key: 'is_active', label: 'Estado', render: (v) => (
      <span className={`badge ${v ? 'badge-success' : 'badge-gray'}`}>{v ? 'Activo' : 'Inactivo'}</span>
    )}
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-unal-secondary">Productos</h1>
          <p className="text-unal-secondary-light">Catálogo de productos de la Granja El Cairo</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4 mr-2" /> Filtros
          </button>
          <button className="btn-primary" onClick={() => openModal()}>
            <Plus className="w-4 h-4 mr-2" /> Nuevo producto
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
              options={[{ value: '', label: 'Todas' }, ...categories.map(c => ({ value: c, label: c }))]}
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

      <DataTable
        columns={columns}
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
          <div className="flex items-center justify-end gap-1">
            {row.current_stock <= row.min_stock && row.current_stock > 0 && (
              <span className="badge badge-warning mr-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Stock bajo
              </span>
            )}
            {row.current_stock === 0 && (
              <span className="badge badge-danger mr-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Sin stock
              </span>
            )}
            <button
              onClick={() => openModal(row)}
              className="p-2 text-unal-primary hover:bg-unal-primary/10 rounded-lg transition-colors"
              title="Editar"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDelete(row)}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Desactivar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      />

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingProduct ? 'Editar producto' : 'Nuevo producto'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormError message={errors.general} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Nombre"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              error={errors.name}
              required
              placeholder="Ej: Huevos"
            />
            <Select
              label="Categoría"
              id="category"
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              error={errors.category}
              required
              options={CATEGORIES.map(c => ({ value: c, label: c }))}
            />
            <Input
              label="Unidad"
              id="unit"
              value={formData.unit}
              onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
              error={errors.unit}
              required
              placeholder="Ej: docena, kilogramo, unidad, litro"
            />
            <Input
              label="Precio actual (COP)"
              id="current_price"
              type="number"
              step="0.01"
              min="0"
              value={formData.current_price}
              onChange={(e) => setFormData(prev => ({ ...prev, current_price: e.target.value }))}
              error={errors.current_price}
              required
            />
            <Input
              label="Stock actual"
              id="current_stock"
              type="number"
              min="0"
              value={formData.current_stock}
              onChange={(e) => setFormData(prev => ({ ...prev, current_stock: e.target.value }))}
              error={errors.current_stock}
              required
            />
            <Input
              label="Stock mínimo"
              id="min_stock"
              type="number"
              min="0"
              value={formData.min_stock}
              onChange={(e) => setFormData(prev => ({ ...prev, min_stock: e.target.value }))}
              error={errors.min_stock}
              required
            />
            <div className="md:col-span-2">
              <label className="label-field">Descripción</label>
              <textarea
                id="description"
                rows={3}
                className="input-field"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descripción opcional del producto..."
              />
            </div>
            <div className="md:col-span-2">
              <label className="label-field">Imagen del producto</label>
              {formData.image_url && (
                <div className="relative inline-block mb-3">
                  <img
                    src={formData.image_url}
                    alt="Vista previa del producto"
                    className="h-32 rounded-lg border border-gray-200 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                    className="absolute -top-2 -right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
                    title="Quitar imagen"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <label
                htmlFor="product_image_file"
                className={`flex items-center justify-center gap-2 w-full px-4 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  uploadingImage
                    ? 'border-gray-300 bg-gray-50 text-unal-secondary-light cursor-wait'
                    : 'border-gray-300 hover:border-unal-primary hover:bg-gray-50 text-unal-secondary'
                }`}
              >
                {uploadingImage ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Subiendo imagen...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    {formData.image_url ? 'Cambiar imagen (se sube a Cloudinary)' : 'Subir imagen (se guarda en Cloudinary)'}
                  </>
                )}
              </label>
              <input
                id="product_image_file"
                type="file"
                accept="image/jpeg,image/png,image/jpg,image/webp"
                onChange={handleImageFileChange}
                disabled={uploadingImage}
                className="hidden"
              />
              <p className="mt-2 text-xs text-unal-secondary-light">JPG, PNG o WEBP • Máx. 10MB. O pega una URL manualmente:</p>
              <input
                id="image_url"
                type="url"
                className="input-field mt-1"
                value={formData.image_url}
                onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
                placeholder="https://ejemplo.com/imagen.jpg"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                className="w-4 h-4 text-unal-primary border-gray-300 rounded focus:ring-unal-primary"
              />
              <span className="text-sm text-unal-secondary">Activo</span>
            </label>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Guardando...' : (editingProduct ? 'Actualizar' : 'Crear')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}