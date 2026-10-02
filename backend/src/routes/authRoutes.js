import { login, me } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';
import { loginSchema } from '../validators/index.js';

export default async function authRoutes(fastify) {
  fastify.post('/login', {
    // Freno contra ataques de fuerza bruta a contraseñas: 20 intentos
    // por IP cada 15 minutos (el límite global es más amplio).
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '15 minutes'
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 }
        }
      }
    }
  }, login);
  
  fastify.get('/me', {
    preHandler: authenticateToken(fastify)
  }, me);
}