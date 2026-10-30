import {
  getAdminOverview,
  getAdminMetrics,
  getOrganizations,
  createOrganization,
  updateOrganization,
  getSubscriptions,
  createSubscription,
  updateSubscription,
  getPayments,
  confirmPayment,
  rejectPayment,
  getLicenses,
  issueLicense,
  revokeLicense,
  verifyLicense,
  getServiceOrders,
  updateServiceOrder,
  getAdminPlans,
  updatePlan,
  createAdminPlan,
  getFeatureCatalog,
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  runLifecycleNow,
} from "../controllers/adminBillingController.js";
import { authenticateToken, requireRole } from "../middleware/auth.js";

// Todo el back office comercial exige autenticación + rol super_admin.
export default async function adminBillingRoutes(fastify) {
  const superAdmin = [authenticateToken(fastify), requireRole("super_admin")];

  fastify.get("/overview", { preHandler: superAdmin }, getAdminOverview);
  fastify.get("/metrics", { preHandler: superAdmin }, getAdminMetrics);

  // Organizaciones
  fastify.get("/organizations", { preHandler: superAdmin }, getOrganizations);
  fastify.post("/organizations", { preHandler: superAdmin }, createOrganization);
  fastify.put("/organizations/:id", { preHandler: superAdmin }, updateOrganization);

  // Suscripciones
  fastify.get("/subscriptions", { preHandler: superAdmin }, getSubscriptions);
  fastify.post("/subscriptions", { preHandler: superAdmin }, createSubscription);
  fastify.patch("/subscriptions/:id", { preHandler: superAdmin }, updateSubscription);
  fastify.post("/subscriptions/run-lifecycle", { preHandler: superAdmin }, runLifecycleNow);

  // Pagos / solicitudes
  fastify.get("/payments", { preHandler: superAdmin }, getPayments);
  fastify.post("/payments/:id/confirm", { preHandler: superAdmin }, confirmPayment);
  fastify.post("/payments/:id/reject", { preHandler: superAdmin }, rejectPayment);

  // Cupones de descuento
  fastify.get("/coupons", { preHandler: superAdmin }, getCoupons);
  fastify.post("/coupons", { preHandler: superAdmin }, createCoupon);
  fastify.patch("/coupons/:id", { preHandler: superAdmin }, updateCoupon);
  fastify.delete("/coupons/:id", { preHandler: superAdmin }, deleteCoupon);

  // Licencias on-premise (verify va antes que :id por claridad de rutas).
  fastify.get("/licenses", { preHandler: superAdmin }, getLicenses);
  fastify.post("/licenses", { preHandler: superAdmin }, issueLicense);
  fastify.post("/licenses/verify", { preHandler: superAdmin }, verifyLicense);
  fastify.post("/licenses/:id/revoke", { preHandler: superAdmin }, revokeLicense);

  // Órdenes de servicios de valor agregado
  fastify.get("/service-orders", { preHandler: superAdmin }, getServiceOrders);
  fastify.patch("/service-orders/:id", { preHandler: superAdmin }, updateServiceOrder);

  // Planes
  fastify.get("/plans", { preHandler: superAdmin }, getAdminPlans);
  fastify.post("/plans", { preHandler: superAdmin }, createAdminPlan);
  fastify.patch("/plans/:code", { preHandler: superAdmin }, updatePlan);
  fastify.get("/features", { preHandler: superAdmin }, getFeatureCatalog);
}
