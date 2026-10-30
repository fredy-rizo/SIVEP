// ============================================================================
// PARSER DE COMPROBANTE ECOLLECT — SIVEP
// ----------------------------------------------------------------------------
// ¿POR QUÉ existe?
//   El comprobante de pago emitido por eCollect (o por la caja de la UNAL) es
//   la PRUEBA de pago del cliente. En el nuevo flujo el cliente ya compró en la
//   página de la universidad y SIVEP solo recibe el PDF: de ahí se extraen los
//   datos del cliente, la fecha, el monto y las descripciones compradas.
//
// CÓMO funciona:
//   - `parseEcollectReceipt(buffer)` recibe el buffer del PDF, lo carga con
//     `pdfjs-dist` (build legacy para Node) y extrae los ítems de texto CON sus
//     coordenadas en cada página.
//   - `parseReceiptPages(pages)` es la función PURA y testeable: recibe las
//     páginas ya extraídas (`{ str, x, y }`) y busca cada etiqueta en su
//     columna, porque en este formato etiqueta y valor no están en la misma
//     línea de texto (incluso pueden estar en páginas distintas).
//   - `parseReceiptText(text)` conserva el modo lineal para comprobantes
//     antiguos o de una sola columna.
//
// NOTA: la columna "Cantidad" del PDF no es confiable (el valor ya refleja la
// cantidad comprada). Por eso cada descripción se registra como una línea con
// cantidad 1 y el valor de la fila.
// ============================================================================

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export const ECOLLECT_STATUS_APPROVED = "APROBADA";

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

// Etiquetas conocidas del comprobante. Se excluyen al buscar valores para no
// confundir una etiqueta vecina con el dato que estamos leyendo.
const LABEL_PATTERN =
  /^(tipo de documento|numero de identificacion|nombre y apellido|telefono|email de confirmacion|direccion de residencia|fecha y hora|total pagado|nro\.? transaccion ecollect|descripcion del pago|descripcion|cantidad|valor pagado|valor servicio|razon social|nit|usuario pagador|direccion ip|resumen medios de pago|no\.? autorizacion\/cus|medio de pago|comprobante|escane y verifica|este pago)$/;

// Normaliza texto: minúsculas, sin tildes, espacios colapsados y sin bordes.
export function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Número de identificación: solo dígitos.
export function normalizeDocumentNumber(value = "") {
  return String(value || "").replace(/\D/g, "");
}

// Tipo de documento: acepta "T.I", "C.C", "CE", "NIT", "PASSPORT" (con o sin
// tildes/puntos) y devuelve el código canónico (TI, CC, CE, NIT, PASSPORT).
export function normalizeDocumentType(value = "") {
  const compact = String(value || "")
    .toUpperCase()
    .replace(/[.\s]/g, "");
  const aliases = {
    TI: "TI",
    CC: "CC",
    CE: "CE",
    NIT: "NIT",
    PASSPORT: "PASSPORT",
  };
  const canonical = aliases[compact];
  return canonical || null;
}

// Monto: quita símbolo de moneda y separadores de miles (coma), conserva el
// punto decimal. Ej: "$ 12,000.00" -> 12000.
export function normalizeAmount(value = "") {
  const cleaned = String(value || "")
    .replace(/[$\s]/g, "")
    .replace(/,/g, "");
  if (!cleaned) return null;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
}

// Fecha y hora: "dd/mm/aaaa hh:mm:ss a.m./p.m." -> Date.
const DATE_TIME_PATTERN =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})[\s-]*([ap])\.?\s*m\.?$/i;

