import { useState, useEffect } from 'react';
import { Filter, User, Mail, Phone, CreditCard, CalendarDays, X } from 'lucide-react';
import api from '../utils/api';
import { formatDate } from '../utils/formatters';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { Input, Select } from '../components/FormComponents';
import toast from '../utils/toast';

export function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ search: '', origin: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      });
      const response = await api.get(`/customers?${params}`);
      setCustomers(response.data.data);
      setPagination(prev => ({
        ...prev,
        total: response.data.pagination.total,
        totalPages: response.data.pagination.totalPages
      }));
    } catch (error) {
      toast.error('Error', 'No se pudieron cargar los clientes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [pagination.page, filters]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const openDetail = (customer) => {
    setSelectedCustomer(customer);
    setDetailOpen(true);
  };

  const columns = [
    { key: 'full_name', label: 'Nombre', sortable: true },
    { key: 'document_type', label: 'Tipo Doc', sortable: true },
    { key: 'document_number', label: 'Núm. Documento', sortable: true },
    { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Correo' },
    { key: 'created_at', label: 'Fecha Registro', render: (v) => formatDate(v), sortable: true }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-unal-secondary">Clientes</h1>
          <p className="text-unal-secondary-light">Haz clic en un cliente para ver su información</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4 mr-2" /> Filtros
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="card p-4 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Buscar"
              placeholder="Nombre, documento, email..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
            />
            <Select
              label="Origen"
              value={filters.origin}
              onChange={(e) => handleFilterChange('origin', e.target.value)}
              options={[
                { value: '', label: 'Todos' },
                { value: 'manual', label: 'Manual' },
                { value: 'formulario_publico', label: 'Formulario público' }
              ]}
            />
            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilters({ search: '', origin: '' });
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
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
        data={customers}
        keyField="id"
        pagination={true}
        pageSize={pagination.limit}
        emptyMessage="No se encontraron clientes"
        onRowClick={(row) => openDetail(row)}
      />

      <Modal
        isOpen={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedCustomer(null); }}
        title="Información del cliente"
        size="md"
      >
        {selectedCustomer && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 pb-4 border-b border-gray-200">
              <div className="w-14 h-14 bg-unal-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-7 h-7 text-unal-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-unal-secondary truncate">
                  {selectedCustomer.full_name}
                </h3>
                <p className="text-sm text-unal-secondary-light">
                  {selectedCustomer.document_type} {selectedCustomer.document_number}
                </p>
              </div>
            </div>

            <dl className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <CreditCard className="w-4 h-4 text-unal-secondary-light flex-shrink-0" />
                <dt className="w-36 text-unal-secondary-light">Tipo documento:</dt>
                <dd className="font-medium text-unal-secondary">{selectedCustomer.document_type}</dd>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <CreditCard className="w-4 h-4 text-unal-secondary-light flex-shrink-0" />
                <dt className="w-36 text-unal-secondary-light">Núm. documento:</dt>
                <dd className="font-medium text-unal-secondary">{selectedCustomer.document_number}</dd>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Phone className="w-4 h-4 text-unal-secondary-light flex-shrink-0" />
                <dt className="w-36 text-unal-secondary-light">Teléfono:</dt>
                <dd className="font-medium text-unal-secondary">{selectedCustomer.phone || '—'}</dd>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Mail className="w-4 h-4 text-unal-secondary-light flex-shrink-0" />
                <dt className="w-36 text-unal-secondary-light">Correo:</dt>
                <dd className="font-medium text-unal-secondary break-all">{selectedCustomer.email || '—'}</dd>
              </div>
              {selectedCustomer.address && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <User className="w-4 h-4 text-unal-secondary-light flex-shrink-0" />
                  <dt className="w-36 text-unal-secondary-light">Dirección:</dt>
                  <dd className="font-medium text-unal-secondary">{selectedCustomer.address}</dd>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <CalendarDays className="w-4 h-4 text-unal-secondary-light flex-shrink-0" />
                <dt className="w-36 text-unal-secondary-light">Fecha registro:</dt>
                <dd className="font-medium text-unal-secondary">{formatDate(selectedCustomer.created_at)}</dd>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <User className="w-4 h-4 text-unal-secondary-light flex-shrink-0" />
                <dt className="w-36 text-unal-secondary-light">Origen:</dt>
                <dd>
                  <span className={`badge ${selectedCustomer.origin === 'formulario_publico' ? 'badge-info' : 'badge-gray'}`}>
                    {selectedCustomer.origin === 'formulario_publico' ? 'Formulario público' : 'Manual'}
                  </span>
                </dd>
              </div>
            </dl>

            <div className="flex justify-end pt-4 border-t border-gray-200">
              <button
                onClick={() => { setDetailOpen(false); setSelectedCustomer(null); }}
                className="btn-secondary inline-flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Cerrar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}