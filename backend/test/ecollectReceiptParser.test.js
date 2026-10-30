// Pruebas del parser de comprobantes eCollect (funciones puras + normalización).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ECOLLECT_STATUS_APPROVED,
  normalizeText,
  normalizeDocumentNumber,
  normalizeDocumentType,
  normalizeAmount,
  normalizePaidAt,
  parseReceiptText,
  parseReceiptItems,
  parseReceiptPages,
} from "../src/utils/ecollectReceiptParser.js";

const sampleText = [
  "eCollect — Comprobante de Pago",
  "Nombre y Apellido: Juan Pérez Gómez",
  "Número de Identificación: 1000000000",
  "Tipo de Documento: T.I",
  "Fecha y Hora: 01/09/2026 03:05:44 p.m.",
  "Total Pagado: $ 12,000.00",
  "Descripción del Pago: Productos Avícolas",
  "Nro. Transacción ecollect: 169549476",
  "APROBADA",
].join("\n");

// Reproduce la disposición del comprobante real de la UNAL: etiquetas y valores
// en columnas distintas y datos personales en la segunda página.
const item = (str, x, y) => ({ str, x, y });
const samplePages = [
  [
    item("Nro. Transacción ecollect", 66, 314),
    item("169549476", 66, 282),
    item("Fecha y Hora", 78, 385),
    item("01/09/2026", 287, 386),
    item("03:05:44-p.m.", 287, 374),
    item("Total Pagado", 102, 588),
    item("$ 12,000.00", 102, 611),
    item("Descripción del Pago:", 78, 438),
    item("Productos Avicolas", 287, 438),
    item("615919044 APROBADA", 190, 283),
  ],
  [
    item("Tipo de Documento", 60, 325),
    item("T.I", 60, 305),
    item("Número de Identificación", 60, 368),
    item("1127047819", 60, 348),
    item("Nombre y Apellido", 331, 368),
    item("Stephany Maribel Obando Plata", 331, 348),
    item("Teléfono", 60, 283),
    item("3142793290", 60, 263),
    item("Email de Confirmación", 331, 283),
    item("sobandop@unal.edu.co", 331, 263),
    item("Dirección de Residencia", 331, 325),
    item("Cra 14 # 18-14", 331, 305),
    item("Descripción", 60, 594),
    item("Cantidad", 220, 594),
    item("Valor Pagado", 313, 594),
    item("Valor Servicio", 423, 594),
    item("Productos Avicolas", 62, 571),
    item("1", 222, 569),
    item("$ 12,000.00", 313, 569),
    item("COP", 422, 569),
    item("$ 12,000.00", 458, 569),
  ],
];

test("normaliza texto: minúsculas, sin tildes y espacios colapsados", () => {
  assert.equal(normalizeText("  Juan   PÉREZ Gómez  "), "juan perez gomez");
});

test("número de documento se queda solo con dígitos", () => {
  assert.equal(normalizeDocumentNumber("1.003.456.789"), "1003456789");
  assert.equal(normalizeDocumentNumber(""), "");
});

test("tipo de documento se normaliza a código canónico", () => {
  assert.equal(normalizeDocumentType("T.I"), "TI");
  assert.equal(normalizeDocumentType("C.C"), "CC");
  assert.equal(normalizeDocumentType("CE"), "CE");
  assert.equal(normalizeDocumentType("NIT"), "NIT");
  assert.equal(normalizeDocumentType("PASSPORT"), "PASSPORT");
  assert.equal(normalizeDocumentType("n i t"), "NIT");
});

test("monto normaliza '$ 12,000.00' a 12000", () => {
  assert.equal(normalizeAmount("$ 12,000.00"), 12000);
  assert.equal(normalizeAmount("0"), 0);
});

test("fecha y hora normaliza 'dd/mm/aaaa hh:mm:ss a.m./p.m.' a Date", () => {
  const paidAt = normalizePaidAt("01/09/2026 03:05:44 p.m.");
  assert.ok(paidAt instanceof Date);
  assert.equal(paidAt.getFullYear(), 2026);
  assert.equal(paidAt.getMonth(), 8); // Septiembre (0-based)
  assert.equal(paidAt.getDate(), 1);
  assert.equal(paidAt.getHours(), 15); // 03:05:44 p.m. -> 15:05:44
  assert.equal(paidAt.getMinutes(), 5);
  assert.equal(paidAt.getSeconds(), 44);
});

test("fecha y hora acepta el guion antes de p.m. del comprobante de la UNAL", () => {
  const paidAt = normalizePaidAt("01/09/2026 03:05:44-p.m.");
  assert.ok(paidAt instanceof Date);
  assert.equal(paidAt.getHours(), 15);
});

test("parseReceiptText devuelve los campos normalizados del comprobante válido", () => {
  const result = parseReceiptText(sampleText);
  assert.equal(result.status, ECOLLECT_STATUS_APPROVED);
  assert.equal(result.document_number, "1000000000");
  assert.equal(result.document_type, "TI");
  assert.equal(result.amount, 12000);
  assert.equal(result.transaction_id, "169549476");
  assert.equal(result.service_description, "productos avicolas");
  assert.equal(result.full_name, "juan perez gomez");
  assert.ok(result.paid_at instanceof Date);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].total, 12000);
});

test("parseReceiptText rechaza comprobantes sin estado APROBADA", () => {
  assert.throws(() => parseReceiptText("Nombre y Apellido: Juan Pérez Gómez"), /APROBADA/);
});

test("parseReceiptText rechaza comprobantes sin los campos requeridos", () => {
  assert.throws(() => parseReceiptText("Total Pagado: $ 12,000.00\nAPROBADA"), /dato requerido/);
});

test("parseReceiptPages extrae los datos del comprobante de dos páginas", () => {
  const result = parseReceiptPages(samplePages);

  assert.equal(result.full_name, "Stephany Maribel Obando Plata");
  assert.equal(result.document_number, "1127047819");
  assert.equal(result.document_type, "TI");
  assert.equal(result.phone, "3142793290");
  assert.equal(result.email, "sobandop@unal.edu.co");
  assert.equal(result.address, "Cra 14 # 18-14");
  assert.equal(result.amount, 12000);
  assert.equal(result.transaction_id, "169549476");
  assert.equal(result.service_description, "productos avicolas");
  assert.equal(result.status, ECOLLECT_STATUS_APPROVED);
  assert.ok(result.paid_at instanceof Date);
  assert.equal(result.paid_at.getHours(), 15);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].description, "Productos Avicolas");
  assert.equal(result.items[0].total, 12000);
});

test("parseReceiptPages rechaza comprobantes sin estado APROBADA", () => {
  const pages = samplePages.map((items) =>
    items.filter((entry) => !normalizeText(entry.str).includes("aprobada")),
  );
  assert.throws(() => parseReceiptPages(pages), /APROBADA/);
});

test("parseReceiptItems devuelve una línea por descripción con su valor", () => {
  const pages = [
    [
      item("Descripción", 60, 594),
      item("Cantidad", 220, 594),
      item("Valor Pagado", 313, 594),
      item("Productos Avicolas", 62, 571),
      item("1", 222, 569),
      item("$ 12,000.00", 313, 569),
      item("Huevos", 62, 540),
      item("2", 222, 540),
      item("$ 24,000.00", 313, 540),
    ],
  ];

  const items = parseReceiptItems(pages);
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((row) => [row.description, row.quantity, row.total]),
    [
      ["Productos Avicolas", 1, 12000],
      ["Huevos", 1, 24000],
    ],
  );
});
