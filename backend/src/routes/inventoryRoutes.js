import { getInventory, createInventoryMovement, getInventoryMovements } from '../controllers/inventoryController.js';
import { authenticateToken } from '../middleware/auth.js';

export default async function inventoryRoutes(fastify) {
  fastify.get('/', {
    preHandler: authenticateToken(fastify)
  }, getInventory);
  
  fastify.get('/movements', {
    preHandler: authenticateToken(fastify)
  }, getInventoryMovements);
  
  fastify.post('/movement', {
    preHandler: authenticateToken(fastify)
  }, createInventoryMovement);
}