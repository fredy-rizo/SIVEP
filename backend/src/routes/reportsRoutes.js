import {
  getSalesReport,
  getInventoryReport,
  getCustomersReport,
  exportSalesCSV,
  exportInventoryCSV,
  exportCustomersCSV,
  getSalesForecast,
  getProductAffinity,
  getSalesRate,
  getEoqOptimization,
} from "../controllers/reportsController.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireFeature } from "../middleware/plan.js";

export default async function reportsRoutes(fastify) {
  fastify.get(
    "/sales",
    {
      preHandler: authenticateToken(fastify),
    },
    getSalesReport,
  );

  fastify.get(
    "/inventory",
    {
      preHandler: authenticateToken(fastify),
    },
    getInventoryReport,
  );

  fastify.get(
    "/customers",
    {
      preHandler: authenticateToken(fastify),
    },
    getCustomersReport,
  );

  fastify.get(
    "/sales/export",
    {
      preHandler: authenticateToken(fastify),
    },
    exportSalesCSV,
  );

  fastify.get(
    "/inventory/export",
    {
      preHandler: authenticateToken(fastify),
    },
    exportInventoryCSV,
  );

  fastify.get(
    "/customers/export",
    {
      preHandler: authenticateToken(fastify),
    },
    exportCustomersCSV,
  );

  // Analítica premium: proyecciones por álgebra lineal (plan Profesional+).
  fastify.get(
    "/forecast",
    {
      preHandler: [authenticateToken(fastify), requireFeature("analytics.algebra")],
    },
    getSalesForecast,
  );

  fastify.get(
    "/affinity",
    {
      preHandler: [authenticateToken(fastify), requireFeature("analytics.algebra")],
    },
    getProductAffinity,
  );

  // Cálculo diferencial: velocidad/aceleración de ventas (1ª y 2ª derivada).
  fastify.get(
    "/rate",
    {
      preHandler: [authenticateToken(fastify), requireFeature("analytics.calculus")],
    },
    getSalesRate,
  );

  // Cálculo diferencial: cantidad económica de pedido (óptimo por derivadas).
  fastify.get(
    "/eoq",
    {
      preHandler: [authenticateToken(fastify), requireFeature("analytics.calculus")],
    },
    getEoqOptimization,
  );
}
