// ============================================================================
// CONTROLADOR DE FACTURACIÓN / PLANES — SIVEP
// ----------------------------------------------------------------------------
// Expone la información comercial que consumen el frontend y los clientes:
//   - `getPublicPlans`   → catálogo público de planes y servicios (pricing).
//   - `getMyPlan`        → plan, features, límites y uso de la organización.
//   - `requestPlanChange`→ registra una SOLICITUD de cambio de plan (pago
//                          manual: un asesor confirma y activa en el panel).
//
// En esta fase el cobro es MANUAL (sin pasarela). La tabla `payments` guarda
// tanto solicitudes ('pendiente') como pagos confirmados ('pagado'), y ya
// contempla `method`/`gateway_ref` para la futura integración (fase 6).
// ============================================================================

import pool from "../config/database.js";
import { formatCOP } from "../utils/helpers.js";
import { resolveUserPlan, countActiveUsers } from "../middleware/plan.js";
import {
  billingRequestSchema,
  serviceRequestSchema,
} from "../validators/index.js";
import { isCouponApplicable, computeCouponDiscount } from "../utils/coupon.js";
import {
  scheduleCancellation,
  resumeSubscription,
} from "../services/subscriptionLifecycle.js";

// Catálogo público de planes + servicios de valor agregado. Sin autenticación:
// alimenta la página de precios abierta al público.
export async function getPublicPlans(request, reply) {
  const [plans] = await pool.query(
    `SELECT id, code, name, description, price_monthly, price_yearly, sort_order
     FROM plans WHERE is_active = TRUE ORDER BY sort_order ASC`,
  );
  const [planFeatures] = await pool.query(
    `SELECT pf.plan_id, pf.feature_code, pf.limit_value,
            fc.name, fc.category, fc.kind, fc.description AS feature_description,
            fc.sort_order
     FROM plan_features pf
     JOIN feature_catalog fc ON fc.code = pf.feature_code
     ORDER BY fc.sort_order ASC`,
  );
  const [services] = await pool.query(
    `SELECT code, name, description, price
     FROM services WHERE is_active = TRUE ORDER BY sort_order ASC`,
  );

  const featuresByPlan = new Map();
  for (const row of planFeatures) {
    if (!featuresByPlan.has(row.plan_id)) featuresByPlan.set(row.plan_id, []);
    featuresByPlan.get(row.plan_id).push({
      code: row.feature_code,
      name: row.name,
      category: row.category,
      kind: row.kind,
      description: row.feature_description,
      limit: row.limit_value,
    });
  }

  const shapedPlans = plans.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    sortOrder: p.sort_order,
    priceMonthly: Number(p.price_monthly),
    priceMonthlyFormatted: formatCOP(p.price_monthly),
    priceYearly: Number(p.price_yearly),
    priceYearlyFormatted: formatCOP(p.price_yearly),
    features: featuresByPlan.get(p.id) || [],
  }));

  return reply.send({
    plans: shapedPlans,
    services: services.map((s) => ({
      code: s.code,
      name: s.name,
      description: s.description,
      price: Number(s.price),
      priceFormatted: formatCOP(s.price),
    })),
  });
}

// Plan actual de la organización del usuario autenticado: features, límites,
// uso (nº de usuarios) y cualquier solicitud de cambio pendiente.
export async function getMyPlan(request, reply) {
  const resolved = await resolveUserPlan(request.user);

  let organization = null;
  let usageUsers = 0;
  let pendingRequest = null;
  let serviceOrders = [];
  let subscriptionRow = null;

  if (resolved.organizationId) {
    const [orgRows] = await pool.query(
      `SELECT id, name, nit, city, contact_email, contact_phone
       FROM organizations WHERE id = ?`,
      [resolved.organizationId],
    );
    organization = orgRows[0] || null;
    usageUsers = await countActiveUsers(resolved.organizationId);

    // Suscripción vigente con columnas de ciclo de vida (cancelación/trial).
    const [subRows] = await pool.query(
      `SELECT status, billing_cycle, amount, current_period_start,
              current_period_end, cancel_at_period_end, canceled_at, trial_ends_at
       FROM subscriptions
       WHERE organization_id = ?
         AND status IN ('active', 'trialing')
         AND current_period_end >= CURDATE()
       ORDER BY current_period_end DESC, id DESC
       LIMIT 1`,
      [resolved.organizationId],
    );
    subscriptionRow = subRows[0] || null;

    const [pending] = await pool.query(
      `SELECT id, plan_code, billing_cycle, amount, reference, status, created_at
       FROM payments
       WHERE organization_id = ? AND status = 'pendiente'
       ORDER BY id DESC LIMIT 1`,
      [resolved.organizationId],
    );
    const p = pending[0];
    if (p) {
      pendingRequest = {
        id: p.id,
        planCode: p.plan_code,
        billingCycle: p.billing_cycle,
        amount: Number(p.amount),
        amountFormatted: formatCOP(p.amount),
        reference: p.reference,
        status: p.status,
        createdAt: p.created_at,
      };
    }

    // Órdenes de servicios solicitadas por la organización (upselling).
    const [orders] = await pool.query(
      `SELECT so.id, so.status, so.amount, so.created_at,
              sv.code AS service_code, sv.name AS service_name
       FROM service_orders so
       JOIN services sv ON sv.id = so.service_id
       WHERE so.organization_id = ?
       ORDER BY so.created_at DESC`,
      [resolved.organizationId],
    );
    serviceOrders = orders.map((o) => ({
      id: o.id,
      serviceCode: o.service_code,
      serviceName: o.service_name,
      status: o.status,
      amount: Number(o.amount),
      amountFormatted: formatCOP(o.amount),
      createdAt: o.created_at,
    }));
  }

  const sub = subscriptionRow || resolved.subscription;
  return reply.send({
    organization,
    plan: resolved.plan,
    isActive: resolved.isActive,
    isSuperAdmin: resolved.isSuperAdmin,
    subscription: sub
      ? {
          status: sub.status,
          billingCycle: sub.billing_cycle,
          amount: Number(sub.amount),
          amountFormatted: formatCOP(sub.amount),
          currentPeriodStart: sub.current_period_start,
          currentPeriodEnd: sub.current_period_end,
          cancelAtPeriodEnd: !!sub.cancel_at_period_end,
          canceledAt: sub.canceled_at || null,
          trialEndsAt: sub.trial_ends_at || null,
        }
      : null,
    features: [...resolved.features],
    limits: {
      // null = ilimitado. Sin límite definido se asume ilimitado.
      users: resolved.limits.has("limit.users")
        ? resolved.limits.get("limit.users")
        : null,
    },
    usage: { users: usageUsers },
    pendingRequest,
    serviceOrders,
  });
}

