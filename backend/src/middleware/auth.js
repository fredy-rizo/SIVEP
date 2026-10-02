import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export function authenticateToken(fastify) {
  return async function (request, reply) {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Token de autorización requerido' });
      }
      
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      request.user = decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return reply.code(401).send({ error: 'Token expirado' });
      }
      return reply.code(403).send({ error: 'Token inválido' });
    }
  };
}

export function requireRole(...allowedRoles) {
  return async function (request, reply) {
    if (!request.user) {
      return reply.code(401).send({ error: 'No autenticado' });
    }
    
    if (!allowedRoles.includes(request.user.role)) {
      return reply.code(403).send({ error: 'No tiene permisos para acceder a este recurso' });
    }
  };
}

export function optionalAuth(fastify) {
  return async function (request, reply) {
    try {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        request.user = decoded;
      }
    } catch (error) {
      // Ignore invalid tokens for optional auth
    }
  };
}