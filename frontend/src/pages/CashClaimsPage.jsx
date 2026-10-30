import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  Filter,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import api from '../utils/api';
import { formatCOP, formatDate, formatDateTime } from '../utils/formatters';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { ProofViewer } from '../components/ProofViewer';
import toast from '../utils/toast';

const STATUS_META = {
  pendiente: { label: 'Pendiente', className: 'badge-warning' },
  aprobada: { label: 'Aprobada', className: 'badge-success' },
  rechazada: { label: 'Rechazada', className: 'badge-danger' },
};

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'aprobada', label: 'Aprobadas' },
  { value: 'rechazada', label: 'Rechazadas' },
];

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pendiente;
  return <span className={`badge ${meta.className}`}>{meta.label}</span>;
}

// ============================================================================
// VALIDACIÓN DE COMPRAS EN EFECTIVO — panel administrativo
// ----------------------------------------------------------------------------
// El administrador compara la solicitud con el recibo físico. Aprobar descuenta
// stock de forma atómica; si no alcanza, el backend revierte todo y aquí se
// muestra el producto y las existencias para que pueda ajustar o rechazar.
// ============================================================================
export function CashClaimsPage() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState({
    status: 'pendiente',
    search: '',
    start_date: '',
    end_date: '',
  });
  const [searchInput, setSearchInput] = useState('');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  const [approveOpen, setApproveOpen] = useState(false);
  const [approveError, setApproveError] = useState('');
  const [approving, setApproving] = useState(false);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const loadClaims = async () => {
    setLoading(true);
    try {
      const response = await api.get('/cash-claims', {
        params: {
          page,
          limit: pagination.limit,
          status: filters.status || undefined,
          search: filters.search || undefined,
          start_date: filters.start_date || undefined,
          end_date: filters.end_date || undefined,
        },
      });
      setClaims(response.data.data || []);
      setPagination(response.data.pagination);
    } catch (error) {
      toast.error(
        'No pudimos cargar las solicitudes',
        error.response?.data?.error || 'Intenta de nuevo',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClaims();
  }, [page, filters.status, filters.search, filters.start_date, filters.end_date]);

  const applySearch = (event) => {
    event.preventDefault();
    setPage(1);
    setFilters((prev) => ({ ...prev, search: searchInput.trim() }));
  };

  const clearFilters = () => {
    setSearchInput('');
    setPage(1);
    setFilters({ status: 'pendiente', search: '', start_date: '', end_date: '' });
  };

  const openDetail = async (claimId) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const response = await api.get(`/cash-claims/${claimId}`);
      setDetail(response.data);
    } catch (error) {
      toast.error(
        'No pudimos abrir la solicitud',
        error.response?.data?.error || 'Intenta de nuevo',
      );
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetail(null);
  };

  const openApprove = () => {
    setApproveError('');
    setApproveOpen(true);
  };

  const handleApprove = async () => {
    if (!detail?.claim) return;
    setApproving(true);
    setApproveError('');
    try {
      const response = await api.post(
        `/cash-claims/${detail.claim.id}/approve`,
      );
      toast.success(
        'Solicitud aprobada',
        `Código de reclamo: ${response.data.sale.pickup_code}`,
      );
      setApproveOpen(false);
      closeDetail();
      loadClaims();
    } catch (error) {
      const data = error.response?.data;
      let message = data?.error || 'No pudimos aprobar la solicitud';
      if (data?.code === 'INSUFFICIENT_STOCK') {
        message += ` Producto: ${data.product_name}. Disponible: ${data.available}, solicitado: ${data.requested}. Ajusta el inventario o rechaza la solicitud.`;
      }
      setApproveError(message);
      toast.error('No se aprobó la solicitud', message);
    } finally {
      setApproving(false);
    }
  };

  const openReject = () => {
    setRejectReason('');
    setRejectError('');
    setRejectOpen(true);
  };

  const handleReject = async () => {
    if (!detail?.claim) return;
    if (rejectReason.trim().length < 3) {
      setRejectError('Escribe el motivo del rechazo');
      return;
    }

    setRejecting(true);
    setRejectError('');
    try {
      await api.post(`/cash-claims/${detail.claim.id}/reject`, {
        reason: rejectReason.trim(),
      });
      toast.success('Solicitud rechazada', 'El comprador podrá ver el motivo.');
      setRejectOpen(false);
      closeDetail();
      loadClaims();
    } catch (error) {
      setRejectError(
        error.response?.data?.error || 'No pudimos rechazar la solicitud',
      );
    } finally {
      setRejecting(false);
    }
  };

  const columns = [
    {
      key: 'claim_code',
      label: 'Solicitud',
      render: (value) => (
        <span className="font-mono font-semibold text-unal-primary">{value}</span>
      ),
    },
    { key: 'cash_receipt_code', label: 'Código caja' },
    {
      key: 'full_name',
      label: 'Comprador',
      render: (value, row) => (
        <div>
          <p className="font-medium text-unal-secondary">{value}</p>
          <p className="text-xs text-unal-secondary-light">
            {row.document_type} {row.document_number}
          </p>
        </div>
      ),
    },
    {
      key: 'purchase_date',
      label: 'Fecha compra',
      render: (value) => formatDate(value),
    },
    {
      key: 'computed_total',
      label: 'Total',
      render: (value, row) => (
        <div>
          <p className="font-medium text-unal-secondary">{formatCOP(value)}</p>
          {Number(row.declared_total) !== Number(row.computed_total) && (
            <p className="text-xs text-amber-700">
              Declaró {formatCOP(row.declared_total)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'items_count',
      label: 'Productos',
      render: (value, row) => (
        <span className="text-unal-secondary">
          {value} línea{Number(value) === 1 ? '' : 's'} · {row.total_units} und.
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Estado',
      render: (value) => <StatusBadge status={value} />,
    },
    {
      key: 'created_at',
      label: 'Recibida',
      render: (value) => (
        <span className="text-xs text-unal-secondary-light">
          {formatDateTime(value)}
        </span>
      ),
    },
  ];

  const hasStockWarning =
    detail?.items?.some(
      (item) => Number(item.quantity) > Number(item.current_stock ?? 0),
    ) || false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-unal-secondary">
            Compras en efectivo
          </h1>
          <p className="text-unal-secondary-light">
            Valida el recibo de caja antes de descontar inventario y habilitar la
            entrega.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowFilters((prev) => !prev)}
          >
            <Filter className="mr-2 h-4 w-4" />
            Filtros
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={loadClaims}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="card animate-fade-in p-4">
          <form onSubmit={applySearch} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <label className="label-field" htmlFor="claim_search">
                Buscar
              </label>
              <div className="flex gap-2">
                <input
                  id="claim_search"
                  type="text"
                  className="input-field"
                  placeholder="Código, recibo, documento o nombre"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
                <button type="submit" className="btn-primary px-3" aria-label="Buscar">
                  <Search className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div>
              <label className="label-field" htmlFor="claim_status">
                Estado
              </label>
              <select
                id="claim_status"
                className="input-field"
                value={filters.status}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({ ...prev, status: event.target.value }));
                }}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field" htmlFor="claim_start">
                Desde
              </label>
              <input
                id="claim_start"
                type="date"
                className="input-field"
                value={filters.start_date}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({ ...prev, start_date: event.target.value }));
                }}
              />
            </div>
            <div>
              <label className="label-field" htmlFor="claim_end">
                Hasta
              </label>
              <input
                id="claim_end"
                type="date"
                className="input-field"
                value={filters.end_date}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({ ...prev, end_date: event.target.value }));
                }}
              />
            </div>
            <div className="flex items-end lg:col-span-5">
              <button type="button" className="btn-outline" onClick={clearFilters}>
                Limpiar filtros
              </button>
            </div>
          </form>
        </div>
      )}

      <DataTable
        columns={columns}
        data={claims}
        keyField="id"
        pagination={false}
        emptyMessage={
          loading ? 'Cargando solicitudes...' : 'No hay solicitudes para mostrar'
        }
        renderActions={(row) => (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => openDetail(row.id)}
              className="rounded-lg p-2 text-unal-primary transition-colors hover:bg-unal-primary/10"
              title="Ver solicitud"
            >
              <Eye className="h-4 w-4" />
            </button>
            {row.status === 'pendiente' && (
              <button
                type="button"
                onClick={() => openDetail(row.id)}
                className="rounded-lg p-2 text-green-600 transition-colors hover:bg-green-50"
                title="Revisar y aprobar"
              >
                <CheckCircle className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      />

      {pagination.totalPages > 1 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-unal-secondary-light">
            Mostrando {claims.length} de {pagination.total} solicitudes
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-outline"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Anterior
            </button>
            <span className="text-sm text-unal-secondary">
              Página {pagination.page} de {pagination.totalPages}
            </span>
            <button
              type="button"
              className="btn-outline"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Detalle de la solicitud */}
      <Modal
        isOpen={detailOpen}
        onClose={closeDetail}
        title={`Solicitud ${detail?.claim?.claim_code || ''}`}
        size="xl"
      >
        {detailLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-unal-primary border-t-transparent" />
          </div>
        ) : detail?.claim ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-unal-secondary-light">
                  Código de caja
                </p>
                <p className="font-mono text-lg font-bold text-unal-secondary">
                  {detail.claim.cash_receipt_code}
                </p>
              </div>
              <StatusBadge status={detail.claim.status} />
            </div>

            {hasStockWarning && detail.claim.status === 'pendiente' && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>
                  Uno o más productos no tienen stock suficiente para esta
                  solicitud. Si apruebas, la operación se revertirá. Ajusta el
                  inventario o rechaza con el motivo.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-3 font-semibold text-unal-secondary">
                  Datos del comprador
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-unal-secondary-light">Nombre</dt>
                    <dd className="text-right font-medium text-unal-secondary">
                      {detail.claim.full_name}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-unal-secondary-light">Documento</dt>
                    <dd className="text-right font-medium text-unal-secondary">
                      {detail.claim.document_type} {detail.claim.document_number}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-unal-secondary-light">Teléfono</dt>
                    <dd className="text-right font-medium text-unal-secondary">
                      {detail.claim.phone || '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-unal-secondary-light">Correo</dt>
                    <dd className="break-all text-right font-medium text-unal-secondary">
                      {detail.claim.email || '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-unal-secondary-light">Fecha de compra</dt>
                    <dd className="text-right font-medium text-unal-secondary">
                      {formatDate(detail.claim.purchase_date)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-unal-secondary-light">Recibida</dt>
                    <dd className="text-right font-medium text-unal-secondary">
                      {formatDateTime(detail.claim.created_at)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="mb-3 font-semibold text-unal-secondary">
                  Totales
                </h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-unal-secondary-light">
                      Total calculado
                    </dt>
                    <dd className="font-medium text-unal-secondary">
                      {formatCOP(detail.claim.computed_total)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-unal-secondary-light">Valor declarado</dt>
                    <dd className="font-medium text-unal-secondary">
                      {formatCOP(detail.claim.declared_total)}
                    </dd>
                  </div>
                  {Number(detail.claim.declared_total) !==
                    Number(detail.claim.computed_total) && (
                    <div className="flex justify-between gap-3 rounded-lg bg-amber-50 p-2">
                      <dt className="text-amber-800">Diferencia</dt>
                      <dd className="font-bold text-amber-800">
                        {formatCOP(
                          Number(detail.claim.declared_total) -
                            Number(detail.claim.computed_total),
                        )}
                      </dd>
                    </div>
                  )}
                </dl>

                {detail.claim.notes && (
                  <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-unal-secondary">
                    <p className="mb-1 font-medium">Observaciones del comprador</p>
                    <p className="text-unal-secondary-light">{detail.claim.notes}</p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-3 font-semibold text-unal-secondary">
                Productos solicitados
              </h3>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="text-center">Cantidad</th>
                      <th className="text-center">Stock actual</th>
                      <th className="text-right">Precio unit.</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item) => {
                      const insufficient =
                        Number(item.quantity) > Number(item.current_stock ?? 0);
                      return (
                        <tr key={item.id}>
                          <td>
                            {item.product_name}
                            {item.product_unit && (
                              <span className="text-xs text-unal-secondary-light">
                                {' '}
                                ({item.product_unit})
                              </span>
                            )}
                          </td>
                          <td className="text-center">{item.quantity}</td>
                          <td className="text-center">
                            <span
                              className={`font-semibold ${
                                insufficient ? 'text-red-600' : 'text-unal-secondary'
                              }`}
                            >
                              {item.current_stock ?? 0}
                            </span>
                          </td>
                          <td className="text-right">
                            {formatCOP(item.unit_price)}
                          </td>
                          <td className="text-right font-medium">
                            {formatCOP(item.total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="mb-3 font-semibold text-unal-secondary">
                Recibo de caja
              </h3>
              <ProofViewer
                url={detail.claim.receipt_url}
                customerName={detail.claim.full_name}
                customerDocument={detail.claim.document_number}
              />
            </div>

            {detail.claim.status === 'rechazada' &&
              detail.claim.rejection_reason && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                  <p className="font-medium">Motivo del rechazo</p>
                  <p>{detail.claim.rejection_reason}</p>
                </div>
              )}

            {detail.claim.status === 'aprobada' && (
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
                <p className="font-medium">
                  Aprobada por {detail.claim.reviewed_by_name || 'un administrador'}{' '}
                  el {formatDateTime(detail.claim.reviewed_at)}
                </p>
                <p>
                  Factura {detail.claim.invoice_number} · Código de reclamo{' '}
                  <span className="font-mono font-bold">
                    {detail.claim.sale_pickup_code}
                  </span>
                </p>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={closeDetail}>
                Cerrar
              </button>
              {detail.claim.status === 'pendiente' && (
                <>
                  <button type="button" className="btn-outline" onClick={openReject}>
                    <XCircle className="mr-2 inline h-4 w-4" />
                    Rechazar
                  </button>
                  <button type="button" className="btn-accent" onClick={openApprove}>
                    <CheckCircle className="mr-2 inline h-4 w-4" />
                    Aprobar y descontar stock
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-unal-secondary-light">
            No se pudo cargar la solicitud.
          </p>
        )}
      </Modal>

      {/* Confirmación de aprobación */}
      <Modal
        isOpen={approveOpen}
        onClose={() => !approving && setApproveOpen(false)}
        title="Aprobar compra en efectivo"
        size="md"
      >
        {detail?.claim && (
          <div className="space-y-4">
            <p className="text-sm text-unal-secondary">
              Vas a aprobar la solicitud{' '}
              <span className="font-mono font-semibold">
                {detail.claim.claim_code}
              </span>
              . Se creará la venta, se descontará el stock y se habilitará el
              código de reclamo. Esta acción no se puede deshacer.
            </p>

            <div className="rounded-xl border border-gray-200 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-unal-secondary-light">Comprador</span>
                <span className="text-right font-medium">{detail.claim.full_name}</span>
              </div>
              <div className="mt-2 flex justify-between gap-3">
                <span className="text-unal-secondary-light">Total a registrar</span>
                <span className="font-bold text-unal-primary">
                  {formatCOP(detail.claim.computed_total)}
                </span>
              </div>
            </div>

            {hasStockWarning && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>
                  Hay stock insuficiente. La aprobación se revertirá y deberás
                  ajustar el inventario o rechazar la solicitud.
                </p>
              </div>
            )}

            {approveError && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
                {approveError}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setApproveOpen(false)}
                disabled={approving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-accent inline-flex items-center justify-center gap-2"
                onClick={handleApprove}
                disabled={approving}
              >
                <CheckCircle className="h-4 w-4" />
                {approving ? 'Aprobando...' : 'Confirmar aprobación'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Rechazo con motivo */}
      <Modal
        isOpen={rejectOpen}
        onClose={() => !rejecting && setRejectOpen(false)}
        title="Rechazar solicitud"
        size="md"
      >
        {detail?.claim && (
          <div className="space-y-4">
            <p className="text-sm text-unal-secondary">
              El comprador verá este motivo al consultar la solicitud{' '}
              <span className="font-mono font-semibold">
                {detail.claim.claim_code}
              </span>
              . No se descuenta inventario.
            </p>
            <div>
              <label className="label-field" htmlFor="reject_reason">
                Motivo del rechazo
              </label>
              <textarea
                id="reject_reason"
                rows={4}
                className="input-field"
                value={rejectReason}
                onChange={(event) => {
                  setRejectReason(event.target.value);
                  setRejectError('');
                }}
                maxLength={1000}
                placeholder="Ej.: el recibo no coincide con los productos o el código ya fue usado."
              />
              {rejectError && (
                <p className="mt-1 text-sm text-red-500" role="alert">
                  {rejectError}
                </p>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setRejectOpen(false)}
                disabled={rejecting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-accent inline-flex items-center justify-center gap-2"
                onClick={handleReject}
                disabled={rejecting}
              >
                <XCircle className="h-4 w-4" />
                {rejecting ? 'Rechazando...' : 'Confirmar rechazo'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