export function normalizePaidAt(value = "") {
  const raw = String(value || "").trim();
  const match = raw.match(DATE_TIME_PATTERN);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const meridiem = (match[7] || "").toLowerCase();
  if (meridiem === "p" && hour < 12) hour += 12;
  if (meridiem === "a" && hour === 12) hour = 0;
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

// ---------------------------------------------------------------------------
// Utilidades de posicionamiento (coordenadas locales de cada página)
// ---------------------------------------------------------------------------

function normalizeItem(item = {}) {
  const str = String(item.str || "").trim();
  if (!str) return null;
  const x = Number(item.x ?? item.transform?.[4] ?? 0);
  const y = Number(item.y ?? item.transform?.[5] ?? 0);
  return { str, x, y, n: normalizeText(str) };
}

function normalizePages(rawPages = []) {
  return rawPages.map((items) =>
    (items || [])
      .map((item) => normalizeItem(item))
      .filter((item) => item !== null),
  );
}

function isLabel(item) {
  return LABEL_PATTERN.test(item.n);
}

function findLabel(pages, pattern) {
  for (const items of pages) {
    const label = items.find((item) => pattern.test(item.n));
    if (label) return { items, label };
  }
  return null;
}

// Valor en la misma columna, justo debajo de la etiqueta (y crece hacia
// arriba en pdfjs, así que "debajo" es un y menor).
function extractBelow(items, label, { tolX = 26, maxDy = 45 } = {}) {
  const candidates = items.filter(
    (item) =>
      !isLabel(item) &&
      Math.abs(item.x - label.x) <= tolX &&
      item.y < label.y &&
      label.y - item.y <= maxDy,
  );
  candidates.sort((a, b) => b.y - a.y);
  return candidates[0]?.str ?? null;
}

// Valor a la derecha de la etiqueta, en la misma fila.
function extractRight(items, label, { tolY = 6, maxDx = 320 } = {}) {
  const candidates = items.filter(
    (item) =>
      !isLabel(item) &&
      Math.abs(item.y - label.y) <= tolY &&
      item.x > label.x &&
      item.x - label.x <= maxDx,
  );
  candidates.sort((a, b) => a.x - b.x);
  return candidates[0]?.str ?? null;
}

// Valor encima de la etiqueta (p. ej. el monto sobre "Total Pagado").
function extractAbove(items, label, { tolX = 30, maxDy = 60 } = {}) {
  const candidates = items.filter(
    (item) =>
      !isLabel(item) &&
      Math.abs(item.x - label.x) <= tolX &&
      item.y > label.y &&
      item.y - label.y <= maxDy,
  );
  candidates.sort((a, b) => a.y - b.y);
  return candidates[0]?.str ?? null;
}

function readFromLabel(pages, pattern, extractor, options) {
  const found = findLabel(pages, pattern);
  if (!found) return null;
  return extractor(found.items, found.label, options);
}

function findEmail(pages) {
  for (const items of pages) {
    for (const item of items) {
      if (EMAIL_PATTERN.test(item.str)) return item.str.trim();
    }
  }
  return null;
}

function findStatus(pages) {
  for (const items of pages) {
    for (const item of items) {
      if (/\baprobada\b/.test(item.n)) return ECOLLECT_STATUS_APPROVED;
    }
  }
  return null;
}

// Lee la fecha y su hora, que pueden estar a la derecha de la etiqueta o
// debajo de ella (el formato de la UNAL las separa en dos renglones).
function readDateTime(pages) {
  const found = findLabel(pages, /^fecha y hora$/);
  if (!found) return null;
  const { items, label } = found;

  let datePart = extractRight(items, label, { tolY: 8 });
  if (!datePart) datePart = extractBelow(items, label, { tolX: 30, maxDy: 50 });
  if (!datePart) return null;

  const dateItem = items.find((item) => item.str === datePart);
  let timePart = null;
  if (dateItem) {
    timePart = extractBelow(items, dateItem, { tolX: 30, maxDy: 24 });
  }

  const paidAt = normalizePaidAt(timePart ? `${datePart} ${timePart}` : datePart);
  return paidAt;
}

function sumItems(items) {
  return Math.round(
    items.reduce((sum, item) => sum + Number(item.total || 0), 0) * 100,
  ) / 100;
}

// ---------------------------------------------------------------------------
// Ítems comprados
// ---------------------------------------------------------------------------

// Lee la tabla "Descripción / Cantidad / Valor Pagado" del comprobante. Cada
// fila se devuelve con cantidad 1 y el valor de la fila como precio unitario.
export function parseReceiptItems(rawPages = []) {
  const pages = normalizePages(rawPages);

  for (const items of pages) {
    const header = items.find((item) => item.n === "descripcion");
    if (!header) continue;

    const headerRow = items.filter(
      (item) => Math.abs(item.y - header.y) <= 6,
    );
    const descriptionColumn = headerRow.find(
      (item) => item.n === "descripcion",
    );
    const quantityColumn = headerRow.find((item) => item.n === "cantidad");
    const amountColumn =
      headerRow.find((item) => item.n === "valor pagado") ||
      headerRow.find((item) => item.n === "valor servicio");

    if (!descriptionColumn || !amountColumn) continue;

    const descX = descriptionColumn.x;
    const qtyX = quantityColumn?.x ?? descX + 160;
    const amountX = amountColumn.x;

    const body = items
      .filter((item) => item.y < header.y - 1 && item.y >= header.y - 220)
      .sort((a, b) => b.y - a.y);

    const rows = [];
    for (const item of body) {
      let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 6);
      if (!row) {
        row = { y: item.y, items: [] };
        rows.push(row);
      }
      row.items.push(item);
    }

    const result = [];
    for (const row of rows) {
      const description = row.items
        .filter(
          (item) =>
            !isLabel(item) &&
            Math.abs(item.x - descX) <= Math.max(120, qtyX - descX - 10) &&
            item.x < qtyX - 5,
        )
        .sort((a, b) => a.x - b.x)
        .map((item) => item.str)
        .join(" ")
        .trim();

      const amountItem = row.items
        .filter(
          (item) => !isLabel(item) && Math.abs(item.x - amountX) <= 90,
        )
        .sort(
          (a, b) =>
            Math.abs(a.x - amountX) - Math.abs(b.x - amountX),
        )[0];
      const amount = amountItem ? normalizeAmount(amountItem.str) : null;

      if (!description || amount === null) continue;
      result.push({
        description,
        quantity: 1,
        unit_price: amount,
        total: amount,
      });
    }

    if (result.length > 0) return result;
  }

  return [];
}

