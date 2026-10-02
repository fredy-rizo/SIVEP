import fs from 'fs';
import path from 'path';
import cloudinary from '../config/cloudinary.js';

const FALLBACK_DIR = path.join(process.cwd(), 'uploads', 'comprobantes');

if (!fs.existsSync(FALLBACK_DIR)) {
  fs.mkdirSync(FALLBACK_DIR, { recursive: true });
}

/**
 * Sube un buffer de imagen/archivo a Cloudinary.
 * Devuelve la URL segura (secure_url) lista para guardar en BD y mostrar en el frontend.
 * Si Cloudinary falla, guarda localmente en uploads/comprobantes/ como respaldo
 * para que el formulario nunca se rompa.
 *
 * @param {Buffer} buffer - Contenido del archivo
 * @param {string} originalName - Nombre original (para conservar la extensión)
 * @param {string} folder - Carpeta dentro de Cloudinary (por defecto sivep/comprobantes)
 * @returns {Promise<string>} URL pública del archivo
 */
export async function uploadImage(buffer, originalName = 'archivo', folder = 'sivep/comprobantes') {
  const ext = path.extname(originalName).toLowerCase();
  const publicId = `comprobante_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          resource_type: 'auto',
          format: ext ? ext.replace('.', '') : undefined
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      stream.end(buffer);
    });
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary falló, usando almacenamiento local como respaldo:', error.message);

    const fileName = `${publicId}${ext}`;
    fs.writeFileSync(path.join(FALLBACK_DIR, fileName), buffer);
    return `/uploads/comprobantes/${fileName}`;
  }
}