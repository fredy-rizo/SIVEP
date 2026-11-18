// Pruebas del schema del formulario público de compra EN LÍNEA.
import { test } from "node:test";
import assert from "node:assert/strict";
import { publicLeadSchema } from "../src/validators/index.js";

const validLeadBase = {
  payment_mode: "online",
  accepts_policy: true,
  items: [{ product_id: 1, quantity: 2 }],
};

test("publicLeadSchema acepta pago eCollect con productos seleccionados", async () => {
  const { error } = await publicLeadSchema.validate(validLeadBase);
  assert.ok(!error);
});

test("publicLeadSchema exige al menos un producto", async () => {
  const { error } = await publicLeadSchema.validate({
    ...validLeadBase,
    items: [],
  });
  assert.ok(error);
});

test("publicLeadSchema rechaza cantidades inválidas", async () => {
  const { error } = await publicLeadSchema.validate({
    ...validLeadBase,
    items: [{ product_id: 1, quantity: 0 }],
  });
  assert.ok(error);
});

test("publicLeadSchema rechaza el pago en efectivo (va por solicitud validada)", async () => {
  const { error } = await publicLeadSchema.validate({
    ...validLeadBase,
    payment_mode: "efectivo",
  });
  assert.ok(error);
});

test("publicLeadSchema rechaza payment_mode invalido", async () => {
  const { error } = await publicLeadSchema.validate({
    ...validLeadBase,
    payment_mode: "bogus",
  });
  assert.ok(error);
});

test("publicLeadSchema exige aceptar la política de privacidad", async () => {
  const missing = await publicLeadSchema.validate({
    ...validLeadBase,
    accepts_policy: undefined,
  });
  assert.ok(missing.error);

  const rejected = await publicLeadSchema.validate({
    ...validLeadBase,
    accepts_policy: false,
  });
  assert.ok(rejected.error);
});
