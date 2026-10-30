// ============================================================================
// CICLO DE VIDA DE PEDIDOS PENDIENTES (pago en efectivo) — SIVEP
// ----------------------------------------------------------------------------
// ¿POR QUÉ existe?
//   Un pedido creado con pago en efectivo queda 'pendiente' hasta que se
//   confirme. Si pasan N días sin pago, el pedido se considera vencido: se
//   devuelve el stock y se marca 'vencido'. Las compras externas (PDF de la
//   UNAL) ya nacen pagadas, así que este ciclo no las toca.
//
// CÓMO funciona:
//   - `runPendingOrdersLifecycle()` busca pedidos con payment_mode = 'efectivo',
//     payment_status = 'pendiente' y pickup_status = 'pendiente' vencidos
//     (sale_date anterior a N días, default 3).
//   - Por cada pedido vencido, dentro de una transacción con la venta bloqueada,
//     devuelve el stock con `applyStockMovement` ('entrada') y marca la venta
//     como 'vencido'.
//   - Al confirmar, invalida la caché y emite `stock:update` por WebSocket.
//   - Es idempotente: si otra ejecución ya procesó el pedido, la segunda no
//     encuentra la venta pendiente y no devuelve el stock dos veces.
// ============================================================================

import pool from "../config/database.js";
import { applyStockMovement } from "./inventoryService.js";
import { publishCatalogUpdate } from "./catalogEvents.js";

const SCHEDULE_MS = 24 * 60 * 60 * 1000; // 1 día
export const PENDING_ORDERS_DAYS = Number(process.env.PENDING_ORDERS_DAYS || 3);

// Procesa cada pedido vencido en su propia transacción:
//   1. bloquea la venta para que dos instancias no la procesen a la vez,
//   2. devuelve el stock con `applyStockMovement` (entrada atómica),
//   3. marca la venta como 'vencido',
//   4. después del commit publica el cambio por WebSocket.
export async function runPendingOrdersLifecycle() {
  const [expired] = await pool.query(
    `SELECT s.id, s.invoice_number, s.organization_id, s.created_by, s.sale_date
     FROM sales s
     WHERE s.payment_mode = 'efectivo'
       AND s.payment_status = 'pendiente'
       AND s.pickup_status = 'pendiente'
       AND s.sale_date < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)
     ORDER BY s.sale_date ASC
     LIMIT 100`,
    [PENDING_ORDERS_DAYS],
  );

  let released = 0;
  let processed = 0;

  for (const sale of expired) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Bloqueo de la venta: solo la transacción que la toma puede devolver su
      // stock. La segunda espera y, al no encontrarla pendiente, no hace nada.
      const [locked] = await connection.query(
        `SELECT id FROM sales
         WHERE id = ? AND payment_mode = 'efectivo' AND payment_status = 'pendiente'
         FOR UPDATE`,
        [sale.id],
      );
      if (locked.length === 0) {
        await connection.rollback();
        continue;
      }

      const [items] = await connection.query(
        `SELECT si.product_id, si.quantity
         FROM sale_items si
         JOIN products p ON p.id = si.product_id
         WHERE si.sale_id = ?`,
        [sale.id],
      );

      // Mismo orden de bloqueo que ventas e inventario: menos deadlocks.
      items.sort((a, b) => a.product_id - b.product_id);

      const changes = [];
      for (const item of items) {
        const change = await applyStockMovement(connection, {
          organizationId: sale.organization_id,
          productId: item.product_id,
          movementType: "entrada",
          quantity: item.quantity,
          reason: `Devolución por vencimiento del pedido ${sale.invoice_number}`,
          referenceType: "venta",
          referenceId: sale.id,
          createdBy: sale.created_by,
          allowInactive: true,
        });
        changes.push(change);
        released += 1;
      }

      await connection.query(
        "UPDATE sales SET payment_status = 'vencido' WHERE id = ?",
        [sale.id],
      );

      await connection.commit();
      processed += 1;

      await publishCatalogUpdate(sale.organization_id, changes, { connection });
    } catch (error) {
      await connection.rollback();
      console.error(
        `[pedidos] no se pudo vencer el pedido ${sale.invoice_number}:`,
        error.message,
      );
    } finally {
      connection.release();
    }
  }

  return { released, processed };
}

let timer = null;

// Arranca el temporizador periódico. `unref()` evita que el proceso quede vivo
// solo por este intervalo (importante al cerrar el servidor).
export function startPendingOrdersLifecycle() {
  if (timer) return;
  const tick = async () => {
    try {
      const result = await runPendingOrdersLifecycle();
      if (result.processed > 0) {
        console.log(
          `[pedidos] ciclo de vida: ${result.processed} pedido(s) vencido(s), ${result.released} item(s) con stock devuelto`,
        );
      }
    } catch (error) {
      console.error("[pedidos] error en el ciclo de vida:", error.message);
    }
  };
  // Una pasada al arrancar y luego periódicamente.
  tick();
  timer = setInterval(tick, SCHEDULE_MS);
  if (timer.unref) timer.unref();
}
