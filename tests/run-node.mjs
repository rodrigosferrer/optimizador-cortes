// Node-based mirror of optimizer.test.html — for CI / dev.
// Imports the same harness + optimizer modules, prints results, exits non-zero on failure.

import { optimizar } from '../js/optimizer.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (err) { results.push({ name, ok: false, err: err.message }); }
}
function assert(cond, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function assertEq(actual, expected, msg = '') {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e} got ${a}`);
}

test('empty input returns empty result', () => {
  const r = optimizar({ piezas: [], placas: [], config: { kerf: 3, margenPlaca: 0 } });
  assertEq(r.placas, []);
  assertEq(r.metricas.placasUsadas, 0);
  assertEq(r.errores, []);
});

test('one piece fits in one plate at origin', () => {
  const r = optimizar({
    piezas: [{ id: 'a', nombre: 'A', ancho: 600, alto: 400, cantidad: 1, vetaDireccion: 'ancho' }],
    placas: [{ ancho: 2750, alto: 1830, cantidad: 5 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assertEq(r.metricas.placasUsadas, 1);
  assertEq(r.placas.length, 1);
  assertEq(r.placas[0].colocaciones.length, 1);
  const c = r.placas[0].colocaciones[0];
  assertEq([c.x, c.y, c.ancho, c.alto, c.rotada], [0, 0, 600, 400, false]);
});

test('two pieces fit in one plate (no waste of second plate)', () => {
  const r = optimizar({
    piezas: [
      { id: 'a', nombre: 'A', ancho: 1000, alto: 500, cantidad: 1, vetaDireccion: 'libre' },
      { id: 'b', nombre: 'B', ancho: 800, alto: 500, cantidad: 1, vetaDireccion: 'libre' },
    ],
    placas: [{ ancho: 2750, alto: 1830, cantidad: 1 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assertEq(r.metricas.placasUsadas, 1);
  assertEq(r.placas[0].colocaciones.length, 2);
  assertEq(r.errores, []);
  const [c1, c2] = r.placas[0].colocaciones;
  const overlap = c1.x < c2.x + c2.ancho && c2.x < c1.x + c1.ancho
               && c1.y < c2.y + c2.alto && c2.y < c1.y + c1.alto;
  assert(!overlap, 'pieces should not overlap');
});

test('two pieces stacked vertically use one plate', () => {
  const r = optimizar({
    piezas: [
      { id: 'a', nombre: 'A', ancho: 2000, alto: 800, cantidad: 1, vetaDireccion: 'libre' },
      { id: 'b', nombre: 'B', ancho: 2000, alto: 600, cantidad: 1, vetaDireccion: 'libre' },
    ],
    placas: [{ ancho: 2750, alto: 1830, cantidad: 1 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assertEq(r.metricas.placasUsadas, 1);
  assertEq(r.placas[0].colocaciones.length, 2);
});

test('kerf 3mm forces extra plate when pieces tight', () => {
  const r = optimizar({
    piezas: [{ id: 'a', nombre: 'A', ancho: 50, alto: 100, cantidad: 2, vetaDireccion: 'ancho' }],
    placas: [{ ancho: 100, alto: 100, cantidad: 5 }],
    config: { kerf: 3, margenPlaca: 0 },
  });
  assertEq(r.metricas.placasUsadas, 2);
});

test('kerf 0 packs both pieces in one plate', () => {
  const r = optimizar({
    piezas: [{ id: 'a', nombre: 'A', ancho: 50, alto: 100, cantidad: 2, vetaDireccion: 'ancho' }],
    placas: [{ ancho: 100, alto: 100, cantidad: 5 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assertEq(r.metricas.placasUsadas, 1);
});

test('rotable piece rotates to fit', () => {
  const r = optimizar({
    piezas: [{ id: 'a', nombre: 'A', ancho: 100, alto: 600, cantidad: 1, vetaDireccion: 'libre' }],
    placas: [{ ancho: 700, alto: 150, cantidad: 1 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assertEq(r.errores, []);
  assertEq(r.placas[0].colocaciones[0].rotada, true);
  assertEq(r.placas[0].colocaciones[0].ancho, 600);
  assertEq(r.placas[0].colocaciones[0].alto, 100);
});

test('non-rotable piece does not rotate', () => {
  const r = optimizar({
    piezas: [{ id: 'a', nombre: 'A', ancho: 100, alto: 600, cantidad: 1, vetaDireccion: 'ancho' }],
    placas: [{ ancho: 700, alto: 150, cantidad: 1 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assert(r.errores.length === 1, 'should error: piece does not fit');
});

test('stock insufficient: places all pieces and reports faltantes', () => {
  const r = optimizar({
    piezas: [{ id: 'a', nombre: 'A', ancho: 2000, alto: 1500, cantidad: 5, vetaDireccion: 'ancho' }],
    placas: [{ ancho: 2750, alto: 1830, cantidad: 1 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assertEq(r.metricas.placasUsadas, 5);
  assertEq(r.metricas.placasFaltantes, 4);
  const total = r.placas.reduce((s, p) => s + p.colocaciones.length, 0);
  assertEq(total, 5);
});

test('stock sufficient: placasFaltantes is 0', () => {
  const r = optimizar({
    piezas: [{ id: 'a', nombre: 'A', ancho: 2000, alto: 1500, cantidad: 2, vetaDireccion: 'ancho' }],
    placas: [{ ancho: 2750, alto: 1830, cantidad: 5 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assertEq(r.metricas.placasFaltantes, 0);
});

test('piece bigger than stock yields error, others still placed', () => {
  const r = optimizar({
    piezas: [
      { id: 'a', nombre: 'Gigante', ancho: 5000, alto: 5000, cantidad: 1, vetaDireccion: 'libre' },
      { id: 'b', nombre: 'Normal', ancho: 600, alto: 400, cantidad: 1, vetaDireccion: 'libre' },
    ],
    placas: [{ ancho: 2750, alto: 1830, cantidad: 5 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assert(r.errores.some(e => e.includes('Gigante')), 'expected error mentioning Gigante');
  const total = r.placas.reduce((s, p) => s + p.colocaciones.length, 0);
  assertEq(total, 1);
});

const passed = results.filter(r => r.ok).length;
const failed = results.length - passed;
for (const r of results) {
  console.log((r.ok ? '\x1b[32m✓\x1b[0m ' : '\x1b[31m✗\x1b[0m ') + r.name + (r.ok ? '' : '\n  ' + r.err));
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
