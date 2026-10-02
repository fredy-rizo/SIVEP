import pool from "../config/database.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { loginSchema } from "../validators/index.js";
import { sanitizeUser } from "../utils/helpers.js";

dotenv.config();

export async function login(request, reply) {
  const { error, value } = loginSchema.validate(request.body);
  if (error) {
    return reply.code(400).send({ error: error.details[0].message });
  }

  const { email, password } = value;

  const [users] = await pool.query(
    "SELECT * FROM users WHERE email = ? AND is_active = TRUE",
    [email],
  );

  if (users.length === 0) {
    return reply.code(401).send({ error: "Credenciales inválidas" });
  }

  const user = users[0];
  const validPassword = await bcrypt.compare(password, user.password);

  if (!validPassword) {
    return reply.code(401).send({ error: "Credenciales inválidas" });
  }

  await pool.query(
    "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?",
    [user.id],
  );

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "24h" },
  );

  return reply.send({
    token,
    user: sanitizeUser(user),
  });
}

export async function me(request, reply) {
  const [users] = await pool.query(
    "SELECT * FROM users WHERE id = ? AND is_active = TRUE",
    [request.user.id],
  );

  if (users.length === 0) {
    return reply.code(404).send({ error: "Usuario no encontrado" });
  }

  return reply.send({ user: sanitizeUser(users[0]) });
}
