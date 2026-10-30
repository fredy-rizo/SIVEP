// ============================================================================
// REDUCCIÓN DE EVENTOS DE STOCK — utilidades compartidas del frontend
// ----------------------------------------------------------------------------
// El servidor puede enviar el catálogo completo (`products`) o solo los cambios
// (`changes`, cuando no pudo refrescar la lista). Esta función deja ambos casos
// en un único formato: la lista de productos ya actualizada y sin agotados.
// ============================================================================

export function mergeStockUpdate(previous, message) {
  if (Array.isArray(message?.products)) {
    return message.products;
  }

  if (!Array.isArray(message?.changes)) {
    return previous;
  }

  const changesById = new Map();
  for (const change of message.changes) {
    if (change?.productId !== undefined) {
      changesById.set(change.productId, change);
    }
  }

  return previous
    .map((product) => {
      const change = changesById.get(product.id);
      return change ? { ...product, current_stock: change.newStock } : product;
    })
    .filter((product) => Number(product.current_stock) > 0);
}
