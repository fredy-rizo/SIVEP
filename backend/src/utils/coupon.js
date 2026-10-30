// ============================================================================
// UTILIDADES DE CUPONES — SIVEP
// ----------------------------------------------------------------------------
// Lógica PURA (sin base de datos) para poder probarla con `node --test`.
// El controlador se encarga de traer el cupón; aquí se decide si aplica y
// cuánto descuenta.
// ============================================================================

function isoDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

// ¿El cupón es válido para este plan y esta fecha de hoy?
export function isCouponApplicable(
  coupon,
  { planCode = null, today = new Date(), redeemedCount = 0 } = {},
) {
  if (!coupon) return false;
  if (coupon.is_active === false || coupon.is_active === 0) return false;

  // Restringido a un plan concreto.
  if (coupon.plan_code && coupon.plan_code !== planCode) return false;

  const day = isoDate(today);
  const from = isoDate(coupon.valid_from);
  const until = isoDate(coupon.valid_until);
  if (from && day < from) return false;
  if (until && day > until) return false;

  const max = coupon.max_redemptions;
  if (max !== null && max !== undefined && Number(redeemedCount) >= Number(max)) {
    return false;
  }
  return true;
}

// Descuento en pesos para un monto dado. `percent` usa discount_value como
// porcentaje (0-100); `fixed` como valor absoluto. Nunca supera el monto.
export function computeCouponDiscount(coupon, amount) {
  const base = Number(amount);
  if (!coupon || !Number.isFinite(base) || base <= 0) return 0;

  const value = Number(coupon.discount_value) || 0;
  let discount =
    coupon.discount_type === "percent" ? Math.round((base * value) / 100) : value;

  if (discount < 0) discount = 0;
  if (discount > base) discount = base;
  return discount;
}
