// ============================================================================
// SERVICIO DE INVENTARIO — operaciones atómicas de stock
// ----------------------------------------------------------------------------
// ¿POR QUÉ existe?
//   Antes cada controlador hacía "leer stock → calcular → escribir stock". Con
//   dos compras simultáneas, ambas leían el mismo valor y la última pisaba a la
//   primera (sobreventa). Aquí la lectura y la escritura ocurren dentro de la
//   MISMA transacción y con la fila bloqueada (`SELECT ... FOR UPDATE`).
//
// ¿CÓMO se usa?
//   - Siempre con una conexión que ya tenga `beginTransaction()`.
//   - `applyStockMovement()` valida, actualiza products y registra el
//     movimiento en inventory_movements. Devuelve un resumen del cambio.
//   - Después del `commit()`, el controlador llama a `publishCatalogUpdate()`
//     para invalidar caché y emitir el evento WebSocket.
//
// TIPOS DE MOVIMIENTO:
//   entrada → suma unidades (compra, devolución).
//   salida  → resta unidades; falla si no alcanza (venta).
//   ajuste  → fija el stock al valor indicado (conteo físico).
// ============================================================================

const MOVEMENT_TYPES = new Set(["entrada", "salida", "ajuste"]);

// Error de negocio con código y status HTTP para que los controladores puedan
// responder 404/409 sin convertir todo en un 500.
export class InventoryError extends Error {
  constructor(message, { statusCode = 400, code = "INVENTORY_ERROR", ...meta } = {}) {
    super(message);
    this.name = "InventoryError";
    this.statusCode = statusCode;
    this.code = code;
    Object.assign(this, meta);
  }
}

// Bloquea la fila del producto durante la transacción. El bloqueo es la pieza
// clave contra compras simultáneas: la segunda transacción espera a que la
// primera confirme y luego lee el stock ya actualizado.
//
// `allowInactive` se usa al devolver stock de un pedido vencido: el producto
// pudo desactivarse después de la compra y aun así hay que devolver unidades.
async function lockProduct(
  connection,
  productId,
  organizationId,
  { allowInactive = false } = {},
) {
  const activeClause = allowInactive ? "" : "AND is_active = TRUE";
  const [rows] = await connection.query(
    `SELECT id, name, current_stock
     FROM products
     WHERE id = ? AND organization_id = ? ${activeClause}
     FOR UPDATE`,
    [productId, organizationId],
  );
  return rows[0] || null;
}

export async function applyStockMovement(
  connection,
  {
    organizationId,
    productId,
    movementType,
    quantity,
    reason,
    referenceType = null,
    referenceId = null,
    createdBy = null,
    allowInactive = false,
  },
) {
  if (!MOVEMENT_TYPES.has(movementType)) {
    throw new InventoryError(`Tipo de movimiento inválido: ${movementType}`);
  }

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty < 0) {
    throw new InventoryError("La cantidad debe ser un número mayor o igual a cero");
  }
  if (movementType !== "ajuste" && qty === 0) {
    throw new InventoryError("La cantidad debe ser mayor a cero");
  }

  const product = await lockProduct(connection, productId, organizationId, {
    allowInactive,
  });
  if (!product) {
    throw new InventoryError("Producto no encontrado o inactivo", {
      statusCode: 404,
      code: "PRODUCT_NOT_FOUND",
    });
  }

  const previousStock = Number(product.current_stock);
  let newStock;

  if (movementType === "entrada") {
    newStock = previousStock + qty;
  } else if (movementType === "salida") {
    if (previousStock < qty) {
      throw new InventoryError(
        `Stock insuficiente para ${product.name}. Disponible: ${previousStock}, Solicitado: ${qty}`,
        {
          statusCode: 409,
          code: "INSUFFICIENT_STOCK",
          productId,
          productName: product.name,
          available: previousStock,
          requested: qty,
        },
      );
    }
    newStock = previousStock - qty;
  } else {
    newStock = qty;
  }

  // La fila ya está bloqueada, así que este UPDATE no puede competir con otra
  // transacción que también esté moviendo el mismo producto.
  await connection.query(
    "UPDATE products SET current_stock = ? WHERE id = ? AND organization_id = ?",
    [newStock, productId, organizationId],
  );

  const [movementResult] = await connection.query(
    `INSERT INTO inventory_movements
       (organization_id, product_id, movement_type, quantity, previous_stock,
        new_stock, reason, reference_type, reference_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      organizationId,
      productId,
      movementType,
      qty,
      previousStock,
      newStock,
      reason || null,
      referenceType,
      referenceId || null,
      createdBy,
    ],
  );

  return {
    movementId: movementResult.insertId,
    productId,
    name: product.name,
    movementType,
    quantity: qty,
    previousStock,
    newStock,
  };
}
