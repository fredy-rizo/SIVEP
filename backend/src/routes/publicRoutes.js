import { createPublicLead, getPublicProducts } from '../controllers/publicController.js';

export default async function publicRoutes(fastify) {
  fastify.get('/products', async (request, reply) => {
    return getPublicProducts(request, reply);
  });
  
  fastify.post('/leads', async (request, reply) => {
    return createPublicLead(request, reply);
  });
}