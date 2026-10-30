import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle,
  Clock,
  CreditCard,
  FileText,
  Package,
  ShieldCheck,
} from 'lucide-react';
import api from '../utils/api';
import toast from '../utils/toast';
import { FileInput, FormError } from '../components/FormComponents';
import { LogoShield } from '../components/LogoShield';
import { BuyOnUnalButton } from '../components/BuyOnUnalButton';
import { LiveStockBadge } from '../components/LiveStockBadge';
import { usePublicProducts } from '../hooks/usePublicProducts';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PublicFormPage() {
  const [paymentMethod, setPaymentMethod] = useState('online');
  const [proofFile, setProofFile] = useState(null);
  const [acceptsPolicy, setAcceptsPolicy] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const {
    products,
    loading: loadingProducts,
    error: productsError,
    status: stockStatus,
  } = usePublicProducts();

  const validate = () => {
    const newErrors = {};

    if (!proofFile) {
      newErrors.proof_file = 'Debes adjuntar el comprobante de compra en PDF';
    } else if (proofFile.size > MAX_FILE_BYTES) {
      newErrors.proof_file = 'El archivo no debe superar 10 MB';
    } else if (proofFile.type !== 'application/pdf') {
      newErrors.proof_file = 'El comprobante debe ser un archivo PDF';
    }

    if (!acceptsPolicy) {
      newErrors.accepts_policy =
        'Debe aceptar la política de privacidad para continuar';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setProofFile(null);
      return;
    }

    if (file.type !== 'application/pdf') {
      setProofFile(null);
      setErrors((prev) => ({
        ...prev,
        proof_file: 'El comprobante debe ser un archivo PDF',
      }));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setProofFile(null);
      setErrors((prev) => ({
        ...prev,
        proof_file: 'El archivo no debe superar 10 MB',
      }));
      return;
    }

    setProofFile(file);
    setErrors((prev) => ({ ...prev, proof_file: '' }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('payment_mode', 'online');
      formData.append('accepts_policy', String(acceptsPolicy));
      formData.append('proof_file', proofFile);

      const response = await api.post('/public/leads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setResult(response.data);
      toast.success(
        '¡Compra registrada!',
        'Guarda tu código de reclamo para recoger tus productos.',
      );
    } catch (error) {
      const message =
        error.response?.data?.error || 'Error al registrar la compra';
      toast.error('No pudimos registrar la compra', message);
      setErrors((prev) => ({ ...prev, general: message }));
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-screen bg-unal-background flex items-center justify-center py-12 px-4">
        <div className="max-w-xl w-full card p-6 sm:p-8">
          <div className="text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-unal-secondary mb-3">
              ¡Compra registrada!
            </h1>
            <p className="text-unal-secondary-light mb-6">
              Leímos el comprobante y registramos tu compra. Presenta este
              código cuando vayas a recoger tus productos.
            </p>
          </div>

          <div className="mb-6 p-4 sm:p-5 bg-unal-primary/5 border-2 border-dashed border-unal-primary/40 rounded-xl text-center">
            <p className="text-sm font-medium text-unal-secondary-light mb-1">
              Tu código único de reclamo
            </p>
            <p className="text-3xl sm:text-4xl font-bold tracking-widest text-unal-primary font-mono">
              {result.pickup_code}
            </p>
            <p className="mt-2 text-xs sm:text-sm text-unal-secondary-light">
              Tómale una captura o anótalo. También quedó asociado a tu compra.
            </p>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 text-sm">
            <div>
              <dt className="text-unal-secondary-light">Factura</dt>
              <dd className="font-medium text-unal-secondary">
                {result.invoice_number}
              </dd>
            </div>
            <div>
              <dt className="text-unal-secondary-light">Fecha de compra</dt>
              <dd className="font-medium text-unal-secondary">
                {formatDateTime(result.sale_date)}
              </dd>
            </div>
            <div>
              <dt className="text-unal-secondary-light">Total pagado</dt>
              <dd className="font-medium text-unal-secondary">
                {formatCurrency(result.total)}
              </dd>
            </div>
            <div>
              <dt className="text-unal-secondary-light">Medio de pago</dt>
              <dd className="font-medium text-unal-secondary">
                {result.payment_mode === 'efectivo'
                  ? 'Efectivo en caja'
                  : 'Pago virtual (en línea)'}
              </dd>
            </div>
          </dl>

          {result.customer && (
            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
              <h2 className="text-sm font-semibold text-unal-secondary mb-2">
                Datos tomados del comprobante
              </h2>
              <ul className="text-sm text-unal-secondary-light space-y-1">
                <li>
                  <span className="font-medium text-unal-secondary">Nombre:</span>{' '}
                  {result.customer.full_name}
                </li>
                <li>
                  <span className="font-medium text-unal-secondary">
                    Documento:
                  </span>{' '}
                  {result.customer.document_type} {result.customer.document_number}
                </li>
                {result.customer.phone && (
                  <li>
                    <span className="font-medium text-unal-secondary">
                      Teléfono:
                    </span>{' '}
                    {result.customer.phone}
                  </li>
                )}
                {result.customer.email && (
                  <li>
                    <span className="font-medium text-unal-secondary">
                      Correo:
                    </span>{' '}
                    {result.customer.email}
                  </li>
                )}
              </ul>
            </div>
          )}

          {Array.isArray(result.items) && result.items.length > 0 && (
            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
              <h2 className="text-sm font-semibold text-unal-secondary mb-2">
                Productos registrados
              </h2>
              <ul className="text-sm text-unal-secondary-light space-y-2">
                {result.items.map((item, index) => (
                  <li
                    key={`${item.description}-${index}`}
                    className="flex justify-between gap-3"
                  >
                    <span>{item.description}</span>
                    <span className="font-medium text-unal-secondary">
                      {formatCurrency(item.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Link
            to="/"
            className="btn-primary w-full inline-flex items-center justify-center"
          >
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
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-unal-secondary hover:text-unal-primary mb-6"
            >
              <ArrowLeft className="w-5 h-5" />
              Volver al inicio
            </Link>
            <div className="mx-auto mb-4 w-fit">
              <LogoShield className="w-14 h-14" />
            </div>
            <h1 className="text-2xl font-bold text-unal-secondary">
              Registra tu compra
            </h1>
            <p className="text-unal-secondary-light mt-2">
              {paymentMethod === 'efectivo'
                ? 'Pagaste en efectivo en la caja de la Universidad. Registra tu recibo y los productos para que un administrador valide la compra.'
                : 'Ya compraste en la página de la Universidad Nacional. Sube el comprobante en PDF y nosotros registramos la venta con tus datos.'}
            </p>
          </div>

          {paymentMethod === 'online' && (
            <div className="mb-6 flex flex-col gap-4 rounded-xl border border-unal-primary/20 bg-unal-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-unal-secondary">
                  ¿Aún no has realizado tu compra?
                </p>
                <p className="mt-1 text-sm text-unal-secondary-light">
                  Compra primero en la página de pago virtual de la UNAL y luego
                  sube aquí el comprobante en PDF.
                </p>
              </div>
              <BuyOnUnalButton className="btn-primary whitespace-nowrap">
                Comprar en la UNAL
              </BuyOnUnalButton>
            </div>
          )}

          <div className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-unal-secondary">
                ¿Cómo pagaste?
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('online');
                    setErrors({});
                  }}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    paymentMethod === 'online'
                      ? 'border-unal-primary bg-unal-primary/5'
                      : 'border-gray-200 hover:border-unal-primary/50'
                  }`}
                  aria-pressed={paymentMethod === 'online'}
                >
                  <span className="flex items-center gap-2 font-medium text-unal-secondary">
                    <CreditCard className="w-5 h-5 text-unal-primary" />
                    Pago virtual (en línea)
                  </span>
                  <span className="block text-sm text-unal-secondary-light mt-1">
                    Pagaste en la página de la UNAL. Solo necesitas el PDF.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('efectivo');
                    setErrors({});
                  }}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    paymentMethod === 'efectivo'
                      ? 'border-unal-primary bg-unal-primary/5'
                      : 'border-gray-200 hover:border-unal-primary/50'
                  }`}
                  aria-pressed={paymentMethod === 'efectivo'}
                >
                  <span className="flex items-center gap-2 font-medium text-unal-secondary">
                    <Banknote className="w-5 h-5 text-unal-primary" />
                    Efectivo en caja
                  </span>
                  <span className="block text-sm text-unal-secondary-light mt-1">
                    Registra tu solicitud y un administrador valida el recibo
                    físico antes de descontar el inventario.
                  </span>
                </button>
              </div>
            </div>

            {paymentMethod === 'efectivo' ? (
              <div className="space-y-4 rounded-xl border border-unal-primary/20 bg-unal-primary/5 p-5">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-unal-secondary">
                  <Banknote className="w-5 h-5 text-unal-primary" />
                  Compra en efectivo en caja
                </h2>
                <p className="text-sm text-unal-secondary-light">
                  Si pagaste en efectivo en la caja de la Universidad, el recibo
                  físico es tu comprobante. La granja no controla los códigos de
                  caja, así que un administrador revisa cada solicitud antes de
                  entregar productos.
                </p>
                <ol className="space-y-2 text-sm text-unal-secondary">
                  <li>
                    <span className="font-semibold">1.</span> Registra el código
                    del recibo, tus datos y los productos que pagaste.
                  </li>
                  <li>
                    <span className="font-semibold">2.</span> Adjunta una foto o
                    PDF legible del recibo de caja.
                  </li>
                  <li>
                    <span className="font-semibold">3.</span> Recibirás un código
                    de solicitud para consultar el estado.
                  </li>
                  <li>
                    <span className="font-semibold">4.</span> Cuando un
                    administrador apruebe, se descuenta el stock y ese mismo
                    código sirve para reclamar.
                  </li>
                </ol>
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  <Clock className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p>
                    La solicitud no reserva inventario. Si el producto se agota
                    antes de la validación, la aprobación se bloquea y el
                    administrador te contactará.
                  </p>
                </div>
                <Link
                  to="/formulario-compra/efectivo"
                  className="btn-primary inline-flex w-full items-center justify-center gap-2 py-3 text-base sm:w-auto"
                >
                  Registrar o consultar solicitud
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between gap-3 bg-gray-50 px-4 py-3">
                <h2 className="flex items-center gap-2 font-semibold text-unal-secondary">
                  <Package className="w-5 h-5 text-unal-primary" />
                  Productos disponibles
                </h2>
                <div className="flex items-center gap-2">
                  {!loadingProducts && !productsError && (
                    <span className="text-xs text-unal-secondary-light">
                      {products.length} producto{products.length === 1 ? '' : 's'}
                    </span>
                  )}
                  <LiveStockBadge status={stockStatus} />
                </div>
              </div>
              <div className="p-4">
                <p className="text-xs text-unal-secondary-light mb-3">
                  La compra se realiza en la página de la UNAL. Esta lista es
                  informativa y muestra la cantidad disponible hoy en la granja.
                </p>

                {loadingProducts ? (
                  <div className="flex justify-center py-6">
                    <div className="w-7 h-7 border-4 border-unal-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : productsError ? (
                  <p className="text-sm text-unal-secondary-light">
                    {productsError}
                  </p>
                ) : products.length === 0 ? (
                  <p className="text-sm text-unal-secondary-light">
                    No hay productos disponibles en este momento.
                  </p>
                ) : (
                  <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {products.map((product) => (
                      <li
                        key={product.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-100 bg-white"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-unal-secondary truncate">
                            {product.name}
                          </p>
                          <p className="text-xs text-unal-secondary-light">
                            {formatCurrency(product.current_price)} /{' '}
                            {product.unit} · {product.category}
                          </p>
                        </div>
                        <span className="badge badge-success whitespace-nowrap">
                          {product.current_stock} {product.unit}(s)
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <FileInput
                label="Comprobante de compra (PDF)"
                id="proof_file"
                name="proof_file"
                accept="application/pdf"
                onChange={handleFileChange}
                error={errors.proof_file}
                required
              />
              {proofFile && (
                <p className="flex items-center gap-2 text-sm text-unal-secondary-light">
                  <FileText className="w-4 h-4 text-unal-primary" />
                  {proofFile.name} · {(proofFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              )}
            </div>

            <div className="p-4 bg-unal-primary/5 border border-unal-primary/20 rounded-xl">
              <h3 className="flex items-center gap-2 font-medium text-unal-secondary mb-2">
                <ShieldCheck className="w-4 h-4 text-unal-primary" />
                Qué tomamos del comprobante
              </h3>
              <p className="text-sm text-unal-secondary-light">
                Tipo y número de documento, nombre completo, teléfono, correo,
                fecha de compra y las descripciones pagadas. No tienes que
                escribir estos datos otra vez.
              </p>
            </div>

            <FormError message={errors.general} />

            <div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  id="accepts_policy"
                  type="checkbox"
                  checked={acceptsPolicy}
                  onChange={(event) => {
                    setAcceptsPolicy(event.target.checked);
                    setErrors((prev) => ({ ...prev, accepts_policy: '' }));
                  }}
                  className="mt-1 w-4 h-4 flex-shrink-0 text-unal-primary border-gray-300 rounded focus:ring-unal-primary focus:ring-2"
                  aria-describedby={
                    errors.accepts_policy ? 'accepts_policy-error' : undefined
                  }
                />
                <span className="text-sm text-unal-secondary">
                  Autorizo el tratamiento de mis datos personales conforme a la{' '}
                  <Link
                    to="/privacidad"
                    className="text-unal-primary hover:underline font-medium"
                  >
                    Política de Privacidad
                  </Link>{' '}
                  y acepto los{' '}
                  <Link
                    to="/terminos"
                    className="text-unal-primary hover:underline font-medium"
                  >
                    Términos y Condiciones
                  </Link>
                  .<span className="text-red-500"> *</span>
                </span>
              </label>
              {errors.accepts_policy && (
                <p
                  id="accepts_policy-error"
                  className="mt-1 text-sm text-red-500"
                  role="alert"
                >
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
                  <svg
                    className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Leyendo comprobante...
                </>
              ) : (
                'Registrar mi compra'
              )}
            </button>
              </form>
            )}
          </div>

          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-unal-secondary mb-2 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-unal-accent" />
              Información importante
            </h4>
            <ul className="text-sm text-unal-secondary-light space-y-1">
              <li>• Pago virtual: sube el PDF que entrega la UNAL.</li>
              <li>• Efectivo: registra el código y adjunta el recibo de caja.</li>
              <li>• Cada comprobante o recibo se usa una sola vez.</li>
              <li>
                • En efectivo, el código de reclamo se habilita cuando el
                administrador aprueba la solicitud.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
