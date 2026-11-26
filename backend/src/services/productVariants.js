// ============================================================================
// PRESENTACIONES — resolución de precios y descuento de stock
// ----------------------------------------------------------------------------
// Una línea de venta apunta a una PRESENTACIÓN (`product_variants`), no
// directamente al producto. La presentación define:
//   price       → precio unitario que paga el cliente.
//   stock_factor→ unidades base de inventario que descuenta (cubeta = 1,
//                 media cubeta = 0,5, tarro 465 g = 0,465, kilo = 1).
//
// Los controladores NUNCA aceptan el precio del cliente: lo leen de aquí.
// `resolveSaleItem` devuelve null cuando el producto o la presentación ya no
// está disponible, para que cada flujo decida cómo responder.
// ============================================================================

export function roundStock(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

export function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function lineDescription(productName, variantName) {
  if (!variantName || variantName === productName) return productName;
  return `${productName} - ${variantName}`;
}

const VARIANT_SELECT = `
  SELECT v.id AS variant_id, v.name AS variant_name, v.unit_label,
         v.price, v.stock_factor,
         p.id AS product_id, p.name AS product_name, p.unit AS product_unit
  FROM product_variants v
  JOIN products p ON p.id = v.product_id
`;

// Resuelve una línea { variant_id, quantity } (o { product_id, quantity } para
// clientes antiguos) contra la base de datos.
export async function resolveSaleItem(
  executor,
  organizationId,
  item,
  { allowInactiveProduct = false } = {},
) {
  const quantity = Number(item.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  let rows;
  if (item.variant_id) {
    [rows] = await executor.query(
      `${VARIANT_SELECT}
       WHERE v.id = ? AND v.organization_id = ? AND v.is_active = TRUE
         ${allowInactiveProduct ? "" : "AND p.is_active = TRUE"}`,
      [item.variant_id, organizationId],
    );
  } else if (item.product_id) {
    // Compatibilidad: sin presentación explícita se usa la primera activa.
    [rows] = await executor.query(
      `${VARIANT_SELECT}
       WHERE v.product_id = ? AND v.organization_id = ? AND v.is_active = TRUE
         ${allowInactiveProduct ? "" : "AND p.is_active = TRUE"}
       ORDER BY v.sort_order ASC, v.id ASC
       LIMIT 1`,
      [item.product_id, organizationId],
    );
  } else {
    return null;
  }

  let variant = rows[0];

  // Respaldo: producto sin presentaciones (base recién migrada o alta manual
  // que aún no las definió). Se comporta como una presentación de factor 1.
  if (!variant && item.product_id) {
    const [products] = await executor.query(
      `SELECT id, name, unit, current_price, is_active
       FROM products WHERE id = ? AND organization_id = ?`,
      [item.product_id, organizationId],
    );
    const product = products[0];
    if (!product || (!allowInactiveProduct && !product.is_active)) return null;
    variant = {
      variant_id: null,
      variant_name: product.name,
      unit_label: product.unit,
      price: product.current_price,
      stock_factor: 1,
      product_id: product.id,
      product_name: product.name,
      product_unit: product.unit,
    };
  }

  if (!variant) return null;

  const unitPrice = roundMoney(variant.price);
  const stockFactor = Number(variant.stock_factor) || 0;
  if (stockFactor <= 0) return null;

  return {
    product_id: Number(variant.product_id),
    product_name: variant.product_name,
    variant_id: variant.variant_id ? Number(variant.variant_id) : null,
    variant_name: variant.variant_name,
    unit_label: variant.unit_label,
    description: lineDescription(variant.product_name, variant.variant_name),
    quantity,
    unit_price: unitPrice,
    total: roundMoney(unitPrice * quantity),
    stock_factor: stockFactor,
    stock_quantity: roundStock(quantity * stockFactor),
  };
}

// Carga las presentaciones de varios productos y las deja anidadas para el
// catálogo público y el panel (evita N+1 consultas en el frontend).
export async function attachVariants(executor, organizationId, products) {
  if (!products.length) return products;

  const ids = products.map((product) => Number(product.id));
  const [variants] = await executor.query(
    `SELECT id, product_id, name, unit_label, price, stock_factor, sort_order
     FROM product_variants
     WHERE organization_id = ? AND product_id IN (?) AND is_active = TRUE
     ORDER BY product_id, sort_order, id`,
    [organizationId, ids],
  );

  const byProduct = new Map();
  for (const variant of variants) {
    const key = Number(variant.product_id);
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key).push({
      id: Number(variant.id),
      name: variant.name,
      unit_label: variant.unit_label,
      price: Number(variant.price),
      stock_factor: Number(variant.stock_factor),
    });
  }

  return products.map((product) => {
    const productVariants = byProduct.get(Number(product.id)) || [];
    return {
      ...product,
      units_available: roundStock(product.current_stock),
      variants:
        productVariants.length > 0
          ? productVariants
          : [
              {
                id: null,
                name: product.unit,
                unit_label: product.unit,
                price: Number(product.current_price),
                stock_factor: 1,
              },
            ],
    };
  });
}
