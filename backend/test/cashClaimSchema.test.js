// Pruebas de los schemas de solicitudes de compra en efectivo.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cashClaimSchema,
  cashClaimRejectSchema,
} from "../src/validators/index.js";

const validClaim = {
  cash_receipt_code: "CAJA-12345",
  document_type: "CC",
  document_number: "12345678",
  full_name: "Juan Pérez",
  phone: "3001234567",
  email: "juan@example.com",
  purchase_date: "2025-01-15",
  declared_total: 24000,
  notes: "",
  accepts_policy: true,
  items: [{ product_id: 1, quantity: 2 }],
};

test("cashClaimSchema acepta una solicitud completa", async () => {
  const { error } = await cashClaimSchema.validate(validClaim);
  assert.ok(!error);
});

test("cashClaimSchema exige el código de caja", async () => {
  const { error } = await cashClaimSchema.validate({
    ...validClaim,
    cash_receipt_code: "",
  });
  assert.ok(error);
});

test("cashClaimSchema exige al menos un producto", async () => {
  const { error } = await cashClaimSchema.validate({
    ...validClaim,
    items: [],
  });
  assert.ok(error);
});

test("cashClaimSchema rechaza cantidades no positivas", async () => {
  for (const quantity of [0, -1, 1.5]) {
    const { error } = await cashClaimSchema.validate({
      ...validClaim,
      items: [{ product_id: 1, quantity }],
    });
    assert.ok(error, `cantidad ${quantity} debería ser inválida`);
  }
});

test("cashClaimSchema rechaza una fecha de compra futura", async () => {
  const { error } = await cashClaimSchema.validate({
    ...validClaim,
    purchase_date: "2999-01-01",
  });
  assert.ok(error);
});

test("cashClaimSchema exige aceptar la política de privacidad", async () => {
  const missing = await cashClaimSchema.validate({
    ...validClaim,
    accepts_policy: undefined,
  });
  assert.ok(missing.error);

  const rejected = await cashClaimSchema.validate({
    ...validClaim,
    accepts_policy: false,
  });
  assert.ok(rejected.error);
});

test("cashClaimRejectSchema exige un motivo claro", async () => {
  const empty = await cashClaimRejectSchema.validate({ reason: "" });
  assert.ok(empty.error);

  const valid = await cashClaimRejectSchema.validate({
    reason: "El recibo no coincide con los productos declarados",
  });
  assert.ok(!valid.error);
});
