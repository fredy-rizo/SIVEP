import test from "node:test";
import assert from "node:assert/strict";
import {
  getCachedPublicProducts,
  getCatalogVersion,
  setCachedPublicProducts,
  setCachedPublicProductsIfCurrent,
  invalidatePublicProducts,
} from "../src/services/productCache.js";

test("la caché guarda y devuelve la lista por organización", () => {
  const products = [{ id: 1, name: "Huevos", current_stock: 10 }];

  assert.equal(getCachedPublicProducts(99), null);
  setCachedPublicProducts(99, products);

  assert.deepEqual(getCachedPublicProducts(99), products);
  // Otra organización no ve la entrada de la primera.
  assert.equal(getCachedPublicProducts(100), null);

  invalidatePublicProducts(99);
  assert.equal(getCachedPublicProducts(99), null);
});

test("invalidar sin organización limpia toda la caché", () => {
  setCachedPublicProducts(1, [{ id: 1 }]);
  setCachedPublicProducts(2, [{ id: 2 }]);

  invalidatePublicProducts();

  assert.equal(getCachedPublicProducts(1), null);
  assert.equal(getCachedPublicProducts(2), null);
});

test("una lectura obsoleta no pisa la caché después de invalidar", () => {
  const version = getCatalogVersion(88);
  setCachedPublicProducts(88, [{ id: 1, current_stock: 99 }]);

  // Una venta invalida la caché mientras la lectura anterior estaba en vuelo.
  invalidatePublicProducts(88);
  setCachedPublicProducts(88, [{ id: 1, current_stock: 50 }]);

  // La lectura vieja intenta guardar su foto: debe rechazarse.
  const applied = setCachedPublicProductsIfCurrent(
    88,
    [{ id: 1, current_stock: 99 }],
    version,
  );

  assert.equal(applied, false);
  assert.equal(getCachedPublicProducts(88)[0].current_stock, 50);
});
