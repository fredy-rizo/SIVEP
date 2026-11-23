import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';
import { pdfFromJpegs } from '../utils/pdfFromJpegs.js';
import { saleReceiptPdf } from '../utils/saleReceiptPdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const MAX_PDF_PAGES = 30;

// Las ventas de demostración guardan una URL interna en `sales.proof_url`.
// No hay archivo: el comprobante se arma al vuelo con los datos de la venta.
const DEMO_RECEIPT_PREFIX = 'sivep-demo://sale/';

// Verifica que la URL pertenezca a un comprobante de la organización del
// usuario. Evita que un usuario autenticado pueda pedir cualquier archivo.
async function proofBelongsToOrganization(url, organizationId) {
  const [rows] = await pool.query(
    `SELECT 1 FROM customers
       WHERE proof_image_url = ? AND organization_id = ?
     UNION
     SELECT 1 FROM cash_purchase_claims
       WHERE receipt_url = ? AND organization_id = ?
     UNION
     SELECT 1 FROM sales
       WHERE proof_url = ? AND organization_id = ?
     LIMIT 1`,
    [url, organizationId, url, organizationId, url, organizationId],
  );
  return rows.length > 0;
}

// Comprobante de demostración: se reconstruye desde la venta y su cliente.
async function demoReceiptPdf(url, organizationId) {
  const invoiceNumber = decodeURIComponent(url.slice(DEMO_RECEIPT_PREFIX.length));
  const [rows] = await pool.query(
    `SELECT s.*, c.full_name, c.document_type, c.document_number, c.email,
            c.phone, c.address, o.name AS organization_name
       FROM sales s
       JOIN customers c ON c.id = s.customer_id
       JOIN organizations o ON o.id = s.organization_id
      WHERE s.invoice_number = ? AND s.organization_id = ? AND s.proof_url = ?`,
    [invoiceNumber, organizationId, url],
  );
  if (rows.length === 0) return null;

  const sale = rows[0];
  const [items] = await pool.query(
    `SELECT si.description, si.quantity, si.unit_price, si.total,
            p.name AS product_name
       FROM sale_items si
       LEFT JOIN products p ON p.id = si.product_id
      WHERE si.sale_id = ?
      ORDER BY si.id`,
    [sale.id],
  );

  return saleReceiptPdf({
    sale,
    customer: {
      full_name: sale.full_name,
      document_type: sale.document_type,
      document_number: sale.document_number,
      email: sale.email,
      phone: sale.phone,
    },
    items: items.map((item) => ({
      ...item,
      description: item.product_name || item.description || "Producto",
    })),
    organizationName: sale.organization_name,
  });
}

function cloudinaryPageUrl(url, page) {
  return url
    .replace('/image/upload/', `/image/upload/pg_${page},w_1400/`)
    .replace(/\.pdf(\?.*)?$/i, '.jpg$1');
}

function sendPdf(reply, bytes, filename = 'comprobante.pdf') {
  return reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', `inline; filename="${filename}"`)
    .header('Cache-Control', 'private, max-age=300')
    .send(bytes);
}

async function fetchCloudinaryPdf(url) {
  // 1) Intentar el PDF original. Funciona si la cuenta permite entregar PDF.
  try {
    const response = await fetch(url);
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 4) return buffer;
    }
  } catch {
    // Se intenta el respaldo por páginas.
  }

  // 2) Respaldo: pedir cada página como JPG y armar un PDF con ellas.
  const pages = [];
  for (let page = 1; page <= MAX_PDF_PAGES; page++) {
    const response = await fetch(cloudinaryPageUrl(url, page));
    if (!response.ok) break;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) break;
    pages.push(buffer);
  }

  if (pages.length === 0) return null;
  return pdfFromJpegs(pages);
}

// GET /api/files/proof?url=...
// Devuelve el comprobante como PDF para incrustarlo en el visor del navegador,
// sin exponer la URL directa ni depender de que Cloudinary permita entregar PDF.
export async function getProofFile(request, reply) {
  const url = String(request.query?.url || '').trim();
  if (!url) {
    return reply.code(400).send({ error: 'Falta la URL del comprobante' });
  }

  // Comprobante de demostración generado desde la venta (sin archivo).
  if (url.startsWith(DEMO_RECEIPT_PREFIX)) {
    const pdf = await demoReceiptPdf(url, request.organizationId);
    if (!pdf) {
      return reply.code(404).send({ error: 'Comprobante no encontrado' });
    }
    const invoice = url.slice(DEMO_RECEIPT_PREFIX.length);
    return sendPdf(reply, pdf, `${decodeURIComponent(invoice)}.pdf`);
  }

  const allowed = await proofBelongsToOrganization(url, request.organizationId);
  if (!allowed) {
    return reply.code(404).send({ error: 'Comprobante no encontrado' });
  }

  // Archivos guardados localmente (respaldo cuando Cloudinary falla).
  if (url.startsWith('/uploads/')) {
    const relative = url.replace(/^\/uploads\//, '');
    const filePath = path.resolve(UPLOAD_ROOT, relative);
    if (!filePath.startsWith(path.resolve(UPLOAD_ROOT))) {
      return reply.code(400).send({ error: 'Ruta de archivo inválida' });
    }
    try {
      const buffer = await fs.readFile(filePath);
      return sendPdf(reply, buffer);
    } catch {
      return reply.code(404).send({ error: 'Comprobante no encontrado' });
    }
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return reply.code(400).send({ error: 'URL de comprobante inválida' });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const isCloudinary =
    parsed.hostname === 'res.cloudinary.com' &&
    (parsed.pathname.startsWith(`/${cloudName}/image/upload/`) ||
      parsed.pathname.startsWith(`/${cloudName}/raw/upload/`));

  if (!isCloudinary) {
    return reply.code(400).send({ error: 'Origen de comprobante no permitido' });
  }

  const pdf = await fetchCloudinaryPdf(url);
  if (!pdf) {
    return reply
      .code(502)
      .send({ error: 'No se pudo obtener el comprobante desde Cloudinary' });
  }

  return sendPdf(reply, pdf);
}
