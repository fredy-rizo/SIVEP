// ============================================================================
// ÁLGEBRA LINEAL APLICADA A SIVEP — Granja El Cairo
// ----------------------------------------------------------------------------
// ¿POR QUÉ álgebra lineal aquí?
//   La granja necesita responder con datos, no con intuición:
//   "¿Cuánto vamos a vender los próximos días?" (planificar producción).
//   Se responde con matrices, sin librerías externas: todo está implementado
//   desde cero en este archivo con fines didácticos.
//
// ¿PARA QUÉ sirve?
//   Las operaciones con matrices (transpuesta, producto, inversa) permiten
//   resolver el sistema de ECUACIONES NORMALES y así trazar la RECTA DE
//   TENDENCIA de las ventas (pronóstico por mínimos cuadrados).
//
// ¿CÓMO funciona en el sistema?
//   - Pronóstico: se toman las ventas diarias (y) numerando los días (x =
//     1, 2, 3, ...) y se ajusta la recta y ≈ m·x + b que minimiza el error
//     cuadrático. Con esa recta se proyectan los próximos días.
// ============================================================================

// ---------------------------------------------------------------------------
// SECCIÓN 1: MATRICES
// Una matriz es una tabla de números (arreglo de arreglos). Aquí la usamos
// para plantear el sistema de ecuaciones del pronóstico de ventas.
// ---------------------------------------------------------------------------

// TRANSPUESTA: (Aᵀ)[i][j] = A[j][i] (filas ↔ columnas).
// ¿Por qué? Las ecuaciones normales exigen multiplicar Xᵀ·X y Xᵀ·y; sin la
// transpuesta esas multiplicaciones serían dimensionalmente imposibles.
// ¿Para qué? Convertir el problema de "n ecuaciones" en un sistema cuadrado
// pequeño (2×2) que sí se puede resolver.
export function transpose(A) {
  // Se crea una matriz nueva con filas y columnas intercambiadas.
  return A[0].map((_, col) => A.map((row) => row[col]));
}

// PRODUCTO DE MATRICES: C[i][j] = Σ_k A[i][k]·B[k][j]
// ¿Por qué? Es como "cruzar" cada fila de A con cada columna de B usando el
// producto punto. Solo es válido si #columnas de A == #filas de B.
// ¿Para qué? Para calcular Xᵀ·X (matriz 2×2 del sistema) y Xᵀ·y (vector del
// sistema) en las ecuaciones normales.
// ¿Cómo? Triple ciclo: recorre cada celda C[i][j] y acumula la suma de los
// productos de la fila i de A con la columna j de B.
export function matMul(A, B) {
  const rowsA = A.length;
  const colsA = A[0].length;
  const rowsB = B.length;
  const colsB = B[0].length;
  // Validación dimensional: el producto solo existe si colsA === rowsB.
  if (colsA !== rowsB) {
    throw new Error("Dimensiones incompatibles para multiplicar matrices");
  }
  // Se inicializa la matriz resultado llena de ceros.
  const C = Array.from({ length: rowsA }, () => Array(colsB).fill(0));
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      // Cada celda es el producto punto de la fila i de A con la columna j de B.
      for (let k = 0; k < colsA; k++) {
        C[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return C;
}

// PRODUCTO MATRIZ × VECTOR: y[i] = Σ_j A[i][j]·v[j]
// ¿Por qué? Es el caso especial del producto de matrices donde B es una sola
// columna. ¿Para qué? Para evaluar la recta del pronóstico: con la matriz X
// de días y el vector β = [b, m], X·β entrega los valores ajustados.
// ¿Cómo? Cada fila de A se combina con el vector mediante producto punto.
export function matVec(A, v) {
  // Se reutiliza matMul tratando al vector como matriz de una columna...
  const asColumn = v.map((x) => [x]);
  const result = matMul(A, asColumn);
  // ...y se aplana el resultado de vuelta a vector.
  return result.map((row) => row[0]);
}

// INVERSA POR GAUSS-JORDAN con pivoteo parcial: A·A⁻¹ = I
// ¿Por qué? Para "despejar" el sistema A·x = b como x = A⁻¹·b. Es el paso que
// permite hallar la pendiente y el intercepto de la recta de tendencia.
// ¿Para qué? Invertir la matriz 2×2 (XᵀX) de las ecuaciones normales.
// ¿Cómo funciona? Se pega la identidad a la derecha [A | I] y con operaciones
// elementales de fila (intercambiar, escalar, sumar múltiplos) se convierte la
// izquierda en la identidad; lo que queda a la derecha ES la inversa. El
// "pivoteo parcial" (elegir el mayor pivote disponible) evita dividir por
// números diminutos y da estabilidad numérica.
export function inverse(A) {
  const n = A.length;
  if (!A.every((row) => row.length === n)) {
    throw new Error("Solo se puede invertir una matriz cuadrada");
  }
  // Se construye la matriz aumentada [A | I] clonando A para no mutarla.
  const M = A.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    // PIVOTEO PARCIAL: buscar la fila con el mayor |valor| en esta columna
    // para usarla como pivote (más estable que usar la fila que toque).
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    }
    // Intercambiar la fila actual con la del pivote.
    [M[col], M[pivot]] = [M[pivot], M[col]];

    const pivotVal = M[col][col];
    // Si el pivote es (casi) cero, la matriz es singular: no tiene inversa
    // (en nuestro caso no ocurre con días distintos, pero se valida).
    if (Math.abs(pivotVal) < 1e-12) {
      throw new Error("Matriz singular: no tiene inversa");
    }
    // NORMALIZAR: dividir toda la fila por el pivote para que valga 1.
    for (let j = 0; j < 2 * n; j++) M[col][j] /= pivotVal;
    // ELIMINAR: restar múltiplos de la fila pivote a TODAS las demás filas
    // (arriba y abajo) para hacer ceros en esta columna → Gauss-Jordan.
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      for (let j = 0; j < 2 * n; j++) M[row][j] -= factor * M[col][j];
    }
  }
  // La mitad derecha de la aumentada es ahora A⁻¹: se extrae y se devuelve.
  return M.map((row) => row.slice(n));
}

