import { getSales, getSaleById, createSale, updatePaymentStatus, validatePickupCode, markDelivered } from '../controllers/salesController.js';
import { authenticateToken } from '../middleware/auth.js';

export default async function salesRoutes(fastify) {
  fastify.get('/', {
    preHandler: authenticateToken(fastify)
  }, getSales);
  
  fastify.get('/:id', {
    preHandler: authenticateToken(fastify)
  }, getSaleById);
  
  fastify.post('/', {
    preHandler: authenticateToken(fastify)
  }, createSale);

  fastify.patch('/:id/payment', {
    preHandler: authenticateToken(fastify)
  }, updatePaymentStatus);

  fastify.post('/validate-pickup', {
    preHandler: authenticateToken(fastify)
  }, validatePickupCode);

  fastify.patch('/:id/pickup', {
    preHandler: authenticateToken(fastify)
  }, markDelivered);
}