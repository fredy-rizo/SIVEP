// ============================================================================
// CONTROLADOR DE ADMINISTRACIÓN DE MONETIZACIÓN — SIVEP (solo super_admin)
// ----------------------------------------------------------------------------
// Es el "back office" comercial del SaaS. Permite operar TODO el ciclo sin
// pasarela de pago (pago manual):
//   - Organizaciones (cuentas de cliente, multi-tenant).
//   - Suscripciones (asignar/cambiar plan y vigencia).
//   - Pagos/solicitudes (confirmar → activa la suscripción, o rechazar).
//   - Licencias on-premise (emitir con firma y revocar).
//   - Órdenes de servicios de valor agregado (upselling).
//   - Planes (ajustar precios y activar/desactivar).
//
// Principio senior aplicado: toda operación que toca dinero o acceso se hace
// en una TRANSACCIÓN (begin/commit/rollback) para no dejar estados a medias.
// ============================================================================

import pool from "../config/database.js";
import { formatCOP } from "../utils/helpers.js";
import { invalidatePlanCache } from "../middleware/plan.js";
import { generateLicenseKey, verifyLicenseKey } from "../utils/license.js";
import { runLifecycle } from "../services/subscriptionLifecycle.js";
import {
  organizationSchema,
  organizationUpdateSchema,
  subscriptionAdminSchema,
  subscriptionUpdateSchema,
  licenseSchema,
  planUpdateSchema,
  planCreateSchema,
  couponSchema,
  couponUpdateSchema,
  serviceOrderUpdateSchema,
} from "../validators/index.js";

const toDate = (d) => new Date(d).toISOString().split("T")[0];

// Calcula la fecha de fin de periodo a partir del ciclo de facturación.
function periodEndFrom(cycle, explicit) {
  if (explicit) return toDate(explicit);
  const end = new Date();
  if (cycle === "yearly") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return toDate(end);
}

// ---------------------------------------------------------------------------
// Resumen general para el panel.
// ---------------------------------------------------------------------------
export async function getAdminOverview(request, reply) {
  const [[orgs]] = await pool.query(
    "SELECT COUNT(*) AS total, SUM(is_active = TRUE) AS active FROM organizations",
  );
  const [[activeSubs]] = await pool.query(
    `SELECT COUNT(*) AS total FROM subscriptions
     WHERE status IN ('active', 'trialing') AND current_period_end >= CURDATE()`,
  );
  const [[pendingPayments]] = await pool.query(
    "SELECT COUNT(*) AS total FROM payments WHERE status = 'pendiente'",
  );
  const [[activeLicenses]] = await pool.query(
    "SELECT COUNT(*) AS total FROM licenses WHERE status = 'active'",
  );
  const [[openOrders]] = await pool.query(
    "SELECT COUNT(*) AS total FROM service_orders WHERE status IN ('solicitado', 'en_proceso')",
  );
  const [revenue] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS collected FROM payments WHERE status = 'pagado'`,
  );

  return reply.send({
    organizations: { total: Number(orgs.total), active: Number(orgs.active || 0) },
    activeSubscriptions: Number(activeSubs.total),
    pendingPayments: Number(pendingPayments.total),
    activeLicenses: Number(activeLicenses.total),
    openServiceOrders: Number(openOrders.total),
    revenueCollected: Number(revenue[0].collected),
    revenueCollectedFormatted: formatCOP(revenue[0].collected),
  });
}

// ---------------------------------------------------------------------------
// ORGANIZACIONES
// ---------------------------------------------------------------------------
export async function getOrganizations(request, reply) {
  const [rows] = await pool.query(
    `SELECT o.*,
       (SELECT COUNT(*) FROM users u
         WHERE u.organization_id = o.id AND u.is_active = TRUE) AS users_count,
       (SELECT p.code FROM subscriptions s JOIN plans p ON p.id = s.plan_id
         WHERE s.organization_id = o.id AND s.status IN ('active','trialing')
           AND s.current_period_end >= CURDATE()
         ORDER BY s.current_period_end DESC LIMIT 1) AS plan_code,
       (SELECT p.name FROM subscriptions s JOIN plans p ON p.id = s.plan_id
         WHERE s.organization_id = o.id AND s.status IN ('active','trialing')
           AND s.current_period_end >= CURDATE()
         ORDER BY s.current_period_end DESC LIMIT 1) AS plan_name
     FROM organizations o
     ORDER BY o.created_at DESC`,
  );
  return reply.send({ organizations: rows });
}

export async function createOrganization(request, reply) {
  const { error, value } = organizationSchema.validate(request.body);
  if (error) return reply.code(400).send({ error: error.details[0].message });

  const [result] = await pool.query(
    `INSERT INTO organizations
       (name, nit, city, contact_email, contact_phone, notes, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      value.name,
      value.nit || null,
      value.city || null,
      value.contact_email || null,
      value.contact_phone || null,
      value.notes || null,
      value.is_active,
    ],
  );
  const [rows] = await pool.query("SELECT * FROM organizations WHERE id = ?", [
    result.insertId,
  ]);
  return reply.code(201).send({ organization: rows[0] });
}

