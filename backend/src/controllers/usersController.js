import pool from "../config/database.js";
import bcrypt from "bcryptjs";
import { userCreateSchema, userUpdateSchema } from "../validators/index.js";
import {
  sanitizeUser,
  calculatePagination,
  buildPaginatedResponse,
} from "../utils/helpers.js";
// Resolución de plan y límites: el número de usuarios lo dicta la suscripción.
import { resolveUserPlan, countActiveUsers } from "../middleware/plan.js";

// Columnas que se exponen de un usuario (nunca la contraseña). Incluye la
// organización (multi-tenant) a la que pertenece.
const USER_COLUMNS =
  "id, email, full_name, role, granja_asignada, organization_id, is_active, last_login, created_at, updated_at";

export async function getUsers(request, reply) {
  const { page, limit, offset } = calculatePagination(
    request.query.page,
    request.query.limit,
  );
  const { search, role, is_active } = request.query;

  let whereClause = "WHERE 1=1";
  const params = [];

  if (search) {
    whereClause += " AND (full_name LIKE ? OR email LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  if (role) {
    whereClause += " AND role = ?";
    params.push(role);
  }

  if (is_active === "true" || is_active === "false") {
    whereClause += " AND is_active = ?";
    params.push(is_active === "true");
  }

  const [users] = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users ${whereClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const [countResult] = await pool.query(
    `SELECT COUNT(*) as total FROM users ${whereClause}`,
    params,
  );

  return reply.send(
    buildPaginatedResponse(users, countResult[0].total, page, limit),
  );
}

export async function createUser(request, reply) {
  const { error, value } = userCreateSchema.validate(request.body);
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }

  const { email, password, full_name, role, granja_asignada, organization_id } =
    value;

  const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [
    email,
  ]);
  if (existing.length > 0) {
    return reply.code(409).send({ error: "El email ya está registrado" });
  }

  // Multi-tenant: el usuario pertenece a una organización. Si no se indica, se
  // hereda la del creador. El super_admin puede no tener organización.
  const resolved = await resolveUserPlan(request.user);
  const targetOrganizationId = organization_id ?? resolved.organizationId ?? null;

  // Límite de usuarios del plan: es una feature de tipo 'limit'.
  if (
    targetOrganizationId &&
    !resolved.isSuperAdmin &&
    resolved.limits.has("limit.users")
  ) {
    const userLimit = resolved.limits.get("limit.users");
    if (userLimit !== null) {
      const currentUsers = await countActiveUsers(targetOrganizationId);
      if (currentUsers >= userLimit) {
        return reply.code(402).send({
          error: `Tu plan permite hasta ${userLimit} usuarios activos. Mejora tu plan para agregar más.`,
          code: "USER_LIMIT_REACHED",
          limit: userLimit,
          current: currentUsers,
        });
      }
    }
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const [result] = await pool.query(
    `INSERT INTO users (email, password, full_name, role, granja_asignada, organization_id, is_active)
     VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
    [
      email,
      hashedPassword,
      full_name,
      role,
      granja_asignada || null,
      targetOrganizationId,
    ],
  );

  const [newUser] = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`,
    [result.insertId],
  );

  return reply.code(201).send({ user: newUser[0] });
}

export async function updateUser(request, reply) {
  const { error, value } = userUpdateSchema.validate(request.body);
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }

  const { id } = request.params;

  const [existing] = await pool.query(
    "SELECT id, role, organization_id, is_active FROM users WHERE id = ?",
    [id],
  );
  if (existing.length === 0) {
    return reply.code(404).send({ error: "Usuario no encontrado" });
  }

  if (
    existing[0].role === "super_admin" &&
    request.user.role !== "super_admin"
  ) {
    return reply.code(403).send({ error: "No puede modificar un super_admin" });
  }

  // Reactivar un usuario consume una licencia del plan: se vuelve a comprobar el
  // límite (desactivarlo lo libera; activarlo lo ocupa).
  if (value.is_active === true && existing[0].is_active === false) {
    const resolved = await resolveUserPlan(request.user);
    const targetOrg = existing[0].organization_id;
    if (
      targetOrg &&
      !resolved.isSuperAdmin &&
      resolved.limits.has("limit.users")
    ) {
      const userLimit = resolved.limits.get("limit.users");
      if (userLimit !== null) {
        const currentUsers = await countActiveUsers(targetOrg);
        if (currentUsers >= userLimit) {
          return reply.code(402).send({
            error: `Tu plan permite hasta ${userLimit} usuarios activos. Mejora tu plan para reactivar este usuario.`,
            code: "USER_LIMIT_REACHED",
            limit: userLimit,
            current: currentUsers,
          });
        }
      }
    }
  }

  if (value.email) {
    const [emailExists] = await pool.query(
      "SELECT id FROM users WHERE email = ? AND id != ?",
      [value.email, id],
    );
    if (emailExists.length > 0) {
      return reply.code(409).send({ error: "El email ya está en uso" });
    }
  }

  const fields = [];
  const params = [];

  Object.entries(value).forEach(([key, val]) => {
    if (val !== undefined) {
      fields.push(`${key} = ?`);
      params.push(val);
    }
  });

  if (fields.length === 0) {
    return reply.code(400).send({ error: "No hay campos para actualizar" });
  }

  params.push(id);

  await pool.query(
    `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
    params,
  );

  const [updated] = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`,
    [id],
  );

  return reply.send({ user: updated[0] });
}

export async function deleteUser(request, reply) {
  const { id } = request.params;

  if (parseInt(id) === request.user.id) {
    return reply.code(400).send({ error: "No puede eliminarse a sí mismo" });
  }

  const [existing] = await pool.query(
    "SELECT id, role FROM users WHERE id = ?",
    [id],
  );
  if (existing.length === 0) {
    return reply.code(404).send({ error: "Usuario no encontrado" });
  }

  if (existing[0].role === "super_admin") {
    return reply.code(403).send({ error: "No puede eliminar un super_admin" });
  }

  await pool.query("UPDATE users SET is_active = FALSE WHERE id = ?", [id]);

  return reply.send({ message: "Usuario desactivado correctamente" });
}