// RESOLVER SISTEMA LINEAL: dado A·x = b, hallar x.
// ¿Por qué? Es exactamente lo que piden las ecuaciones normales.
// ¿Para qué? Obtener [intercepto, pendiente] de la recta de tendencia.
// ¿Cómo? Directamente x = A⁻¹ · b usando las funciones anteriores.
export function solve(A, b) {
  // Se invierte A y se multiplica por b (matriz × vector).
  return matVec(inverse(A), b);
}

// ---------------------------------------------------------------------------
// SECCIÓN 2: APLICACIÓN — PRONÓSTICO DE VENTAS (mínimos cuadrados)
// ---------------------------------------------------------------------------
// Planteo: se tienen n días con ventas y₁..yₙ. Se propone el modelo lineal
//   y ≈ m·x + b   (x = número del día: 1, 2, 3, ...)
// con n ecuaciones y solo 2 incógnitas (m, b): sistema SOBRADO que en general
// no tiene solución exacta. El criterio de MÍNIMOS CUADRADOS elige la recta
// que minimiza Σ(yᵢ − m·xᵢ − b)² (el error cuadrático total).
//
// Derivando ese error e igualando a cero salen las ECUACIONES NORMALES:
//   β = (Xᵀ·X)⁻¹ · Xᵀ·y,   con X = [[1,x₁],[1,x₂],...] y β = [b, m].
// La columna de unos en X es la que produce el intercepto b.
// ---------------------------------------------------------------------------

// Ajusta la recta de tendencia a los datos y devuelve sus parámetros.
// ¿Por qué x = 1..n? Porque numerar los días convierte la serie temporal en
// puntos (x, y) del plano, que es lo que la recta necesita.
// ¿Para qué? m dice cuánto suben/bajan las ventas por día ($/día) y b el
// nivel base; además se calcula R² (0 a 1) que indica qué tan bien la recta
// explica los datos (1 = ajuste perfecto): es la medida de CONFIANZA.
export function leastSquares(yValues) {
  const n = yValues.length;
  if (n < 2) {
    throw new Error("Se necesitan al menos 2 datos para ajustar la recta");
  }
  // Eje x: días numerados 1..n (vector columna junto a la columna de unos).
  const xValues = yValues.map((_, i) => i + 1);
  // Matriz de diseño X de n×2: primera columna unos (intercepto), segunda los días.
  const X = xValues.map((x) => [1, x]);
  const Xt = transpose(X); // Xᵀ de 2×n: la transpuesta "dobla" el sistema...
  const XtX = matMul(Xt, X); // ...a una matriz cuadrada 2×2 resoluble...
  const Xty = matVec(Xt, yValues); // ...y al vector 2×1 del lado derecho.
  const [intercept, slope] = solve(XtX, Xty); // β = (XᵀX)⁻¹·Xᵀy → [b, m]

  // R² = 1 − SSres/SStot: fracción de la variación explicada por la recta.
  // SSres = error que deja la recta; SStot = variación total respecto a la media.
  const mean = yValues.reduce((a, b) => b + a, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * xValues[i]; // valor sobre la recta
    ssRes += (yValues[i] - predicted) ** 2; // error residual al cuadrado
    ssTot += (yValues[i] - mean) ** 2; // dispersión respecto a la media
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot; // Si no hay variación, ajuste perfecto.
  return { slope, intercept, r2 };
}

// Proyecta las ventas de los próximos días usando la recta ajustada.
// ¿Por qué? Los días futuros son simplemente x = n+1, n+2, ... evaluados en
// la recta y = m·x + b. ¿Para qué? Darle a la granja una ESTIMACIÓN de
// ingresos para planificar producción y stock. Las ventas no pueden ser
// negativas, así que se recortan a cero con Math.max.
export function forecastNext(yValues, days = 7) {
  // Primero se ajusta la recta con el historial disponible.
  const { slope, intercept, r2 } = leastSquares(yValues);
  const n = yValues.length;
  const predictions = [];
  for (let d = 1; d <= days; d++) {
    // El día futuro n+d se evalúa directamente en la ecuación de la recta.
    predictions.push(Math.max(0, intercept + slope * (n + d)));
  }
  return { slope, intercept, r2, predictions };
}