export async function updateOrganization(request, reply) {
  const { error, value } = organizationUpdateSchema.validate(request.body);
  if (error) return reply.code(400).send({ error: error.details[0].message });

  const fields = [];
  const params = [];
  Object.entries(value).forEach(([key, val]) => {
    if (val !== undefined) {
      fields.push(`${key} = ?`);
      params.push(val);
    }
  });
  params.push(request.params.id);

  const [result] = await pool.query(
    `UPDATE organizations SET ${fields.join(", ")} WHERE id = ?`,
    params,
  );
  if (result.affectedRows === 0) {
    return reply.code(404).send({ error: "Organización no encontrada" });
  }
  const [rows] = await pool.query("SELECT * FROM organizations WHERE id = ?", [
    request.params.id,
  ]);
  return reply.send({ organization: rows[0] });
}

// ---------------------------------------------------------------------------
// SUSCRIPCIONES
// ---------------------------------------------------------------------------
export async function getSubscriptions(request, reply) {
  const [rows] = await pool.query(
    `SELECT s.id, s.status, s.billing_cycle, s.amount,
            s.current_period_start, s.current_period_end, s.created_at,
            o.id AS organization_id, o.name AS organization_name,
            p.code AS plan_code, p.name AS plan_name
     FROM subscriptions s
     JOIN organizations o ON o.id = s.organization_id
     JOIN plans p ON p.id = s.plan_id
     ORDER BY s.created_at DESC`,
  );
  return reply.send({ subscriptions: rows });
}

