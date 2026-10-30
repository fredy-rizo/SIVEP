// ============================================================================
// CICLO DE VIDA DE LAS SUSCRIPCIONES — SIVEP
// ----------------------------------------------------------------------------
// ¿POR QUÉ existe?
//   Una suscripción no cambia de estado "sola": si el periodo vence y nadie la
//   toca, el sistema seguiría dando acceso a funciones premium indefinidamente.
//   Este servicio aplica las TRANSICIONES de estado de forma controlada:
//
//     active/past_due vencida  → 'expired'   (se acaba el periodo)
//     active con cancelación  → 'canceled'  (el cliente pidió cancelar)
//     trialing vencida        → 'expired'   (terminó la prueba)
//
// ¿CÓMO se ejecuta?
//   - `runLifecycle()` se invoca:
//       · al arrancar el servidor,
//       · cada 6 horas mediante un temporizador liviano (no bloquea el proceso),
//       · a demanda desde el panel de administración.
//   Es idempotente: repetirla no cambia nada si no hay nada que cambiar.
// ============================================================================

import pool from "../config/database.js";
import { invalidatePlanCache } from "../middleware/plan.js";

const SCHEDULE_MS = 6 * 60 * 60 * 1000; // 6 horas

// Aplica todas las transiciones de estado vencidas. Devuelve cuántas filas
// cambiaron por tipo (útil para logs y para el panel admin).
export async function runLifecycle() {
  // 1) Cancelaciones programadas al final del periodo.
  const [canceled] = await pool.query(
    `UPDATE subscriptions
     SET status = 'canceled', canceled_at = CURRENT_TIMESTAMP
     WHERE cancel_at_period_end = TRUE
       AND status IN ('active', 'trialing')
       AND current_period_end < CURDATE()`,
  );

  // 2) Suscripciones activas con pago pendiente y periodo vencido.
  const [expired] = await pool.query(
    `UPDATE subscriptions
     SET status = 'expired'
     WHERE status IN ('active', 'past_due')
       AND cancel_at_period_end = FALSE
       AND current_period_end < CURDATE()`,
  );

  // 3) Pruebas vencidas.
  const [trials] = await pool.query(
    `UPDATE subscriptions
     SET status = 'expired'
     WHERE status = 'trialing'
       AND cancel_at_period_end = FALSE
       AND current_period_end < CURDATE()`,
  );

  const result = {
    canceled: canceled.affectedRows || 0,
    expired: expired.affectedRows || 0,
    trialsExpired: trials.affectedRows || 0,
  };
  const total = result.canceled + result.expired + result.trialsExpired;
  // Si cambió el acceso de alguna organización, el catálogo cacheado debe
  // refrescarse para que el gating (402) sea inmediato.
  if (total > 0) invalidatePlanCache();
  return result;
}

// Marca una suscripción para cancelarse al final del periodo (no corta el
// acceso de inmediato: el cliente conserva lo que ya pagó).
export async function scheduleCancellation(organizationId) {
  const [result] = await pool.query(
    `UPDATE subscriptions
     SET cancel_at_period_end = TRUE
     WHERE organization_id = ?
       AND status IN ('active', 'trialing')
       AND cancel_at_period_end = FALSE`,
    [organizationId],
  );
  return result.affectedRows || 0;
}

// Deshace la cancelación programada mientras el periodo siga vigente.
export async function resumeSubscription(organizationId) {
  const [result] = await pool.query(
    `UPDATE subscriptions
     SET cancel_at_period_end = FALSE
     WHERE organization_id = ?
       AND status IN ('active', 'trialing')
       AND cancel_at_period_end = TRUE`,
    [organizationId],
  );
  return result.affectedRows || 0;
}

let timer = null;

// Arranca el temporizador periódico. `unref()` evita que el proceso quede vivo
// solo por este intervalo (importante al cerrar el servidor).
export function startSubscriptionLifecycle() {
  if (timer) return;
  const tick = async () => {
    try {
      const res = await runLifecycle();
      const total = res.canceled + res.expired + res.trialsExpired;
      if (total > 0) {
        console.log(
          `[suscripciones] ciclo de vida: ${res.canceled} canceladas, ` +
            `${res.expired} vencidas, ${res.trialsExpired} pruebas expiradas`,
        );
      }
    } catch (error) {
      console.error("[suscripciones] error en el ciclo de vida:", error.message);
    }
  };
  // Una pasada al arrancar y luego cada SCHEDULE_MS.
  tick();
  timer = setInterval(tick, SCHEDULE_MS);
  if (timer.unref) timer.unref();
}
