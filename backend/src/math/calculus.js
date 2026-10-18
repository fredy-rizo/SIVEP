// ============================================================================
// CÁLCULO DIFERENCIAL APLICADO A SIVEP — Granja El Cairo
// ----------------------------------------------------------------------------
// ¿POR QUÉ cálculo aquí?
//   El módulo de álgebra lineal (src/math/linearAlgebra.js) traza la RECTA de
//   la tendencia. Pero una recta no dice a qué RITMO cambian las ventas ni
//   cuánto conviene pedir para no desperdiciar plata en inventario. Para eso
//   hace falta la DERIVADA: la razón de cambio instantánea de una función.
//
// ¿PARA QUÉ sirve cada parte?
//   1) RITMO DE VENTAS (Sección 1): la 1ª derivada de la serie diaria de
//      ventas mide la "velocidad" (cuánto cambian las ventas por día) y la 2ª
//      derivada la "aceleración" (si ese ritmo sube o se frena). Permite
//      anticipar quiebres o estancamientos antes de que se vean en el total.
//   2) OPTIMIZACIÓN DE PEDIDOS / EOQ (Sección 2): el costo de inventario es
//      una función del tamaño del pedido; su derivada igualada a cero da el
//      pedido ÓPTIMO (mínimo costo). Es el caso de estudio clásico del cálculo
//      diferencial aplicado (Economic Order Quantity).
//
// ¿CÓMO funciona en el sistema?
//   - Las ventas son una serie DISCRETA (un valor por día), no una función
//     continua; por eso no hay "límite" y se usan DIFERENCIAS FINITAS
//     (aproximaciones de la derivada con cocientes incrementales).
//   - Todo se implementa desde cero, sin librerías externas, con fines
//     didácticos, igual que linearAlgebra.js.
//
// NOTA DE DISEÑO: este archivo es PURO. No toca la base de datos ni Fastify.
// Recibe arreglos de números y devuelve números/arreglos; así es trivial de
// probar y de reutilizar desde cualquier controlador.
// ============================================================================

// ---------------------------------------------------------------------------
// SECCIÓN 1: DERIVADAS NUMÉRICAS — VELOCIDAD Y ACELERACIÓN DE LAS VENTAS
// ---------------------------------------------------------------------------
// Definición matemática de derivada:  f'(x) = lím_{h→0} (f(x+h) − f(x)) / h.
// Con datos diarios NO podemos tomar el límite (solo hay un valor por día),
// así que elegimos un h fijo y usamos COCIENTES INCREMENTALES (diferencias
// finitas). Como los días están equiespaciados, tomamos h = 1 día.

/**
 * Primera derivada numérica por DIFERENCIA CENTRADA.
 *
 * ¿POR QUÉ centrada y no hacia adelante? La fórmula centrada
 *   f'(x) ≈ (f(x+h) − f(x−h)) / (2h)
 * es de orden O(h²) (error mucho menor) que la diferencia hacia adelante de
 * orden O(h), a cambio de necesitar un punto a cada lado. Por eso se usa en el
 * INTERIOR de la serie y se deja diferencia de un solo lado SOLO en los
 * extremos, donde no existe vecino por un lado.
 *
 * @param {number[]} values Serie equiespaciada (p. ej. ventas por día).
 * @returns {number[]} Derivada en cada punto, MISMA longitud que `values`.
 *                     Unidad: [unidad de values] / día.
 */
export function numericDerivative(values) {
  if (!Array.isArray(values) || values.length < 2) {
    throw new Error('numericDerivative requiere al menos 2 valores');
  }
  const n = values.length;
  const derivative = new Array(n);

  // Extremo izquierdo: no hay punto anterior → diferencia hacia adelante.
  derivative[0] = values[1] - values[0];

  // Interior: diferencia centrada (mejor precisión, simétrica).
  for (let i = 1; i < n - 1; i++) {
    derivative[i] = (values[i + 1] - values[i - 1]) / 2;
  }

  // Extremo derecho: no hay punto posterior → diferencia hacia atrás.
  derivative[n - 1] = values[n - 1] - values[n - 2];

  return derivative;
}

