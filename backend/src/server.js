import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./config/database.js";

import authRoutes from "./routes/authRoutes.js";
import usersRoutes from "./routes/usersRoutes.js";
import productsRoutes from "./routes/productsRoutes.js";
import customersRoutes from "./routes/customersRoutes.js";
import salesRoutes from "./routes/salesRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import reportsRoutes from "./routes/reportsRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import cookiesRoutes from "./routes/cookiesRoutes.js";

dotenv.config();

// Sin secreto JWT el servidor no debe arrancar: un valor por defecto público
// permitiría falsificar tokens de sesión.
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET no está configurado en el archivo .env");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({
  logger: true,
  // Necesario detrás de un proxy HTTPS (Nginx) para leer correctamente
  // la IP del cliente (rate-limit) y el protocolo (redirección HTTPS).
  trustProxy: true,
});

async function start() {
  try {
    // CORS restringible por entorno. En producción defina CORS_ORIGIN con los
    // dominios exactos separados por coma; por defecto se permite todo (solo dev).
    const corsOrigin = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
      : true;
    if (corsOrigin === true) {
      fastify.log.warn("CORS permisivo activo: defina CORS_ORIGIN en producción");
    }
    await fastify.register(cors, {
      origin: corsOrigin,
      credentials: true,
    });

    // Cabeceras de seguridad (HSTS, no-sniff, anti-clickjacking, etc.).
    // CSP y CORP se desactivan a propósito: el SPA sirve imágenes de
    // Cloudinary/Unsplash y usa un script inline mínimo para el tema;
    // una CSP estricta rompería esas funciones.
    await fastify.register(helmet, {
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
    });

    // Límite global generoso contra abuso automatizado. El login tiene un
    // límite propio más estricto (ver routes/authRoutes.js).
    await fastify.register(rateLimit, {
      max: 500,
      timeWindow: "1 minute",
    });

    // Parseo de cookies (necesario para leer la preferencia de consentimiento).
    // No crea ni altera ninguna cookie existente: solo habilita request.cookies.
    await fastify.register(cookie);

    // HTTPS forzado solo cuando se activa por entorno (producción detrás de
    // proxy TLS). Apagado por defecto para no romper el desarrollo local.
    if (process.env.FORCE_HTTPS === "true") {
      fastify.addHook("onRequest", async (request, reply) => {
        const proto =
          request.headers["x-forwarded-proto"] || request.protocol;
        if (proto !== "https") {
          return reply.redirect(
            301,
            `https://${request.headers.host}${request.url}`,
          );
        }
      });
    }

    await fastify.register(jwt, {
      secret: process.env.JWT_SECRET,
    });

    await fastify.register(multipart, {
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    });

    await fastify.register(staticPlugin, {
      root: path.join(__dirname, "..", "uploads"),
      prefix: "/uploads/",
      decorateReply: false,
    });

    fastify.decorate("authenticate", async function (request, reply) {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.send(err);
      }
    });

    fastify.register(authRoutes, { prefix: "/api/auth" });
    fastify.register(usersRoutes, { prefix: "/api/users" });
    fastify.register(productsRoutes, { prefix: "/api/products" });
    fastify.register(customersRoutes, { prefix: "/api/customers" });
    fastify.register(salesRoutes, { prefix: "/api/sales" });
    fastify.register(inventoryRoutes, { prefix: "/api/inventory" });
    fastify.register(reportsRoutes, { prefix: "/api/reports" });
    fastify.register(publicRoutes, { prefix: "/api/public" });
    fastify.register(cookiesRoutes, { prefix: "/api/cookies" });

    fastify.get("/api/health", async () => {
      return { status: "ok", timestamp: new Date().toISOString() };
    });

    // Ping liviano anti-suspensión (Render/Aiven): además de responder,
    // ejecuta SELECT 1 para mantener viva una conexión del pool de MySQL.
    fastify.get("/ping", async (request, reply) => {
      try {
        await pool.query("SELECT 1");
        return reply.code(200).send({ status: "ok", message: "Pong!" });
      } catch (error) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ status: "error", message: error.message });
      }
    });

    fastify.setErrorHandler((error, request, reply) => {
      fastify.log.error(error);

      if (error.validation) {
        return reply
          .code(400)
          .send({
            error: "Datos de entrada inválidos",
            details: error.validation,
          });
      }

      if (error.code === "ER_DUP_ENTRY") {
        return reply.code(409).send({ error: "Registro duplicado" });
      }

      if (error.code === "ER_NO_REFERENCED_ROW_2") {
        return reply.code(400).send({ error: "Referencia inválida" });
      }

      return reply.code(500).send({ error: "Error interno del servidor" });
    });

    const port = process.env.PORT || 3000;
    await fastify.listen({ port, host: "0.0.0.0" });

    console.log(`Servidor corriendo en http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
