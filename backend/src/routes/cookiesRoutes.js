import { setCookieConsent, getCookieConsent } from '../controllers/cookiesController.js';

export default async function cookiesRoutes(fastify) {
  fastify.post('/consent', setCookieConsent);

  fastify.get('/consent', getCookieConsent);
}