// ---------------------------------------------------------------------------
// Parser por coordenadas (formato multi-página de la UNAL)
// ---------------------------------------------------------------------------

export function parseReceiptPages(rawPages = []) {
  const pages = normalizePages(rawPages);

  const items = parseReceiptItems(pages);

  const data = {
    full_name: readFromLabel(pages, /^nombre y apellido$/, extractBelow),
    document_number: normalizeDocumentNumber(
      readFromLabel(pages, /^numero de identificacion$/, extractBelow),
    ),
    document_type: normalizeDocumentType(
      readFromLabel(pages, /^tipo de documento$/, extractBelow),
    ),
    phone:
      readFromLabel(pages, /^telefono$/, extractBelow) ||
      null,
    email:
      readFromLabel(pages, /^email de confirmacion$/, extractBelow) ||
      findEmail(pages),
    address: readFromLabel(pages, /^direccion de residencia$/, extractBelow),
    paid_at: readDateTime(pages),
    amount: normalizeAmount(
      readFromLabel(
        pages,
        /^total pagado$/,
        (foundItems, label) =>
          extractAbove(foundItems, label) || extractRight(foundItems, label),
      ),
    ),
    service_description: normalizeText(
      readFromLabel(pages, /^descripcion del pago:?$/, extractRight) || "",
    ),
    transaction_id: normalizeDocumentNumber(
      readFromLabel(
        pages,
        /^nro\.? transaccion ecollect$/,
        (foundItems, label) =>
          extractBelow(foundItems, label) || extractRight(foundItems, label),
      ),
    ),
    status: findStatus(pages),
    items,
  };

  // Si la tabla no trae el total (o no hay tabla), se usa el monto global.
  if (data.amount === null && items.length > 0) {
    data.amount = sumItems(items);
  }

  // Si el detalle no está en tabla, se registra el concepto general del pago.
  if (data.items.length === 0 && data.service_description && data.amount !== null) {
    data.items = [
      {
        description: data.service_description,
        quantity: 1,
        unit_price: data.amount,
        total: data.amount,
      },
    ];
  }

  if (!data.service_description && data.items.length > 0) {
    data.service_description = normalizeText(data.items[0].description);
  }

  if (data.status !== ECOLLECT_STATUS_APPROVED) {
    throw new Error("El comprobante no tiene estado APROBADA");
  }

  const requiredFields = [
    "full_name",
    "document_number",
    "document_type",
    "paid_at",
    "amount",
    "transaction_id",
  ];
  for (const field of requiredFields) {
    if (data[field] === null || data[field] === undefined || data[field] === "") {
      throw new Error(`El comprobante no tiene el dato requerido: ${field}`);
    }
  }

  // El detalle es imprescindible: sin descripción no se puede registrar la venta.
  if (data.items.length === 0) {
    throw new Error(
      "El comprobante no tiene el dato requerido: descripcion de la compra",
    );
  }

  return {
    full_name: data.full_name,
    document_number: data.document_number,
    document_type: data.document_type,
    phone: data.phone,
    email: data.email,
    address: data.address,
    paid_at: data.paid_at,
    amount: data.amount,
    service_description: data.service_description,
    transaction_id: data.transaction_id,
    status: data.status,
    items: data.items,
  };
}

// ---------------------------------------------------------------------------
// Parser lineal (compatibilidad con comprobantes de una sola columna)
// ---------------------------------------------------------------------------