// Registra una solicitud de cambio/ascenso de plan. Con pago manual, queda
// 'pendiente' hasta que el super_admin confirme el pago y active la suscripción.
export async function requestPlanChange(request, reply) {
  const { error, value } = billingRequestSchema.validate(request.body);
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }

  const resolved = await resolveUserPlan(request.user);
  if (resolved.isSuperAdmin || !resolved.organizationId) {
    return reply.code(400).send({
      error: "Solo una cuenta de organización puede solicitar un cambio de plan",
    });
  }

  const [plans] = await pool.query(
    "SELECT id, code, price_monthly, price_yearly FROM plans WHERE code = ? AND is_active = TRUE",
    [value.plan_code],
  );
  if (plans.length === 0) {
    return reply.code(404).send({ error: "Plan no encontrado" });
  }
  const plan = plans[0];
  const baseAmount = Number(
    value.billing_cycle === "yearly" ? plan.price_yearly : plan.price_monthly,
  );

  // Cupón opcional: se valida y se calcula el descuento ANTES de registrar.
  let coupon = null;
  let discount = 0;
  let amount = baseAmount;
  if (value.coupon_code) {
    const code = String(value.coupon_code).trim().toUpperCase();
    const [couponRows] = await pool.query(
      "SELECT * FROM coupons WHERE code = ? LIMIT 1",
      [code],
    );
    const found = couponRows[0];
    if (!found) {
      return reply.code(404).send({ error: "El cupón no existe" });
    }
    if (
      !isCouponApplicable(found, {
        planCode: value.plan_code,
        today: new Date(),
        redeemedCount: Number(found.redeemed_count) || 0,
      })
    ) {
      return reply
        .code(422)
        .send({ error: "El cupón no es válido para este plan o ya expiró" });
    }
    discount = computeCouponDiscount(found, baseAmount);
    amount = baseAmount - discount;
    coupon = found;
  }

  // Evita duplicar una solicitud idéntica todavía sin resolver.
  const [duplicate] = await pool.query(
    `SELECT id FROM payments
     WHERE organization_id = ? AND plan_code = ? AND billing_cycle = ?
       AND status = 'pendiente' LIMIT 1`,
    [resolved.organizationId, value.plan_code, value.billing_cycle],
  );
  if (duplicate.length > 0) {
    return reply
      .code(409)
      .send({ error: "Ya tienes una solicitud pendiente para este plan" });
  }

  const reference = `SOL-${Date.now().toString(36).toUpperCase()}`;
  const [result] = await pool.query(
    `INSERT INTO payments
       (organization_id, plan_code, billing_cycle, amount, method, status,
        reference, coupon_code, discount_amount, notes, created_by)
     VALUES (?, ?, ?, ?, 'manual', 'pendiente', ?, ?, ?, ?, ?)`,
    [
      resolved.organizationId,
      value.plan_code,
      value.billing_cycle,
      amount,
      reference,
      coupon ? coupon.code : null,
      discount,
      value.notes || null,
      request.user.id,
    ],
  );

  return reply.code(201).send({
    message:
      "Solicitud registrada. Un asesor te contactará para completar el pago y la activación.",
    request: {
      id: result.insertId,
      planCode: value.plan_code,
      billingCycle: value.billing_cycle,
      baseAmount,
      baseAmountFormatted: formatCOP(baseAmount),
      discount,
      discountFormatted: formatCOP(discount),
      couponCode: coupon ? coupon.code : null,
      amount,
      amountFormatted: formatCOP(amount),
      reference,
      status: "pendiente",
    },
  });
}

