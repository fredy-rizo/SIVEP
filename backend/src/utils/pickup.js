const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generatePickupCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `RC-${code}`;
}

export function normalizePickupCode(code) {
  return String(code || '').trim().toUpperCase();
}

export async function generateUniquePickupCode(connection, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    const code = generatePickupCode();
    const [rows] = await connection.query('SELECT id FROM sales WHERE pickup_code = ?', [code]);
    if (rows.length === 0) return code;
  }
  throw new Error('No se pudo generar un código único de reclamo');
}

// Código público de una SOLICITUD de compra en efectivo. Se entrega al
// comprador al registrarla y, si el administrador aprueba, pasa a ser el mismo
// código de reclamo de la venta: el comprador conserva un único código de
// seguimiento hasta la entrega.
//
// Se comprueba contra solicitudes y ventas porque ambos espacios comparten el
// código visible. El prefijo `CE-` distingue estas compras de las ventas
// normales (`RC-`).
export async function generateUniqueClaimCode(connection, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    const code = generatePickupCode().replace(/^RC-/, 'CE-');

    const [claims] = await connection.query(
      'SELECT id FROM cash_purchase_claims WHERE claim_code = ?',
      [code],
    );
    if (claims.length > 0) continue;

    const [sales] = await connection.query(
      'SELECT id FROM sales WHERE pickup_code = ?',
      [code],
    );
    if (sales.length === 0) return code;
  }
  throw new Error('No se pudo generar un código único de solicitud');
}
