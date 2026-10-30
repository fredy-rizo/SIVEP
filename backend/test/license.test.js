// Pruebas de la utilidad de licencias on-premise (firma y verificación HMAC).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { generateLicenseKey, verifyLicenseKey } from "../src/utils/license.js";

before(() => {
  process.env.LICENSE_SECRET = "secreto-de-prueba-largo-y-aleatorio";
});

test("una licencia generada se verifica correctamente", () => {
  const key = generateLicenseKey({
    organizationId: 7,
    planCode: "institutional",
    type: "perpetual",
    seats: 10,
    expiresAt: null,
  });

  assert.ok(key.startsWith("SIVEP-"));

  const result = verifyLicenseKey(key);
  assert.equal(result.valid, true);
  assert.equal(result.payload.org, 7);
  assert.equal(result.payload.plan, "institutional");
  assert.equal(result.payload.seats, 10);
});

test("una clave manipulada no verifica (firma inválida)", () => {
  const key = generateLicenseKey({ organizationId: 1, planCode: "basic" });
  const tampered = key.slice(0, -2) + (key.endsWith("aa") ? "bb" : "aa");
  const result = verifyLicenseKey(tampered);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "firma");
});

test("una licencia expirada no verifica", () => {
  const key = generateLicenseKey({
    organizationId: 1,
    planCode: "basic",
    expiresAt: "2000-01-01",
  });
  const result = verifyLicenseKey(key);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "expirada");
});

test("una clave con formato inválido no verifica", () => {
  assert.equal(verifyLicenseKey("no-es-una-licencia").valid, false);
  assert.equal(verifyLicenseKey("").valid, false);
  assert.equal(verifyLicenseKey(null).valid, false);
});
