// ============================================================================
// HUB WEBSOCKET DE STOCK EN TIEMPO REAL — SIVEP
// ----------------------------------------------------------------------------
// ¿POR QUÉ existe?
//   Cuando dos personas compran casi al mismo tiempo, la segunda debe ver el
//   stock que dejó la primera sin recargar la página. El hub mantiene una sala
//   por organización y empuja el catálogo actualizado a todos los clientes
//   conectados (público y personal interno).
//
// ¿CÓMO funciona?
//   1. El cliente abre `GET /ws` (opcionalmente con `?token=<jwt>`).
//   2. El servidor resuelve la organización: del token si es interno, o la
//      organización pública por defecto si es un visitante.
//   3. El socket entra en la sala `org:<id>`.
//   4. `broadcastStockUpdate()` envía `stock:update` a esa sala cuando una
//      venta, un movimiento de inventario o un pedido vencido cambian el stock.
//
// SEGURIDAD: el cliente NO elige la organización; la impone el servidor. Así
// nadie puede suscribirse a los datos de otra organización enviando un id.
// ============================================================================

import websocket from "@fastify/websocket";
import jwt from "jsonwebtoken";
import { resolveDefaultOrganizationId } from "../middleware/plan.js";

const HEARTBEAT_MS = 30_000;
const MAX_PAYLOAD_BYTES = 1 * 1024 * 1024;

// Map<string, Set<WebSocket>>: una sala por organización.
const rooms = new Map();
let heartbeatTimer = null;

function roomKey(organizationId) {
  return String(organizationId);
}

function addToRoom(organizationId, socket) {
  const key = roomKey(organizationId);
  if (!rooms.has(key)) rooms.set(key, new Set());
  rooms.get(key).add(socket);
}

function removeFromRoom(organizationId, socket) {
  const key = roomKey(organizationId);
  const room = rooms.get(key);
  if (!room) return;

  room.delete(socket);
  if (room.size === 0) rooms.delete(key);
}

// Envía un mensaje solo a sockets abiertos. Un socket que falla se ignora:
// nunca debe romper la operación de negocio que originó el evento.
function safeSend(socket, message) {
  if (socket.readyState !== 1 /* OPEN */) return false;
  try {
    socket.send(message);
    return true;
  } catch {
    return false;
  }
}

// Invalida la caché y avisa a los clientes. Lo llaman los servicios de stock
// DESPUÉS del commit, para que nadie reciba datos que luego se revierten.
export function broadcastStockUpdate(organizationId, payload = {}) {
  const room = rooms.get(roomKey(organizationId));
  if (!room || room.size === 0) return 0;

  const message = JSON.stringify({
    type: "stock:update",
    organizationId: Number(organizationId),
    ...payload,
  });

  let delivered = 0;
  for (const socket of room) {
    if (safeSend(socket, message)) delivered += 1;
  }
  return delivered;
}

// Datos útiles para /api/health: cuántos clientes hay escuchando por sala.
export function getRealtimeStats() {
  const channels = {};
  let total = 0;
  for (const [key, room] of rooms) {
    channels[key] = room.size;
    total += room.size;
  }
  return { totalConnections: total, channels };
}

// Extrae el JWT del query string (el navegador no permite cabeceras propias en
// WebSocket) o del header Authorization cuando lo envía un cliente no browser.
function extractToken(request) {
  const fromQuery = request.query?.token;
  if (fromQuery) return String(fromQuery);

  const header = request.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.slice(7);
  return null;
}

// Resuelve la sala del socket. Los visitantes anónimos solo pueden escuchar el
// catálogo público de la organización por defecto.
async function resolveConnectionContext(request) {
  const token = extractToken(request);

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.organization_id) {
        return { organizationId: decoded.organization_id, channel: "internal" };
      }
    } catch {
      // Token inválido o vencido: se degrada a la sala pública en lugar de
      // cerrar la conexión, para que el escaparate siga funcionando.
    }
  }

  const organizationId = await resolveDefaultOrganizationId();
  return { organizationId, channel: "public" };
}

// Registra el plugin y la ruta /ws. Se llama una sola vez desde server.js.
export async function registerStockHub(fastify) {
  await fastify.register(websocket, {
    options: { maxPayload: MAX_PAYLOAD_BYTES },
  });

  fastify.get(
    "/ws",
    {
      websocket: true,
      config: { rateLimit: false },
      // No registrar la URL de la conexión: en navegadores el JWT viaja en el
      // query string (?token=...) y no queremos que quede en los logs.
      logLevel: "warn",
    },
    (socket, request) => {
      // El handler debe enganchar los eventos de forma síncrona (documentación
      // de @fastify/websocket). La resolución asíncrona del contexto continúa
      // después de registrar los listeners.
      socket._sivepAlive = true;
      socket.on("pong", () => {
        socket._sivepAlive = true;
      });

      // El cliente puede mandar {"type":"ping"} para comprobar el canal.
      socket.on("message", (raw) => {
        try {
          const message = JSON.parse(raw.toString());
          if (message?.type === "ping") {
            safeSend(socket, JSON.stringify({ type: "pong", at: Date.now() }));
          }
        } catch {
          // Mensaje malformado: se ignora sin cerrar la conexión.
        }
      });

      socket.on("error", (error) => {
        request.log.debug({ err: error }, "websocket stock hub error");
      });

      resolveConnectionContext(request)
        .then(({ organizationId, channel }) => {
          if (!organizationId) {
            socket.close(1011, "No hay una organización activa");
            return;
          }

          addToRoom(organizationId, socket);

          const cleanup = () => removeFromRoom(organizationId, socket);
          socket.on("close", cleanup);
          socket.on("error", cleanup);

          safeSend(
            socket,
            JSON.stringify({
              type: "connected",
              channel,
              organizationId: Number(organizationId),
            }),
          );

          request.log.debug(
            { channel, organizationId },
            "cliente conectado al hub de stock",
          );
        })
        .catch((error) => {
          request.log.error({ err: error }, "no se pudo autenticar el websocket");
          socket.close(1011, "Error de conexión");
        });
    },
  );

  // Heartbeat: descarta conexiones que dejaron de responder (red móvil, laptop
  // suspendida…). Sin esto, las salas se llenarían de sockets zombis.
  heartbeatTimer = setInterval(() => {
    for (const room of rooms.values()) {
      for (const socket of room) {
        if (socket._sivepAlive === false) {
          socket.terminate();
          continue;
        }
        socket._sivepAlive = false;
        try {
          socket.ping();
        } catch {
          socket.terminate();
        }
      }
    }
  }, HEARTBEAT_MS);

  if (heartbeatTimer.unref) heartbeatTimer.unref();

  // Al apagar el servidor se cierran los canales y se libera el intervalo.
  fastify.addHook("onClose", async () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    for (const room of rooms.values()) {
      for (const socket of room) {
        try {
          socket.close(1001, "Servidor apagándose");
        } catch {
          /* socket ya cerrado */
        }
      }
    }
    rooms.clear();
  });
}
