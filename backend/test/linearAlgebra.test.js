import test from 'node:test';
import assert from 'node:assert/strict';
import {
  leastSquares,
  forecastNext,
  transpose,
  matMul,
  inverse,
} from '../src/math/linearAlgebra.js';

test('leastSquares ajusta una recta perfecta y da R² = 1', () => {
  const { slope, intercept, r2 } = leastSquares([100, 200, 300]);
  assert.ok(Math.abs(slope - 100) < 1e-9);
  assert.ok(Math.abs(intercept - 0) < 1e-9);
  assert.ok(Math.abs(r2 - 1) < 1e-9);
});

test('forecastNext proyecta los días siguientes con la recta ajustada', () => {
  const result = forecastNext([100, 200, 300], 3);
  assert.equal(result.predictions.length, 3);
  assert.ok(Math.abs(result.predictions[0] - 400) < 1e-9);
  assert.ok(Math.abs(result.predictions[1] - 500) < 1e-9);
  assert.ok(Math.abs(result.predictions[2] - 600) < 1e-9);
});

test('forecastNext no devuelve ventas negativas', () => {
  const result = forecastNext([300, 200, 100], 3);
  assert.ok(result.predictions.every((value) => value >= 0));
});

test('transpose, matMul e inverse resuelven un sistema 2x2', () => {
  const A = [
    [4, 2],
    [1, 3],
  ];
  const Ainv = inverse(A);
  const identity = matMul(A, Ainv);
  assert.ok(Math.abs(identity[0][0] - 1) < 1e-9);
  assert.ok(Math.abs(identity[0][1]) < 1e-9);
  assert.ok(Math.abs(identity[1][0]) < 1e-9);
  assert.ok(Math.abs(identity[1][1] - 1) < 1e-9);

  const transposed = transpose(A);
  assert.deepEqual(transposed, [
    [4, 1],
    [2, 3],
  ]);
});
