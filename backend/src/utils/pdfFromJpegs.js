import { PDFDocument } from 'pdf-lib';

// Convierte una lista de imágenes JPEG (una por página) en un único PDF.
// Se usa cuando Cloudinary bloquea la entrega directa del PDF original:
// se piden las páginas como JPG y se arma un PDF para el visor del navegador.
export async function pdfFromJpegs(jpegs) {
  const pdf = await PDFDocument.create();
  // Tamaño A4 en puntos (72 dpi), el estándar que espera un visor de PDF.
  const [pageWidth, pageHeight] = [595.28, 841.89];

  for (const jpeg of jpegs) {
    const image = await pdf.embedJpg(jpeg);
    const page = pdf.addPage([pageWidth, pageHeight]);
    // Se ajusta la imagen a la página conservando su proporción.
    const scale = Math.min(
      pageWidth / image.width,
      pageHeight / image.height,
    );
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, {
      x: (pageWidth - width) / 2,
      y: (pageHeight - height) / 2,
      width,
      height,
    });
  }

  return Buffer.from(await pdf.save());
}
