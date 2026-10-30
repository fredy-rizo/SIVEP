import {
  listCashClaims,
  getCashClaimById,
  approveCashClaim,
  rejectCashClaim,
} from '../controllers/cashClaimsController.js';
import { authenticateToken } from '../middleware/auth.js';

// Panel administrativo de compras en efectivo. Cualquier usuario autenticado de
// la organización puede revisar y validar; el aislamiento multi-tenant lo hace
// `request.organizationId` en el controlador.
export default async function cashClaimsRoutes(fastify) {
  fastify.get('/', {
    preHandler: authenticateToken(fastify),
  }, listCashClaims);

  fastify.get('/:id', {
    preHandler: authenticateToken(fastify),
  }, getCashClaimById);

  fastify.post('/:id/approve', {
    preHandler: authenticateToken(fastify),
  }, approveCashClaim);

  fastify.post('/:id/reject', {
    preHandler: authenticateToken(fastify),
  }, rejectCashClaim);
}
