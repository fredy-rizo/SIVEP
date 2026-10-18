import {
  getPublicPlans,
  getMyPlan,
  requestPlanChange,
  requestService,
} from "../controllers/billingController.js";
import { authenticateToken } from "../middleware/auth.js";

export default async function billingRoutes(fastify) {
  // Catálogo abierto: alimenta la página pública de precios.
  fastify.get("/plans", getPublicPlans);

  // Plan, features, límites y uso de la organización del usuario.
  fastify.get(
    "/me",
    { preHandler: authenticateToken(fastify) },
    getMyPlan,
  );

  // Solicitud de cambio/ascenso de plan (pago manual).
  fastify.post(
    "/request",
    { preHandler: authenticateToken(fastify) },
    requestPlanChange,
  );

  // Solicitud de un servicio de valor agregado (upselling).
  fastify.post(
    "/service-request",
    { preHandler: authenticateToken(fastify) },
    requestService,
  );
}
