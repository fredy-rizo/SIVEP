import { getProducts, getProductById, createProduct, updateProduct, deleteProduct, getCategories, uploadProductImage } from '../controllers/productsController.js';
import { authenticateToken } from '../middleware/auth.js';

export default async function productsRoutes(fastify) {
  fastify.get('/', {
    preHandler: authenticateToken(fastify)
  }, getProducts);
  
  fastify.get('/categories', {
    preHandler: authenticateToken(fastify)
  }, getCategories);

  fastify.post('/upload-image', {
    preHandler: authenticateToken(fastify)
  }, uploadProductImage);
  
  fastify.get('/:id', {
    preHandler: authenticateToken(fastify)
  }, getProductById);
  
  fastify.post('/', {
    preHandler: authenticateToken(fastify)
  }, createProduct);
  
  fastify.put('/:id', {
    preHandler: authenticateToken(fastify)
  }, updateProduct);
  
  fastify.patch('/:id', {
    preHandler: authenticateToken(fastify)
  }, updateProduct);
  
  fastify.delete('/:id', {
    preHandler: authenticateToken(fastify)
  }, deleteProduct);
}