// ============================================================================
// CACHÉ EN MEMORIA DEL CATÁLOGO PÚBLICO — SIVEP
// ----------------------------------------------------------------------------
// ¿POR QUÉ existe?
//   El escaparate público se consulta muchas más veces que las veces que cambia
//   el inventario. Guardar la lista unos segundos reduce la carga de MySQL y
//   hace que la primera pintura del formulario sea inmediata.
//
// ¿CÓMO se mantiene fresca?
//   - TTL corto como red de seguridad (PUBLIC_PRODUCTS_CACHE_MS, 15 s).
//   - Invalidación explícita desde `publishCatalogUpdate()` en cada cambio de
//     stock o de catálogo. Esa invalidación ocurre ANTES de emitir el evento
//     WebSocket, así que la siguiente lectura HTTP ya ve datos nuevos.
//
// NOTA DE ESCALADO: esta caché vive en el proceso. Si algún día se levantan
// varias instancias del backend, habrá que sustituirla por Redis y publicar
// los eventos por pub/sub para que todas las instancias invaliden a la vez.
// ============================================================================

const TTL_MS = Number(process.env.PUBLIC_PRODUCTS_CACHE_MS || 15_000);

// Map<string, { products: Array, expiresAt: number }>
const store = new Map();

// Versión por organización. Se incrementa al invalidar y sirve para descartar
// escrituras de una lectura que empezó antes de un cambio (race cache-aside).
const versions = new Map();

export function getCatalogVersion(organizationId) {
  return versions.get(String(organizationId)) || 0;
}

// Devuelve la lista cacheada o null si no existe / ya expiró.
export function getCachedPublicProducts(organizationId) {
  const key = String(organizationId);
  const entry = store.get(key);
  if (!entry) return null;

  if (Date.now() >= entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.products;
}

// Guarda una lista recién consultada y devuelve la misma lista para encadenar.
export function setCachedPublicProducts(organizationId, products) {
  store.set(String(organizationId), {
    products,
    expiresAt: Date.now() + TTL_MS,
  });
  return products;
}

// Variante segura para cache-aside: solo guarda si la versión no cambió entre
// el inicio de la consulta y su escritura. Así una lectura lenta no pisa datos
// más nuevos publicados por una venta concurrente.
export function setCachedPublicProductsIfCurrent(
  organizationId,
  products,
  expectedVersion,
) {
  if (getCatalogVersion(organizationId) !== expectedVersion) return false;
  setCachedPublicProducts(organizationId, products);
  return true;
}

// Borra la entrada de una organización (o toda la caché si no se indica).
// Invalidar también sube la versión: cualquier lectura en curso queda marcada
// como obsoleta y no podrá volver a escribir la lista vieja.
export function invalidatePublicProducts(organizationId) {
  if (organizationId === undefined || organizationId === null) {
    store.clear();
    versions.clear();
    return;
  }
  const key = String(organizationId);
  store.delete(key);
  versions.set(key, (versions.get(key) || 0) + 1);
}
