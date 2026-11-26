import pool from "../config/database.js";
import { productSchema, productUpdateSchema } from "../validators/index.js";
import {
  calculatePagination,
  buildPaginatedResponse,
} from "../utils/helpers.js";
import { uploadImage } from "../utils/upload.js";
import { attachVariants } from "../services/productVariants.js";
import { publishCatalogUpdate } from "../services/catalogEvents.js";

// ============================================================================
// CONTROLADOR DE PRODUCTOS — SIVEP
// ----------------------------------------------------------------------------
// Cada alta, edición o desactivación de producto invalida la caché pública y
// emite un evento WebSocket. Sin esto, un producto nuevo podría tardar hasta el
// TTL de la caché en aparecer en el escaparate.
//
// Los precios viven en las PRESENTACIONES (`product_variants`). El producto
// conserva `current_price` solo como valor de referencia para reportes de
// valorización; la venta siempre usa el precio de la presentación elegida.
// ============================================================================

// Crea/actualiza/desactiva las presentaciones enviadas por el panel. No se
// borran filas para no romper el histórico de ventas que las referencia.
async function syncVariants(executor, organizationId, productId, variants) {
  if (!Array.isArray(variants)) return;

  const [existingRows] = await executor.query(
    "SELECT id FROM product_variants WHERE product_id = ? AND organization_id = ?",
    [productId, organizationId],
  );
  const existingIds = new Set(existingRows.map((row) => Number(row.id)));
  const submittedIds = new Set();

  for (const [index, variant] of variants.entries()) {
    const payload = {
      name: variant.name,
      unit_label: variant.unit_label,
      price: variant.price,
      stock_factor: variant.stock_factor ?? 1,
      is_active: variant.is_active !== false,
      sort_order: variant.sort_order ?? index,
    };

    if (variant.id && existingIds.has(Number(variant.id))) {
      submittedIds.add(Number(variant.id));
      await executor.query(
        `UPDATE product_variants
         SET name = ?, unit_label = ?, price = ?, stock_factor = ?,
             is_active = ?, sort_order = ?
         WHERE id = ? AND product_id = ? AND organization_id = ?`,
        [
          payload.name,
          payload.unit_label,
          payload.price,
          payload.stock_factor,
          payload.is_active,
          payload.sort_order,
          variant.id,
          productId,
          organizationId,
        ],
      );
    } else {
      const [result] = await executor.query(
        `INSERT INTO product_variants
           (organization_id, product_id, name, unit_label, price, stock_factor,
            is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          organizationId,
          productId,
          payload.name,
          payload.unit_label,
          payload.price,
          payload.stock_factor,
          payload.is_active,
          payload.sort_order,
        ],
      );
      submittedIds.add(Number(result.insertId));
    }
  }

  for (const id of existingIds) {
    if (!submittedIds.has(id)) {
      await executor.query(
        "UPDATE product_variants SET is_active = FALSE WHERE id = ? AND organization_id = ?",
        [id, organizationId],
      );
    }
  }
}

export async function uploadProductImage(request, reply) {
  if (!request.isMultipart()) {
    return reply.code(400).send({ error: "Debe adjuntar una imagen" });
  }

  // Consumir el archivo dentro del bucle (si no, la petición se cuelga)
  let imgBuffer = null;
  let imgName = "";
  for await (const part of request.parts()) {
    if (part.file) {
      if (!imgBuffer) {
        imgBuffer = await part.toBuffer();
        imgName = part.filename;
      } else {
        part.file.resume();
      }
    }
  }

  if (!imgBuffer) {
    return reply.code(400).send({ error: "No se recibió ninguna imagen" });
  }

  const dotIndex = imgName.lastIndexOf(".");
  const ext = (dotIndex >= 0 ? imgName.slice(dotIndex) : "").toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
    return reply
      .code(400)
      .send({ error: "Formato no permitido. Use JPG, PNG o WEBP" });
  }

  const image_url = await uploadImage(imgBuffer, imgName, "sivep/productos");
  return reply.code(201).send({ image_url });
}

export async function getProducts(request, reply) {
  const { page, limit, offset } = calculatePagination(
    request.query.page,
    request.query.limit,
  );
  const { search, category, is_active, low_stock } = request.query;

  let whereClause = "WHERE organization_id = ?";
  const params = [request.organizationId];

  if (search) {
    whereClause += " AND (name LIKE ? OR description LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  if (category) {
    whereClause += " AND category = ?";
    params.push(category);
  }

  if (is_active === "true" || is_active === "false") {
    whereClause += " AND is_active = ?";
    params.push(is_active === "true");
  }

  if (low_stock === "true") {
    whereClause += " AND current_stock <= min_stock AND is_active = TRUE";
  }

  const [products] = await pool.query(
    `SELECT * FROM products ${whereClause}
     ORDER BY name ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM products ${whereClause}`,
    params,
  );

  const withVariants = await attachVariants(
    pool,
    request.organizationId,
    products,
  );

  return reply.send(
    buildPaginatedResponse(withVariants, countResult[0].total, page, limit),
  );
}

export async function getProductById(request, reply) {
  const { id } = request.params;

  const [products] = await pool.query(
    "SELECT * FROM products WHERE id = ? AND organization_id = ?",
    [id, request.organizationId],
  );

  if (products.length === 0) {
    return reply.code(404).send({ error: "Producto no encontrado" });
  }

  const [product] = await attachVariants(
    pool,
    request.organizationId,
    products,
  );

  return reply.send({ product });
}

export async function createProduct(request, reply) {
  const { error, value } = productSchema.validate(request.body);
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }

  const {
    name,
    unit,
    current_price,
    current_stock,
    min_stock,
    category,
    description,
    image_url,
    is_active,
    variants = [],
  } = value;

  const referencePrice =
    variants.length > 0 ? Number(variants[0].price) : current_price;

  const [result] = await pool.query(
    `INSERT INTO products (organization_id, name, unit, current_price, current_stock, min_stock, category, description, image_url, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      request.organizationId,
      name,
      unit,
      referencePrice,
      current_stock || 0,
      min_stock || 0,
      category,
      description || null,
      image_url || null,
      is_active !== false,
    ],
  );

  // Un producto sin presentaciones explícitas nace con una equivalente a su
  // unidad base, para que sea comprable de inmediato.
  const variantList =
    variants.length > 0
      ? variants
      : [
          {
            name: unit,
            unit_label: unit,
            price: referencePrice,
            stock_factor: 1,
          },
        ];
  await syncVariants(pool, request.organizationId, result.insertId, variantList);

  const [newProduct] = await pool.query(
    "SELECT * FROM products WHERE id = ? AND organization_id = ?",
    [result.insertId, request.organizationId],
  );

  const [created] = await attachVariants(
    pool,
    request.organizationId,
    newProduct,
  );

  // Nuevo producto visible en el catálogo público (si nace con stock > 0).
  await publishCatalogUpdate(request.organizationId, []);

  return reply.code(201).send({ product: created });
}

export async function updateProduct(request, reply) {
  const { error, value } = productUpdateSchema.validate(request.body);
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }

  const { id } = request.params;
  const { variants, ...productFields } = value;

  const [existing] = await pool.query(
    "SELECT id FROM products WHERE id = ? AND organization_id = ?",
    [id, request.organizationId],
  );
  if (existing.length === 0) {
    return reply.code(404).send({ error: "Producto no encontrado" });
  }

  const fields = [];
  const params = [];

  Object.entries(productFields).forEach(([key, val]) => {
    if (val !== undefined) {
      fields.push(`${key} = ?`);
      params.push(val);
    }
  });

  if (fields.length > 0) {
    params.push(id, request.organizationId);

    await pool.query(
      `UPDATE products SET ${fields.join(", ")} WHERE id = ? AND organization_id = ?`,
      params,
    );
  }

  // Actualizar las presentaciones no exige reenviar el producto completo.
  await syncVariants(pool, request.organizationId, id, variants);

  const [updated] = await attachVariants(
    pool,
    request.organizationId,
    (
      await pool.query(
        "SELECT * FROM products WHERE id = ? AND organization_id = ?",
        [id, request.organizationId],
      )
    )[0],
  );

  // Precio, stock, categoría o visibilidad pueden haber cambiado.
  await publishCatalogUpdate(request.organizationId, []);

  return reply.send({ product: updated });
}

export async function deleteProduct(request, reply) {
  const { id } = request.params;

  const [existing] = await pool.query(
    "SELECT id, is_active FROM products WHERE id = ? AND organization_id = ?",
    [id, request.organizationId],
  );
  if (existing.length === 0) {
    return reply.code(404).send({ error: "Producto no encontrado" });
  }

  await pool.query(
    "UPDATE products SET is_active = FALSE WHERE id = ? AND organization_id = ?",
    [id, request.organizationId],
  );

  // Deja de aparecer en el catálogo público de inmediato.
  await publishCatalogUpdate(request.organizationId, []);

  return reply.send({ message: "Producto desactivado correctamente" });
}

export async function getCategories(request, reply) {
  const [categories] = await pool.query(
    "SELECT DISTINCT category FROM products WHERE is_active = TRUE AND organization_id = ? ORDER BY category",
    [request.organizationId],
  );
  return reply.send({ categories: categories.map((c) => c.category) });
}
