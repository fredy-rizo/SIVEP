// ============================================================================
// EMPAREJAMIENTO DE COMPRAS EXTERNAS CON EL INVENTARIO — SIVEP
// ----------------------------------------------------------------------------
// El PDF de la UNAL no siempre trae el nombre exacto del producto: a veces
// describe la compra como "Productos Avicolas" y solo da el valor pagado.
//
// Para poder descontar stock se intenta, en este orden:
//   1. Coincidencia por nombre (exacta o contenida en la descripción).
//   2. Coincidencia por precio: si el valor de la línea es un múltiplo exacto
//      del precio de un único producto, se asume ese producto y esa cantidad.
//   3. Si no hay coincidencia única, NO se descuenta: se deja una advertencia
//      para que el operador ajuste el inventario manualmente.
//
// La cantidad se estima con `valor de la línea / precio del producto`. Así,
// si el PDF trae $24.000 y el producto vale $12.000, se descuentan 2 unidades.
// ============================================================================

import { normalizeText } from "./ecollectReceiptParser.js";

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function clampDescription(value) {
  return String(value || "Compra externa").slice(0, 255);
}

// Devuelve el producto que mejor corresponde a una línea del comprobante.
export function findProductForItem(item = {}, products = []) {
  const description = normalizeText(item.description || "");
  const amount = Number(item.total);

  // 1. Coincidencia por nombre.
  const exact = products.filter(
    (product) => normalizeText(product.name) === description,
  );
  if (exact.length === 1) {
    return { product: exact[0], reason: "nombre" };
  }
  if (exact.length > 1) {
    return { product: null, reason: "ambiguo" };
  }

  const nameMatches = products.filter((product) => {
    const name = normalizeText(product.name);
    if (!name) return false;
    const descriptionHasName =
      name.length >= 3 && description.includes(name);
    const nameHasDescription =
      description.length >= 3 && name.includes(description);
    return descriptionHasName || nameHasDescription;
  });

  if (nameMatches.length === 1) {
    return { product: nameMatches[0], reason: "nombre" };
  }
  if (nameMatches.length > 1) {
    // Si varias descripciones contienen el nombre, se prefiere el más
    // específico (el nombre más largo).
    const sorted = [...nameMatches].sort(
      (a, b) => normalizeText(b.name).length - normalizeText(a.name).length,
    );
    return { product: sorted[0], reason: "nombre" };
  }

  // 2. Coincidencia por precio.
  if (!Number.isFinite(amount) || amount <= 0) {
    return { product: null, reason: "sin_valor" };
  }

  const priceMatches = products.filter((product) => {
    const price = Number(product.current_price);
    if (!Number.isFinite(price) || price <= 0) return false;
    const quantity = amount / price;
    return quantity >= 0.999 && Math.abs(quantity - Math.round(quantity)) < 0.005;
  });

  if (priceMatches.length === 1) {
    return { product: priceMatches[0], reason: "precio" };
  }

  return {
    product: null,
    reason: priceMatches.length > 1 ? "ambiguo" : "sin_coincidencia",
  };
}

// Convierte las líneas del comprobante en líneas de venta y advertencias de
// inventario. No toca la base de datos: solo calcula el plan.
export function buildExternalSalePlan(receipt = {}, products = []) {
  const receiptItems = Array.isArray(receipt.items) ? receipt.items : [];
  const amount = Number(receipt.amount);
  const itemsTotal = roundMoney(
    receiptItems.reduce((sum, item) => sum + Number(item.total || 0), 0),
  );

  // Si la suma de las líneas no coincide con el total pagado (descuentos,
  // redondeos o una tabla incompleta), se usa una sola línea con el total.
  const rawItems =
    receiptItems.length > 0 && Math.abs(itemsTotal - amount) < 0.01
      ? receiptItems
      : [
          {
            description:
              receipt.service_description ||
              receiptItems[0]?.description ||
              "Compra externa",
            quantity: 1,
            unit_price: amount,
            total: amount,
          },
        ];

  const warnings = [];
  const items = rawItems.map((item) => {
    const itemTotal = roundMoney(item.total);
    const match = findProductForItem({ ...item, total: itemTotal }, products);

    if (!match.product) {
      if (match.reason === "ambiguo") {
        warnings.push(
          `No se pudo identificar con certeza el producto de "${clampDescription(
            item.description,
          )}" por ${itemTotal}. Ajusta el inventario manualmente.`,
        );
      } else {
        warnings.push(
          `No se encontró un producto para "${clampDescription(
            item.description,
          )}" por ${itemTotal}. Ajusta el inventario manualmente.`,
        );
      }
      return {
        product_id: null,
        description: clampDescription(item.description),
        quantity: 1,
        unit_price: itemTotal,
        total: itemTotal,
      };
    }

    const price = Number(match.product.current_price);
    let quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
    if (Number.isFinite(price) && price > 0 && itemTotal > 0) {
      quantity = Math.max(1, Math.round(itemTotal / price));
    }

    return {
      product_id: match.product.id,
      description: clampDescription(item.description),
      quantity,
      unit_price: roundMoney(itemTotal / quantity),
      total: itemTotal,
    };
  });

  return { items, warnings };
}
