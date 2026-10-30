// ============================================================================
// PUBLICACIÓN DE CAMBIOS DE CATÁLOGO — caché + WebSocket en un solo lugar
// ----------------------------------------------------------------------------
// Cada vez que cambia el stock o el catálogo hay que hacer SIEMPRE tres cosas:
//   1. invalidar la caché pública,
//   2. volver a leer la lista vigente,
//   3. emitir `stock:update` a los clientes conectados.
//
// Tenerlo aquí evita olvidos: los controladores solo llaman a una función
// después del commit y no repiten la secuencia en ventas, inventario, pedidos
// vencidos y productos.
// ============================================================================

import { fetchPublicProducts } from "./productCatalog.js";
import {
  invalidatePublicProducts,
  setCachedPublicProducts,
  getCatalogVersion,
} from "./productCache.js";
import { broadcastStockUpdate } from "../realtime/stockHub.js";

// Secuencia por organización para resolver el caso de dos commits casi
// simultáneos: si la publicación más nueva termina antes que la anterior, la
// anterior NO debe sobrescribir la caché ni la lista del cliente con una foto
// más vieja. Solo la publicación más reciente puede enviar la lista completa.
const publishVersions = new Map();

// `changes` describe qué productos se movieron:
//   [{ productId, name, movementType, quantity, previousStock, newStock }]
// El evento incluye además `products` con el catálogo completo ya filtrado por
// stock > 0, para que el cliente pueda reemplazar su lista sin otra petición.
//
// `connection` es opcional: los controladores que acaban de hacer commit pasan
// su conexión para leer la lista sin pedir otra al pool.
export async function publishCatalogUpdate(
  organizationId,
  changes = [],
  { connection = null } = {},
) {
  if (!organizationId) return;

  const key = String(organizationId);
  const version = (publishVersions.get(key) || 0) + 1;
  publishVersions.set(key, version);

  // La invalidación es inmediata: cualquier GET /api/public/products posterior
  // a este punto consulta la base de datos, no una lista vieja.
  invalidatePublicProducts(organizationId);

  let products = null;
  try {
    products = connection
      ? await fetchPublicProducts(organizationId, connection)
      : await fetchPublicProducts(organizationId);
  } catch (error) {
    // Si la lectura falla, el evento igual sale con `changes`; el cliente puede
    // refrescar por HTTP. Nunca se rompe la operación de negocio por esto.
    console.error("[stock] no se pudo refrescar el catálogo público:", error.message);
  }

  // Otra publicación más nueva empezó mientras consultábamos: nuestra foto
  // puede ser anterior a ese commit, así que solo enviamos los cambios.
  const isLatest = version === (publishVersions.get(key) || 0);
  if (products && isLatest) setCachedPublicProducts(organizationId, products);

  broadcastStockUpdate(organizationId, {
    changes,
    products: isLatest ? products : null,
    catalogVersion: getCatalogVersion(key),
    updatedAt: new Date().toISOString(),
  });
}
