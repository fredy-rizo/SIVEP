// Pruebas del emparejamiento de compras externas con el inventario.
// El comprobante de la UNAL suele traer descripciones genéricas; el valor
// pagado es la pista que permite identificar el producto.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findProductForItem,
  buildExternalSalePlan,
} from "../src/utils/externalSaleMatching.js";

const products = [
  {
    id: 1,
    name: "Huevos",
    current_price: "12000.00",
    current_stock: 100,
  },
  {
    id: 2,
    name: "Gallinas Ponedoras",
    current_price: "85000.00",
    current_stock: 50,
  },
  {
    id: 3,
    name: "Peces",
    current_price: "25000.00",
    current_stock: 200,
  },
  {
    id: 4,
    name: "Miel",
    current_price: "45000.00",
    current_stock: 30,
  },
  {
    id: 5,
    name: "Porcino",
    current_price: "350000.00",
    current_stock: 15,
  },
];

test("encuentra el producto por nombre exacto", () => {
  const match = findProductForItem(
    { description: "Huevos", total: 12000 },
    products,
  );
  assert.equal(match.product?.id, 1);
  assert.equal(match.reason, "nombre");
});

test("encuentra el producto cuando el nombre está dentro de la descripción", () => {
  const match = findProductForItem(
    { description: "Docena de huevos campesinos", total: 12000 },
    products,
  );
  assert.equal(match.product?.id, 1);
  assert.equal(match.reason, "nombre");
});

test("encuentra el producto por precio cuando la descripción es genérica", () => {
  const match = findProductForItem(
    { description: "Productos Avicolas", total: 12000 },
    products,
  );
  assert.equal(match.product?.id, 1);
  assert.equal(match.reason, "precio");
});

test("detecta ambigüedad cuando el valor es múltiplo de varios productos", () => {
  // $300.000 = 25 docenas de huevos o 12 kg de peces.
  const match = findProductForItem(
    { description: "Productos Agropecuarios", total: 300000 },
    products,
  );
  assert.equal(match.product, null);
  assert.equal(match.reason, "ambiguo");
});

test("no inventa un producto cuando el valor no coincide con ningún precio", () => {
  const match = findProductForItem(
    { description: "Productos Agropecuarios", total: 99000 },
    products,
  );
  assert.equal(match.product, null);
  assert.equal(match.reason, "sin_coincidencia");
});

test("arma una línea vinculada y calcula la cantidad por precio", () => {
  const plan = buildExternalSalePlan(
    {
      amount: 24000,
      items: [{ description: "Productos Avicolas", total: 24000 }],
    },
    products,
  );

  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].product_id, 1);
  assert.equal(plan.items[0].quantity, 2);
  assert.equal(plan.items[0].unit_price, 12000);
  assert.equal(plan.warnings.length, 0);
});

test("maneja compras de varios productos a la vez", () => {
  const plan = buildExternalSalePlan(
    {
      amount: 74000,
      items: [
        { description: "Productos Avicolas", total: 24000 },
        { description: "Productos Agropecuarios", total: 50000 },
      ],
    },
    products,
  );

  assert.equal(plan.items.length, 2);
  assert.equal(plan.items[0].product_id, 1);
  assert.equal(plan.items[0].quantity, 2);
  assert.equal(plan.items[1].product_id, 3);
  assert.equal(plan.items[1].quantity, 2);
  assert.equal(plan.warnings.length, 0);
});

test("deja advertencia y no vincula producto cuando hay ambigüedad", () => {
  const plan = buildExternalSalePlan(
    {
      amount: 300000,
      items: [{ description: "Productos Agropecuarios", total: 300000 }],
    },
    products,
  );

  assert.equal(plan.items[0].product_id, null);
  assert.equal(plan.items[0].quantity, 1);
  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0], /No se pudo identificar/);
});

test("usa el total pagado cuando las líneas no suman el comprobante", () => {
  const plan = buildExternalSalePlan(
    {
      amount: 12000,
      service_description: "Productos Avicolas",
      items: [{ description: "Productos Avicolas", total: 10000 }],
    },
    products,
  );

  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].total, 12000);
  assert.equal(plan.items[0].product_id, 1);
  assert.equal(plan.items[0].quantity, 1);
});

test("registra el total como línea externa si no hay ítems", () => {
  const plan = buildExternalSalePlan(
    { amount: 50000, service_description: "Compra en línea", items: [] },
    products,
  );

  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].description, "Compra en línea");
  assert.equal(plan.items[0].total, 50000);
  assert.equal(plan.items[0].product_id, 3);
  assert.equal(plan.items[0].quantity, 2);
});
