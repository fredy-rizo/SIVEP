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
  BarChart3,
  Tag,
  PlayCircle,
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
    metrics: null,
    organizations: [],
    subscriptions: [],
    payments: [],
    licenses: [],
    serviceOrders: [],
    plans: [],
    coupons: [],
    features: [],
  });
  const [paymentFilter, setPaymentFilter] = useState("");
  const [modal, setModal] = useState(null); // 'org' | 'sub' | 'license' | 'plan' | 'plan-new' | 'coupon'
  const [submitting, setSubmitting] = useState(false);
  const [issuedKey, setIssuedKey] = useState(null);

  const [orgForm, setOrgForm] = useState({ name: "", nit: "", city: "", contact_email: "", contact_phone: "" });
  const [subForm, setSubForm] = useState({ organization_id: "", plan_code: "", billing_cycle: "monthly", status: "active" });
  const [licenseForm, setLicenseForm] = useState({ organization_id: "", plan_code: "", type: "perpetual", seats: "", expires_at: "" });
  const [planForm, setPlanForm] = useState({ code: null, price_monthly: 0, price_yearly: 0, trial_days: 0, is_active: true });
  const [planNewForm, setPlanNewForm] = useState({ code: "", name: "", description: "", price_monthly: 0, price_yearly: 0, trial_days: 0, features: {} });
  const [couponForm, setCouponForm] = useState({ id: null, code: "", description: "", discount_type: "percent", discount_value: 0, plan_code: "", max_redemptions: "", valid_from: "", valid_until: "", is_active: true });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [overview, metrics, orgs, subs, payments, licenses, orders, plans, coupons, features] =
        await Promise.all([
          api.get("/admin/overview"),
          api.get("/admin/metrics"),
          api.get("/admin/organizations"),
          api.get("/admin/subscriptions"),
          api.get(`/admin/payments${paymentFilter ? `?status=${paymentFilter}` : ""}`),
          api.get("/admin/licenses"),
          api.get("/admin/service-orders"),
          api.get("/admin/plans"),
          api.get("/admin/coupons"),
          api.get("/admin/features"),
        ]);
      setData({
        overview: overview.data,
        metrics: metrics.data,
        organizations: orgs.data.organizations || [],
        subscriptions: subs.data.subscriptions || [],
        payments: payments.data.payments || [],
        licenses: licenses.data.licenses || [],
        serviceOrders: orders.data.serviceOrders || [],
        plans: plans.data.plans || [],
        coupons: coupons.data.coupons || [],
        features: features.data.features || [],
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
        trial_days: payload.trial_days ?? 0,
        is_active: !!payload.is_active,
      });
    } else if (type === "plan-new") {
      setPlanNewForm({ code: "", name: "", description: "", price_monthly: 0, price_yearly: 0, trial_days: 0, features: {} });
    } else if (type === "coupon") {
      setCouponForm(
        payload
          ? {
              id: payload.id,
              code: payload.code,
              description: payload.description || "",
              discount_type: payload.discount_type,
              discount_value: Number(payload.discount_value),
              plan_code: payload.plan_code || "",
              max_redemptions: payload.max_redemptions ?? "",
              valid_from: payload.valid_from ? String(payload.valid_from).slice(0, 10) : "",
              valid_until: payload.valid_until ? String(payload.valid_until).slice(0, 10) : "",
              is_active: !!payload.is_active,
            }
          : { id: null, code: "", description: "", discount_type: "percent", discount_value: 0, plan_code: "", max_redemptions: "", valid_from: "", valid_until: "", is_active: true },
      );
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
          trial_days: Number(planForm.trial_days),
          is_active: planForm.is_active,
        });
        toast.success("Plan actualizado");
      } else if (modal === "plan-new") {
        await api.post("/admin/plans", {
          code: planNewForm.code.trim().toLowerCase(),
          name: planNewForm.name,
          description: planNewForm.description,
          price_monthly: Number(planNewForm.price_monthly),
          price_yearly: Number(planNewForm.price_yearly),
          trial_days: Number(planNewForm.trial_days),
          features: planNewForm.features,
        });
        toast.success("Plan creado");
      } else if (modal === "coupon") {
        const payload = {
          description: couponForm.description || null,
          discount_type: couponForm.discount_type,
          discount_value: Number(couponForm.discount_value),
          plan_code: couponForm.plan_code || null,
          max_redemptions: couponForm.max_redemptions ? Number(couponForm.max_redemptions) : null,
          valid_from: couponForm.valid_from || null,
          valid_until: couponForm.valid_until || null,
          is_active: couponForm.is_active,
        };
        if (couponForm.id) {
          await api.patch(`/admin/coupons/${couponForm.id}`, payload);
          toast.success("Cupón actualizado");
        } else {
          await api.post("/admin/coupons", { ...payload, code: couponForm.code.trim().toUpperCase() });
          toast.success("Cupón creado");
        }
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
    { id: "metrics", label: "Métricas", icon: BarChart3 },
    { id: "organizations", label: "Organizaciones", icon: Building2 },
    { id: "subscriptions", label: "Suscripciones", icon: CreditCard },
    { id: "payments", label: "Pagos", icon: Receipt },
    { id: "coupons", label: "Cupones", icon: Tag },
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

          {activeTab === "metrics" && data.metrics && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard title="MRR" value={data.metrics.mrrFormatted} icon={<BarChart3 className="w-6 h-6" />} iconBg="bg-unal-primary/10" />
                <KPICard title="ARR" value={data.metrics.arrFormatted} icon={<BarChart3 className="w-6 h-6" />} iconBg="bg-unal-accent/10" />
                <KPICard title="ARPU" value={data.metrics.arpuFormatted} icon={<CreditCard className="w-6 h-6" />} iconBg="bg-unal-secondary/10" />
                <KPICard title="Churn (30 días)" value={`${data.metrics.churnRate}%`} icon={<Ban className="w-6 h-6" />} iconBg="bg-yellow-100" />
                <KPICard title="Suscripciones activas" value={data.metrics.activeSubscriptions} icon={<CreditCard className="w-6 h-6" />} iconBg="bg-unal-primary/10" />
                <KPICard title="Pruebas activas" value={data.metrics.activeTrials} icon={<PlayCircle className="w-6 h-6" />} iconBg="bg-unal-accent/10" />
                <KPICard title="Nuevas orgs (30 d)" value={data.metrics.newOrganizations30} icon={<Building2 className="w-6 h-6" />} iconBg="bg-unal-secondary/10" />
                <KPICard title="Recaudado (30 d)" value={data.metrics.revenueLast30Formatted} icon={<Receipt className="w-6 h-6" />} iconBg="bg-unal-accent/10" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card p-6">
                  <h3 className="text-lg font-semibold text-unal-secondary mb-5">
                    Ingresos últimos 6 meses
                  </h3>
                  {data.metrics.revenueByMonth.length === 0 ? (
                    <p className="text-sm text-unal-secondary-light">
                      Aún no hay pagos confirmados.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {(() => {
                        const max = Math.max(...data.metrics.revenueByMonth.map((m) => m.total), 1);
                        return data.metrics.revenueByMonth.map((m) => (
                          <div key={m.month}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-unal-secondary-light">{m.month}</span>
                              <span className="font-medium text-unal-secondary">{m.totalFormatted}</span>
                            </div>
                            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-unal-primary rounded-full" style={{ width: `${Math.round((m.total / max) * 100)}%` }} />
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>

                <div className="card p-6">
                  <h3 className="text-lg font-semibold text-unal-secondary mb-5">
                    Suscripciones por plan
                  </h3>
                  {data.metrics.subscriptionsByPlan.length === 0 ? (
                    <p className="text-sm text-unal-secondary-light">
                      No hay suscripciones activas.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {data.metrics.subscriptionsByPlan.map((p) => (
                        <div key={p.planCode} className="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-3 py-2">
                          <span className="text-unal-secondary">{p.planName}</span>
                          <span className="badge badge-info">{p.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
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
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  className="btn-secondary inline-flex items-center gap-2"
                  onClick={() => action(() => api.post("/admin/subscriptions/run-lifecycle"), "Ciclo de vida ejecutado")}
                >
                  <PlayCircle className="w-4 h-4" /> Ejecutar ciclo de vida
                </button>
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

          {activeTab === "coupons" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button className="btn-primary inline-flex items-center gap-2" onClick={() => openModal("coupon")}>
                  <Plus className="w-4 h-4" /> Nuevo cupón
                </button>
              </div>
              <DataTable
                columns={[
                  { key: "code", label: "Código", render: (v) => <span className="font-mono text-xs">{v}</span> },
                  { key: "discount_type", label: "Descuento", render: (v, row) => (v === "percent" ? `${Number(row.discount_value)}%` : formatCOP(row.discount_value)) },
                  { key: "plan_code", label: "Aplica a", render: (v) => v || "Todos" },
                  { key: "redemptions", label: "Canjes", render: (v, row) => `${v}${row.max_redemptions ? ` / ${row.max_redemptions}` : ""}` },
                  { key: "valid_until", label: "Vence", render: (v) => (v ? formatDate(v) : "Sin límite") },
                  { key: "is_active", label: "Estado", render: (v) => (v ? <span className="badge badge-success">Activo</span> : <span className="badge badge-gray">Inactivo</span>) },
                ]}
                data={data.coupons}
                keyField="id"
                pagination={false}
                emptyMessage="No hay cupones"
                renderActions={(row) => (
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openModal("coupon", row)} className="btn-secondary text-sm">Editar</button>
                    {row.is_active ? (
                      <button onClick={() => action(() => api.delete(`/admin/coupons/${row.id}`), "Cupón desactivado")} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Desactivar">
                        <Ban className="w-4 h-4" />
                      </button>
                    ) : null}
                  </div>
                )}
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
            <div className="space-y-4">
              <div className="flex justify-end">
                <button className="btn-primary inline-flex items-center gap-2" onClick={() => openModal("plan-new")}>
                  <Plus className="w-4 h-4" /> Nuevo plan a medida
                </button>
              </div>
              <DataTable
                columns={[
                  { key: "name", label: "Plan" },
                  { key: "price_monthly", label: "Mensual", render: (v) => formatCOP(v) },
                  { key: "price_yearly", label: "Anual", render: (v) => formatCOP(v) },
                  { key: "trial_days", label: "Prueba", render: (v) => (v ? `${v} días` : "—") },
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
            </div>
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
          <Input label="Días de prueba (trial)" type="number" value={planForm.trial_days} onChange={(e) => setPlanForm({ ...planForm, trial_days: e.target.value })} />
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

      <Modal isOpen={modal === "plan-new"} onClose={() => setModal(null)} title="Nuevo plan a medida" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Código *" value={planNewForm.code} onChange={(e) => setPlanNewForm({ ...planNewForm, code: e.target.value })} required placeholder="ej: cooperativa" />
            <Input label="Nombre *" value={planNewForm.name} onChange={(e) => setPlanNewForm({ ...planNewForm, name: e.target.value })} required />
            <Input label="Precio mensual" type="number" value={planNewForm.price_monthly} onChange={(e) => setPlanNewForm({ ...planNewForm, price_monthly: e.target.value })} />
            <Input label="Precio anual" type="number" value={planNewForm.price_yearly} onChange={(e) => setPlanNewForm({ ...planNewForm, price_yearly: e.target.value })} />
            <Input label="Días de prueba" type="number" value={planNewForm.trial_days} onChange={(e) => setPlanNewForm({ ...planNewForm, trial_days: e.target.value })} />
            <Input label="Descripción" value={planNewForm.description} onChange={(e) => setPlanNewForm({ ...planNewForm, description: e.target.value })} />
          </div>
          <div>
            <p className="text-sm font-medium text-unal-secondary mb-2">Funciones incluidas</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto scrollbar-thin pr-1">
              {data.features.map((f) => {
                const checked = Object.prototype.hasOwnProperty.call(planNewForm.features, f.code);
                return (
                  <div key={f.code} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = { ...planNewForm.features };
                        if (e.target.checked) next[f.code] = f.kind === "limit" ? 1 : null;
                        else delete next[f.code];
                        setPlanNewForm({ ...planNewForm, features: next });
                      }}
                      className="w-4 h-4 accent-unal-primary"
                    />
                    <span className="text-sm text-unal-secondary flex-1">{f.name}</span>
                    {checked && f.kind === "limit" && (
                      <input
                        type="number"
                        min="1"
                        value={planNewForm.features[f.code] ?? ""}
                        onChange={(e) =>
                          setPlanNewForm({
                            ...planNewForm,
                            features: {
                              ...planNewForm.features,
                              [f.code]: e.target.value === "" ? null : Number(e.target.value),
                            },
                          })
                        }
                        className="input-field w-20 py-1 text-sm"
                        placeholder="∞"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? "Creando..." : "Crear plan"}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={modal === "coupon"} onClose={() => setModal(null)} title={couponForm.id ? `Editar cupón ${couponForm.code}` : "Nuevo cupón"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Código *" value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })} required disabled={!!couponForm.id} />
            <Input label="Descripción" value={couponForm.description} onChange={(e) => setCouponForm({ ...couponForm, description: e.target.value })} />
            <Select label="Tipo de descuento" value={couponForm.discount_type} onChange={(e) => setCouponForm({ ...couponForm, discount_type: e.target.value })} options={[{ value: "percent", label: "Porcentaje (%)" }, { value: "fixed", label: "Valor fijo (COP)" }]} />
            <Input label="Valor" type="number" value={couponForm.discount_value} onChange={(e) => setCouponForm({ ...couponForm, discount_value: e.target.value })} />
            <Select label="Aplica al plan" value={couponForm.plan_code} onChange={(e) => setCouponForm({ ...couponForm, plan_code: e.target.value })} options={[{ value: "", label: "Todos los planes" }, ...planOptions]} />
            <Input label="Máx. canjes (vacío = ilimitado)" type="number" value={couponForm.max_redemptions} onChange={(e) => setCouponForm({ ...couponForm, max_redemptions: e.target.value })} />
            <Input label="Válido desde" type="date" value={couponForm.valid_from} onChange={(e) => setCouponForm({ ...couponForm, valid_from: e.target.value })} />
            <Input label="Válido hasta" type="date" value={couponForm.valid_until} onChange={(e) => setCouponForm({ ...couponForm, valid_until: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={couponForm.is_active} onChange={(e) => setCouponForm({ ...couponForm, is_active: e.target.checked })} className="w-4 h-4 accent-unal-primary" />
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
