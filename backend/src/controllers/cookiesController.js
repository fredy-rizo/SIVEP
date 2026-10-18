import { cookieConsentSchema } from "../validators/index.js";

// Nombre de la cookie técnica que guarda la decisión del usuario.
// Es "técnica" (no rastrea): solo recuerda su preferencia, por eso no pide a
// su vez consentimiento.
const CONSENT_COOKIE = "cookie_consent";

// Un año en milisegundos: la decisión se recuerda a largo plazo para
// no preguntar en cada visita.
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Categorías OPCIONALES que el usuario puede activar/desactivar. Las
// "necesarias" (sesión, tema) siempre están activas y no se listan aquí.
const OPTIONAL_CATEGORIES = ["preferences", "analytics", "marketing"];

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

function allCategories(value) {
  const out = {};
  for (const c of OPTIONAL_CATEGORIES) out[c] = value;
  return out;
}

// El valor de la cookie se codifica como JSON URL-encoded porque una cookie no
// admite comas, llaves ni comillas sin escapar. Se conservan los valores
// antiguos ("accepted"/"rejected") por compatibilidad.
function encodeConsent(state) {
  return encodeURIComponent(JSON.stringify(state));
}

function decodeConsent(raw) {
  if (!raw) return null;
  if (raw === "accepted") {
    return { mode: "accepted", categories: allCategories(true) };
  }
  if (raw === "rejected") {
    return { mode: "rejected", categories: allCategories(false) };
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (parsed && parsed.mode && parsed.categories) return parsed;
  } catch (e) {
    /* valor ilegible: se trata como "sin decisión" */
  }
  return null;
}

// POST /api/cookies/consent  { accepted: bool }  ó  { categories: {...} }
// Guarda la decisión. NO toca la sesión ni configuración existente: solo
// escribe la cookie técnica de preferencia. Si se rechaza una categoría,
// se limpian sus cookies opcionales (ver OPTIONAL_COOKIES).
export async function setCookieConsent(request, reply) {
  const { error, value } = cookieConsentSchema.validate(request.body ?? {});
  if (error) {
    return reply.code(400).send({
      error:
        'Envíe { "accepted": true|false } o { "categories": { preferences, analytics, marketing } }',
    });
  }

  let state;
  if (value.categories) {
    // Personalización por categoría: se deduce un modo legible.
    const categories = {};
    for (const c of OPTIONAL_CATEGORIES) categories[c] = value.categories[c] === true;
    const anyOn = OPTIONAL_CATEGORIES.some((c) => categories[c]);
    const allOn = OPTIONAL_CATEGORIES.every((c) => categories[c]);
    state = { mode: allOn ? "accepted" : anyOn ? "custom" : "rejected", categories };
  } else {
    const on = value.accepted === true;
    state = { mode: on ? "accepted" : "rejected", categories: allCategories(on) };
  }

  // Ante un rechazo (total o parcial) se depuran las cookies opcionales.
  if (state.mode !== "accepted") {
    for (const name of OPTIONAL_COOKIES) {
      reply.clearCookie(name, { path: "/" });
    }
  }

  reply.setCookie(CONSENT_COOKIE, encodeConsent(state), baseCookieOptions());
  return reply.send({
    consent: state.mode,
    accepted: state.mode === "accepted",
    categories: state.categories,
  });
}

// GET /api/cookies/consent
// Lee la cookie de preferencia para que el frontend sepa si debe mostrar el
// banner. Sin cookie responde "unknown" (mostrar banner).
export async function getCookieConsent(request, reply) {
  const state = decodeConsent(request.cookies?.[CONSENT_COOKIE]);

  if (!state) {
    return reply.send({ consent: "unknown", accepted: null, categories: null });
  }

  return reply.send({
    consent: state.mode,
    accepted: state.mode === "accepted",
    categories: state.categories,
  });
}
