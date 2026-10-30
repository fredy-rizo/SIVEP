import test from "node:test";
import assert from "node:assert/strict";
import {
  applyStockMovement,
  InventoryError,
} from "../src/services/inventoryService.js";

// Estas validaciones ocurren antes de tocar la base de datos, así que la prueba
// no necesita conexión MySQL.

test("rechaza un tipo de movimiento desconocido", async () => {
  await assert.rejects(
    () =>
      applyStockMovement(
        {},
        {
          organizationId: 1,
          productId: 1,
          movementType: "transferencia",
          quantity: 1,
        },
      ),
    (error) =>
      error instanceof InventoryError &&
      error.statusCode === 400 &&
      error.code === "INVENTORY_ERROR",
  );
});

test("rechaza cantidades negativas o cero en entrada/salida", async () => {
  await assert.rejects(
    () =>
      applyStockMovement(
        {},
        {
          organizationId: 1,
          productId: 1,
          movementType: "salida",
          quantity: -2,
        },
      ),
    (error) => error instanceof InventoryError,
  );

  await assert.rejects(
    () =>
      applyStockMovement(
        {},
        {
          organizationId: 1,
          productId: 1,
          movementType: "entrada",
          quantity: 0,
        },
      ),
    (error) => error instanceof InventoryError,
  );
});
