import pool from "../config/database.js";
import { productSchema, productUpdateSchema } from "../validators/index.js";
import {
  calculatePagination,
  buildPaginatedResponse,
} from "../utils/helpers.js";
import { uploadImage } from "../utils/upload.js";

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

  let whereClause = "WHERE 1=1";
  const params = [];

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

  return reply.send(
    buildPaginatedResponse(products, countResult[0].total, page, limit),
  );
}

export async function getProductById(request, reply) {
  const { id } = request.params;

  const [products] = await pool.query("SELECT * FROM products WHERE id = ?", [
    id,
  ]);

  if (products.length === 0) {
    return reply.code(404).send({ error: "Producto no encontrado" });
  }

  return reply.send({ product: products[0] });
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
  } = value;

  const [result] = await pool.query(
    `INSERT INTO products (name, unit, current_price, current_stock, min_stock, category, description, image_url, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      unit,
      current_price,
      current_stock || 0,
      min_stock || 0,
      category,
      description || null,
      image_url || null,
      is_active !== false,
    ],
  );

  const [newProduct] = await pool.query("SELECT * FROM products WHERE id = ?", [
    result.insertId,
  ]);

  return reply.code(201).send({ product: newProduct[0] });
}

export async function updateProduct(request, reply) {
  const { error, value } = productUpdateSchema.validate(request.body);
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }

  const { id } = request.params;

  const [existing] = await pool.query("SELECT id FROM products WHERE id = ?", [
    id,
  ]);
  if (existing.length === 0) {
    return reply.code(404).send({ error: "Producto no encontrado" });
  }

  const fields = [];
  const params = [];

  Object.entries(value).forEach(([key, val]) => {
    if (val !== undefined) {
      fields.push(`${key} = ?`);
      params.push(val);
    }
  });

  if (fields.length === 0) {
    return reply.code(400).send({ error: "No hay campos para actualizar" });
  }

  params.push(id);

  await pool.query(
    `UPDATE products SET ${fields.join(", ")} WHERE id = ?`,
    params,
  );

  const [updated] = await pool.query("SELECT * FROM products WHERE id = ?", [
    id,
  ]);

  return reply.send({ product: updated[0] });
}

export async function deleteProduct(request, reply) {
  const { id } = request.params;

  const [existing] = await pool.query(
    "SELECT id, is_active FROM products WHERE id = ?",
    [id],
  );
  if (existing.length === 0) {
    return reply.code(404).send({ error: "Producto no encontrado" });
  }

  await pool.query("UPDATE products SET is_active = FALSE WHERE id = ?", [id]);

  return reply.send({ message: "Producto desactivado correctamente" });
}

export async function getCategories(request, reply) {
  const [categories] = await pool.query(
    "SELECT DISTINCT category FROM products WHERE is_active = TRUE ORDER BY category",
  );
  return reply.send({ categories: categories.map((c) => c.category) });
}
