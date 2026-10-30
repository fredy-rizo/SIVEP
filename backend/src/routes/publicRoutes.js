import { createPublicLead, getPublicProducts } from '../controllers/publicController.js';
import {
  createCashClaim,
  getCashClaimStatus,
} from '../controllers/cashClaimsController.js';

export default async function publicRoutes(fastify) {
  fastify.get('/products', async (request, reply) => {
    return getPublicProducts(request, reply);
  });

  // Compra pública EN LÍNEA: el cliente ya pagó en la página de la UNAL y sube
  // el PDF de eCollect. La venta se registra como externa a partir del PDF. El
  // efectivo tiene su propia ruta de solicitud (más abajo).
  fastify.post('/leads', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    return createPublicLead(request, reply);
  });

  // Compra en efectivo: NO registra la venta todavía. Crea una solicitud que un
  // administrador valida contra el recibo físico antes de descontar stock.
  fastify.post('/cash-claims', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    return createCashClaim(request, reply);
  });

  // Consulta de estado. Exige el documento del comprador para que un código
  // filtrado no permita ver solicitudes ajenas.
  fastify.get('/cash-claims/:code', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    return getCashClaimStatus(request, reply);
  });
}
