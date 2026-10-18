// ============================================================================
// UTILIDAD DE LICENCIAS ON-PREMISE — SIVEP
// ----------------------------------------------------------------------------
// ¿POR QUÉ? En la venta de licencia perpetua (instalación en servidores del
// cliente) el software debe poder validar su licencia SIN depender de internet
// ni de nuestra base de datos. Para eso se firma un token con clave secreta.
//
// CÓMO funciona:
//   - `generateLicenseKey()` arma un payload (organización, plan, asientos,
//     expiración) y lo firma con HMAC-SHA256 usando `LICENSE_SECRET`.
//   - El resultado es `SIVEP-<payload base64url>.<firma base64url>`.
//   - `verifyLicenseKey()` recalcula la firma y comprueba la expiración: la
//     instalación on-premise solo necesita el secreto compartido para validar.
//
// La firma es simétrica (HMAC), suficiente para licencias: quien no conoce el
// secreto no puede fabricar una licencia válida.
// ============================================================================

import crypto from "crypto";

const PREFIX = "SIVEP-";

function secret() {
  // Se usa LICENSE_SECRET y, si no está definido, se cae a JWT_SECRET para no
  // dejar el sistema sin firma en entornos ya configurados.
  const value = process.env.LICENSE_SECRET || process.env.JWT_SECRET;
  if (!value) {
    throw new Error("LICENSE_SECRET (o JWT_SECRET) no está configurado");
  }
  return value;
}

function toBase64Url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function sign(body) {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

/**
 * Genera una clave de licencia firmada.
 * @param {{ organizationId:number, planCode:string, type?:'perpetual'|'subscription', seats?:number|null, expiresAt?:string|null }} params
 * @returns {string} Clave `SIVEP-...`
 */
export function generateLicenseKey({
  organizationId,
  planCode,
  type = "perpetual",
  seats = null,
  expiresAt = null,
}) {
  const payload = {
    v: 1,
    org: organizationId,
    plan: planCode,
    type,
    seats,
    exp: expiresAt, // fecha ISO o null (sin vencimiento)
    iat: new Date().toISOString(),
    jti: crypto.randomUUID(), // identificador único de la licencia
  };
  const body = toBase64Url(payload);
  return `${PREFIX}${body}.${sign(body)}`;
}

/**
 * Verifica y decodifica una clave de licencia.
 * @param {string} key
 * @returns {{ valid:boolean, reason?:string, payload?:object }}
 */
export function verifyLicenseKey(key) {
  if (!key || typeof key !== "string" || !key.startsWith(PREFIX)) {
    return { valid: false, reason: "formato" };
  }
  const [body, signature] = key.slice(PREFIX.length).split(".");
  if (!body || !signature) return { valid: false, reason: "formato" };

  // Comparación en tiempo constante para evitar ataques de temporización.
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: "firma" };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "payload" };
  }

  if (payload.exp && new Date(payload.exp) < new Date()) {
    return { valid: false, reason: "expirada", payload };
  }

  return { valid: true, payload };
}
