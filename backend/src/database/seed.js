import pool from "../config/database.js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

async function runSeed() {
  const connection = await pool.getConnection();
  try {
    console.log("Iniciando seed de datos...");

    await connection.beginTransaction();

    const hashedPassword = await bcrypt.hash("Sivep2026*Admin", 12);

    await connection.query(
      `
      INSERT IGNORE INTO users (email, password, full_name, role, is_active)
      VALUES (?, ?, ?, ?, ?)
    `,
      [
        "superadmin@sivep.unal.edu.co",
        hashedPassword,
        "Super Administrador",
        "super_admin",
        true,
      ],
    );

    console.log("Super admin creado/verificado");

    // Multi-tenant: los productos semilla pertenecen a la organización por
    // defecto (creada por la migración). Sin organización no se puede sembrar.
    const [orgRows] = await connection.query(
      "SELECT id FROM organizations ORDER BY id ASC LIMIT 1",
    );
    const organizationId = orgRows[0]?.id;
    if (!organizationId) {
      throw new Error(
        "No existe ninguna organización. Ejecute primero 'pnpm run db:migrate' o 'pnpm run db:add-billing'.",
      );
    }

    const products = [
      {
        name: "Huevos",
        unit: "huevo",
        current_price: 400.0,
        current_stock: 3000,
        min_stock: 600,
        category: "Avícola",
        description: "Huevos frescos de gallinas ponedoras",
        is_active: true,
        variants: [
          {
            name: "Cubeta",
            unit_label: "cubeta",
            price: 12000,
            stock_factor: 30,
          },
          {
            name: "Media cubeta",
            unit_label: "media cubeta",
            price: 6000,
            stock_factor: 15,
          },
        ],
      },
      {
        name: "Gallinas Ponedoras",
        unit: "unidad",
        current_price: 25000.0,
        current_stock: 50,
        min_stock: 10,
        category: "Avícola",
        description: "Gallinas ponedoras en producción",
        is_active: true,
        variants: [
          {
            name: "Unidad",
            unit_label: "unidad",
            price: 25000,
            stock_factor: 1,
          },
        ],
      },
      {
        name: "Peces",
        unit: "kg",
        current_price: 12000.0,
        current_stock: 200,
        min_stock: 50,
        category: "Piscícola",
        description: "Cachama fresca de cultivo",
        is_active: true,
        variants: [
          {
            name: "Con escamas",
            unit_label: "kg",
            price: 12000,
            stock_factor: 1,
          },
          {
            name: "Sin escamas",
            unit_label: "kg",
            price: 14000,
            stock_factor: 1,
          },
        ],
      },
      {
        name: "Miel",
        unit: "kg",
        current_price: 45000.0,
        current_stock: 30,
        min_stock: 10,
        category: "Apícola",
        description: "Miel natural de abejas",
        is_active: true,
        variants: [
          {
            name: "Tarro 465 g",
            unit_label: "tarro 465 g",
            price: 22000,
            stock_factor: 0.465,
          },
          {
            name: "Tarro 650 g",
            unit_label: "tarro 650 g",
            price: 30000,
            stock_factor: 0.65,
          },
          { name: "Kilo", unit_label: "kg", price: 45000, stock_factor: 1 },
        ],
      },
      {
        name: "Porcino",
        unit: "unidad",
        current_price: 5000.0,
        current_stock: 15,
        min_stock: 5,
        category: "Porcino",
        description: "Porcino vendido por unidad",
        is_active: true,
        variants: [
          {
            name: "Unidad",
            unit_label: "unidad",
            price: 5000,
            stock_factor: 1,
          },
        ],
      },
    ];

    for (const product of products) {
      await connection.query(
        `
        INSERT IGNORE INTO products (organization_id, name, unit, current_price, current_stock, min_stock, category, description, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          organizationId,
          product.name,
          product.unit,
          product.current_price,
          product.current_stock,
          product.min_stock,
          product.category,
          product.description,
          product.is_active,
        ],
      );

      const [rows] = await connection.query(
        "SELECT id FROM products WHERE organization_id = ? AND name = ? LIMIT 1",
        [organizationId, product.name],
      );
      if (rows.length === 0) continue;

      const [existingVariants] = await connection.query(
        "SELECT id FROM product_variants WHERE product_id = ? LIMIT 1",
        [rows[0].id],
      );
      if (existingVariants.length > 0) continue;

      for (const [index, variant] of product.variants.entries()) {
        await connection.query(
          `INSERT INTO product_variants
             (organization_id, product_id, name, unit_label, price, stock_factor, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            organizationId,
            rows[0].id,
            variant.name,
            variant.unit_label,
            variant.price,
            variant.stock_factor,
            index,
          ],
        );
      }
    }

    console.log("Productos base creados/verificados");

    await connection.commit();
    console.log("Seed completado exitosamente");
  } catch (error) {
    await connection.rollback();
    console.error("Error en seed:", error);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

runSeed().catch(console.error);
