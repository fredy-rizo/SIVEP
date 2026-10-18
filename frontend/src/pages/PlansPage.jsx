import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  X,
  Crown,
  Building2,
  Server,
  Wrench,
  GraduationCap,
} from "lucide-react";
import api from "../utils/api";
import { LogoShield } from "../components/LogoShield";
import { formatCOP } from "../utils/formatters";

// ============================================================================
// PÁGINA PÚBLICA DE PLANES — SIVEP
// ----------------------------------------------------------------------------
// Presenta el modelo de monetización híbrido: planes SaaS (Básico, Profesional,
// Institucional), licencia perpetua on-premise y servicios de valor agregado.
// El catálogo se lee del backend (/billing/plans) para no duplicar precios.
// ============================================================================

// Detalle comercial estático que complementa al catálogo del backend.
const PLAN_HIGHLIGHTS = {
  basic: "Ideal para pequeños productores que inician su digitalización.",
  professional:
    "Para granjas medianas y cooperativas que quieren decidir con datos.",
  institutional:
    "Para universidades y gobiernos con varias sedes y necesidad de SLA.",
};

const PLAN_ICONS = {
  basic: Crown,
  professional: GraduationCap,
  institutional: Building2,
};

function limitLabel(feature) {
  if (feature.code === "limit.users") {
    return feature.limit ? `Hasta ${feature.limit} usuarios` : "Usuarios ilimitados";
  }
  return feature.name;
}

export function PlansPage() {
  const [data, setData] = useState({ plans: [], services: [] });
  const [cycle, setCycle] = useState("monthly");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/billing/plans");
        setData(res.data);
      } catch (error) {
        console.error("No se pudo cargar el catálogo de planes:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-unal-background">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <LogoShield className="w-10 h-10" />
            <span className="font-bold text-unal-primary text-xl">SIVEP</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-unal-secondary hover:text-unal-primary font-medium">
              Inicio
            </Link>
            <Link to="/login" className="btn-primary">
              Iniciar sesión
            </Link>
          </div>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-10">
          <span className="inline-block px-4 py-1.5 bg-unal-primary/10 text-unal-primary text-sm font-medium rounded-full mb-4">
            Planes y precios
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold text-unal-secondary mb-4">
            Lleva tu granja al siguiente nivel
          </h1>
          <p className="text-unal-secondary-light max-w-2xl mx-auto">
            Gestión de inventario y ventas, proyecciones con álgebra lineal y
            análisis con cálculo diferencial. Elige el plan que se ajusta a tu
            operación.
          </p>

          <div className="inline-flex items-center gap-1 mt-6 p-1 bg-white rounded-lg border border-gray-200">
            <button
              onClick={() => setCycle("monthly")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                cycle === "monthly" ? "bg-unal-primary text-white" : "text-unal-secondary"
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setCycle("yearly")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                cycle === "yearly" ? "bg-unal-primary text-white" : "text-unal-secondary"
              }`}
            >
              Anual
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 border-4 border-unal-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {data.plans.map((plan) => {
                const Icon = PLAN_ICONS[plan.code] || Crown;
                const price =
                  cycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
                const isPro = plan.code === "professional";
                return (
                  <article
                    key={plan.code}
                    className={`card p-6 relative flex flex-col ${
                      isPro ? "ring-2 ring-unal-primary" : ""
                    }`}
                  >
                    {isPro && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-unal-primary text-white text-xs font-semibold rounded-full">
                        Más elegido
                      </span>
                    )}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-11 h-11 bg-unal-primary/10 rounded-lg flex items-center justify-center">
                        <Icon className="w-6 h-6 text-unal-primary" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-unal-secondary">
                          {plan.name}
                        </h3>
                        <p className="text-xs text-unal-secondary-light">
                          {plan.description}
                        </p>
                      </div>
                    </div>

                    <p className="text-sm text-unal-secondary-light mb-4">
                      {PLAN_HIGHLIGHTS[plan.code]}
                    </p>

                    <div className="mb-5">
                      <span className="text-3xl font-bold text-unal-secondary">
                        {formatCOP(price)}
                      </span>
                      <span className="text-unal-secondary-light">
                        {" "}
                        / {cycle === "yearly" ? "año" : "mes"}
                      </span>
                    </div>

                    <ul className="space-y-2 mb-6 flex-1">
                      {plan.features.map((feature) => (
                        <li
                          key={feature.code}
                          className="flex items-start gap-2 text-sm text-unal-secondary"
                        >
                          <Check className="w-4 h-4 text-unal-accent flex-shrink-0 mt-0.5" />
                          {limitLabel(feature)}
                        </li>
                      ))}
                    </ul>

                    <Link
                      to="/login"
                      className={isPro ? "btn-primary text-center" : "btn-outline text-center"}
                    >
                      Solicitar plan
                    </Link>
                  </article>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-10">
              <article className="card p-6">
                <div className="flex items-center gap-3 mb-3">
                  <Server className="w-6 h-6 text-unal-secondary" />
                  <h3 className="text-lg font-bold text-unal-secondary">
                    Licencia perpetua (On-Premise)
                  </h3>
                </div>
                <p className="text-sm text-unal-secondary-light mb-4">
                  Para clientes que exigen que sus datos permanezcan en sus
                  propios servidores. Instalación y configuración incluidas.
                </p>
                <ul className="space-y-2 text-sm text-unal-secondary">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-unal-accent" /> Licencia única:{" "}
                    <strong>$8.000.000 – $15.000.000 COP</strong>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-unal-accent" /> Mantenimiento
                    anual (desde el año 2): 15% – 20% de la licencia
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-unal-accent" /> Actualizaciones,
                    backups y soporte técnico
                  </li>
                </ul>
              </article>

              <article className="card p-6">
                <div className="flex items-center gap-3 mb-3">
                  <Wrench className="w-6 h-6 text-unal-secondary" />
                  <h3 className="text-lg font-bold text-unal-secondary">
                    Servicios de valor agregado
                  </h3>
                </div>
                <div className="space-y-3">
                  {data.services.map((service) => (
                    <div
                      key={service.code}
                      className="flex items-start justify-between gap-4 p-3 rounded-lg bg-gray-50"
                    >
                      <div>
                        <p className="font-medium text-unal-secondary">
                          {service.name}
                        </p>
                        <p className="text-xs text-unal-secondary-light">
                          {service.description}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-unal-primary whitespace-nowrap">
                        {service.priceFormatted}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
