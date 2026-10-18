import { useState, useEffect, useCallback } from "react";
import {
  Building2,
  CreditCard,
  Receipt,
  KeyRound,
  Wrench,
  Package,
  Plus,
  Check,
  X,
  Ban,
  RefreshCw,
} from "lucide-react";
import api from "../utils/api";
import { formatCOP, formatDate } from "../utils/formatters";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { Input, Select } from "../components/FormComponents";
import { KPICard } from "../components/KPICard";
import toast from "../utils/toast";

// ============================================================================
// PANEL DE MONETIZACIÓN (Super Admin) — SIVEP
// ----------------------------------------------------------------------------
// Back office comercial para operar la Parte 1 completa sin pasarela de pago:
// organizaciones, suscripciones, pagos, licencias on-premise, servicios y
// planes. Toda acción llama a /api/admin/* (protegido por rol super_admin).
// ============================================================================

const STATUS_LABELS = {
  active: "Activa",
  trialing: "Prueba",
  past_due: "Pago pendiente",
  canceled: "Cancelada",
  expired: "Vencida",
  pendiente: "Pendiente",
  pagado: "Pagado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
  solicitado: "Solicitado",
  en_proceso: "En proceso",
  completado: "Completado",
  revoked: "Revocada",
};

const statusBadge = (value) => {
  const cls =
    {
      active: "badge-success",
      pagado: "badge-success",
      completado: "badge-success",
      trialing: "badge-info",
      pendiente: "badge-warning",
      past_due: "badge-warning",
      solicitado: "badge-warning",
      en_proceso: "badge-info",
      canceled: "badge-gray",
      cancelado: "badge-gray",
      expired: "badge-danger",
      rechazado: "badge-danger",
      revoked: "badge-danger",
    }[value] || "badge-gray";
  return <span className={`badge ${cls}`}>{STATUS_LABELS[value] || value}</span>;
};

