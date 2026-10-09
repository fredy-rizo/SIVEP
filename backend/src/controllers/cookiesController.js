import { cookieConsentSchema } from "../validators/index.js";

// Nombre de la cookie técnica que guarda la decisión del usuario.
// Es "técnica" (no rastrea): solo recuerda si aceptó o rechazó,
// por eso no pide a su vez consentimiento.
const CONSENT_COOKIE = "cookie_consent";

// Un año en milisegundos: la decisión se recuerda a largo plazo para
// no preguntar en cada visita.
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Cookies OPCIONALES (rastreo/analítica) que deben respetarse ante un rechazo.
// En este proyecto NO existe ninguna: la sesión usa JWT en cabecera y el
// frontend guarda solo datos funcionales en localStorage. La lista queda
// como punto único de extensión: si a futuro se agrega analítica, se añade
// su nombre aquí y el rechazo la limpiará automáticamente.
const OPTIONAL_COOKIES = [];

function baseCookieOptions() {
  return {
    path: "/",
    maxAge: ONE_YEAR_MS,
    httpOnly: true, // no accesible desde JS: se consulta vía GET /api/cookies/consent
    sameSite: "lax",
    // Solo por HTTPS en producción (en local es http y debe seguir funcionando).
    secure: process.env.FORCE_HTTPS === "true",
  };
}

// POST /api/cookies/consent  { accepted: true | false }
// Guarda la decisión. NO toca ninguna cookie de sesión ni configuración
// existente: solo escribe la cookie técnica de preferencia. Si rechaza,
// además limpia las cookies opcionales listadas en OPTIONAL_COOKIES.
export async function setCookieConsent(request, reply) {
  const { error, value } = cookieConsentSchema.validate(request.body ?? {});
  if (error) {
    return reply
      .code(400)
      .send({ error: 'El cuerpo debe ser { "accepted": true | false }' });
  }

  const status = value.accepted ? "accepted" : "rejected";

  if (!value.accepted) {
    for (const name of OPTIONAL_COOKIES) {
      reply.clearCookie(name, { path: "/" });
    }
  }

  reply.setCookie(CONSENT_COOKIE, status, baseCookieOptions());
  return reply.send({ consent: status, accepted: value.accepted });
}

// GET /api/cookies/consent
// Lee la cookie de preferencia para que el frontend sepa si debe mostrar
// el banner. Sin cookie responde "unknown" (mostrar banner).
export async function getCookieConsent(request, reply) {
  const status = request.cookies?.[CONSENT_COOKIE];

  if (status === "accepted") {
    return reply.send({ consent: "accepted", accepted: true });
  }
  if (status === "rejected") {
    return reply.send({ consent: "rejected", accepted: false });
  }
  return reply.send({ consent: "unknown", accepted: null });
}
