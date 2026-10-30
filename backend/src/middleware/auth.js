import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import pool from '../config/database.js';

dotenv.config();

export function authenticateToken(_fastify) {
  return async function (request, reply) {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Token de autorización requerido' });
      }
      
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Multi-tenant: los tokens emitidos antes de esta versión no traen
      // organization_id; se resuelve una sola vez desde la BD para no dejar al
      // usuario sin acceso a sus datos. Los tokens nuevos ya lo incluyen.
      if (decoded.organization_id === undefined) {
        const [rows] = await pool.query(
          'SELECT organization_id FROM users WHERE id = ?',
          [decoded.id],
        );
        decoded.organization_id = rows[0]?.organization_id ?? null;
      }

      request.user = decoded;
      request.organizationId = decoded.organization_id ?? null;
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

export function optionalAuth(_fastify) {
  return async function (request, _reply) {
    try {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        request.user = decoded;
        request.organizationId = decoded.organization_id ?? null;
      }
    } catch {
      // Ignore invalid tokens for optional auth
    }
  };
}