export function AdminBillingPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    overview: null,
    organizations: [],
    subscriptions: [],
    payments: [],
    licenses: [],
    serviceOrders: [],
    plans: [],
  });
  const [paymentFilter, setPaymentFilter] = useState("");
  const [modal, setModal] = useState(null); // 'org' | 'sub' | 'license' | 'plan'
  const [submitting, setSubmitting] = useState(false);
  const [issuedKey, setIssuedKey] = useState(null);

  const [orgForm, setOrgForm] = useState({ name: "", nit: "", city: "", contact_email: "", contact_phone: "" });
  const [subForm, setSubForm] = useState({ organization_id: "", plan_code: "", billing_cycle: "monthly", status: "active" });
  const [licenseForm, setLicenseForm] = useState({ organization_id: "", plan_code: "", type: "perpetual", seats: "", expires_at: "" });
  const [planForm, setPlanForm] = useState({ code: null, price_monthly: 0, price_yearly: 0, is_active: true });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [overview, orgs, subs, payments, licenses, orders, plans] =
        await Promise.all([
          api.get("/admin/overview"),
          api.get("/admin/organizations"),
          api.get("/admin/subscriptions"),
          api.get(`/admin/payments${paymentFilter ? `?status=${paymentFilter}` : ""}`),
          api.get("/admin/licenses"),
          api.get("/admin/service-orders"),
          api.get("/admin/plans"),
        ]);
      setData({
        overview: overview.data,
        organizations: orgs.data.organizations || [],
        subscriptions: subs.data.subscriptions || [],
        payments: payments.data.payments || [],
        licenses: licenses.data.licenses || [],
        serviceOrders: orders.data.serviceOrders || [],
        plans: plans.data.plans || [],
      });
    } catch (error) {
      toast.error("Error", error.response?.data?.error || "No se pudo cargar el panel");
    } finally {
      setLoading(false);
    }
  }, [paymentFilter]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openModal = (type, payload = null) => {
    setIssuedKey(null);
    if (type === "org") {
      setOrgForm(payload || { name: "", nit: "", city: "", contact_email: "", contact_phone: "" });
    } else if (type === "sub") {
      setSubForm({
        organization_id: payload?.organization_id || "",
        plan_code: payload?.plan_code || "",
        billing_cycle: "monthly",
        status: "active",
      });
    } else if (type === "license") {
      setLicenseForm({ organization_id: "", plan_code: "", type: "perpetual", seats: "", expires_at: "" });
    } else if (type === "plan") {
      setPlanForm({
        code: payload.code,
        price_monthly: payload.price_monthly,
        price_yearly: payload.price_yearly,
        is_active: !!payload.is_active,
      });
    }
    setModal(type);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (modal === "org") {
        await api.post("/admin/organizations", orgForm);
        toast.success("Organización creada");
      } else if (modal === "sub") {
        await api.post("/admin/subscriptions", {
          ...subForm,
          organization_id: Number(subForm.organization_id),
        });
        toast.success("Suscripción asignada");
      } else if (modal === "license") {
        const res = await api.post("/admin/licenses", {
          ...licenseForm,
          organization_id: Number(licenseForm.organization_id),
          seats: licenseForm.seats ? Number(licenseForm.seats) : null,
          expires_at: licenseForm.expires_at || null,
        });
        setIssuedKey(res.data.license.license_key);
        await loadAll();
        toast.success("Licencia emitida");
        return; // no cerrar: se muestra la clave generada
      } else if (modal === "plan") {
        await api.patch(`/admin/plans/${planForm.code}`, {
          price_monthly: Number(planForm.price_monthly),
          price_yearly: Number(planForm.price_yearly),
          is_active: planForm.is_active,
        });
        toast.success("Plan actualizado");
      }
      setModal(null);
      await loadAll();
    } catch (error) {
      toast.error("Error", error.response?.data?.error || "No se pudo guardar");
    } finally {
      setSubmitting(false);
    }
  };

  const action = async (fn, successMsg) => {
    try {
      await fn();
      toast.success(successMsg);
      await loadAll();
    } catch (error) {
      toast.error("Error", error.response?.data?.error || "No se pudo completar");
    }
  };

  const tabs = [
    { id: "overview", label: "Resumen", icon: Package },
    { id: "organizations", label: "Organizaciones", icon: Building2 },
    { id: "subscriptions", label: "Suscripciones", icon: CreditCard },
    { id: "payments", label: "Pagos", icon: Receipt },
    { id: "licenses", label: "Licencias", icon: KeyRound },
    { id: "services", label: "Servicios", icon: Wrench },
    { id: "plans", label: "Planes", icon: Package },
  ];

  const overview = data.overview;
  const planOptions = data.plans.map((p) => ({ value: p.code, label: p.name }));
  const orgOptions = data.organizations.map((o) => ({ value: String(o.id), label: o.name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-unal-secondary">Monetización</h1>
          <p className="text-unal-secondary-light">
            Organizaciones, planes, pagos, licencias y servicios
          </p>
        </div>
        <button onClick={loadAll} className="btn-secondary inline-flex items-center gap-2" disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-unal-primary text-unal-primary"
                : "border-transparent text-unal-secondary-light hover:text-unal-secondary"
            }`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-12 h-12 border-4 border-unal-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {activeTab === "overview" && overview && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <KPICard title="Organizaciones" value={`${overview.organizations.active} / ${overview.organizations.total}`} icon={<Building2 className="w-6 h-6" />} iconBg="bg-unal-primary/10" />
              <KPICard title="Suscripciones activas" value={overview.activeSubscriptions} icon={<CreditCard className="w-6 h-6" />} iconBg="bg-unal-accent/10" />
              <KPICard title="Pagos pendientes" value={overview.pendingPayments} icon={<Receipt className="w-6 h-6" />} iconBg="bg-yellow-100" />
              <KPICard title="Licencias activas" value={overview.activeLicenses} icon={<KeyRound className="w-6 h-6" />} iconBg="bg-unal-secondary/10" />
              <KPICard title="Órdenes de servicio abiertas" value={overview.openServiceOrders} icon={<Wrench className="w-6 h-6" />} iconBg="bg-unal-primary/10" />
              <KPICard title="Recaudado" value={overview.revenueCollectedFormatted} icon={<Receipt className="w-6 h-6" />} iconBg="bg-unal-accent/10" />
            </div>
          )}

          {activeTab === "organizations" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button className="btn-primary inline-flex items-center gap-2" onClick={() => openModal("org")}>
                  <Plus className="w-4 h-4" /> Nueva organización
                </button>
              </div>
              <DataTable
                columns={[
                  { key: "name", label: "Organización" },
                  { key: "nit", label: "NIT" },
                  { key: "city", label: "Ciudad" },
                  { key: "users_count", label: "Usuarios" },
                  { key: "plan_name", label: "Plan", render: (v) => v || "Sin plan" },
                  { key: "is_active", label: "Estado", render: (v) => (v ? <span className="badge badge-success">Activa</span> : <span className="badge badge-gray">Inactiva</span>) },
                ]}
                data={data.organizations}
                keyField="id"
                pagination={false}
                emptyMessage="No hay organizaciones"
              />
            </div>
          )}

          {activeTab === "subscriptions" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button className="btn-primary inline-flex items-center gap-2" onClick={() => openModal("sub")}>
                  <Plus className="w-4 h-4" /> Asignar plan
                </button>
              </div>
              <DataTable
                columns={[
                  { key: "organization_name", label: "Organización" },
                  { key: "plan_name", label: "Plan" },
                  { key: "billing_cycle", label: "Ciclo", render: (v) => (v === "yearly" ? "Anual" : "Mensual") },
                  { key: "amount", label: "Valor", render: (v) => formatCOP(v) },
                  { key: "current_period_end", label: "Vence", render: (v) => formatDate(v) },
                  { key: "status", label: "Estado", render: (v) => statusBadge(v) },
                ]}
                data={data.subscriptions}
                keyField="id"
                pagination={false}
                emptyMessage="No hay suscripciones"
              />
            </div>
          )}

          {activeTab === "payments" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <Select
                  label="Filtrar por estado"
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  options={[
                    { value: "", label: "Todos" },
                    { value: "pendiente", label: "Pendientes" },
                    { value: "pagado", label: "Pagados" },
                    { value: "rechazado", label: "Rechazados" },
                  ]}
                />
              </div>
              <DataTable
                columns={[
                  { key: "organization_name", label: "Organización" },
                  { key: "plan_code", label: "Plan" },
                  { key: "billing_cycle", label: "Ciclo", render: (v) => (v === "yearly" ? "Anual" : "Mensual") },
                  { key: "amount", label: "Valor", render: (v) => formatCOP(v) },
                  { key: "reference", label: "Referencia" },
                  { key: "status", label: "Estado", render: (v) => statusBadge(v) },
                ]}
                data={data.payments}
                keyField="id"
                pagination={false}
                emptyMessage="No hay pagos"
                renderActions={(row) =>
                  row.status === "pendiente" ? (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => action(() => api.post(`/admin/payments/${row.id}/confirm`), "Pago confirmado y suscripción activada")}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                        title="Confirmar pago"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => action(() => api.post(`/admin/payments/${row.id}/reject`), "Pago rechazado")}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        title="Rechazar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : null
                }
              />
            </div>
          )}

          {activeTab === "licenses" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button className="btn-primary inline-flex items-center gap-2" onClick={() => openModal("license")}>
                  <Plus className="w-4 h-4" /> Emitir licencia
                </button>
              </div>
              <DataTable
                columns={[
                  { key: "organization_name", label: "Organización" },
                  { key: "plan_code", label: "Plan" },
                  { key: "type", label: "Tipo", render: (v) => (v === "perpetual" ? "Perpetua" : "Suscripción") },
                  { key: "seats", label: "Asientos", render: (v) => v || "Ilimitado" },
                  { key: "expires_at", label: "Vence", render: (v) => (v ? formatDate(v) : "Sin vencimiento") },
                  { key: "status", label: "Estado", render: (v) => statusBadge(v) },
                ]}
                data={data.licenses}
                keyField="id"
                pagination={false}
                emptyMessage="No hay licencias"
                renderActions={(row) =>
                  row.status === "active" ? (
                    <button
                      onClick={() => action(() => api.post(`/admin/licenses/${row.id}/revoke`), "Licencia revocada")}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      title="Revocar"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  ) : null
                }
              />
            </div>
          )}

          {activeTab === "services" && (
            <DataTable
              columns={[
                { key: "organization_name", label: "Organización" },
                { key: "service_name", label: "Servicio" },
                { key: "amount", label: "Valor", render: (v) => formatCOP(v) },
                { key: "status", label: "Estado", render: (v) => statusBadge(v) },
                { key: "created_at", label: "Solicitado", render: (v) => formatDate(v) },
              ]}
              data={data.serviceOrders}
              keyField="id"
              pagination={false}
              emptyMessage="No hay órdenes de servicio"
              renderActions={(row) => (
                <Select
                  value={row.status}
                  onChange={(e) => action(() => api.patch(`/admin/service-orders/${row.id}`, { status: e.target.value }), "Orden actualizada")}
                  options={[
                    { value: "solicitado", label: "Solicitado" },
                    { value: "en_proceso", label: "En proceso" },
                    { value: "completado", label: "Completado" },
                    { value: "cancelado", label: "Cancelado" },
                  ]}
                />
              )}
            />
          )}

          {activeTab === "plans" && (
            <DataTable
              columns={[
                { key: "name", label: "Plan" },
                { key: "price_monthly", label: "Mensual", render: (v) => formatCOP(v) },
                { key: "price_yearly", label: "Anual", render: (v) => formatCOP(v) },
                { key: "is_active", label: "Estado", render: (v) => (v ? <span className="badge badge-success">Activo</span> : <span className="badge badge-gray">Inactivo</span>) },
              ]}
              data={data.plans}
              keyField="code"
              pagination={false}
              renderActions={(row) => (
                <button onClick={() => openModal("plan", row)} className="btn-secondary text-sm">
                  Editar
                </button>
              )}
            />
          )}
        </>
      )}

      {/* Modal genérico según el tipo */}
      <Modal
        isOpen={modal === "org"}
        onClose={() => setModal(null)}
        title="Nueva organización"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Nombre *" value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} required />
            <Input label="NIT" value={orgForm.nit} onChange={(e) => setOrgForm({ ...orgForm, nit: e.target.value })} />
            <Input label="Ciudad" value={orgForm.city} onChange={(e) => setOrgForm({ ...orgForm, city: e.target.value })} />
            <Input label="Email de contacto" type="email" value={orgForm.contact_email} onChange={(e) => setOrgForm({ ...orgForm, contact_email: e.target.value })} />
            <Input label="Teléfono" value={orgForm.contact_phone} onChange={(e) => setOrgForm({ ...orgForm, contact_phone: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? "Guardando..." : "Crear"}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={modal === "sub"} onClose={() => setModal(null)} title="Asignar plan a organización" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select label="Organización *" value={subForm.organization_id} onChange={(e) => setSubForm({ ...subForm, organization_id: e.target.value })} options={orgOptions} required />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select label="Plan *" value={subForm.plan_code} onChange={(e) => setSubForm({ ...subForm, plan_code: e.target.value })} options={planOptions} required />
            <Select label="Ciclo" value={subForm.billing_cycle} onChange={(e) => setSubForm({ ...subForm, billing_cycle: e.target.value })} options={[{ value: "monthly", label: "Mensual" }, { value: "yearly", label: "Anual" }]} />
            <Select label="Estado" value={subForm.status} onChange={(e) => setSubForm({ ...subForm, status: e.target.value })} options={[{ value: "active", label: "Activa" }, { value: "trialing", label: "Prueba" }, { value: "past_due", label: "Pago pendiente" }]} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? "Guardando..." : "Asignar"}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={modal === "license"} onClose={() => setModal(null)} title="Emitir licencia on-premise" size="lg">
        {issuedKey ? (
          <div className="space-y-4">
            <p className="text-sm text-unal-secondary">
              Licencia generada. Cópiela y entréguela al cliente para su instalación on-premise.
            </p>
            <textarea readOnly value={issuedKey} className="input-field font-mono text-xs h-32" />
            <div className="flex justify-end">
              <button className="btn-primary" onClick={() => setModal(null)}>Listo</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Select label="Organización *" value={licenseForm.organization_id} onChange={(e) => setLicenseForm({ ...licenseForm, organization_id: e.target.value })} options={orgOptions} required />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label="Plan *" value={licenseForm.plan_code} onChange={(e) => setLicenseForm({ ...licenseForm, plan_code: e.target.value })} options={planOptions} required />
              <Select label="Tipo" value={licenseForm.type} onChange={(e) => setLicenseForm({ ...licenseForm, type: e.target.value })} options={[{ value: "perpetual", label: "Perpetua" }, { value: "subscription", label: "Suscripción" }]} />
              <Input label="Asientos (vacío = ilimitado)" type="number" value={licenseForm.seats} onChange={(e) => setLicenseForm({ ...licenseForm, seats: e.target.value })} />
              <Input label="Vence (vacío = sin vencimiento)" type="date" value={licenseForm.expires_at} onChange={(e) => setLicenseForm({ ...licenseForm, expires_at: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? "Emitiendo..." : "Emitir"}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={modal === "plan"} onClose={() => setModal(null)} title={`Editar plan ${planForm.code || ""}`} size="sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Precio mensual" type="number" value={planForm.price_monthly} onChange={(e) => setPlanForm({ ...planForm, price_monthly: e.target.value })} />
          <Input label="Precio anual" type="number" value={planForm.price_yearly} onChange={(e) => setPlanForm({ ...planForm, price_yearly: e.target.value })} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={planForm.is_active} onChange={(e) => setPlanForm({ ...planForm, is_active: e.target.checked })} className="w-4 h-4 text-unal-primary border-gray-300 rounded" />
            <span className="text-sm text-unal-secondary">Activo</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? "Guardando..." : "Guardar"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
