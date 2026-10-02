import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Upload, FileImage, CheckCircle, ArrowLeft, Shield, Plus, Minus, Package, Tag } from 'lucide-react';
import api from '../utils/api';
import toast from '../utils/toast';
import { FileInput, Input, Select, FormError } from '../components/FormComponents';
import { LogoShield } from '../components/LogoShield';

export function PublicFormPage() {
  const [formData, setFormData] = useState({
    document_type: 'CC',
    document_number: '',
    full_name: '',
    phone: '',
    email: '',
    proof_file: null,
    accepts_policy: false
  });
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [purchase, setPurchase] = useState(null);
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState({});

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await api.get('/public/products');
        setProducts(response.data.products || []);
      } catch (error) {
        console.error('Error loading products:', error);
        toast.error('Error', 'No se pudieron cargar los productos');
      } finally {
        setLoadingProducts(false);
      }
    };
    fetchProducts();
  }, []);

  const validate = () => {
    const newErrors = {};
    if (!formData.document_number.trim()) {
      newErrors.document_number = 'El número de documento es obligatorio';
    }
    if (!formData.full_name.trim()) {
      newErrors.full_name = 'El nombre completo es obligatorio';
    }
    if (!formData.phone.trim()) {
      newErrors.phone = 'El celular es obligatorio';
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'El correo electrónico no es válido';
    }
    if (!formData.proof_file) {
      newErrors.proof_file = 'El comprobante de pago es obligatorio';
    }
    if (!formData.accepts_policy) {
      newErrors.accepts_policy = 'Debe aceptar la política de privacidad para continuar';
    }
    const hasProducts = Object.values(selectedProducts).some(qty => qty > 0);
    if (!hasProducts) {
      newErrors.products = 'Seleccione al menos un producto';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setErrors(prev => ({ ...prev, proof_file: 'El archivo no debe superar 10MB' }));
        return;
      }
      const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
      if (!validTypes.includes(file.type)) {
        setErrors(prev => ({ ...prev, proof_file: 'Formato no válido. Use JPG, PNG o PDF' }));
        return;
      }
      setFormData(prev => ({ ...prev, proof_file: file }));
      setErrors(prev => ({ ...prev, proof_file: '' }));
      
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target.result);
        reader.readAsDataURL(file);
      } else {
        setPreview(null);
      }
    }
  };

  const handleQuantityChange = (productId, change) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const currentQty = selectedProducts[productId] || 0;
    const newQty = currentQty + change;
    
    if (newQty < 0) return;
    if (newQty > product.current_stock) {
      toast.warning('Stock insuficiente', `Solo hay ${product.current_stock} ${product.unit}(s) disponibles`);
      return;
    }
    
    setSelectedProducts(prev => ({
      ...prev,
      [productId]: newQty
    }));
  };

  const getSelectedItems = () => {
    return Object.entries(selectedProducts)
      .filter(([_, qty]) => qty > 0)
      .map(([productId, quantity]) => {
        const product = products.find(p => p.id === parseInt(productId));
        return {
          product_id: parseInt(productId),
          product_name: product?.name,
          product_unit: product?.unit,
          quantity,
          unit_price: product?.current_price,
          total: quantity * (product?.current_price || 0)
        };
      });
  };

  const getTotal = () => {
    return getSelectedItems().reduce((sum, item) => sum + item.total, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('document_type', formData.document_type);
      formDataToSend.append('document_number', formData.document_number.trim());
      formDataToSend.append('full_name', formData.full_name.trim());
      formDataToSend.append('phone', formData.phone.trim());
      if (formData.email) formDataToSend.append('email', formData.email.trim());
      formDataToSend.append('products', JSON.stringify(getSelectedItems()));
      formDataToSend.append('proof_file', formData.proof_file);

      const response = await api.post('/public/leads', formDataToSend, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setPurchase({
        invoice_number: response.data.invoice_number,
        pickup_code: response.data.pickup_code,
        total: response.data.total
      });
      setSubmitted(true);
      toast.success('¡Formulario enviado!', 'Guarda tu código de reclamo para recoger tus productos.');
    } catch (error) {
      const message = error.response?.data?.error || 'Error al enviar el formulario';
      toast.error('Error', message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-unal-background flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full card p-6 sm:p-8 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-unal-secondary mb-3">¡Formulario enviado!</h1>
          <p className="text-unal-secondary-light mb-6">
            Hemos recibido tu solicitud y comprobante de pago. Nuestro equipo revisará la información
            y se pondrá en contacto contigo a la brevedad.
          </p>
          {purchase?.pickup_code && (
            <div className="mb-6 p-4 sm:p-5 bg-unal-primary/5 border-2 border-dashed border-unal-primary/40 rounded-xl">
              <p className="text-sm font-medium text-unal-secondary-light mb-1">
                Tu código único de reclamo{purchase.invoice_number ? ` · Factura ${purchase.invoice_number}` : ''}
              </p>
              <p className="text-3xl sm:text-4xl font-bold tracking-widest text-unal-primary font-mono">
                {purchase.pickup_code}
              </p>
              <p className="mt-2 text-xs sm:text-sm text-unal-secondary-light">
                Presenta este código al recoger tus productos. Tómale una captura o anótalo.
              </p>
            </div>
          )}
          <Link to="/" className="btn-primary inline-flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-unal-background py-12 px-4">
      <div className="max-w-3xl w-full mx-auto">
        <div className="card p-6 sm:p-8">
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2 text-unal-secondary hover:text-unal-primary mb-6">
              <ArrowLeft className="w-5 h-5" />
              Volver al inicio
            </Link>
            <div className="mx-auto mb-4 w-fit">
              <LogoShield className="w-14 h-14" />
            </div>
            <h1 className="text-2xl font-bold text-unal-secondary">Formulario de compra</h1>
            <p className="text-unal-secondary-light mt-2">
              Selecciona los productos, completa tus datos y adjunta el comprobante de pago
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-unal-secondary flex items-center gap-2">
                <Package className="w-5 h-5 text-unal-primary" />
                Productos disponibles
              </h3>
              
              {loadingProducts ? (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 border-4 border-unal-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : products.length === 0 ? (
                <p className="text-center text-unal-secondary-light py-8">No hay productos disponibles</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {products.map(product => {
                    const qty = selectedProducts[product.id] || 0;
                    const isSelected = qty > 0;
                    return (
                      <div 
                        key={product.id}
                        className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-lg border-2 transition-colors ${
                          isSelected 
                            ? 'border-unal-primary bg-unal-primary/5' 
                            : 'border-gray-200 hover:border-unal-primary/50'
                        }`}
                      >
                        {product.image_url && (
                          <img 
                            src={product.image_url} 
                            alt={product.name}
                            className="w-16 h-16 object-cover rounded-lg"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-unal-secondary truncate">{product.name}</h4>
                            <span className="badge badge-gray">{product.category}</span>
                          </div>
                          <p className="text-sm text-unal-secondary-light">
                            ${product.current_price.toLocaleString('es-CO')} / {product.unit}
                            <span className="mx-2">•</span>
                            Stock: {product.current_stock} {product.unit}(s)
                          </p>
                          {product.description && (
                            <p className="text-xs text-unal-secondary-light mt-1 line-clamp-1">{product.description}</p>
                          )}
                        </div>
                        <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(product.id, -1)}
                            disabled={qty <= 0}
                            className="p-2 rounded-lg border border-gray-300 text-unal-secondary hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-12 text-center font-semibold text-unal-secondary">{qty}</span>
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(product.id, 1)}
                            disabled={qty >= product.current_stock}
                            className="p-2 rounded-lg border border-gray-300 text-unal-secondary hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <span className="text-sm text-unal-primary font-medium w-24 text-right">
                            ${(qty * product.current_price).toLocaleString('es-CO')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {errors.products && (
                <p className="text-sm text-red-500" role="alert">{errors.products}</p>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="font-medium text-unal-secondary">Total estimado:</span>
                <span className="text-2xl font-bold text-unal-primary">
                  ${getTotal().toLocaleString('es-CO')}
                </span>
              </div>
              {getSelectedItems().length > 0 && (
                <p className="text-xs text-unal-secondary-light mt-1">
                  {getSelectedItems().length} producto{getSelectedItems().length > 1 ? 's' : ''} seleccionado{getSelectedItems().length > 1 ? 's' : ''}
                </p>
              )}
            </div>

            <h3 className="text-lg font-semibold text-unal-secondary">Tus datos</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Tipo de documento"
                id="document_type"
                value={formData.document_type}
                onChange={(e) => setFormData(prev => ({ ...prev, document_type: e.target.value }))}
                required
                options={[
                  { value: 'CC', label: 'Cédula de ciudadanía (CC)' },
                  { value: 'CE', label: 'Cédula de extranjería (CE)' },
                  { value: 'NIT', label: 'NIT' },
                  { value: 'PASSPORT', label: 'Pasaporte' }
                ]}
              />

              <Input
                label="Número de documento"
                id="document_number"
                name="document_number"
                type="text"
                value={formData.document_number}
                onChange={(e) => setFormData(prev => ({ ...prev, document_number: e.target.value }))}
                error={errors.document_number}
                required
                placeholder="1234567890"
                autoComplete="off"
              />
            </div>

            <Input
              label="Nombre completo"
              id="full_name"
              name="full_name"
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
              error={errors.full_name}
              required
              placeholder="Juan Pérez García"
              autoComplete="name"
            />

            <Input
              label="Celular"
              id="phone"
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              error={errors.phone}
              required
              placeholder="300 123 4567"
              autoComplete="tel"
            />

            <Input
              label="Correo electrónico (opcional)"
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              error={errors.email}
              placeholder="juan@ejemplo.com"
              autoComplete="email"
            />

            <FileInput
              label="Foto del comprobante de pago"
              id="proof_file"
              accept="image/jpeg,image/png,image/jpg,application/pdf"
              onChange={handleFileChange}
              error={errors.proof_file}
              required
              preview={preview}
            />

            <FormError message={errors.general} />

            <div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  id="accepts_policy"
                  type="checkbox"
                  checked={formData.accepts_policy}
                  onChange={(e) => setFormData(prev => ({ ...prev, accepts_policy: e.target.checked }))}
                  className="mt-1 w-4 h-4 flex-shrink-0 text-unal-primary border-gray-300 rounded focus:ring-unal-primary focus:ring-2"
                  aria-describedby={errors.accepts_policy ? 'accepts_policy-error' : undefined}
                />
                <span className="text-sm text-unal-secondary">
                  Autorizo el tratamiento de mis datos personales conforme a la{' '}
                  <Link to="/privacidad" className="text-unal-primary hover:underline font-medium">Política de Privacidad</Link>{' '}
                  y acepto los{' '}
                  <Link to="/terminos" className="text-unal-primary hover:underline font-medium">Términos y Condiciones</Link>.
                  <span className="text-red-500"> *</span>
                </span>
              </label>
              {errors.accepts_policy && (
                <p id="accepts_policy-error" className="mt-1 text-sm text-red-500" role="alert">
                  {errors.accepts_policy}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full btn-primary py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Enviando...
                </>
              ) : (
                'Enviar solicitud'
              )}
            </button>
          </form>

          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-unal-secondary mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-unal-accent" />
              Información importante
            </h4>
            <ul className="text-sm text-unal-secondary-light space-y-1">
              <li>• Los comprobantes son revisados manualmente por nuestro equipo</li>
              <li>• Te contactaremos al correo o teléfono proporcionado</li>
              <li>• El pedido se confirma una vez verificado el pago</li>
              <li>• Los precios son de referencia y pueden variar al momento de la confirmación</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}