import { useEffect, useState } from "react";
import {
  Crown,
  Clock,
  Users as UsersIcon,
  AlertTriangle,
  Sparkles,
  Wrench,
  Building2,
  CalendarDays,
  CalendarClock,
  CreditCard,
  Wallet,
  CheckCircle2,
  Tag,
  Power,
  RotateCcw,
  Receipt,
} from "lucide-react";
import api from "../utils/api";
import { formatCOP, formatDate } from "../utils/formatters";
import { usePlan } from "../context/PlanContext";
import { KPICard } from "../components/KPICard";
import toast from "../utils/toast";

// ============================================================================
// PÁGINA "MI PLAN" (privada) — SIVEP
// ----------------------------------------------------------------------------
// Muestra el plan actual de la organización, su estado, periodo de facturación,
// uso de usuarios frente al límite y las features incluidas. Permite SOLICITAR
// un cambio de plan (pago manual: un asesor confirma y activa).
// ============================================================================

function featureLabel(feature) {
  if (feature.code === "limit.users") {
    return feature.limit ? `Hasta ${feature.limit} usuarios` : "Usuarios ilimitados";
  }
  return feature.name;
}

export function MyPlanPage() {
  const { plan, refresh, isSuperAdmin } = usePlan();
  const [catalog, setCatalog] = useState({ plans: [], services: [] });
  const [cycle, setCycle] = useState("monthly");
  const [submitting, setSubmitting] = useState(null);
  const [requestingService, setRequestingService] = useState(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [coupon, setCoupon] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/billing/plans");
        setCatalog(res.data);
      } catch (error) {
        console.error("No se pudo cargar el catálogo:", error);
      } finally {
        setLoadingCatalog(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const loadInvoices = async () => {
      try {
        const res = await api.get("/billing/invoices");
        setInvoices(res.data.invoices || []);
      } catch (error) {
        // Silencioso: el historial es informativo.
      }
    };
    loadInvoices();
  }, []);

  const currentCode = plan?.plan?.code || null;
  const features = plan?.features || [];
  const limits = plan?.limits || {};
  const usage = plan?.usage || {};
  const subscription = plan?.subscription;
  const pending = plan?.pendingRequest;
  const organization = plan?.organization;
  const serviceOrders = plan?.serviceOrders || [];
  const openServiceCodes = new Set(
    serviceOrders
      .filter((o) => o.status === "solicitado" || o.status === "en_proceso")
      .map((o) => o.serviceCode),
  );

  // Mapa código→nombre de feature para mostrar etiquetas legibles (el endpoint
  // /billing/me entrega códigos; los nombres vienen del catálogo).
  const featureNameByCode = {};
  for (const p of catalog.plans) {
    for (const f of p.features) featureNameByCode[f.code] = f.name;
  }

  const requestPlan = async (planCode) => {
    setSubmitting(planCode);
    try {
      const { data } = await api.post("/billing/request", {
        plan_code: planCode,
        billing_cycle: cycle,
        coupon_code: coupon.trim() || undefined,
      });
      const disc = data?.request?.discount || 0;
      toast.success(
        "Solicitud enviada",
        disc > 0
          ? `Cupón aplicado: ahorras ${data.request.discountFormatted}. Un asesor te contactará.`
          : "Un asesor te contactará para completar la activación"
      );
      await refresh();
      const inv = await api.get("/billing/invoices");
      setInvoices(inv.data.invoices || []);
    } catch (error) {
      toast.error("Error", error.response?.data?.error || "No se pudo enviar la solicitud");
    } finally {
      setSubmitting(null);
    }
  };

  const cancelSubscription = async () => {
    if (!window.confirm("¿Cancelar tu suscripción al final del periodo actual?")) return;
    setLifecycleBusy(true);
    try {
      await api.post("/billing/subscription/cancel");
      toast.success("Cancelación programada", "Tu suscripción seguirá activa hasta el vencimiento.");
      await refresh();
    } catch (error) {
      toast.error("Error", error.response?.data?.error || "No se pudo cancelar");
    } finally {
      setLifecycleBusy(false);
    }
  };

  const resumeSubscription = async () => {
    setLifecycleBusy(true);
    try {
      await api.post("/billing/subscription/resume");
      toast.success("Suscripción reactivada", "Tu cancelación fue deshecha.");
      await refresh();
    } catch (error) {
      toast.error("Error", error.response?.data?.error || "No se pudo reactivar");
    } finally {
      setLifecycleBusy(false);
    }
  };

  const requestService = async (serviceCode) => {
    setRequestingService(serviceCode);
    try {
      await api.post("/billing/service-request", { service_code: serviceCode });
      toast.success("Solicitud enviada", "Un asesor te contactará para coordinar el servicio");
      await refresh();
    } catch (error) {
      toast.error("Error", error.response?.data?.error || "No se pudo enviar la solicitud");
    } finally {
      setRequestingService(null);
    }
  };

  // Etiqueta legible del estado de la suscripción.
  const statusBadge = (status) => {
    const map = {
      active: { label: "Activa", cls: "badge-success" },
      trialing: { label: "Prueba", cls: "badge-info" },
      past_due: { label: "Pago pendiente", cls: "badge-warning" },
      canceled: { label: "Cancelada", cls: "badge-danger" },
      expired: { label: "Vencida", cls: "badge-danger" },
    };
    return map[status] || { label: status || "Sin suscripción", cls: "badge-gray" };
  };

  // Etiqueta legible del estado de una factura/solicitud de pago.
  const invoiceBadge = (status) => {
    const map = {
      pagado: { label: "Pagado", cls: "badge-success" },
      pendiente: { label: "Pendiente", cls: "badge-warning" },
      rechazado: { label: "Rechazado", cls: "badge-danger" },
      cancelado: { label: "Cancelado", cls: "badge-gray" },
    };
    return map[status] || { label: status || "—", cls: "badge-gray" };
  };

  if (isSuperAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-unal-secondary">Mi plan</h1>
        <div className="card p-8 text-center">
          <Crown className="w-10 h-10 mx-auto mb-3 text-unal-primary" />
          <p className="text-unal-secondary font-medium">
            Sesión de administración con acceso total
          </p>
          <p className="text-sm text-unal-secondary-light mt-1">
            El super administrador no está sujeto a los límites de un plan.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-unal-secondary">Mi plan</h1>
        <p className="text-unal-secondary-light">
          Estado de la suscripción de tu organización y funciones incluidas
        </p>
      </div>

      {pending && (
        <div className="card p-4 border-l-4 border-yellow-500 bg-yellow-50 flex items-start gap-3">
          <Clock className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-unal-secondary">
              Solicitud de cambio pendiente
            </p>
            <p className="text-unal-secondary-light">
              Plan solicitado: <strong>{pending.planCode}</strong> ({pending.billingCycle === "yearly" ? "anual" : "mensual"}) ·
              ref. {pending.reference}. Un asesor te contactará para completar el pago.
            </p>
          </div>
        </div>
      )}

      {subscription?.cancelAtPeriodEnd && (
        <div className="card p-4 border-l-4 border-red-400 bg-red-50 flex flex-col sm:flex-row sm:items-center gap-3">
          <Power className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div className="text-sm flex-1">
            <p className="font-medium text-unal-secondary">Cancelación programada</p>
            <p className="text-unal-secondary-light">
              Tu suscripción se cancelará el{" "}
              <strong>{formatDate(subscription.currentPeriodEnd)}</strong>. Puedes
              reactivarla antes de esa fecha.
            </p>
          </div>
          <button
            onClick={resumeSubscription}
            disabled={lifecycleBusy}
            className="btn-primary text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-50 flex-shrink-0"
          >
            <RotateCcw className="w-4 h-4" /> Reactivar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Plan actual"
          value={plan?.plan?.name || "Sin plan"}
          icon={<Crown className="w-6 h-6" />}
          iconBg="bg-unal-primary/10"
        />
        <KPICard
          title="Usuarios"
          value={`${usage.users ?? 0}${limits.users ? ` / ${limits.users}` : ""}`}
          icon={<UsersIcon className="w-6 h-6" />}
          iconBg="bg-unal-accent/10"
        />
        <KPICard
          title="Facturación"
          value={subscription ? (subscription.billingCycle === "yearly" ? "Anual" : "Mensual") : "—"}
          icon={<Clock className="w-6 h-6" />}
          iconBg="bg-unal-secondary/10"
        />
        <KPICard
          title="Próximo vencimiento"
          value={subscription ? formatDate(subscription.currentPeriodEnd) : "—"}
          icon={<AlertTriangle className="w-6 h-6" />}
          iconBg="bg-yellow-100"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3 min-w-0">
              <span className="p-2.5 rounded-lg bg-unal-primary/10 text-unal-primary flex-shrink-0">
                <Building2 className="w-5 h-5" />
              </span>
              <h3 className="text-lg font-semibold text-unal-secondary truncate">
                Organización y suscripción
              </h3>
            </div>
            <span className={`badge ${statusBadge(subscription?.status).cls} flex-shrink-0`}>
              {statusBadge(subscription?.status).label}
            </span>
          </div>

          <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 mb-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-unal-secondary-light">
                  Organización
                </p>
                <p className="font-semibold text-unal-secondary truncate mt-0.5">
                  {organization?.name || "Sin asignar"}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-medium uppercase tracking-wider text-unal-secondary-light">
                  Plan
                </p>
                <p className="font-semibold text-unal-primary mt-0.5">
                  {plan?.plan?.name || "Sin plan"}
                </p>
              </div>
            </div>
          </div>

          <dl className="divide-y divide-gray-100">
            <div className="flex items-center justify-between py-3">
              <dt className="flex items-center gap-2 text-sm text-unal-secondary-light">
                <CreditCard className="w-4 h-4" /> Facturación
              </dt>
              <dd className="text-sm font-medium text-unal-secondary">
                {subscription ? (subscription.billingCycle === "yearly" ? "Anual" : "Mensual") : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="flex items-center gap-2 text-sm text-unal-secondary-light">
                <Wallet className="w-4 h-4" /> Valor del periodo
              </dt>
              <dd className="text-sm font-medium text-unal-secondary">
                {subscription?.amountFormatted || "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="flex items-center gap-2 text-sm text-unal-secondary-light">
                <CalendarDays className="w-4 h-4" /> Vigencia
              </dt>
              <dd className="text-sm font-medium text-unal-secondary">
                {subscription
                  ? `${formatDate(subscription.currentPeriodStart)} – ${formatDate(subscription.currentPeriodEnd)}`
                  : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="flex items-center gap-2 text-sm text-unal-secondary-light">
                <CalendarClock className="w-4 h-4" /> Próximo vencimiento
              </dt>
              <dd className="text-sm font-medium text-unal-secondary">
                {subscription ? formatDate(subscription.currentPeriodEnd) : "—"}
              </dd>
            </div>
          </dl>

          {limits.users ? (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-unal-secondary-light">Usuarios activos</span>
                <span className="font-medium text-unal-secondary">
                  {usage.users ?? 0} / {limits.users}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-unal-accent rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, ((usage.users ?? 0) / limits.users) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          {subscription && !subscription.cancelAtPeriodEnd && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={cancelSubscription}
                disabled={lifecycleBusy}
                className="btn-outline border-red-300 text-red-600 hover:bg-red-500 hover:text-white hover:border-red-500 text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Power className="w-4 h-4" /> Cancelar suscripción
              </button>
            </div>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-lg bg-unal-accent/10 text-unal-accent flex-shrink-0">
                <Sparkles className="w-5 h-5" />
              </span>
              <h3 className="text-lg font-semibold text-unal-secondary">
                Funciones incluidas
              </h3>
            </div>
            {features.length > 0 && (
              <span className="badge badge-gray flex-shrink-0">{features.length}</span>
            )}
          </div>

          {features.length === 0 ? (
            <div className="text-center py-10">
              <Sparkles className="w-9 h-9 mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-unal-secondary-light">
                No hay una suscripción activa. Solicita un plan para activar las funciones.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {features.map((code) => (
                <div
                  key={code}
                  className="flex items-start gap-2.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-unal-accent flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-unal-secondary">
                    {featureNameByCode[code] || code}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <h3 className="text-lg font-semibold text-unal-secondary">
            Cambiar de plan
          </h3>
          <div className="inline-flex items-center gap-1 p-1 bg-gray-50 rounded-lg border border-gray-200">
            <button
              onClick={() => setCycle("monthly")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${cycle === "monthly" ? "bg-unal-primary text-white" : "text-unal-secondary"}`}
            >
              Mensual
            </button>
            <button
              onClick={() => setCycle("yearly")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${cycle === "yearly" ? "bg-unal-primary text-white" : "text-unal-secondary"}`}
            >
              Anual
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
          <label className="text-sm text-unal-secondary-light flex items-center gap-2">
            <Tag className="w-4 h-4" /> ¿Tienes un cupón?
          </label>
          <input
            value={coupon}
            onChange={(e) => setCoupon(e.target.value.toUpperCase())}
            placeholder="CÓDIGO"
            className="input-field sm:max-w-[220px] uppercase"
          />
        </div>

        {loadingCatalog ? (
          <p className="text-sm text-unal-secondary-light">Cargando planes...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {catalog.plans.map((p) => {
              const isCurrent = p.code === currentCode;
              const price = cycle === "yearly" ? p.priceYearly : p.priceMonthly;
              const lower = catalog.plans.findIndex((x) => x.code === currentCode) > catalog.plans.findIndex((x) => x.code === p.code);
              return (
                <div
                  key={p.code}
                  className={`p-4 rounded-lg border ${isCurrent ? "border-unal-primary bg-unal-primary/5" : "border-gray-200"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-unal-secondary">{p.name}</h4>
                    {isCurrent && <span className="badge badge-info">Actual</span>}
                  </div>
                  <p className="text-xl font-bold text-unal-secondary mb-1">
                    {formatCOP(price)}
                    <span className="text-sm font-normal text-unal-secondary-light">
                      {" "}/ {cycle === "yearly" ? "año" : "mes"}
                    </span>
                  </p>
                  <p className="text-xs text-unal-secondary-light mb-3">
                    {p.description}
                  </p>
                  <button
                    onClick={() => requestPlan(p.code)}
                    disabled={isCurrent || submitting === p.code}
                    className={`w-full ${isCurrent ? "btn-secondary opacity-60 cursor-not-allowed" : "btn-primary"} inline-flex items-center justify-center gap-2`}
                  >
                    <Sparkles className="w-4 h-4" />
                    {isCurrent
                      ? "Plan actual"
                      : submitting === p.code
                        ? "Enviando..."
                        : lower
                          ? "Cambiar a este plan"
                          : "Mejorar a este plan"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <Wrench className="w-5 h-5 text-unal-primary" />
          <h3 className="text-lg font-semibold text-unal-secondary">
            Servicios de valor agregado
          </h3>
        </div>
        <p className="text-sm text-unal-secondary-light mb-5">
          Servicios puntuales que complementan tu plan. Al solicitarlos, un asesor te
          contactará para coordinar la ejecución.
        </p>

        {catalog.services.length === 0 ? (
          <p className="text-sm text-unal-secondary-light">No hay servicios disponibles.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {catalog.services.map((s) => {
              const inProgress = openServiceCodes.has(s.code);
              const isLoading = requestingService === s.code;
              return (
                <div key={s.code} className="p-4 rounded-lg border border-gray-200 flex flex-col">
                  <h4 className="font-semibold text-unal-secondary mb-1">{s.name}</h4>
                  <p className="text-xs text-unal-secondary-light mb-3 flex-1">{s.description}</p>
                  <p className="text-lg font-bold text-unal-secondary mb-3">
                    {s.priceFormatted}
                  </p>
                  <button
                    onClick={() => requestService(s.code)}
                    disabled={inProgress || isLoading || isSuperAdmin}
                    className={`w-full ${inProgress ? "btn-secondary opacity-60 cursor-not-allowed" : "btn-primary"} inline-flex items-center justify-center gap-2`}
                  >
                    <Wrench className="w-4 h-4" />
                    {inProgress ? "Solicitud en curso" : isLoading ? "Enviando..." : "Solicitar"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {serviceOrders.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-unal-secondary mb-3">
              Mis solicitudes
            </h4>
            <div className="space-y-2">
              {serviceOrders.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-3 py-2"
                >
                  <span className="text-unal-secondary">{o.serviceName}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-unal-secondary-light">{o.amountFormatted}</span>
                    <span
                      className={`badge ${
                        {
                          solicitado: "badge-warning",
                          en_proceso: "badge-info",
                          completado: "badge-success",
                          cancelado: "badge-gray",
                        }[o.status] || "badge-gray"
                      }`}
                    >
                      {
                        {
                          solicitado: "Solicitado",
                          en_proceso: "En proceso",
                          completado: "Completado",
                          cancelado: "Cancelado",
                        }[o.status] || o.status
                      }
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <span className="p-2.5 rounded-lg bg-unal-secondary/10 text-unal-secondary flex-shrink-0">
            <Receipt className="w-5 h-5" />
          </span>
          <h3 className="text-lg font-semibold text-unal-secondary">
            Historial de facturas
          </h3>
        </div>

        {invoices.length === 0 ? (
          <p className="text-sm text-unal-secondary-light">
            Aún no tienes facturas ni solicitudes registradas.
          </p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Referencia</th>
                  <th>Plan</th>
                  <th>Ciclo</th>
                  <th>Valor</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const badge = invoiceBadge(inv.status);
                  const planName =
                    catalog.plans.find((p) => p.code === inv.planCode)?.name ||
                    inv.planCode;
                  return (
                    <tr key={inv.id}>
                      <td className="font-mono text-xs text-unal-secondary-light">
                        {inv.reference}
                      </td>
                      <td className="text-unal-secondary">{planName}</td>
                      <td className="text-unal-secondary-light">
                        {inv.billingCycle === "yearly" ? "Anual" : "Mensual"}
                      </td>
                      <td className="text-unal-secondary">
                        {inv.amountFormatted}
                        {inv.discount > 0 && (
                          <span className="text-xs text-unal-accent ml-2">
                            −{inv.discountFormatted} ({inv.couponCode})
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="text-unal-secondary-light">
                        {formatDate(inv.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
