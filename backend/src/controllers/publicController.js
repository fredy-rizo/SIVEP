import pool from "../config/database.js";
import { publicLeadSchema } from "../validators/index.js";
import { generateInvoiceNumber } from "../utils/helpers.js";
import { generateUniquePickupCode } from "../utils/pickup.js";
import { uploadImage } from "../utils/upload.js";
import dotenv from "dotenv";

dotenv.config();

export async function getPublicProducts(request, reply) {
  try {
    const [products] = await pool.query(
      `SELECT id, name, unit, current_price, current_stock, category, description, image_url
       FROM products 
       WHERE is_active = TRUE AND current_stock > 0
       ORDER BY category, name`,
    );

    return reply.send({ products });
  } catch (error) {
    console.error("Error getting public products:", error);
    return reply.code(500).send({ error: "Error interno del servidor" });
  }
}

export async function createPublicLead(request, reply) {
  const connection = await pool.getConnection();
  try {
    if (!request.isMultipart()) {
      return reply
        .code(400)
        .send({ error: "Debe adjuntar el comprobante de pago" });
    }

    // Recorrer TODAS las partes (campos y archivo) sin importar el orden.
    // IMPORTANTE: el archivo debe consumirse dentro del bucle; si solo se
    // guarda la referencia sin leer el stream, el iterador se queda esperando
    // y la petición se cuelga.
    let proofBuffer = null;
    let proofFilename = "";
    const rawFields = {};
    for await (const part of request.parts()) {
      if (part.file) {
        if (part.fieldname === "proof_file" && !proofBuffer) {
          proofBuffer = await part.toBuffer();
          proofFilename = part.filename;
        } else {
          part.file.resume();
        }
      } else {
        rawFields[part.fieldname] = part.value;
      }
    }

    if (!proofBuffer) {
      return reply.code(400).send({ error: "No se recibió ningún archivo" });
    }

    const document_type = rawFields.document_type || "CC";
    const document_number = (rawFields.document_number || "").trim();
    const fullName = (rawFields.full_name || "").trim();
    const phone = (rawFields.phone || "").trim() || null;
    const email = (rawFields.email || "").trim() || null;

    let items = [];
    const productsRaw = rawFields.products;
    if (productsRaw) {
      try {
        items = JSON.parse(productsRaw);
      } catch (e) {
        return reply
          .code(400)
          .send({ error: "Los productos seleccionados no son válidos" });
      }
    }

    const { error, value } = publicLeadSchema.validate({
      document_type,
      document_number,
      full_name: fullName,
      phone,
      email,
      products: items,
    });
    if (error) {
      return reply.code(400).send({ error: error.details[0].message });
    }

    if (!phone) {
      return reply.code(400).send({ error: "El celular es obligatorio" });
    }

    const dotIndex = proofFilename.lastIndexOf(".");
    const fileExtension = (
      dotIndex >= 0 ? proofFilename.slice(dotIndex) : ""
    ).toLowerCase();
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".pdf"];

    if (!allowedExtensions.includes(fileExtension)) {
      return reply
        .code(400)
        .send({ error: "Formato de archivo no permitido. Use JPG, PNG o PDF" });
    }

    // Se guarda en Cloudinary (con respaldo local si Cloudinary falla)
    const proofImageUrl = await uploadImage(
      proofBuffer,
      proofFilename,
      "sivep/comprobantes",
    );

    await connection.beginTransaction();

    // 1. Buscar o crear el cliente. Se valida por número de documento para no
    // duplicar clientes que ya compraron antes.
    let customerId = null;
    const [byDocument] = await connection.query(
      "SELECT id FROM customers WHERE document_type = ? AND document_number = ?",
      [value.document_type, value.document_number],
    );
    if (byDocument.length > 0) {
      customerId = byDocument[0].id;
    } else {
      const [byNumber] = await connection.query(
        "SELECT id FROM customers WHERE document_number = ?",
        [value.document_number],
      );
      if (byNumber.length > 0) {
        customerId = byNumber[0].id;
      } else if (email) {
        const [byEmail] = await connection.query(
          "SELECT id FROM customers WHERE email = ?",
          [email],
        );
        if (byEmail.length > 0) {
          customerId = byEmail[0].id;
        }
      }
    }

    if (customerId) {
      await connection.query(
        `UPDATE customers SET
           full_name = ?,
           phone = ?,
           email = ?,
           has_payment_proof = TRUE,
           proof_image_url = ?,
           origin = 'formulario_publico'
         WHERE id = ?`,
        [value.full_name, phone, email, proofImageUrl, customerId],
      );
    } else {
      const [result] = await connection.query(
        `INSERT INTO customers (document_type, document_number, full_name, phone, email, origin, has_payment_proof, proof_image_url)
         VALUES (?, ?, ?, ?, ?, 'formulario_publico', TRUE, ?)`,
        [
          value.document_type,
          value.document_number,
          value.full_name,
          phone,
          email,
          proofImageUrl,
        ],
      );
      customerId = result.insertId;
    }

    // 2. Validar productos y stock (se usa el precio actual de la BD)
    let subtotal = 0;
    const saleItems = [];
    for (const item of value.products) {
      const [rows] = await connection.query(
        "SELECT id, name, unit, current_price, current_stock FROM products WHERE id = ? AND is_active = TRUE",
        [item.product_id],
      );
      if (rows.length === 0) {
        throw {
          statusCode: 400,
          message: `El producto seleccionado ya no está disponible`,
        };
      }
      const product = rows[0];
      if (product.current_stock < item.quantity) {
        throw {
          statusCode: 400,
          message: `Stock insuficiente para ${product.name}. Disponible: ${product.current_stock}`,
        };
      }
      const total = Number(product.current_price) * item.quantity;
      subtotal += total;
      saleItems.push({
        product_id: product.id,
        quantity: item.quantity,
        unit_price: Number(product.current_price),
        total,
      });
    }

    // 3. Usuario del sistema para registrar la venta (requerido por FK)
    const [sysUsers] = await connection.query(
      `SELECT id FROM users WHERE is_active = TRUE ORDER BY (role = 'super_admin') DESC, id ASC LIMIT 1`,
    );
    if (sysUsers.length === 0) {
      throw {
        statusCode: 500,
        message: "No hay usuarios activos para registrar la venta",
      };
    }
    const createdBy = sysUsers[0].id;

    // 4. Crear la venta (contado / pendiente de confirmación del pago por el admin)
    const tax = 0;
    const total = subtotal + tax;
    let invoice_number = generateInvoiceNumber();
    let pickup_code = null;
    let saleId = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        pickup_code = await generateUniquePickupCode(connection);
        const [saleResult] = await connection.query(
          `INSERT INTO sales (invoice_number, customer_id, sale_date, subtotal, tax, total, payment_type, payment_status, pickup_code, pickup_status, created_by, notes)
           VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, 'contado', 'pendiente', ?, 'pendiente', ?, ?)`,
          [
            invoice_number,
            customerId,
            subtotal,
            tax,
            total,
            pickup_code,
            createdBy,
            "Venta generada desde el formulario público de compra. Pago pendiente de confirmación.",
          ],
        );
        saleId = saleResult.insertId;
        break;
      } catch (err) {
        if (err.code === "ER_DUP_ENTRY" && attempt < 2) {
          invoice_number = generateInvoiceNumber();
        } else {
          throw err;
        }
      }
    }

    // 5. Items + descuento de stock + movimientos de inventario
    for (const item of saleItems) {
      await connection.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total)
         VALUES (?, ?, ?, ?, ?)`,
        [saleId, item.product_id, item.quantity, item.unit_price, item.total],
      );

      const [prodRows] = await connection.query(
        "SELECT current_stock FROM products WHERE id = ?",
        [item.product_id],
      );
      const previousStock = prodRows[0].current_stock;
      const newStock = previousStock - item.quantity;

      await connection.query(
        "UPDATE products SET current_stock = ? WHERE id = ?",
        [newStock, item.product_id],
      );

      await connection.query(
        `INSERT INTO inventory_movements (product_id, movement_type, quantity, previous_stock, new_stock, reason, reference_type, reference_id, created_by)
         VALUES (?, 'salida', ?, ?, ?, ?, 'venta', ?, ?)`,
        [
          item.product_id,
          item.quantity,
          previousStock,
          newStock,
          `Venta ${invoice_number} (formulario público)`,
          saleId,
          createdBy,
        ],
      );
    }

    await connection.commit();

    return reply.code(201).send({
      message:
        "Formulario enviado correctamente. Nos pondremos en contacto pronto.",
      customer_id: customerId,
      invoice_number,
      pickup_code,
      total,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (e) {
      /* sin transacción activa */
    }
    console.error("Error en lead público:", error);
    if (error.statusCode) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    if (error.code && String(error.code).startsWith("ER_")) {
      return reply
        .code(400)
        .send({ error: error.sqlMessage || "Error en la base de datos" });
    }
    return reply.code(500).send({ error: "Error interno del servidor" });
  } finally {
    connection.release();
  }
}
