// Pruebas de la lógica de cupones (funciones puras, sin base de datos).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isCouponApplicable, computeCouponDiscount } from "../src/utils/coupon.js";

const baseCoupon = {
  code: "WELCOME20",
  discount_type: "percent",
  discount_value: 20,
  plan_code: null,
  max_redemptions: null,
  redeemed_count: 0,
  valid_from: null,
  valid_until: null,
  is_active: true,
};

test("cupón percent calcula el descuento", () => {
  assert.equal(computeCouponDiscount(baseCoupon, 550000), 110000);
});

test("cupón fixed resta el valor sin pasar del monto", () => {
  const fixed = { ...baseCoupon, discount_type: "fixed", discount_value: 500000 };
  assert.equal(computeCouponDiscount(fixed, 200000), 200000);
  assert.equal(computeCouponDiscount(fixed, 800000), 500000);
});

test("monto inválido o cupón nulo no descuenta", () => {
  assert.equal(computeCouponDiscount(baseCoupon, 0), 0);
  assert.equal(computeCouponDiscount(null, 1000), 0);
});

test("cupón inactivo no aplica", () => {
  assert.equal(
    isCouponApplicable({ ...baseCoupon, is_active: false }, { planCode: "basic" }),
    false,
  );
});

test("cupón restringido solo aplica a su plan", () => {
  const c = { ...baseCoupon, plan_code: "professional" };
  assert.equal(isCouponApplicable(c, { planCode: "professional" }), true);
  assert.equal(isCouponApplicable(c, { planCode: "basic" }), false);
});

test("cupón fuera de rango de fechas no aplica", () => {
  const c = { ...baseCoupon, valid_from: "2026-01-01", valid_until: "2026-01-31" };
  assert.equal(isCouponApplicable(c, { today: "2025-12-31" }), false);
  assert.equal(isCouponApplicable(c, { today: "2026-01-15" }), true);
  assert.equal(isCouponApplicable(c, { today: "2026-02-01" }), false);
});

test("cupón con tope de canjes agotado no aplica", () => {
  const c = { ...baseCoupon, max_redemptions: 2 };
  assert.equal(isCouponApplicable(c, { redeemedCount: 1 }), true);
  assert.equal(isCouponApplicable(c, { redeemedCount: 2 }), false);
});
