import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  CheckCircle,
  Clock,
  FileText,
  Package,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import api from '../utils/api';
import toast from '../utils/toast';
import { FileInput, FormError, Input, Select, Textarea } from '../components/FormComponents';
import { LogoShield } from '../components/LogoShield';
import { LiveStockBadge } from '../components/LiveStockBadge';
import { usePublicProducts } from '../hooks/usePublicProducts';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const RECEIPT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

const DOCUMENT_TYPES = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'TI', label: 'Tarjeta de identidad' },
  { value: 'NIT', label: 'NIT' },
  { value: 'PASSPORT', label: 'Pasaporte' },
];

const STATUS_META = {
  pendiente: {
    label: 'Pendiente de validación',
    className: 'badge-warning',
    icon: Clock,
    description:
      'Un administrador está revisando tu recibo. Todavía no se ha descontado inventario.',
  },
  aprobada: {
    label: 'Aprobada',
    className: 'badge-success',
    icon: CheckCircle,
    description:
      'Tu compra fue validada y la entrega quedó registrada como realizada.',
  },
  rechazada: {
    label: 'Rechazada',
    className: 'badge-danger',
    icon: XCircle,
    description:
      'La solicitud no pudo aprobarse. Revisa el motivo y contacta a la granja si necesitas ayuda.',
  },
};

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

function formatDateOnly(value) {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function todayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pendiente;
  return <span className={`badge ${meta.className}`}>{meta.label}</span>;
}