// Función pura: recibe el texto extraído del PDF y devuelve los campos
// normalizados, o lanza un error en español si el comprobante no es utilizable.
export function parseReceiptText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const data = {
    full_name: null,
    document_number: null,
    document_type: null,
    phone: null,
    email: null,
    address: null,
    paid_at: null,
    amount: null,
    service_description: null,
    transaction_id: null,
    status: null,
  };

  for (const rawLine of lines) {
    const line = String(rawLine || "");
    const key = normalizeText(line);
    if (!key) continue;

    if (key.includes("aprobada")) {
      data.status = ECOLLECT_STATUS_APPROVED;
    }

    if (key.includes("transaccion")) {
      const digits = key.replace(/\D/g, "");
      if (digits) data.transaction_id = digits;
    }

    if (key.includes("total pagado") || key.includes("valor pagado")) {
      const amountMatch = key.match(/(?:total pagado|valor pagado):?\s*(.+)$/);
      const amount = amountMatch ? normalizeAmount(amountMatch[1]) : null;
      if (amount !== null) data.amount = amount;
    }

    if (key.includes("fecha") && key.includes("hora")) {
      const dateMatch = key.match(/fecha y hora:?\s*(.+)$/);
      const paidAt = dateMatch ? normalizePaidAt(dateMatch[1]) : null;
      if (paidAt) data.paid_at = paidAt;
    }

    if (key.includes("nombre") && key.includes("apellido")) {
      const nameMatch = key.match(/nombre y apellido:?\s*(.+)$/);
      const fullName = nameMatch ? nameMatch[1].trim() : null;
      if (fullName) data.full_name = fullName;
    }

    if (key.includes("identificacion")) {
      const docMatch = key.match(/numero de identificacion:?\s*([\d.,$]+)/);
      const docNumber = docMatch ? normalizeDocumentNumber(docMatch[1]) : null;
      if (docNumber) data.document_number = docNumber;
    }

    if (key.includes("tipo de documento")) {
      const typeMatch = key.match(/tipo de documento:?\s*(.+)$/);
      const docType = typeMatch ? normalizeDocumentType(typeMatch[1]) : null;
      if (docType) data.document_type = docType;
    }

    if (key.includes("descripcion")) {
      const serviceMatch = key.match(/descripcion del pago:?\s*(.+)$/);
      const service = serviceMatch ? serviceMatch[1].trim() : null;
      if (service) data.service_description = normalizeText(service);
    }

    if (key.includes("telefono")) {
      const phoneMatch = key.match(/telefono:?\s*(.+)$/);
      if (phoneMatch) data.phone = phoneMatch[1].trim();
    }

    if (key.includes("email") || key.includes("correo")) {
      const emailMatch = key.match(/(?:email|correo)(?: de confirmacion)?:?\s*(\S+@\S+)/);
      if (emailMatch) data.email = emailMatch[1].trim();
    }

    if (key.includes("direccion de residencia")) {
      const addressMatch = key.match(/direccion de residencia:?\s*(.+)$/);
      if (addressMatch) data.address = addressMatch[1].trim();
    }
  }

  // Estado: solo un comprobante APROBADA puede continuar en el flujo.
  if (data.status !== ECOLLECT_STATUS_APPROVED) {
    throw new Error("El comprobante no tiene estado APROBADA");
  }

  // Campos requeridos para registrar la venta externa.
  const requiredFields = [
    "full_name",
    "document_number",
    "document_type",
    "paid_at",
    "amount",
    "service_description",
    "transaction_id",
  ];
  for (const field of requiredFields) {
    if (data[field] === null || data[field] === undefined || data[field] === "") {
      throw new Error(`El comprobante no tiene el dato requerido: ${field}`);
    }
  }

  return {
    full_name: data.full_name,
    document_number: data.document_number,
    document_type: data.document_type,
    phone: data.phone,
    email: data.email,
    address: data.address,
    paid_at: data.paid_at,
    amount: data.amount,
    service_description: data.service_description,
    transaction_id: data.transaction_id,
    status: data.status,
    items: [
      {
        description: data.service_description,
        quantity: 1,
        unit_price: data.amount,
        total: data.amount,
      },
    ],
  };
}

// Función principal: recibe el buffer del comprobante PDF y devuelve los
// campos normalizados del pago eCollect (o lanza error si no es APROBADA).
export async function parseEcollectReceipt(buffer) {
  if (!buffer) {
    throw new Error("No se recibió el comprobante de pago");
  }
  // pdfjs rechaza explícitamente los Buffer de Node: hay que pasarle un
  // Uint8Array "puro".
  const data = Buffer.isBuffer(buffer)
    ? new Uint8Array(buffer)
    : buffer instanceof Uint8Array
      ? buffer
      : new Uint8Array(buffer);
  const doc = await getDocument({ data }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .filter((item) => item.str && item.str.trim())
        .map((item) => ({
          str: item.str.trim(),
          x: item.transform[4],
          y: item.transform[5],
        })),
    );
  }
  return parseReceiptPages(pages);
}