// Asigna un plan a una organización. Se cancelan las suscripciones vigentes
// previas para mantener UNA sola activa por organización (invariante del modelo).
export async function createSubscription(request, reply) {
  const { error, value } = subscriptionAdminSchema.validate(request.body);
  if (error) return reply.code(400).send({ error: error.details[0].message });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[plan]] = await connection.query(
      "SELECT id, price_monthly, price_yearly FROM plans WHERE code = ? LIMIT 1",
      [value.plan_code],
    );
    if (!plan) {
      await connection.rollback();
      return reply.code(404).send({ error: "Plan no encontrado" });
    }

    await connection.query(
      `UPDATE subscriptions SET status = 'canceled'
       WHERE organization_id = ? AND status IN ('active', 'trialing')`,
      [value.organization_id],
    );

    const amount =
      value.billing_cycle === "yearly" ? plan.price_yearly : plan.price_monthly;
    const [result] = await connection.query(
      `INSERT INTO subscriptions
         (organization_id, plan_id, status, billing_cycle, amount,
          current_period_start, current_period_end, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        value.organization_id,
        plan.id,
        value.status,
        value.billing_cycle,
        amount,
        toDate(new Date()),
        periodEndFrom(value.billing_cycle, value.current_period_end),
        request.user.id,
      ],
    );

    await connection.commit();
    invalidatePlanCache();
    return reply.code(201).send({ subscription: { id: result.insertId } });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function updateSubscription(request, reply) {
  const { error, value } = subscriptionUpdateSchema.validate(request.body);
  if (error) return reply.code(400).send({ error: error.details[0].message });

  const fields = [];
  const params = [];

  if (value.plan_code) {
    const [[plan]] = await pool.query(
      "SELECT id, price_monthly, price_yearly FROM plans WHERE code = ? LIMIT 1",
      [value.plan_code],
    );
    if (!plan) return reply.code(404).send({ error: "Plan no encontrado" });
    fields.push("plan_id = ?");
    params.push(plan.id);
    // Si cambia el plan, se recalcula el valor según el ciclo actual.
    const [[current]] = await pool.query(
      "SELECT billing_cycle FROM subscriptions WHERE id = ?",
      [request.params.id],
    );
    const cycle = value.billing_cycle || current?.billing_cycle || "monthly";
    fields.push("amount = ?");
    params.push(cycle === "yearly" ? plan.price_yearly : plan.price_monthly);
  }

  for (const key of ["billing_cycle", "status"]) {
    if (value[key] !== undefined) {
      fields.push(`${key} = ?`);
      params.push(value[key]);
    }
  }
  if (value.current_period_end !== undefined) {
    fields.push("current_period_end = ?");
    params.push(toDate(value.current_period_end));
  }

  params.push(request.params.id);
  const [result] = await pool.query(
    `UPDATE subscriptions SET ${fields.join(", ")} WHERE id = ?`,
    params,
  );
  if (result.affectedRows === 0) {
    return reply.code(404).send({ error: "Suscripción no encontrada" });
  }
  invalidatePlanCache();
  return reply.send({ message: "Suscripción actualizada" });
}

// ---------------------------------------------------------------------------
// PAGOS / SOLICITUDES
// ---------------------------------------------------------------------------
export async function getPayments(request, reply) {
  const { status } = request.query;
  const where = status ? "WHERE pay.status = ?" : "";
  const params = status ? [status] : [];
  const [rows] = await pool.query(
    `SELECT pay.*, o.name AS organization_name
     FROM payments pay
     JOIN organizations o ON o.id = pay.organization_id
     ${where}
     ORDER BY pay.created_at DESC`,
    params,
  );
  return reply.send({ payments: rows });
}

// Confirma un pago pendiente y ACTIVA la suscripción del plan solicitado.
// Es el corazón del flujo manual: confirmar el pago otorga el acceso.
export async function confirmPayment(request, reply) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[payment]] = await connection.query(
      "SELECT * FROM payments WHERE id = ? FOR UPDATE",
      [request.params.id],
    );
    if (!payment) {
      await connection.rollback();
      return reply.code(404).send({ error: "Pago no encontrado" });
    }
    if (payment.status === "pagado") {
      await connection.rollback();
      return reply.code(409).send({ error: "El pago ya fue confirmado" });
    }

    const [[plan]] = await connection.query(
      "SELECT id, price_monthly, price_yearly FROM plans WHERE code = ? LIMIT 1",
      [payment.plan_code],
    );
    if (!plan) {
      await connection.rollback();
      return reply.code(404).send({ error: "El plan del pago ya no existe" });
    }

    // Cancela la suscripción vigente y crea la nueva ya activa.
    await connection.query(
      `UPDATE subscriptions SET status = 'canceled'
       WHERE organization_id = ? AND status IN ('active', 'trialing')`,
      [payment.organization_id],
    );
    // Se respeta el monto de la solicitud: ya incluye el descuento del cupón
    // (o cualquier ajuste negociado), no se recalcula desde el precio de lista.
    const amount = Number(payment.amount);
    const [subResult] = await connection.query(
      `INSERT INTO subscriptions
         (organization_id, plan_id, status, billing_cycle, amount,
          current_period_start, current_period_end, created_by)
       VALUES (?, ?, 'active', ?, ?, ?, ?, ?)`,
      [
        payment.organization_id,
        plan.id,
        payment.billing_cycle,
        amount,
        toDate(new Date()),
        periodEndFrom(payment.billing_cycle),
        request.user.id,
      ],
    );

    await connection.query(
      `UPDATE payments
       SET status = 'pagado', paid_at = CURRENT_TIMESTAMP,
           subscription_id = ?, amount = ?
       WHERE id = ?`,
      [subResult.insertId, amount, payment.id],
    );

    // Si la solicitud usó un cupón, se registra el uso y se incrementa el
    // contador (dentro de la misma transacción para no descuadrar límites).
    if (payment.coupon_code) {
      const [[coupon]] = await connection.query(
        "SELECT id FROM coupons WHERE code = ? LIMIT 1",
        [payment.coupon_code],
      );
      if (coupon) {
        await connection.query(
          `INSERT INTO coupon_redemptions
             (coupon_id, organization_id, payment_id, amount_discounted)
           VALUES (?, ?, ?, ?)`,
          [
            coupon.id,
            payment.organization_id,
            payment.id,
            Number(payment.discount_amount) || 0,
          ],
        );
        await connection.query(
          "UPDATE coupons SET redeemed_count = redeemed_count + 1 WHERE id = ?",
          [coupon.id],
        );
      }
    }

    await connection.commit();
    invalidatePlanCache();
    return reply.send({
      message: "Pago confirmado y suscripción activada",
      subscriptionId: subResult.insertId,
    });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function rejectPayment(request, reply) {
  const [result] = await pool.query(
    `UPDATE payments SET status = 'rechazado' WHERE id = ? AND status = 'pendiente'`,
    [request.params.id],
  );
  if (result.affectedRows === 0) {
    return reply.code(404).send({ error: "Pago pendiente no encontrado" });
  }
  return reply.send({ message: "Pago rechazado" });
}

// ---------------------------------------------------------------------------
// LICENCIAS ON-PREMISE
// ---------------------------------------------------------------------------
export async function getLicenses(request, reply) {
  const [rows] = await pool.query(
    `SELECT l.*, o.name AS organization_name
     FROM licenses l
     JOIN organizations o ON o.id = l.organization_id
     ORDER BY l.created_at DESC`,
  );
  return reply.send({ licenses: rows });
}

export async function issueLicense(request, reply) {
  const { error, value } = licenseSchema.validate(request.body);
  if (error) return reply.code(400).send({ error: error.details[0].message });

  const [[organization]] = await pool.query(
    "SELECT id FROM organizations WHERE id = ?",
    [value.organization_id],
  );
  if (!organization) {
    return reply.code(404).send({ error: "Organización no encontrada" });
  }
  const [[plan]] = await pool.query("SELECT id FROM plans WHERE code = ?", [
    value.plan_code,
  ]);
  if (!plan) return reply.code(404).send({ error: "Plan no encontrado" });

  // La clave se firma con HMAC: la instalación on-premise la valida offline.
  const licenseKey = generateLicenseKey({
    organizationId: value.organization_id,
    planCode: value.plan_code,
    type: value.type,
    seats: value.seats ?? null,
    expiresAt: value.expires_at ? toDate(value.expires_at) : null,
  });

  const [result] = await pool.query(
    `INSERT INTO licenses
       (organization_id, license_key, plan_code, type, seats, issued_at, expires_at, status, notes)
     VALUES (?, ?, ?, ?, ?, CURDATE(), ?, 'active', ?)`,
    [
      value.organization_id,
      licenseKey,
      value.plan_code,
      value.type,
      value.seats ?? null,
      value.expires_at ? toDate(value.expires_at) : null,
      value.notes || null,
    ],
  );

  const [rows] = await pool.query("SELECT * FROM licenses WHERE id = ?", [
    result.insertId,
  ]);
  return reply.code(201).send({ license: rows[0] });
}

export async function revokeLicense(request, reply) {
  const [result] = await pool.query(
    "UPDATE licenses SET status = 'revoked' WHERE id = ?",
    [request.params.id],
  );
  if (result.affectedRows === 0) {
    return reply.code(404).send({ error: "Licencia no encontrada" });
  }
  return reply.send({ message: "Licencia revocada" });
}

// Utilidad de verificación (p. ej. para soporte: comprobar una clave).
export async function verifyLicense(request, reply) {
  const { key } = request.body || {};
  return reply.send(verifyLicenseKey(key));
}

// ---------------------------------------------------------------------------
// ÓRDENES DE SERVICIOS DE VALOR AGREGADO
// ---------------------------------------------------------------------------
export async function getServiceOrders(request, reply) {
  const [rows] = await pool.query(
    `SELECT so.id, so.status, so.amount, so.notes, so.created_at,
            o.id AS organization_id, o.name AS organization_name,
            sv.id AS service_id, sv.code AS service_code, sv.name AS service_name
     FROM service_orders so
     JOIN organizations o ON o.id = so.organization_id
     JOIN services sv ON sv.id = so.service_id
     ORDER BY so.created_at DESC`,
  );
  return reply.send({ serviceOrders: rows });
}

export async function updateServiceOrder(request, reply) {
  const { error, value } = serviceOrderUpdateSchema.validate(request.body);
  if (error) return reply.code(400).send({ error: error.details[0].message });

  const fields = [];
  const params = [];
  Object.entries(value).forEach(([key, val]) => {
    if (val !== undefined) {
      fields.push(`${key} = ?`);
      params.push(val);
    }
  });
  params.push(request.params.id);

  const [result] = await pool.query(
    `UPDATE service_orders SET ${fields.join(", ")} WHERE id = ?`,
    params,
  );
  if (result.affectedRows === 0) {
    return reply.code(404).send({ error: "Orden de servicio no encontrada" });
  }
  return reply.send({ message: "Orden actualizada" });
}

// ---------------------------------------------------------------------------
// PLANES (ajuste de precios / activación)
// ---------------------------------------------------------------------------
export async function getAdminPlans(request, reply) {
  const [rows] = await pool.query(
    `SELECT id, code, name, description, price_monthly, price_yearly,
            sort_order, is_active
     FROM plans ORDER BY sort_order ASC`,
  );
  return reply.send({ plans: rows });
}

export async function updatePlan(request, reply) {
  const { error, value } = planUpdateSchema.validate(request.body);
  if (error) return reply.code(400).send({ error: error.details[0].message });

  const fields = [];
  const params = [];
  Object.entries(value).forEach(([key, val]) => {
    if (val !== undefined) {
      fields.push(`${key} = ?`);
      params.push(val);
    }
  });
  params.push(request.params.code);

  const [result] = await pool.query(
    `UPDATE plans SET ${fields.join(", ")} WHERE code = ?`,
    params,
  );
  if (result.affectedRows === 0) {
    return reply.code(404).send({ error: "Plan no encontrado" });
  }
  // El catálogo en memoria debe reflejar el cambio de inmediato.
  invalidatePlanCache();
  return reply.send({ message: "Plan actualizado" });
}

// Catálogo completo de features disponibles (para crear planes a medida).
export async function getFeatureCatalog(request, reply) {
  const [rows] = await pool.query(
    `SELECT code, name, category, kind, description, sort_order
     FROM feature_catalog ORDER BY sort_order ASC`,
  );
  return reply.send({ features: rows });
}

// Crea un PLAN A MEDIDA (código, precios, trial y features seleccionadas).
export async function createAdminPlan(request, reply) {
  const { error, value } = planCreateSchema.validate(request.body);
  if (error) return reply.code(400).send({ error: error.details[0].message });

  const [existing] = await pool.query("SELECT id FROM plans WHERE code = ?", [
    value.code,
  ]);
  if (existing.length > 0) {
    return reply.code(409).send({ error: "Ya existe un plan con ese código" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO plans
         (code, name, description, price_monthly, price_yearly, trial_days, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        value.code,
        value.name,
        value.description || null,
        value.price_monthly,
        value.price_yearly,
        value.trial_days,
        value.sort_order,
        value.is_active,
      ],
    );

    const features = value.features || {};
    for (const [featureCode, limitValue] of Object.entries(features)) {
      await connection.query(
        `INSERT INTO plan_features (plan_id, feature_code, limit_value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE limit_value = VALUES(limit_value)`,
        [result.insertId, featureCode, limitValue],
      );
    }

    await connection.commit();
    invalidatePlanCache();
    return reply.code(201).send({ plan: { id: result.insertId, code: value.code } });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// ---------------------------------------------------------------------------
// CUPONES DE DESCUENTO
// ---------------------------------------------------------------------------
export async function getCoupons(request, reply) {
  const [rows] = await pool.query(
    `SELECT c.*,
       (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id = c.id) AS redemptions
     FROM coupons c
     ORDER BY c.created_at DESC`,
  );
  return reply.send({ coupons: rows });
}

export async function createCoupon(request, reply) {
  const { error, value } = couponSchema.validate(request.body);
  if (error) return reply.code(400).send({ error: error.details[0].message });

  if (value.discount_type === "percent" && value.discount_value > 100) {
    return reply
      .code(400)
      .send({ error: "Un descuento porcentual no puede superar 100" });
  }

  const [existing] = await pool.query("SELECT id FROM coupons WHERE code = ?", [
    value.code,
  ]);
  if (existing.length > 0) {
    return reply.code(409).send({ error: "Ya existe un cupón con ese código" });
  }

  const [result] = await pool.query(
    `INSERT INTO coupons
       (code, description, discount_type, discount_value, plan_code,
        max_redemptions, valid_from, valid_until, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      value.code,
      value.description || null,
      value.discount_type,
      value.discount_value,
      value.plan_code || null,
      value.max_redemptions ?? null,
      value.valid_from ? toDate(value.valid_from) : null,
      value.valid_until ? toDate(value.valid_until) : null,
      value.is_active,
    ],
  );
  const [rows] = await pool.query("SELECT * FROM coupons WHERE id = ?", [
    result.insertId,
  ]);
  return reply.code(201).send({ coupon: rows[0] });
}

