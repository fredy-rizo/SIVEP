import { getSalesReport, getInventoryReport, getCustomersReport, exportSalesCSV, exportInventoryCSV, exportCustomersCSV, getSalesForecast, getProductAffinity } from '../controllers/reportsController.js';
import { authenticateToken } from '../middleware/auth.js';

export default async function reportsRoutes(fastify) {
  fastify.get('/sales', {
    preHandler: authenticateToken(fastify)
  }, getSalesReport);
  
  fastify.get('/inventory', {
    preHandler: authenticateToken(fastify)
  }, getInventoryReport);
  
  fastify.get('/customers', {
    preHandler: authenticateToken(fastify)
  }, getCustomersReport);
  
  fastify.get('/sales/export', {
    preHandler: authenticateToken(fastify)
  }, exportSalesCSV);
  
  fastify.get('/inventory/export', {
    preHandler: authenticateToken(fastify)
  }, exportInventoryCSV);
  
  fastify.get('/customers/export', {
    preHandler: authenticateToken(fastify)
  }, exportCustomersCSV);

  fastify.get('/forecast', {
    preHandler: authenticateToken(fastify)
  }, getSalesForecast);

  fastify.get('/affinity', {
    preHandler: authenticateToken(fastify)
  }, getProductAffinity);
}