// Solicita un servicio de valor agregado (implementación/capacitación,
// migración de datos, etc.). Queda como orden 'solicitado' para que el
// super_admin la gestione desde el panel de monetización.
export async function requestService(request, reply) {
  const { error, value } = serviceRequestSchema.validate(request.body);
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }

  const resolved = await resolveUserPlan(request.user);
  if (resolved.isSuperAdmin || !resolved.organizationId) {
    return reply.code(400).send({
      error: "Solo una cuenta de organización puede solicitar servicios",
    });
  }

  const [services] = await pool.query(
    "SELECT id, code, name, price FROM services WHERE code = ? AND is_active = TRUE",
    [value.service_code],
  );
  if (services.length === 0) {
    return reply.code(404).send({ error: "Servicio no encontrado" });
  }
  const service = services[0];

  // Evita solicitudes duplicadas del mismo servicio mientras esté en curso.
  const [duplicate] = await pool.query(
    `SELECT id FROM service_orders
     WHERE organization_id = ? AND service_id = ?
       AND status IN ('solicitado', 'en_proceso') LIMIT 1`,
    [resolved.organizationId, service.id],
  );
  if (duplicate.length > 0) {
    return reply
      .code(409)
      .send({ error: "Ya tienes una solicitud en curso para este servicio" });
  }

  const [result] = await pool.query(
    `INSERT INTO service_orders
       (organization_id, service_id, status, amount, notes, created_by)
     VALUES (?, ?, 'solicitado', ?, ?, ?)`,
    [
      resolved.organizationId,
      service.id,
      service.price,
      value.notes || null,
      request.user.id,
    ],
  );

  return reply.code(201).send({
    message:
      "Solicitud de servicio registrada. Un asesor te contactará para coordinar.",
    order: {
      id: result.insertId,
      serviceCode: service.code,
      serviceName: service.name,
      amount: Number(service.price),
      amountFormatted: formatCOP(service.price),
      status: "solicitado",
    },
  });
}

// ---------------------------------------------------------------------------
// AUTOSERVICIO: cancelar, reactivar y consultar facturas de la organización.
// ---------------------------------------------------------------------------

// Cancela al FINAL del periodo (no corta el acceso de inmediato).
export async function cancelMySubscription(request, reply) {
  const resolved = await resolveUserPlan(request.user);
  if (resolved.isSuperAdmin || !resolved.organizationId) {
    return reply.code(400).send({
      error: "Solo una cuenta de organización puede gestionar su suscripción",
    });
  }

  const changed = await scheduleCancellation(resolved.organizationId);
  if (!changed) {
    return reply
      .code(404)
      .send({ error: "No hay una suscripción activa para cancelar" });
  }

  const [rows] = await pool.query(
    `SELECT current_period_end FROM subscriptions
     WHERE organization_id = ? AND cancel_at_period_end = TRUE
       AND status IN ('active', 'trialing')
     ORDER BY current_period_end DESC LIMIT 1`,
    [resolved.organizationId],
  );

  return reply.send({
    message:
      "Tu suscripción se cancelará al final del periodo actual. Puedes reactivarla antes de esa fecha.",
    cancelAtPeriodEnd: true,
    currentPeriodEnd: rows[0]?.current_period_end || null,
  });
}

// Reactiva una suscripción cuya cancelación aún no se ha hecho efectiva.
export async function resumeMySubscription(request, reply) {
  const resolved = await resolveUserPlan(request.user);
  if (resolved.isSuperAdmin || !resolved.organizationId) {
    return reply.code(400).send({
      error: "Solo una cuenta de organización puede gestionar su suscripción",
    });
  }

  const changed = await resumeSubscription(resolved.organizationId);
  if (!changed) {
    return reply
      .code(404)
      .send({ error: "No hay una cancelación programada para reactivar" });
  }

  return reply.send({
    message: "Tu suscripción seguirá activa. Cancelación deshecha.",
    cancelAtPeriodEnd: false,
  });
}

// Historial de pagos/solicitudes (facturas) de la organización.
export async function getMyInvoices(request, reply) {
  const resolved = await resolveUserPlan(request.user);
  if (!resolved.organizationId) {
    return reply.send({ invoices: [] });
  }

  const [rows] = await pool.query(
    `SELECT id, plan_code, billing_cycle, amount, discount_amount, coupon_code,
            status, reference, paid_at, created_at
     FROM payments
     WHERE organization_id = ?
     ORDER BY created_at DESC
     LIMIT 100`,
    [resolved.organizationId],
  );

  return reply.send({
    invoices: rows.map((r) => ({
      id: r.id,
      planCode: r.plan_code,
      billingCycle: r.billing_cycle,
      amount: Number(r.amount),
      amountFormatted: formatCOP(r.amount),
      discount: Number(r.discount_amount),
      discountFormatted: formatCOP(r.discount_amount),
      couponCode: r.coupon_code,
      status: r.status,
      reference: r.reference,
      paidAt: r.paid_at,
      createdAt: r.created_at,
    })),
  });
}
