// URL de la página de pago virtual de la UNAL donde se realizan las compras.
// Se puede sobreescribir con VITE_ECOLLECT_PURCHASE_URL sin tocar el código.
export const ECOLLECT_PURCHASE_URL =
  import.meta.env.VITE_ECOLLECT_PURCHASE_URL ||
  "https://pagovirtual.unal.edu.co/index.php";