/**
 * Segunda derivada numérica: la derivada de la derivada.
 *
 * ¿POR QUÉ? La 1ª derivada (velocidad) dice SI las ventas suben o bajan; la
 * 2ª derivada (aceleración) dice si ese cambio se ACELERA o se FRENA. Es la
 * base del "criterio de la segunda derivada" para clasificar máximos/mínimos.
 *
 * @param {number[]} values Serie original.
 * @returns {number[]} Aceleración en cada punto. Unidad: values / día².
 */
export function secondDerivative(values) {
  // Derivar dos veces es aplicar numericDerivative de forma encadenada.
  return numericDerivative(numericDerivative(values));
}

/**
 * Resumen interpretable del ritmo de una serie (velocidad y aceleración).
 *
 * ¿PARA QUÉ? Traducir los arreglos de derivadas a indicadores que un humano
 * entienda en el dashboard: magnitud promedio, estado actual y una etiqueta
 * cualitativa ("fase").
 *
 * Fases según el signo de (velocidad, aceleración):
 *   (+, +) crecimiento acelerado      (+, −) crecimiento desacelerado
 *   (−, −) caída acelerada            (−, +) caída frenándose / recuperación
 *
 * @param {number[]} values Serie equiespaciada.
 * @returns {{
 *   velocities: number[],
 *   accelerations: number[],
 *   averageVelocity: number,
 *   averageAcceleration: number,
 *   currentVelocity: number,
 *   currentAcceleration: number,
 *   phase: string
 * }}
 */
export function rateSummary(values) {
  const velocities = numericDerivative(values);
  const accelerations = secondDerivative(values);
  const mean = (arr) => arr.reduce((acc, v) => acc + v, 0) / arr.length;

  // La "velocidad/acentuación actual" es la última observación disponible
  // (lo más reciente), que es lo que le importa a quien decide hoy.
  const currentVelocity = velocities[velocities.length - 1];
  const currentAcceleration = accelerations[accelerations.length - 1];

  // Clasificación cualitativa de la fase (ver tabla del encabezado).
  let phase = 'estable';
  if (currentVelocity > 0) {
    phase = currentAcceleration >= 0 ? 'crecimiento acelerado' : 'crecimiento desacelerado';
  } else if (currentVelocity < 0) {
    phase = currentAcceleration <= 0 ? 'caída acelerada' : 'caída desacelerada';
  }

  return {
    velocities,
    accelerations,
    averageVelocity: mean(velocities),
    averageAcceleration: mean(accelerations),
    currentVelocity,
    currentAcceleration,
    phase,
  };
}

// ---------------------------------------------------------------------------
// SECCIÓN 2: OPTIMIZACIÓN — TAMAÑO ECONÓMICO DE PEDIDO (EOQ)
// ---------------------------------------------------------------------------
// Modelo clásico de inventario. El COSTO TOTAL anual de un producto depende del
// tamaño de pedido q y tiene DOS componentes que se oponen:
//
//   C(q) = (D / q) · S        +      (q / 2) · H
//          \_____  _____/            \____  ____/
//                \/                       \/
//   costo de ORDENAR (pedidos)     costo de MANTENER (almacenar)
//
//   D = demanda anual (unidades/año)
//   S = costo fijo por pedido ($/pedido)  — transportar, tramitar, etc.
//   H = costo de mantener 1 unidad por año ($/unidad·año)
//
// Intuición: pedir mucho reduce nº de pedidos (baja D/q·S) pero sube el stock
// promedio (sube q/2·H); pedir poco hace lo contrario. Existe un punto medio.
//
// CÁLCULO DIFERENCIAL: minimizamos C(q).
//   1) 1ª derivada:  C'(q) = −(D·S)/q² + H/2
//   2) Punto crítico: C'(q) = 0  ⟹  H/2 = (D·S)/q²  ⟹  q* = √(2·D·S / H)
//   3) 2ª derivada:  C''(q) = 2·D·S / q³  > 0 para todo q>0
//      Al ser positiva, el punto crítico es un MÍNIMO (criterio de la 2ª
//      derivada): q* es el tamaño de pedido que MINIMIZA el costo total.
// ---------------------------------------------------------------------------