export async function updateCoupon(request, reply) {
  const { error, value } = couponUpdateSchema.validate(request.body);
  if (error) return reply.code(400).send({ error: error.details[0].message });

  const fields = [];
  const params = [];
  for (const [key, val] of Object.entries(value)) {
    if (val === undefined) continue;
    if (key === "valid_from" || key === "valid_until") {
      fields.push(`${key} = ?`);
      params.push(val ? toDate(val) : null);
    } else {
      fields.push(`${key} = ?`);
      params.push(val);
    }
  }
  params.push(request.params.id);

  const [result] = await pool.query(
    `UPDATE coupons SET ${fields.join(", ")} WHERE id = ?`,
    params,
  );
  if (result.affectedRows === 0) {
    return reply.code(404).send({ error: "Cupón no encontrado" });
  }
  return reply.send({ message: "Cupón actualizado" });
}

// Baja lógica del cupón (se conserva el historial de canjes).
export async function deleteCoupon(request, reply) {
  const [result] = await pool.query(
    "UPDATE coupons SET is_active = FALSE WHERE id = ?",
    [request.params.id],
  );
  if (result.affectedRows === 0) {
    return reply.code(404).send({ error: "Cupón no encontrado" });
  }
  return reply.send({ message: "Cupón desactivado" });
}