export function CashPurchasePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'consulta' ? 'consulta' : 'nueva';
  const [tab, setTab] = useState(initialTab);

  const { products, loading: loadingProducts, error: productsError, status: stockStatus } =
    usePublicProducts();

  // --- Formulario de solicitud -------------------------------------------------
  const [form, setForm] = useState({
    cash_receipt_code: '',
    document_type: 'CC',
    document_number: '',
    full_name: '',
    phone: '',
    email: '',
    purchase_date: todayISO(),
    declared_total: '',
    notes: '',
    accepts_policy: false,
  });
  const [declaredTouched, setDeclaredTouched] = useState(false);
  const [quantities, setQuantities] = useState({});
  const [receiptFile, setReceiptFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  // --- Consulta de estado ------------------------------------------------------
  const [lookup, setLookup] = useState({ code: '', document: '' });
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [lookupResult, setLookupResult] = useState(null);

  const selectedItems = useMemo(
    () =>
      products
        .map((product) => ({
          ...product,
          quantity: Number(quantities[product.id]) || 0,
        }))
        .filter((product) => product.quantity > 0),
    [products, quantities],
  );

  const computedTotal = useMemo(
    () =>
      selectedItems.reduce(
        (sum, item) => sum + Number(item.current_price) * item.quantity,
        0,
      ),
    [selectedItems],
  );

  // El total declarado sigue al calculado mientras el comprador no lo edite.
  // Si lo ajusta (por ejemplo, porque el recibo incluye otro valor), se respeta
  // su número y se muestra la diferencia para que la revise el administrador.
  const declaredTotal = declaredTouched
    ? Number(form.declared_total || 0)
    : computedTotal;

  const difference = Number(declaredTotal || 0) - computedTotal;

  const changeTab = (nextTab) => {
    setTab(nextTab);
    setSearchParams(nextTab === 'consulta' ? { tab: 'consulta' } : {});
  };

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '', general: '' }));
  };

  const setQuantity = (productId, rawValue, max) => {
    const value = rawValue === '' ? '' : Math.max(0, Math.min(Number(rawValue), max));
    setQuantities((prev) => ({ ...prev, [productId]: value }));
    setErrors((prev) => ({ ...prev, items: '', general: '' }));
  };

  const handleReceiptChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setReceiptFile(null);
      return;
    }

    if (!RECEIPT_TYPES.has(file.type)) {
      setReceiptFile(null);
      setErrors((prev) => ({
        ...prev,
        receipt_file: 'El recibo debe ser una imagen (JPG, PNG, WEBP) o un PDF',
      }));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setReceiptFile(null);
      setErrors((prev) => ({
        ...prev,
        receipt_file: 'El recibo no debe superar 10 MB',
      }));
      return;
    }

    setReceiptFile(file);
    setErrors((prev) => ({ ...prev, receipt_file: '' }));
  };

  const validate = () => {
    const newErrors = {};

    if (!form.cash_receipt_code.trim()) {
      newErrors.cash_receipt_code = 'Escribe el código que aparece en tu recibo de caja';
    }
    if (!form.document_number.trim()) {
      newErrors.document_number = 'El número de documento es obligatorio';
    }
    if (form.full_name.trim().length < 3) {
      newErrors.full_name = 'Escribe tu nombre completo';
    }
    if (!form.purchase_date) {
      newErrors.purchase_date = 'Indica la fecha de compra';
    }
    if (selectedItems.length === 0) {
      newErrors.items = 'Selecciona al menos un producto con su cantidad';
    }

    for (const item of selectedItems) {
      if (item.quantity > Number(item.current_stock)) {
        newErrors.items = `La cantidad de ${item.name} supera el stock disponible (${item.current_stock}).`;
        break;
      }
    }

    if (!receiptFile) {
      newErrors.receipt_file = 'Adjunta una foto o PDF legible del recibo de caja';
    }
    if (!form.accepts_policy) {
      newErrors.accepts_policy =
        'Debe aceptar la política de privacidad para continuar';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('cash_receipt_code', form.cash_receipt_code.trim());
      formData.append('document_type', form.document_type);
      formData.append('document_number', form.document_number.trim());
      formData.append('full_name', form.full_name.trim());
      if (form.phone.trim()) formData.append('phone', form.phone.trim());
      if (form.email.trim()) formData.append('email', form.email.trim());
      formData.append('purchase_date', form.purchase_date);
      formData.append('declared_total', String(Number(declaredTotal || 0)));
      if (form.notes.trim()) formData.append('notes', form.notes.trim());
      formData.append('accepts_policy', 'true');
      formData.append(
        'items',
        JSON.stringify(
          selectedItems.map((item) => ({
            product_id: item.id,
            quantity: item.quantity,
          })),
        ),
      );
      formData.append('receipt_file', receiptFile);

      const response = await api.post('/public/cash-claims', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setResult(response.data);
      toast.success(
        'Solicitud enviada',
        'Guarda tu código para consultar el estado de la validación.',
      );
    } catch (error) {
      const message =
        error.response?.data?.error || 'No pudimos registrar la solicitud';
      toast.error('No pudimos registrar la solicitud', message);
      setErrors((prev) => ({ ...prev, general: message }));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLookup = async (event) => {
    event.preventDefault();
    setLookupError('');
    setLookupResult(null);

    if (!lookup.code.trim() || !lookup.document.trim()) {
      setLookupError('Ingresa el código de solicitud y tu número de documento');
      return;
    }

    setLookupLoading(true);
    try {
      const response = await api.get(
        `/public/cash-claims/${encodeURIComponent(lookup.code.trim().toUpperCase())}`,
        { params: { document: lookup.document.trim() } },
      );
      setLookupResult(response.data);
    } catch (error) {
      setLookupError(
        error.response?.data?.error ||
          'No pudimos consultar la solicitud en este momento',
      );
    } finally {
      setLookupLoading(false);
    }
  };

  const startNewClaim = () => {
    setResult(null);
    setErrors({});
    setReceiptFile(null);
    setQuantities({});
    setDeclaredTouched(false);
    setForm({
      cash_receipt_code: '',
      document_type: 'CC',
      document_number: '',
      full_name: '',
      phone: '',
      email: '',
      purchase_date: todayISO(),
      declared_total: '',
      notes: '',
      accepts_policy: false,
    });
    changeTab('nueva');
  };

  // --- Resultado de la solicitud ----------------------------------------------
  if (result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-unal-background px-4 py-12">
        <div className="card w-full max-w-xl p-6 sm:p-8">
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
              <Clock className="h-10 w-10 text-amber-600" />
            </div>
            <h1 className="mb-3 text-2xl font-bold text-unal-secondary">
              Solicitud recibida
            </h1>
            <p className="mb-6 text-unal-secondary-light">
              Tu solicitud quedó <strong>pendiente de validación</strong>. Un
              administrador revisará el recibo de caja antes de descontar el
              inventario y habilitar la entrega.
            </p>
          </div>

          <div className="mb-6 rounded-xl border-2 border-dashed border-unal-primary/40 bg-unal-primary/5 p-4 text-center sm:p-5">
            <p className="mb-1 text-sm font-medium text-unal-secondary-light">
              Tu código de solicitud
            </p>
            <p className="font-mono text-3xl font-bold tracking-widest text-unal-primary sm:text-4xl">
              {result.claim_code}
            </p>
            <p className="mt-2 text-xs text-unal-secondary-light sm:text-sm">
              Guárdalo. Si la solicitud es aprobada, este código identifica tu
              compra y la entrega se registra automáticamente.
            </p>
          </div>

          <dl className="mb-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-unal-secondary-light">Código de caja</dt>
              <dd className="font-medium text-unal-secondary">
                {result.cash_receipt_code}
              </dd>
            </div>
            <div>
              <dt className="text-unal-secondary-light">Fecha de compra</dt>
              <dd className="font-medium text-unal-secondary">
                {formatDateOnly(result.purchase_date)}
              </dd>
            </div>
            <div>
              <dt className="text-unal-secondary-light">Total calculado</dt>
              <dd className="font-medium text-unal-secondary">
                {formatCurrency(result.computed_total)}
              </dd>
            </div>
            <div>
              <dt className="text-unal-secondary-light">Valor declarado</dt>
              <dd className="font-medium text-unal-secondary">
                {formatCurrency(result.declared_total)}
              </dd>
            </div>
          </dl>

          {Array.isArray(result.items) && result.items.length > 0 && (
            <div className="mb-6 rounded-xl bg-gray-50 p-4">
              <h2 className="mb-2 text-sm font-semibold text-unal-secondary">
                Productos solicitados
              </h2>
              <ul className="space-y-2 text-sm text-unal-secondary-light">
                {result.items.map((item) => (
                  <li
                    key={`${item.product_id}-${item.product_name}`}
                    className="flex justify-between gap-3"
                  >
                    <span>
                      {item.quantity} × {item.product_name}
                    </span>
                    <span className="font-medium text-unal-secondary">
                      {formatCurrency(item.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setResult(null);
                changeTab('consulta');
              }}
              className="btn-primary inline-flex flex-1 items-center justify-center gap-2"
            >
              <Search className="h-4 w-4" />
              Consultar estado
            </button>
            <button
              type="button"
              onClick={startNewClaim}
              className="btn-secondary inline-flex flex-1 items-center justify-center"
            >
              Registrar otra solicitud
            </button>
          </div>

          <Link
            to="/formulario-compra"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 text-sm text-unal-secondary hover:text-unal-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al formulario de compra
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-unal-background px-4 py-12">
      <div className="mx-auto w-full max-w-4xl">
        <div className="card p-6 sm:p-8">
          <div className="mb-8 text-center">
            <Link
              to="/formulario-compra"
              className="mb-6 inline-flex items-center gap-2 text-unal-secondary hover:text-unal-primary"
            >
              <ArrowLeft className="h-5 w-5" />
              Volver al formulario de compra
            </Link>
            <div className="mx-auto mb-4 w-fit">
              <LogoShield className="h-14 w-14" />
            </div>
            <h1 className="text-2xl font-bold text-unal-secondary">
              Compra en efectivo en caja
            </h1>
            <p className="mt-2 text-unal-secondary-light">
              Registra tu recibo de caja, los productos que pagaste y tus datos.
              Un administrador validará la compra antes de descontar inventario.
            </p>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => changeTab('nueva')}
              className={`rounded-lg border-2 p-4 text-left transition-colors ${
                tab === 'nueva'
                  ? 'border-unal-primary bg-unal-primary/5'
                  : 'border-gray-200 hover:border-unal-primary/50'
              }`}
              aria-pressed={tab === 'nueva'}
            >
              <span className="flex items-center gap-2 font-medium text-unal-secondary">
                <Banknote className="h-5 w-5 text-unal-primary" />
                Nueva solicitud
              </span>
              <span className="mt-1 block text-sm text-unal-secondary-light">
                Ya pagaste en caja y tienes el recibo físico.
              </span>
            </button>
            <button
              type="button"
              onClick={() => changeTab('consulta')}
              className={`rounded-lg border-2 p-4 text-left transition-colors ${
                tab === 'consulta'
                  ? 'border-unal-primary bg-unal-primary/5'
                  : 'border-gray-200 hover:border-unal-primary/50'
              }`}
              aria-pressed={tab === 'consulta'}
            >
              <span className="flex items-center gap-2 font-medium text-unal-secondary">
                <Search className="h-5 w-5 text-unal-primary" />
                Consultar estado
              </span>
              <span className="mt-1 block text-sm text-unal-secondary-light">
                Revisa si tu solicitud fue aprobada o rechazada.
              </span>
            </button>
          </div>

          {tab === 'consulta' ? (
            <div className="space-y-6">
              <form onSubmit={handleLookup} className="space-y-4" noValidate>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Código de solicitud"
                    id="lookup_code"
                    type="text"
                    value={lookup.code}
                    onChange={(event) =>
                      setLookup((prev) => ({ ...prev, code: event.target.value }))
                    }
                    placeholder="CE-XXXXXX"
                    autoComplete="off"
                    className="font-mono uppercase"
                  />
                  <Input
                    label="Número de documento"
                    id="lookup_document"
                    type="text"
                    value={lookup.document}
                    onChange={(event) =>
                      setLookup((prev) => ({ ...prev, document: event.target.value }))
                    }
                    placeholder="Documento del comprador"
                    autoComplete="off"
                  />
                </div>
                {lookupError && (
                  <p className="text-sm text-red-500" role="alert">
                    {lookupError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={lookupLoading}
                  className="btn-primary inline-flex w-full items-center justify-center gap-2 py-3 disabled:opacity-50 sm:w-auto"
                >
                  <Search className="h-4 w-4" />
                  {lookupLoading ? 'Consultando...' : 'Consultar solicitud'}
                </button>
              </form>

              {lookupResult && (
                <div className="rounded-xl border border-gray-200 p-4 sm:p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-mono text-xl font-bold text-unal-primary">
                        {lookupResult.claim_code}
                      </p>
                      <p className="text-sm text-unal-secondary-light">
                        Código de caja: {lookupResult.cash_receipt_code}
                      </p>
                    </div>
                    <StatusBadge status={lookupResult.status} />
                  </div>

                  <p className="mt-3 text-sm text-unal-secondary-light">
                    {(STATUS_META[lookupResult.status] || STATUS_META.pendiente).description}
                  </p>

                  {lookupResult.status === 'rechazada' &&
                    lookupResult.rejection_reason && (
                      <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                        <p className="font-medium">Motivo del rechazo</p>
                        <p>{lookupResult.rejection_reason}</p>
                      </div>
                    )}

                  {lookupResult.status === 'aprobada' && lookupResult.sale && (
                    <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-center">
                      <p className="text-sm font-medium text-green-800">
                        Código de la compra
                      </p>
                      <p className="font-mono text-2xl font-bold tracking-widest text-green-900">
                        {lookupResult.sale.pickup_code}
                      </p>
                      <p className="mt-1 text-sm text-green-800">
                        Factura {lookupResult.sale.invoice_number} ·{' '}
                        {lookupResult.sale.pickup_status === 'entregado'
                          ? 'Entrega registrada'
                          : 'Pendiente de entrega'}
                      </p>
                    </div>
                  )}

                  <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-unal-secondary-light">Fecha de compra</dt>
                      <dd className="font-medium text-unal-secondary">
                        {formatDateOnly(lookupResult.purchase_date)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-unal-secondary-light">Solicitud creada</dt>
                      <dd className="font-medium text-unal-secondary">
                        {formatDateTime(lookupResult.created_at)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-unal-secondary-light">Total calculado</dt>
                      <dd className="font-medium text-unal-secondary">
                        {formatCurrency(lookupResult.computed_total)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-unal-secondary-light">Valor declarado</dt>
                      <dd className="font-medium text-unal-secondary">
                        {formatCurrency(lookupResult.declared_total)}
                      </dd>
                    </div>
                  </dl>

                  {Array.isArray(lookupResult.items) &&
                    lookupResult.items.length > 0 && (
                      <div className="mt-4 rounded-lg bg-gray-50 p-3">
                        <h3 className="mb-2 text-sm font-semibold text-unal-secondary">
                          Productos
                        </h3>
                        <ul className="space-y-1 text-sm text-unal-secondary-light">
                          {lookupResult.items.map((item, index) => (
                            <li key={`${item.product_name}-${index}`}>
                              {item.quantity} × {item.product_name} —{' '}
                              {formatCurrency(item.total)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              <div className="rounded-xl border border-unal-primary/20 bg-unal-primary/5 p-4 text-sm text-unal-secondary-light">
                <p className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-unal-primary" />
                  La solicitud no reserva inventario. El stock se descuenta
                  únicamente cuando un administrador aprueba el recibo. Si el
                  producto se agota antes, la aprobación se bloquea.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-unal-secondary">
                  Datos del recibo y del comprador
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Código de caja"
                    id="cash_receipt_code"
                    type="text"
                    value={form.cash_receipt_code}
                    onChange={(event) =>
                      updateField('cash_receipt_code', event.target.value)
                    }
                    error={errors.cash_receipt_code}
                    placeholder="Código que aparece en el recibo"
                    autoComplete="off"
                    required
                  />
                  <Input
                    label="Fecha de compra"
                    id="purchase_date"
                    type="date"
                    max={todayISO()}
                    value={form.purchase_date}
                    onChange={(event) => updateField('purchase_date', event.target.value)}
                    error={errors.purchase_date}
                    required
                  />
                  <Select
                    label="Tipo de documento"
                    id="document_type"
                    value={form.document_type}
                    onChange={(event) => updateField('document_type', event.target.value)}
                    options={DOCUMENT_TYPES}
                    placeholder="Seleccionar..."
                  />
                  <Input
                    label="Número de documento"
                    id="document_number"
                    type="text"
                    value={form.document_number}
                    onChange={(event) =>
                      updateField('document_number', event.target.value)
                    }
                    error={errors.document_number}
                    autoComplete="off"
                    required
                  />
                  <Input
                    label="Nombre completo"
                    id="full_name"
                    type="text"
                    value={form.full_name}
                    onChange={(event) => updateField('full_name', event.target.value)}
                    error={errors.full_name}
                    autoComplete="name"
                    required
                  />
                  <Input
                    label="Teléfono"
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(event) => updateField('phone', event.target.value)}
                    autoComplete="tel"
                    placeholder="Opcional"
                  />
                  <Input
                    label="Correo electrónico"
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField('email', event.target.value)}
                    autoComplete="email"
                    placeholder="Opcional"
                  />
                  <Input
                    label="Valor pagado según el recibo"
                    id="declared_total"
                    type="number"
                    min="0"
                    step="1"
                    value={declaredTouched ? form.declared_total : computedTotal || ''}
                    onChange={(event) => {
                      setDeclaredTouched(true);
                      updateField('declared_total', event.target.value);
                    }}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200">
                <div className="flex items-center justify-between gap-3 bg-gray-50 px-4 py-3">
                  <h2 className="flex items-center gap-2 font-semibold text-unal-secondary">
                    <Package className="h-5 w-5 text-unal-primary" />
                    Productos comprados
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
                  <p className="mb-3 text-xs text-unal-secondary-light">
                    Selecciona los productos y cantidades que aparecen en tu
                    recibo. Los precios se toman del catálogo vigente.
                  </p>

                  {loadingProducts ? (
                    <div className="flex justify-center py-6">
                      <div className="h-7 w-7 animate-spin rounded-full border-4 border-unal-primary border-t-transparent" />
                    </div>
                  ) : productsError ? (
                    <p className="text-sm text-unal-secondary-light">{productsError}</p>
                  ) : products.length === 0 ? (
                    <p className="text-sm text-unal-secondary-light">
                      No hay productos disponibles en este momento.
                    </p>
                  ) : (
                    <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                      {products.map((product) => {
                        const quantity = Number(quantities[product.id]) || 0;
                        return (
                          <li
                            key={product.id}
                            className="flex flex-col gap-3 rounded-lg border border-gray-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-unal-secondary">
                                {product.name}
                              </p>
                              <p className="text-xs text-unal-secondary-light">
                                {formatCurrency(product.current_price)} /{' '}
                                {product.unit} · Stock {product.current_stock}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <label
                                htmlFor={`quantity-${product.id}`}
                                className="text-xs text-unal-secondary-light"
                              >
                                Cantidad
                              </label>
                              <input
                                id={`quantity-${product.id}`}
                                type="number"
                                min="0"
                                max={product.current_stock}
                                step="1"
                                value={quantities[product.id] ?? ''}
                                onChange={(event) =>
                                  setQuantity(
                                    product.id,
                                    event.target.value,
                                    Number(product.current_stock),
                                  )
                                }
                                className="input-field w-24 text-center"
                              />
                              <span className="min-w-[5.5rem] text-right text-sm font-medium text-unal-secondary">
                                {formatCurrency(
                                  Number(product.current_price) * quantity,
                                )}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {errors.items && (
                    <p className="mt-3 text-sm text-red-500" role="alert">
                      {errors.items}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-unal-secondary-light">
                    Total calculado con precios del catálogo
                  </span>
                  <span className="text-lg font-bold text-unal-primary">
                    {formatCurrency(computedTotal)}
                  </span>
                </div>
                {declaredTouched && Math.abs(difference) > 0.5 && (
                  <p className="mt-2 flex items-start gap-2 text-sm text-amber-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    El valor declarado difiere del total calculado en{' '}
                    {formatCurrency(Math.abs(difference))}. El administrador
                    revisará esa diferencia al validar el recibo.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <FileInput
                  label="Recibo de caja (foto o PDF)"
                  id="receipt_file"
                  name="receipt_file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleReceiptChange}
                  error={errors.receipt_file}
                  required
                />
                {receiptFile && (
                  <p className="flex items-center gap-2 text-sm text-unal-secondary-light">
                    <FileText className="h-4 w-4 text-unal-primary" />
                    {receiptFile.name} · {(receiptFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </div>

              <Textarea
                label="Observaciones (opcional)"
                id="notes"
                value={form.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Cualquier detalle que ayude a validar tu compra"
              />

              <FormError message={errors.general} />

              <div>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    id="accepts_policy"
                    type="checkbox"
                    checked={form.accepts_policy}
                    onChange={(event) =>
                      updateField('accepts_policy', event.target.checked)
                    }
                    className="mt-1 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-unal-primary focus:ring-2 focus:ring-unal-primary"
                    aria-describedby={
                      errors.accepts_policy ? 'accepts_policy-error' : undefined
                    }
                  />
                  <span className="text-sm text-unal-secondary">
                    Autorizo el tratamiento de mis datos personales conforme a la{' '}
                    <Link
                      to="/privacidad"
                      className="font-medium text-unal-primary hover:underline"
                    >
                      Política de Privacidad
                    </Link>{' '}
                    y acepto los{' '}
                    <Link
                      to="/terminos"
                      className="font-medium text-unal-primary hover:underline"
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
                className="btn-primary w-full py-3 text-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Enviando solicitud...' : 'Enviar solicitud de validación'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
