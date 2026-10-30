// ============================================================================
// LECTURA DE PETICIONES MULTIPART — un solo lugar para formularios públicos
// ----------------------------------------------------------------------------
// Los formularios de compra suben archivos (comprobante eCollect, recibo de
// caja). Fastify entrega un stream de partes y cada controlador repetía el
// mismo bucle. Este helper:
//   - separa campos de texto (`fields`) y archivos (`files`),
//   - solo conserva los archivos solicitados en `fileFields`,
//   - descarta el resto del stream para no dejar la petición colgada,
//   - aplica un límite de tamaño por archivo.
//
// Devuelve `{ error }` ante una petición que no es multipart o un archivo
// demasiado grande; el controlador decide el status HTTP.
// ============================================================================

const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function readMultipart(
  request,
  { fileFields = [], maxFileBytes = DEFAULT_MAX_FILE_BYTES } = {},
) {
  if (!request.isMultipart()) {
    return { error: "La petición debe enviarse como multipart/form-data" };
  }

  const allowedFiles = new Set(fileFields);
  const fields = {};
  const files = {};
  let sizeError = false;

  for await (const part of request.parts()) {
    if (!part.file) {
      fields[part.fieldname] = part.value;
      continue;
    }

    // Archivos no solicitados o repetidos: se drenan sin guardarlos.
    if (!allowedFiles.has(part.fieldname) || files[part.fieldname]) {
      part.file.resume();
      continue;
    }

    const buffer = await part.toBuffer();
    if (buffer.length > maxFileBytes) {
      sizeError = true;
      continue;
    }

    files[part.fieldname] = {
      buffer,
      filename: part.filename || "",
      mimetype: part.mimetype || "",
    };
  }

  if (sizeError) {
    const limitMb = Math.round(maxFileBytes / 1024 / 1024);
    return { error: `El archivo no debe superar ${limitMb} MB` };
  }

  return { fields, files };
}