// ---------------------------------------------------------------------------
// MÉTRICAS SaaS
// ---------------------------------------------------------------------------
export async function getAdminMetrics(request, reply) {
  // Suscripciones vigentes: base del MRR/ARR.
  const [activeSubs] = await pool.query(
    `SELECT s.organization_id, s.amount, s.billing_cycle, p.code AS plan_code, p.name AS plan_name
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.status IN ('active', 'trialing') AND s.current_period_end >= CURDATE()`,
  );

  // MRR: normaliza el importe anual a mensual.
  let mrr = 0;
  const planCounts = new Map();
  const payingOrgs = new Set();
  for (const s of activeSubs) {
    const monthly = s.billing_cycle === "yearly" ? Number(s.amount) / 12 : Number(s.amount);
    mrr += monthly;
    payingOrgs.add(s.organization_id);
    const key = s.plan_code;
    if (!planCounts.has(key)) {
      planCounts.set(key, { planCode: s.plan_code, planName: s.plan_name, count: 0 });
    }
    planCounts.get(key).count += 1;
  }
  const arr = mrr * 12;
  const arpu = payingOrgs.size > 0 ? mrr / payingOrgs.size : 0;

  const [[trials]] = await pool.query(
    `SELECT COUNT(*) AS total FROM subscriptions
     WHERE status = 'trialing' AND current_period_end >= CURDATE()`,
  );

  // Cancelaciones + vencimientos de los últimos 30 días.
  const [[churned]] = await pool.query(
    `SELECT COUNT(*) AS total FROM subscriptions
     WHERE status IN ('canceled', 'expired')
       AND (canceled_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            OR current_period_end >= DATE_SUB(CURDATE(), INTERVAL 30 DAY))`,
  );
  const churnBase = activeSubs.length + Number(churned.total);
  const churnRate = churnBase > 0 ? (Number(churned.total) / churnBase) * 100 : 0;

  const [[newOrgs]] = await pool.query(
    `SELECT COUNT(*) AS total FROM organizations
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
  );

  const [[collected]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'pagado'`,
  );
  const [[collected30]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
     WHERE status = 'pagado' AND paid_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
  );

  const [byMonth] = await pool.query(
    `SELECT DATE_FORMAT(paid_at, '%Y-%m') AS month, SUM(amount) AS total
     FROM payments
     WHERE status = 'pagado' AND paid_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
     GROUP BY month ORDER BY month ASC`,
  );

  return reply.send({
    mrr: Math.round(mrr),
    mrrFormatted: formatCOP(mrr),
    arr: Math.round(arr),
    arrFormatted: formatCOP(arr),
    arpu: Math.round(arpu),
    arpuFormatted: formatCOP(arpu),
    activeSubscriptions: activeSubs.length,
    payingOrganizations: payingOrgs.size,
    activeTrials: Number(trials.total),
    churnedLast30: Number(churned.total),
    churnRate: Number(churnRate.toFixed(1)),
    newOrganizations30: Number(newOrgs.total),
    revenueCollected: Number(collected.total),
    revenueCollectedFormatted: formatCOP(collected.total),
    revenueLast30: Number(collected30.total),
    revenueLast30Formatted: formatCOP(collected30.total),
    subscriptionsByPlan: [...planCounts.values()],
    revenueByMonth: byMonth.map((m) => ({
      month: m.month,
      total: Number(m.total),
      totalFormatted: formatCOP(m.total),
    })),
  });
}

// Ejecuta manualmente el ciclo de vida de las suscripciones (expirar/cancelar).
export async function runLifecycleNow(request, reply) {
  const result = await runLifecycle();
  return reply.send({
    message: "Ciclo de vida ejecutado",
    ...result,
  });
}
