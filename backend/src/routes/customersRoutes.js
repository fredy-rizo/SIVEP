import { getCustomers, getCustomerById, createCustomer, updateCustomer, reviewPaymentProof, getPendingProofCount } from '../controllers/customersController.js';
import { authenticateToken } from '../middleware/auth.js';

export default async function customersRoutes(fastify) {
  fastify.get('/', {
    preHandler: authenticateToken(fastify)
  }, getCustomers);
  
  fastify.get('/pending-proof-count', {
    preHandler: authenticateToken(fastify)
  }, getPendingProofCount);
  
  fastify.get('/:id', {
    preHandler: authenticateToken(fastify)
  }, getCustomerById);
  
  fastify.post('/', {
    preHandler: authenticateToken(fastify)
  }, createCustomer);
  
  fastify.put('/:id', {
    preHandler: authenticateToken(fastify)
  }, updateCustomer);
  
  fastify.patch('/:id', {
    preHandler: authenticateToken(fastify)
  }, updateCustomer);
  
  fastify.patch('/:id/review-proof', {
    preHandler: authenticateToken(fastify)
  }, reviewPaymentProof);
}