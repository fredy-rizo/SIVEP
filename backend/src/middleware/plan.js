// ============================================================================
// SERVICIO DE PLANES Y GATING POR FEATURE — SIVEP
// ----------------------------------------------------------------------------
// ¿POR QUÉ existe este módulo?
//   El acceso a las funciones premium (analítica de álgebra y cálculo, reportes
//   avanzados, etc.) no debe decidirse con "if (plan === 'profesional')" regado
//   por el código. Aquí se resuelve, en un solo lugar, QUÉ puede hacer la
//   organización del usuario según su suscripción activa, y se expone el
//   middleware `requireFeature()` para proteger rutas.
//
// CÓMO funciona:
//   - `loadPlanCatalog()` carga en memoria el catálogo planes→features (con TTL)
//     para no consultar la BD en cada petición.
//   - `resolveUserPlan(user)` resuelve la organización del usuario, su
//     suscripción vigente y sus features/límites.
//   - `requireFeature(code)` es un preHandler de Fastify que responde 402
//     (Payment Required) con un mensaje claro y accionable si falta la feature.
//
// NOTA: el super_admin se considera con acceso total (es el operador del SaaS).
// ============================================================================

import pool from "../config/database.js";

const CACHE_TTL_MS = 60 * 1000; // 1 minuto: el catálogo cambia poco.
let planCache = null; // Map<plan_id, { code, name, features:Set, limits:Map }>
let catalogLoadedAt = 0;

export function invalidatePlanCache() {
  planCache = null;
  catalogLoadedAt = 0;
}

export async function loadPlanCatalog(force = false) {
  const now = Date.now();
  if (!force && planCache && now - catalogLoadedAt < CACHE_TTL_MS) {
    return planCache;
  }

  const [plans] = await pool.query(
    `SELECT id, code, name, price_monthly, price_yearly, sort_order
     FROM plans WHERE is_active = TRUE`,
  );
  const [planFeatures] = await pool.query(
    "SELECT plan_id, feature_code, limit_value FROM plan_features",
  );

  const catalog = new Map();
  for (const p of plans) {
    catalog.set(p.id, { ...p, features: new Set(), limits: new Map() });
  }
  for (const row of planFeatures) {
    const entry = catalog.get(row.plan_id);
    if (!entry) continue;
    entry.features.add(row.feature_code);
    entry.limits.set(row.feature_code, row.limit_value);
  }

  planCache = catalog;
  catalogLoadedAt = now;
  return catalog;
}

function emptyPlan() {
  return {
    isActive: false,
    isSuperAdmin: false,
    organizationId: null,
    plan: null,
    subscription: null,
    features: new Set(),
    limits: new Map(),
  };
}

// Resuelve el plan efectivo de un usuario: organización → suscripción vigente
// → features y límites del plan. Devuelve un objeto seguro incluso sin acceso.
export async function resolveUserPlan(user) {
  if (!user) return emptyPlan();

  // El super_admin (operador del SaaS) tiene acceso total.
  if (user.role === "super_admin") {
    const catalog = await loadPlanCatalog();
    const all = new Set();
    for (const p of catalog.values()) p.features.forEach((f) => all.add(f));
    return {
      ...emptyPlan(),
      isActive: true,
      isSuperAdmin: true,
      plan: { code: "super_admin", name: "Administración" },
      features: all,
    };
  }

  const [userRows] = await pool.query(
    "SELECT organization_id FROM users WHERE id = ?",
    [user.id],
  );
  const organizationId = userRows[0]?.organization_id || null;
  if (!organizationId) return { ...emptyPlan(), organizationId: null };

  // Suscripción VIGENTE: activa o en prueba, y con periodo no vencido.
  const [subs] = await pool.query(
    `SELECT s.id, s.status, s.billing_cycle, s.amount,
            s.current_period_start, s.current_period_end, s.plan_id,
            p.code AS plan_code, p.name AS plan_name
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.organization_id = ?
       AND s.status IN ('active', 'trialing')
       AND s.current_period_end >= CURDATE()
     ORDER BY s.current_period_end DESC, s.id DESC
     LIMIT 1`,
    [organizationId],
  );
  const sub = subs[0];
  if (!sub) return { ...emptyPlan(), organizationId };

  const catalog = await loadPlanCatalog();
  const entry = catalog.get(sub.plan_id);

  return {
    isActive: true,
    isSuperAdmin: false,
    organizationId,
    plan: { code: sub.plan_code, name: sub.plan_name },
    subscription: sub,
    features: entry ? entry.features : new Set(),
    limits: entry ? entry.limits : new Map(),
  };
}

// Cuenta de usuarios activos de una organización (para límites del plan).
export async function countActiveUsers(organizationId) {
  if (!organizationId) return 0;
  const [[row]] = await pool.query(
    "SELECT COUNT(*) AS total FROM users WHERE organization_id = ? AND is_active = TRUE",
    [organizationId],
  );
  return Number(row.total);
}

// Organización por defecto para peticiones SIN usuario autenticado (p. ej. el
// formulario público de compra). Se cachea porque cambia muy poco.
let defaultOrganizationId;
export async function resolveDefaultOrganizationId() {
  if (defaultOrganizationId !== undefined) return defaultOrganizationId;
  const [[row]] = await pool.query(
    "SELECT id FROM organizations WHERE is_active = TRUE ORDER BY id ASC LIMIT 1",
  );
  defaultOrganizationId = row?.id ?? null;
  return defaultOrganizationId;
}

// preHandler de Fastify: bloquea la ruta si el plan no incluye la feature.
// Responde 402 Payment Required (no 403) porque el motivo es comercial.
export function requireFeature(featureCode) {
  return async function (request, reply) {
    const resolved = await resolveUserPlan(request.user);
    if (resolved.isSuperAdmin || resolved.features.has(featureCode)) return;

    if (!resolved.isActive) {
      return reply.code(402).send({
        error: "Tu cuenta no tiene una suscripción activa",
        code: "NO_SUBSCRIPTION",
        feature: featureCode,
      });
    }
    return reply.code(402).send({
      error: "Tu plan no incluye esta función",
      code: "FEATURE_NOT_INCLUDED",
      feature: featureCode,
      plan: resolved.plan?.code || null,
    });
  };
}
