import { getProofFile } from '../controllers/filesController.js';
import { authenticateToken } from '../middleware/auth.js';

export default async function filesRoutes(fastify) {
  fastify.get(
    '/proof',
    {
      preHandler: authenticateToken(fastify),
    },
    getProofFile,
  );
}
