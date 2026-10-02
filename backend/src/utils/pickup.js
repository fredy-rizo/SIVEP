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