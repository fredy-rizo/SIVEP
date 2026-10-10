import { useState, useEffect } from 'react';
import { Plus, Search, Filter, Edit, Trash2, UserCheck, UserX, Shield } from 'lucide-react';
import api from '../utils/api';
import { formatDate } from '../utils/formatters';
import { DataTable } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { Input, Select, FormError } from '../components/FormComponents';
import toast from '../utils/toast';

const ROLES = [
  { value: 'admin_granja', label: 'Administrador de Granja' },
  { value: 'super_admin', label: 'Super Administrador' }
];

export function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ search: '', role: '', is_active: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'admin_granja',
    granja_asignada: '',
    is_active: true
  });
  const [errors, setErrors] = useState({});

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      });
      const response = await api.get(`/users?${params}`);
      setUsers(response.data.data);
      setPagination(prev => ({
        ...prev,
        total: response.data.pagination.total,
        totalPages: response.data.pagination.totalPages
      }));
    } catch (error) {
      toast.error('Error', 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [pagination.page, filters]);

  const validate = () => {
    const newErrors = {};
    if (!formData.email.trim()) newErrors.email = 'El email es obligatorio';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Email inválido';
    if (!editingUser && !formData.password) newErrors.password = 'La contraseña es obligatoria';
    else if (formData.password && formData.password.length < 6) newErrors.password = 'Mínimo 6 caracteres';
    if (!formData.full_name.trim()) newErrors.full_name = 'El nombre es obligatorio';
    if (!formData.role) newErrors.role = 'Seleccione un rol';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      full_name: '',
      role: 'admin_granja',
      granja_asignada: '',
      is_active: true
    });
    setErrors({});
    setEditingUser(null);
  };

  const openModal = (user = null) => {
    resetForm();
    if (user) {
      setEditingUser(user);
      setFormData({
        email: user.email,
        password: '',
        full_name: user.full_name,
        role: user.role,
        granja_asignada: user.granja_asignada || '',
        // Mismo caso que productos: normalizar 1/0 a booleano real.
        is_active: !!user.is_active
      });
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const data = {
        email: formData.email,
        full_name: formData.full_name,
        role: formData.role,
        granja_asignada: formData.granja_asignada || null,
        is_active: formData.is_active
      };

      if (formData.password) {
        data.password = formData.password;
      }

      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, data);
        toast.success('Usuario actualizado');
      } else {
        await api.post('/users', data);
        toast.success('Usuario creado');
      }
      setModalOpen(false);
      fetchUsers();
    } catch (error) {
      toast.error('Error', error.response?.data?.error || 'No se pudo guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (user) => {
    if (user.role === 'super_admin') {
      toast.warning('No permitido', 'No se puede desactivar un super administrador');
      return;
    }
    if (user.id === parseInt(localStorage.getItem('user_id') || '0')) {
      toast.warning('No permitido', 'No puedes desactivarte a ti mismo');
      return;
    }
    try {
      await api.delete(`/users/${user.id}`);
      toast.success(user.is_active ? 'Usuario desactivado' : 'Usuario activado');
      fetchUsers();
    } catch (error) {
      toast.error('Error', 'No se pudo actualizar el estado');
    }
  };

  const columns = [
    { key: 'email', label: 'Email', sortable: true },
    { key: 'full_name', label: 'Nombre', sortable: true },
    { key: 'role', label: 'Rol', render: (v) => (
      <span className={`badge ${v === 'super_admin' ? 'badge-info' : 'badge-gray'} flex items-center gap-1`}>
        {v === 'super_admin' ? <Shield className="w-3 h-3" /> : ''}
        {v === 'super_admin' ? 'Super Admin' : 'Admin Granja'}
      </span>
    )},
    { key: 'granja_asignada', label: 'Granja asignada' },
    { key: 'is_active', label: 'Estado', render: (v) => (
      <span className={`badge ${v ? 'badge-success' : 'badge-gray'}`}>{v ? 'Activo' : 'Inactivo'}</span>
    )},
    { key: 'last_login', label: 'Último acceso', render: (v) => v ? formatDate(v) : 'Nunca' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-unal-secondary">Usuarios</h1>
          <p className="text-unal-secondary-light">Gestión de administradores de granja (solo Super Admin)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-4 h-4 mr-2" /> Filtros
          </button>
          <button className="btn-primary" onClick={() => openModal()}>
            <Plus className="w-4 h-4 mr-2" /> Nuevo admin
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="card p-4 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Input
              label="Buscar"
              placeholder="Nombre, email..."
              value={filters.search}
              onChange={(e) => { setFilters(prev => ({ ...prev, search: e.target.value })); setPagination(prev => ({ ...prev, page: 1 })); }}
            />
            <Select
              label="Rol"
              value={filters.role}
              onChange={(e) => { setFilters(prev => ({ ...prev, role: e.target.value })); setPagination(prev => ({ ...prev, page: 1 })); }}
              options={[{ value: '', label: 'Todos' }, ...ROLES]}
            />
            <Select
              label="Estado"
              value={filters.is_active}
              onChange={(e) => { setFilters(prev => ({ ...prev, is_active: e.target.value })); setPagination(prev => ({ ...prev, page: 1 })); }}
              options={[{ value: '', label: 'Todos' }, { value: 'true', label: 'Activos' }, { value: 'false', label: 'Inactivos' }]}
            />
            <div className="flex items-end">
              <button
                onClick={() => { setFilters({ search: '', role: '', is_active: '' }); setPagination(prev => ({ ...prev, page: 1 })); }}
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
        data={users}
        keyField="id"
        loading={loading}
        pagination={true}
        pageSize={pagination.limit}
        onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
        totalPages={pagination.totalPages}
        currentPage={pagination.page}
        emptyMessage="No se encontraron usuarios"
        renderActions={(row) => (
          <div className="flex items-center justify-end gap-1">
            {row.role !== 'super_admin' && (
              <>
                <button
                  onClick={() => handleToggleActive(row)}
                  className={`p-2 rounded-lg transition-colors ${row.is_active ? 'text-yellow-600 hover:bg-yellow-50' : 'text-green-600 hover:bg-green-50'}`}
                  title={row.is_active ? 'Desactivar' : 'Activar'}
                >
                  {row.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                </button>
              </>
            )}
            <button
              onClick={() => openModal(row)}
              className="p-2 text-unal-primary hover:bg-unal-primary/10 rounded-lg transition-colors"
              title="Editar"
            >
              <Edit className="w-4 h-4" />
            </button>
          </div>
        )}
      />

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingUser ? 'Editar usuario' : 'Nuevo administrador de granja'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormError message={errors.general} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Email *"
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              error={errors.email}
              required
              disabled={editingUser && editingUser.role === 'super_admin'}
            />
            <Select
              label="Rol *"
              id="role"
              value={formData.role}
              onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
              error={errors.role}
              required
              options={ROLES}
              disabled={editingUser && editingUser.role === 'super_admin'}
            />
            <Input
              label="Nombre completo *"
              id="full_name"
              value={formData.full_name}
              onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
              error={errors.full_name}
              required
            />
            <Input
              label="Granja asignada"
              id="granja_asignada"
              value={formData.granja_asignada}
              onChange={(e) => setFormData(prev => ({ ...prev, granja_asignada: e.target.value }))}
              placeholder="Opcional"
            />
            {editingUser ? (
              <Input
                label="Nueva contraseña (dejar vacío para no cambiar)"
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                error={errors.password}
                placeholder="••••••••"
              />
            ) : (
              <Input
                label="Contraseña *"
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                error={errors.password}
                required
                placeholder="Mínimo 6 caracteres"
              />
            )}
            <div className="md:col-span-2 flex items-center gap-3 pt-4 border-t border-gray-200">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="w-4 h-4 text-unal-primary border-gray-300 rounded focus:ring-unal-primary"
                  disabled={editingUser && editingUser.role === 'super_admin'}
                />
                <span className="text-sm text-unal-secondary">Activo</span>
              </label>
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Guardando...' : (editingUser ? 'Actualizar' : 'Crear')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}