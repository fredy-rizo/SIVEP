import { useState, useEffect } from 'react';
import { Search, Filter, Eye, Plus, CheckCircle, ReceiptText, KeyRound } from 'lucide-react';
import api from '../utils/api';
import { formatCOP, formatDate } from '../utils/formatters';
import { ProofViewer } from '../components/ProofViewer';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import toast from '../utils/toast';

export function SalesPage() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ start_date: '', end_date: '', payment_status: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [validateOpen, setValidateOpen] = useState(false);
  const [pickupCode, setPickupCode] = useState('');
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState(null);
  const [validationError, setValidationError] = useState('');
  const [selectedSale, setSelectedSale] = useState(null);
  const [saleItems, setSaleItems] = useState([]);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      });
      const response = await api.get(`/sales?${params}`);
      setSales(response.data.data);
      setPagination(prev => ({
        ...prev,
        total: response.data.pagination.total,
        totalPages: response.data.pagination.totalPages
      }));
    } catch (error) {
      toast.error('Error', 'No se pudieron cargar las ventas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [pagination.page, filters]);

  const handleView = async (sale) => {
    try {
      const response = await api.get(`/sales/${sale.id}`);
      setSelectedSale(response.data.sale);
      setSaleItems(response.data.items);
      setModalOpen(true);
    } catch (error) {
      toast.error('Error', 'No se pudo cargar el detalle');
    }
  };

  const handleViewProof = (sale) => {
    setSelectedSale(sale);
    setProofModalOpen(true);
  };

  const openValidate = () => {
    setPickupCode('');
    setValidation(null);
    setValidationError('');
    setValidateOpen(true);
  };

  const handleValidateCode = async (e) => {
    e?.preventDefault();
    if (!pickupCode.trim()) {
      setValidationError('Ingrese el código de reclamo');
      return;
    }
    setValidating(true);
    setValidationError('');
    setValidation(null);
    try {
      const response = await api.post('/sales/validate-pickup', { code: pickupCode });
      setValidation(response.data);
    } catch (error) {
      setValidationError(error.response?.data?.error || 'No se pudo validar el código');
    } finally {
      setValidating(false);
    }
  };

  const handleMarkDelivered = async () => {
    if (!validation?.sale) return;
    try {
      await api.patch(`/sales/${validation.sale.id}/pickup`);
      toast.success('Entrega registrada', 'Los códigos coinciden. Venta marcada como entregada.');
      setValidation(prev => prev && ({
        ...prev,
        sale: { ...prev.sale, pickup_status: 'entregado' }
      }));
      fetchSales();
    } catch (error) {
      toast.error('Error', error.response?.data?.error || 'No se pudo registrar la entrega');
    }
  };

  const handleConfirmPayment = async (sale) => {
    const id = sale.id || selectedSale?.id;
    if (!id) return;
    if (!window.confirm(`¿Confirmar el pago de la factura ${sale.invoice_number || selectedSale?.invoice_number}?`)) return;
    try {
      const response = await api.patch(`/sales/${id}/payment`, { payment_status: 'pagado' });
      toast.success('Pago confirmado', response.data.message);
      setSelectedSale(response.data.sale);
      fetchSales();
    } catch (error) {
      toast.error('Error', error.response?.data?.error || 'No se pudo confirmar el pago');
    }
  };

  const columns = [
    { key: 'invoice_number', label: 'Factura', sortable: true },
    { key: 'customer_name', label: 'Cliente', sortable: true },
    { key: 'sale_date', label: 'Fecha', render: (v) => formatDate(v), sortable: true },
    { key: 'subtotal', label: 'Subtotal', render: (v) => formatCOP(v), sortable: true },
    { key: 'tax', label: 'IVA', render: (v) => formatCOP(v) },
    { key: 'total', label: 'Total', render: (v) => formatCOP(v), sortable: true },
    { key: 'payment_type', label: 'Tipo Pago', render: (v) => v === 'contado' ? 'Contado' : 'Crédito' },
    { key: 'payment_status', label: 'Estado', render: (v, row) => (
      <div className="flex flex-col gap-1">
        <span className={`badge ${v === 'pagado' ? 'badge-success' : 'badge-warning'}`}>
          {v === 'pagado' ? 'Pagado' : 'Pendiente'}
        </span>
        <span className={`badge ${row.pickup_status === 'entregado' ? 'badge-success' : 'badge-gray'}`}>
          {row.pickup_status === 'entregado' ? 'Entregado' : 'Por recoger'}
        </span>
      </div>
    )},
    { key: 'pickup_code', label: 'Código', render: (v) => (
      v ? <span className="font-mono font-semibold text-unal-primary">{v}</span> : <span className="text-unal-secondary-light">—</span>
    )}
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-unal-secondary">Ventas</h1>
          <p className="text-unal-secondary-light">Historial de ventas registradas</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-accent" onClick={openValidate}>
            <KeyRound className="w-4 h-4 mr-2" /> Validar entrega
          </button>
          <button className="btn-secondary" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4 mr-2" /> Filtros
          </button>
          <a href="/ventas/nueva" className="btn-primary">
            <Plus className="w-4 h-4 mr-2" /> Nueva venta
          </a>
        </div>
      </div>

      {showFilters && (
        <div className="card p-4 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="label-field">Fecha inicio</label>
              <input
                type="date"
                className="input-field"
                value={filters.start_date}
                onChange={(e) => { setFilters(prev => ({ ...prev, start_date: e.target.value })); setPagination(prev => ({ ...prev, page: 1 })); }}
              />
            </div>
            <div>
              <label className="label-field">Fecha fin</label>
              <input
                type="date"
                className="input-field"
                value={filters.end_date}
                onChange={(e) => { setFilters(prev => ({ ...prev, end_date: e.target.value })); setPagination(prev => ({ ...prev, page: 1 })); }}
              />
            </div>
            <div>
              <label className="label-field">Estado pago</label>
              <select
                className="input-field"
                value={filters.payment_status}
                onChange={(e) => { setFilters(prev => ({ ...prev, payment_status: e.target.value })); setPagination(prev => ({ ...prev, page: 1 })); }}
              >
                <option value="">Todos</option>
                <option value="pagado">Pagado</option>
                <option value="pendiente">Pendiente</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => { setFilters({ start_date: '', end_date: '', payment_status: '' }); setPagination(prev => ({ ...prev, page: 1 })); }}
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
        data={sales}
        keyField="id"
        loading={loading}
        pagination={true}
        pageSize={pagination.limit}
        onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
        totalPages={pagination.totalPages}
        currentPage={pagination.page}
        emptyMessage="No se encontraron ventas"
        renderActions={(row) => (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => handleView(row)}
              className="p-2 text-unal-primary hover:bg-unal-primary/10 rounded-lg transition-colors"
              title="Ver factura"
            >
              <Eye className="w-4 h-4" />
            </button>
            {row.payment_status === 'pendiente' && (
              <button
                onClick={() => handleConfirmPayment(row)}
                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                title="Confirmar pago"
              >
                <CheckCircle className="w-4 h-4" />
              </button>
            )}
            {row.customer_proof_url && (
              <button
                onClick={() => handleViewProof(row)}
                className="p-2 text-unal-accent hover:bg-unal-accent/10 rounded-lg transition-colors"
                title="Ver comprobante de pago"
              >
                <ReceiptText className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      />

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedSale(null); setSaleItems([]); }}
        title={`Factura ${selectedSale?.invoice_number}`}
        size="xl"
      >
        {selectedSale && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold text-unal-secondary mb-3">Información de la venta</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-unal-secondary-light">Factura:</dt><dd className="font-medium">{selectedSale.invoice_number}</dd></div>
                  <div className="flex justify-between"><dt className="text-unal-secondary-light">Fecha:</dt><dd className="font-medium">{formatDate(selectedSale.sale_date)}</dd></div>
                  <div className="flex justify-between"><dt className="text-unal-secondary-light">Cliente:</dt><dd className="font-medium">{selectedSale.customer_name}</dd></div>
                  <div className="flex justify-between"><dt className="text-unal-secondary-light">Documento:</dt><dd className="font-medium">{selectedSale.customer_document}</dd></div>
                  <div className="flex justify-between"><dt className="text-unal-secondary-light">Tipo pago:</dt><dd className="font-medium capitalize">{selectedSale.payment_type}</dd></div>
                  <div className="flex justify-between"><dt className="text-unal-secondary-light">Estado:</dt><dd className="font-medium">
                    <span className={`badge ${selectedSale.payment_status === 'pagado' ? 'badge-success' : 'badge-warning'}`}>
                      {selectedSale.payment_status === 'pagado' ? 'Pagado' : 'Pendiente'}
                    </span>
                  </dd></div>
                  <div className="flex justify-between"><dt className="text-unal-secondary-light">Código reclamo:</dt><dd className="font-mono font-semibold text-unal-primary">{selectedSale.pickup_code || '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-unal-secondary-light">Entrega:</dt><dd className="font-medium">
                    <span className={`badge ${selectedSale.pickup_status === 'entregado' ? 'badge-success' : 'badge-gray'}`}>
                      {selectedSale.pickup_status === 'entregado' ? 'Entregado' : 'Por recoger'}
                    </span>
                  </dd></div>
                  <div className="flex justify-between"><dt className="text-unal-secondary-light">Vendedor:</dt><dd className="font-medium">{selectedSale.created_by_name}</dd></div>
                  {selectedSale.notes && <div className="flex justify-between"><dt className="text-unal-secondary-light">Notas:</dt><dd className="font-medium">{selectedSale.notes}</dd></div>}
                </dl>
              </div>
              <div>
                <h4 className="font-semibold text-unal-secondary mb-3">Totales</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-unal-secondary-light">Subtotal:</dt><dd className="font-medium">{formatCOP(selectedSale.subtotal)}</dd></div>
                  <div className="flex justify-between"><dt className="text-unal-secondary-light">IVA:</dt><dd className="font-medium">{formatCOP(selectedSale.tax)}</dd></div>
                  <div className="flex justify-between border-t border-gray-200 pt-2"><dt className="text-unal-secondary-light">Total:</dt><dd className="font-medium text-xl text-unal-primary">{formatCOP(selectedSale.total)}</dd></div>
                </dl>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-unal-secondary mb-3">Productos</h4>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="text-center">Cantidad</th>
                      <th className="text-right">Precio unit.</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saleItems.map(item => (
                      <tr key={item.id}>
                        <td>{item.product_name} <span className="text-xs text-unal-secondary-light">({item.product_unit})</span></td>
                        <td className="text-center">{item.quantity}</td>
                        <td className="text-right">{formatCOP(item.unit_price)}</td>
                        <td className="text-right font-medium">{formatCOP(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={() => { setModalOpen(false); setSelectedSale(null); setSaleItems([]); }}
                className="btn-secondary"
              >
                Cerrar
              </button>
              {selectedSale.payment_status === 'pendiente' && (
                <button
                  onClick={() => handleConfirmPayment(selectedSale)}
                  className="btn-accent inline-flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Confirmar pago
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={proofModalOpen}
        onClose={() => { setProofModalOpen(false); setSelectedSale(null); }}
        title={`Comprobante de pago - ${selectedSale?.invoice_number || ''}`}
        size="lg"
      >
        {selectedSale?.customer_proof_url ? (
          <ProofViewer
            url={selectedSale.customer_proof_url}
            customerName={selectedSale.customer_name}
            customerDocument={selectedSale.customer_document}
          />
        ) : (
          <p className="text-center text-unal-secondary-light py-8">
            Esta venta no tiene comprobante de pago adjunto.
          </p>
        )}
      </Modal>

      <Modal
        isOpen={validateOpen}
        onClose={() => { setValidateOpen(false); setValidation(null); setValidationError(''); setPickupCode(''); }}
        title="Validar entrega por código"
        size="md"
      >
        <form onSubmit={handleValidateCode} className="space-y-4">
          <div>
            <label className="label-field" htmlFor="pickup_code_input">
              Código de reclamo del comprador
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="pickup_code_input"
                type="text"
                className="input-field font-mono uppercase"
                placeholder="RC-XXXXXX"
                value={pickupCode}
                onChange={(e) => setPickupCode(e.target.value.toUpperCase())}
                autoComplete="off"
              />
              <button type="submit" disabled={validating} className="btn-primary whitespace-nowrap">
                {validating ? 'Validando...' : 'Validar'}
              </button>
            </div>
          </div>
          {validationError && (
            <p className="text-sm text-red-500" role="alert">{validationError}</p>
          )}
        </form>

        {validation?.sale && (
          <div className="mt-4 p-4 rounded-lg border-2 border-green-500 bg-green-50 dark:bg-green-950 dark:border-green-700 space-y-2 text-sm">
            <p className="font-semibold text-green-800 dark:text-green-200 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" /> ¡Código válido! Coincide con esta compra:
            </p>
            <dl className="space-y-1 text-unal-secondary">
              <div className="flex justify-between"><dt className="text-unal-secondary-light">Factura:</dt><dd className="font-medium">{validation.sale.invoice_number}</dd></div>
              <div className="flex justify-between"><dt className="text-unal-secondary-light">Cliente:</dt><dd className="font-medium">{validation.sale.customer_name}</dd></div>
              <div className="flex justify-between"><dt className="text-unal-secondary-light">Documento:</dt><dd className="font-medium">{validation.sale.customer_document}</dd></div>
              <div className="flex justify-between"><dt className="text-unal-secondary-light">Total:</dt><dd className="font-medium">{formatCOP(validation.sale.total)}</dd></div>
              <div className="flex justify-between"><dt className="text-unal-secondary-light">Pago:</dt><dd className="font-medium">{validation.sale.payment_status === 'pagado' ? 'Pagado' : 'Pendiente'}</dd></div>
              <div className="flex justify-between"><dt className="text-unal-secondary-light">Entrega:</dt><dd className="font-medium">{validation.sale.pickup_status === 'entregado' ? 'Entregado' : 'Por recoger'}</dd></div>
            </dl>
            <div className="pt-2">
              <p className="text-xs text-unal-secondary-light mb-2">Productos ({validation.items?.length || 0}):</p>
              <ul className="text-xs text-unal-secondary space-y-1">
                {(validation.items || []).map(item => (
                  <li key={item.id}>• {item.product_name} — {item.quantity} {item.product_unit}(s)</li>
                ))}
              </ul>
            </div>
            {validation.sale.pickup_status === 'pendiente' ? (
              <button onClick={handleMarkDelivered} className="btn-accent w-full mt-2">
                Marcar como entregado
              </button>
            ) : (
              <p className="text-sm font-medium text-green-800 dark:text-green-200">Esta compra ya fue entregada.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}