import {
  getPublicPlans,
  getMyPlan,
  requestPlanChange,
  requestService,
  cancelMySubscription,
  resumeMySubscription,
  getMyInvoices,
} from "../controllers/billingController.js";
import { authenticateToken } from "../middleware/auth.js";

export default async function billingRoutes(fastify) {
  const auth = authenticateToken(fastify);

  // Catálogo abierto: alimenta la página pública de precios.
  fastify.get("/plans", getPublicPlans);

  // Plan, features, límites y uso de la organización del usuario.
  fastify.get("/me", { preHandler: auth }, getMyPlan);

  // Historial de facturas/pagos de la organización.
  fastify.get("/invoices", { preHandler: auth }, getMyInvoices);

  // Solicitud de cambio/ascenso de plan (pago manual), con cupón opcional.
  fastify.post("/request", { preHandler: auth }, requestPlanChange);

  // Solicitud de un servicio de valor agregado (upselling).
  fastify.post("/service-request", { preHandler: auth }, requestService);

  // Autoservicio del ciclo de vida de la suscripción.
  fastify.post("/subscription/cancel", { preHandler: auth }, cancelMySubscription);
  fastify.post("/subscription/resume", { preHandler: auth }, resumeMySubscription);
}
