import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// ============================================================================
// COMPROBANTE DE PAGO DE DEMOSTRACIÓN
// ----------------------------------------------------------------------------
// Genera un PDF con los datos reales de una venta (cliente, fecha, productos y
// total) para las ventas sembradas con el script de demostración. Se marca de
// forma visible como documento de demostración y no se usa para ventas reales.
// ============================================================================

const PAGE_WIDTH = 595.28; // A4 en puntos
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;

const COLORS = {
  primary: rgb(0.043, 0.31, 0.227),
  primarySoft: rgb(0.925, 0.965, 0.945),
  accent: rgb(0.61, 0.11, 0.2),
  text: rgb(0.13, 0.16, 0.2),
  muted: rgb(0.42, 0.47, 0.53),
  line: rgb(0.85, 0.88, 0.9),
  white: rgb(1, 1, 1),
  warningBg: rgb(1, 0.965, 0.88),
  warningText: rgb(0.55, 0.36, 0.03),
};

const money = (value) =>
  `$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(
    Number(value || 0),
  )}`;

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  });
}

function truncate(text, max) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export async function saleReceiptPdf({
  sale,
  customer,
  items = [],
  organizationName = "Granja El Cairo - UNAL Sede Orinoquía",
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT;

  const text = (value, x, size, options = {}) =>
    page.drawText(String(value ?? ""), {
      x,
      y,
      size,
      font: options.bold ? bold : font,
      color: options.color || COLORS.text,
      maxWidth: options.maxWidth,
      lineHeight: size * 1.35,
    });

  // --- Encabezado ---------------------------------------------------------
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 104,
    width: PAGE_WIDTH,
    height: 104,
    color: COLORS.primary,
  });

  page.drawText("SIVEP", {
    x: MARGIN,
    y: PAGE_HEIGHT - 56,
    size: 24,
    font: bold,
    color: COLORS.white,
  });
  page.drawText("Sistema de Inventario, Ventas y Producción", {
    x: MARGIN,
    y: PAGE_HEIGHT - 76,
    size: 9,
    font,
    color: rgb(0.82, 0.9, 0.86),
  });
  page.drawText(truncate(organizationName, 34), {
    x: PAGE_WIDTH - MARGIN - 190,
    y: PAGE_HEIGHT - 50,
    size: 9,
    font: bold,
    color: COLORS.white,
  });
  page.drawText("NIT 891.800.123-4 · Villavicencio", {
    x: PAGE_WIDTH - MARGIN - 190,
    y: PAGE_HEIGHT - 66,
    size: 8,
    font,
    color: rgb(0.82, 0.9, 0.86),
  });
  page.drawText("COMPROBANTE DE PAGO", {
    x: PAGE_WIDTH - MARGIN - 190,
    y: PAGE_HEIGHT - 88,
    size: 10,
    font: bold,
    color: rgb(0.82, 0.9, 0.86),
  });

  y = PAGE_HEIGHT - 124;

  // --- Aviso de demostración ---------------------------------------------
  page.drawRectangle({
    x: MARGIN,
    y: y - 24,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 24,
    color: COLORS.warningBg,
  });
  page.drawText(
    "DOCUMENTO DE DEMOSTRACIÓN · No válido como comprobante de pago real",
    {
      x: MARGIN + 12,
      y: y - 16,
      size: 9,
      font: bold,
      color: COLORS.warningText,
    },
  );

  y -= 52;

  // --- Datos de la transacción -------------------------------------------
  const paid = ["pagado"].includes(sale.payment_status);
  const modeLabel =
    sale.payment_mode === "efectivo" ? "Pago en efectivo (caja)" : "Pago en línea (eCollect)";

  const transactionRows = [
    ["Nro. de factura", sale.invoice_number],
    ["Fecha y hora", formatDate(sale.sale_date)],
    ["Medio de pago", modeLabel],
    ["Estado", paid ? "Aprobado" : "Pendiente"],
  ];

  text("DATOS DE LA TRANSACCIÓN", MARGIN, 9, { bold: true, color: COLORS.muted });
  y -= 20;

  for (const [label, value] of transactionRows) {
    text(label, MARGIN, 10, { color: COLORS.muted });
    text(truncate(value, 48), MARGIN + 150, 10, { bold: true });
    y -= 17;
  }

  y -= 12;

  // --- Datos del comprador ------------------------------------------------
  text("DATOS DEL COMPRADOR", MARGIN, 9, { bold: true, color: COLORS.muted });
  y -= 20;

  const buyerRows = [
    ["Nombre", customer.full_name],
    [
      "Documento",
      `${customer.document_type || "CC"} ${customer.document_number || ""}`.trim(),
    ],
    ["Correo", customer.email || "No registrado"],
    ["Teléfono", customer.phone || "No registrado"],
  ];

  for (const [label, value] of buyerRows) {
    text(label, MARGIN, 10, { color: COLORS.muted });
    text(truncate(value, 52), MARGIN + 150, 10);
    y -= 17;
  }

  y -= 16;

  // --- Tabla de productos -------------------------------------------------
  const tableTop = y;
  const colQty = MARGIN + 300;
  const colUnit = MARGIN + 380;
  const colTotal = MARGIN + 452;

  page.drawRectangle({
    x: MARGIN,
    y: tableTop - 22,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 22,
    color: COLORS.primary,
  });
  page.drawText("PRODUCTO", {
    x: MARGIN + 10,
    y: tableTop - 15,
    size: 8,
    font: bold,
    color: COLORS.white,
  });
  page.drawText("CANT.", {
    x: colQty,
    y: tableTop - 15,
    size: 8,
    font: bold,
    color: COLORS.white,
  });
  page.drawText("VALOR UNIT.", {
    x: colUnit,
    y: tableTop - 15,
    size: 8,
    font: bold,
    color: COLORS.white,
  });
  page.drawText("TOTAL", {
    x: colTotal,
    y: tableTop - 15,
    size: 8,
    font: bold,
    color: COLORS.white,
  });

  y = tableTop - 40;

  for (const item of items) {
    if (y < 190) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 60;
    }

    page.drawText(truncate(item.description, 38), {
      x: MARGIN + 10,
      y,
      size: 10,
      font,
      color: COLORS.text,
    });
    page.drawText(String(item.quantity), {
      x: colQty,
      y,
      size: 10,
      font,
      color: COLORS.text,
    });
    page.drawText(money(item.unit_price), {
      x: colUnit,
      y,
      size: 10,
      font,
      color: COLORS.text,
    });
    page.drawText(money(item.total), {
      x: colTotal,
      y,
      size: 10,
      font,
      color: COLORS.text,
    });

    page.drawLine({
      start: { x: MARGIN, y: y - 8 },
      end: { x: PAGE_WIDTH - MARGIN, y: y - 8 },
      thickness: 0.5,
      color: COLORS.line,
    });
    y -= 24;
  }

  // --- Total --------------------------------------------------------------
  y -= 8;
  page.drawRectangle({
    x: MARGIN,
    y: y - 34,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 34,
    color: COLORS.primarySoft,
  });
  page.drawText("TOTAL PAGADO", {
    x: MARGIN + 10,
    y: y - 22,
    size: 11,
    font: bold,
    color: COLORS.primary,
  });
  page.drawText(money(sale.total), {
    x: MARGIN + 330,
    y: y - 24,
    size: 16,
    font: bold,
    color: COLORS.primary,
  });

  // --- Pie ----------------------------------------------------------------
  const footerY = 72;
  page.drawLine({
    start: { x: MARGIN, y: footerY + 26 },
    end: { x: PAGE_WIDTH - MARGIN, y: footerY + 26 },
    thickness: 0.5,
    color: COLORS.line,
  });
  page.drawText(
    "Comprobante generado por SIVEP con fines de demostración académica.",
    {
      x: MARGIN,
      y: footerY + 10,
      size: 8,
      font,
      color: COLORS.muted,
    },
  );
  page.drawText(
    `${organizationName} · https://sivep.vercel.app`,
    {
      x: MARGIN,
      y: footerY - 4,
      size: 8,
      font,
      color: COLORS.muted,
    },
  );

  return Buffer.from(await pdf.save());
}
