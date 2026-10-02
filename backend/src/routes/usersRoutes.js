import { getUsers, createUser, updateUser, deleteUser } from '../controllers/usersController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

export default async function usersRoutes(fastify) {
  fastify.get('/', {
    preHandler: [authenticateToken(fastify), requireRole('super_admin')]
  }, getUsers);
  
  fastify.post('/', {
    preHandler: [authenticateToken(fastify), requireRole('super_admin')]
  }, createUser);
  
  fastify.put('/:id', {
    preHandler: [authenticateToken(fastify), requireRole('super_admin')]
  }, updateUser);
  
  fastify.patch('/:id', {
    preHandler: [authenticateToken(fastify), requireRole('super_admin')]
  }, updateUser);
  
  fastify.delete('/:id', {
    preHandler: [authenticateToken(fastify), requireRole('super_admin')]
  }, deleteUser);
}