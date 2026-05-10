// Decompose a placa layout into a sequence of guillotine cuts that minimizes
// the total cut count. Brute-force search with branch-and-bound pruning.
//
// At each rectangle we try every valid horizontal AND vertical cut, recurse,
// and keep the option that produces the fewest total cuts. Pure function — no
// shared mutable state — so backtracking is free.
//
// Return convention from the search:
//   []     -> base case: rect contains no piece, or one piece that fills it
//             (no cuts needed).
//   array  -> the chosen cut sequence.
//   null   -> no valid decomposition exists within the budget (`limit`); the
//             caller should ignore this branch.

const TOL = 0.5; // mm tolerance for "is on edge"

export function planCortes(placa, kerf = 0) {
  const piezas = placa.colocaciones.map((c, i) => ({
    idx: i + 1,
    nombre: c.nombre,
    x: c.x, y: c.y,
    x2: c.x + c.ancho,
    y2: c.y + c.alto,
  }));
  const cortes = buscarOptimo(
    { x: 0, y: 0, x2: placa.ancho, y2: placa.alto },
    piezas,
    kerf,
    Infinity
  ) || [];
  return cortes.map((c, i) => ({ n: i + 1, ...c }));
}

function buscarOptimo(rect, piezas, kerf, limit) {
  const dentro = piezas.filter(p =>
    p.x >= rect.x - TOL && p.y >= rect.y - TOL &&
    p.x2 <= rect.x2 + TOL && p.y2 <= rect.y2 + TOL
  );
  if (dentro.length === 0) return [];
  if (dentro.length === 1) {
    const p = dentro[0];
    const fillsX = p.x <= rect.x + TOL && p.x2 >= rect.x2 - TOL;
    const fillsY = p.y <= rect.y + TOL && p.y2 >= rect.y2 - TOL;
    if (fillsX && fillsY) return [];
  }
  // Need at least one cut from here on. If budget is < 1, impossible.
  if (limit < 1) return null;

  let mejor = null;

  // Horizontal cut candidates
  const candY = new Set();
  for (const p of dentro) { candY.add(p.y); candY.add(p.y2); }
  const ys = [...candY].filter(y => y > rect.y + TOL && y < rect.y2 - TOL).sort((a, b) => a - b);
  for (const y of ys) {
    if (dentro.some(p => p.y < y - TOL && p.y2 > y + TOL)) continue;
    const cap = mejor ? mejor.length - 1 : limit - 1;
    const candidato = evaluar(
      { x: rect.x, y: rect.y, x2: rect.x2, y2: y },
      { x: rect.x, y: y + kerf, x2: rect.x2, y2: rect.y2 },
      { tipo: 'horizontal', pos: y, desde: rect.x, hasta: rect.x2, largo: rect.x2 - rect.x, kerf },
      dentro, kerf, cap
    );
    if (candidato !== null && (!mejor || candidato.length < mejor.length)) mejor = candidato;
  }

  // Vertical cut candidates
  const candX = new Set();
  for (const p of dentro) { candX.add(p.x); candX.add(p.x2); }
  const xs = [...candX].filter(x => x > rect.x + TOL && x < rect.x2 - TOL).sort((a, b) => a - b);
  for (const x of xs) {
    if (dentro.some(p => p.x < x - TOL && p.x2 > x + TOL)) continue;
    const cap = mejor ? mejor.length - 1 : limit - 1;
    const candidato = evaluar(
      { x: rect.x, y: rect.y, x2: x, y2: rect.y2 },
      { x: x + kerf, y: rect.y, x2: rect.x2, y2: rect.y2 },
      { tipo: 'vertical', pos: x, desde: rect.y, hasta: rect.y2, largo: rect.y2 - rect.y, kerf },
      dentro, kerf, cap
    );
    if (candidato !== null && (!mejor || candidato.length < mejor.length)) mejor = candidato;
  }

  return mejor; // may be null if no candidate fits the budget
}

// Returns [corte, ...subcuts] or null if total exceeds `presupuestoSubtree`
// (i.e., the combined sub-cut count must be <= presupuestoSubtree).
function evaluar(sub1, sub2, corte, piezas, kerf, presupuestoSubtree) {
  if (presupuestoSubtree < 0) return null;
  const c1 = buscarOptimo(sub1, piezas, kerf, presupuestoSubtree);
  if (c1 === null) return null;
  const c2 = buscarOptimo(sub2, piezas, kerf, presupuestoSubtree - c1.length);
  if (c2 === null) return null;
  return [corte, ...c1, ...c2];
}
