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

    const products = [
      {
        name: "Huevos",
        unit: "docena",
        current_price: 12000.0,
        current_stock: 100,
        min_stock: 20,
        category: "Avícola",
        description: "Huevos frescos de gallinas ponedoras",
        is_active: true,
      },
      {
        name: "Gallinas Ponedoras",
        unit: "unidad",
        current_price: 85000.0,
        current_stock: 50,
        min_stock: 10,
        category: "Avícola",
        description: "Gallinas ponedoras en producción",
        is_active: true,
      },
      {
        name: "Peces",
        unit: "kilogramo",
        current_price: 25000.0,
        current_stock: 200,
        min_stock: 50,
        category: "Piscícola",
        description: "Peces frescos de cultivo",
        is_active: true,
      },
      {
        name: "Miel",
        unit: "litro",
        current_price: 45000.0,
        current_stock: 30,
        min_stock: 10,
        category: "Apícola",
        description: "Miel natural de abejas",
        is_active: true,
      },
      {
        name: "Marranos",
        unit: "unidad",
        current_price: 350000.0,
        current_stock: 15,
        min_stock: 5,
        category: "Porcino",
        description: "Marranos para levante y venta",
        is_active: true,
      },
    ];

    for (const product of products) {
      await connection.query(
        `
        INSERT IGNORE INTO products (name, unit, current_price, current_stock, min_stock, category, description, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
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