/**
 * Cantidad económica de pedido (EOQ) y métricas derivadas.
 *
 * @param {object} params
 * @param {number} params.demand     D: demanda del periodo (unidades).
 * @param {number} params.orderCost  S: costo fijo por pedido ($).
 * @param {number} params.holdingCost H: costo de mantener 1 unidad por periodo ($).
 * @returns {{
 *   quantity: number,        // q*: pedido óptimo (unidades)
 *   totalCost: number,       // C(q*): costo total mínimo ($)
 *   orderCostTotal: number,  // porción de costo de ordenar en el óptimo
 *   holdingCostTotal: number,// porción de costo de mantener en el óptimo
 *   ordersPerYear: number,   // D / q*: nº de pedidos por periodo
 *   cycleDays: number        // días entre pedidos (periodo de 365 días)
 * } | null}
 */
export function eoq({ demand, orderCost, holdingCost }) {
  // Sin demanda no hay nada que pedir: se informa con null en vez de dividir
  // entre cero o devolver NaN (contrato defensivo para el controlador).
  if (!(demand > 0)) return null;
  // S y H deben ser positivos: físicamente no tiene sentido un costo <= 0 y la
  // fórmula √(2DS/H) se indetermina. Se falla temprano y con mensaje claro.
  if (!(orderCost > 0) || !(holdingCost > 0)) {
    throw new Error('orderCost y holdingCost deben ser mayores que cero');
  }

  // Fórmula cerrada obtenida al resolver C'(q) = 0 (ver deducción arriba).
  const quantity = Math.sqrt((2 * demand * orderCost) / holdingCost);

  // Se descomponen los dos componentes del costo PARA MOSTRAR que en el óptimo
  // ambos se igualan (D/q·S = q/2·H), propiedad característica del EOQ.
  const orderCostTotal = (demand / quantity) * orderCost;
  const holdingCostTotal = (quantity / 2) * holdingCost;

  const ordersPerYear = demand / quantity;
  // Días entre pedidos asumiendo un periodo de 365 días.
  const cycleDays = ordersPerYear > 0 ? 365 / ordersPerYear : 0;

  return {
    quantity,
    totalCost: orderCostTotal + holdingCostTotal,
    orderCostTotal,
    holdingCostTotal,
    ordersPerYear,
    cycleDays,
  };
}

/**
 * Costo total de inventario para un tamaño de pedido CUALQUIERA.
 *
 * ¿PARA QUÉ? Dibujar la curva C(q) en el frontend y ver, de forma visual, que
 * el mínimo cae exactamente en q*. Es la evidencia de que la derivada hizo su
 * trabajo. No es parte del cálculo del óptimo, solo de su visualización.
 *
 * @returns {number} C(q) = (D/q)·S + (q/2)·H.
 */
export function inventoryTotalCost(q, { demand, orderCost, holdingCost }) {
  if (!(q > 0)) return 0;
  return (demand / q) * orderCost + (q / 2) * holdingCost;
}

/**
 * Verificación por el CRITERIO DE LA SEGUNDA DERIVADA.
 *
 * ¿POR QUÉ? Un buen ingeniero no confía a ciegas en la fórmula: comprueba que
 * el punto crítico sea un MÍNIMO. C''(q) = 2·D·S / q³ es > 0 para q>0, luego
 * q* es efectivamente un mínimo. Se expone como función para hacer explícito
 * el argumento matemático y para depuración/telemetría.
 *
 * @returns {boolean} true siempre que D, S, q > 0 (mínimo garantizado).
 */
export function isMinimum({ demand, orderCost }, q) {
  const secondDeriv = (2 * demand * orderCost) / q ** 3;
  return secondDeriv > 0;
}
