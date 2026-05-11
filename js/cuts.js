// Decompose a placa layout into a sequence of guillotine cuts.
// Primary objective:   minimize the cut count.
// Secondary tiebreak:  minimize the total cut length (avoids cuts that
//                      extend through leftover space unnecessarily).
// Branch-and-bound search with cut-count budget pruning.
//
// Return convention:
//   []     -> base case (no pieces, or one piece exactly fills the rect).
//   array  -> chosen cut sequence.
//   null   -> no valid decomposition within the budget.

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
  if (limit < 1) return null;

  let mejor = null;
  const probar = (candidato) => {
    if (candidato === null) return;
    if (mejor === null || esMejorCandidato(candidato, mejor)) mejor = candidato;
  };

  // Horizontal cut candidates
  const candY = new Set();
  for (const p of dentro) { candY.add(p.y2); candY.add(p.y - kerf); }
  const ys = [...candY].filter(y => y > rect.y + TOL && y < rect.y2 - TOL).sort((a, b) => a - b);
  for (const y of ys) {
    if (dentro.some(p => p.y < y + kerf - TOL && p.y2 > y + TOL)) continue;
    const cap = mejor ? mejor.length - 1 : limit - 1;
    probar(evaluar(
      { x: rect.x, y: rect.y, x2: rect.x2, y2: y },
      { x: rect.x, y: y + kerf, x2: rect.x2, y2: rect.y2 },
      { tipo: 'horizontal', pos: y, desde: rect.x, hasta: rect.x2, largo: rect.x2 - rect.x, kerf },
      dentro, kerf, cap
    ));
  }

  // Vertical cut candidates
  const candX = new Set();
  for (const p of dentro) { candX.add(p.x2); candX.add(p.x - kerf); }
  const xs = [...candX].filter(x => x > rect.x + TOL && x < rect.x2 - TOL).sort((a, b) => a - b);
  for (const x of xs) {
    if (dentro.some(p => p.x < x + kerf - TOL && p.x2 > x + TOL)) continue;
    const cap = mejor ? mejor.length - 1 : limit - 1;
    probar(evaluar(
      { x: rect.x, y: rect.y, x2: x, y2: rect.y2 },
      { x: x + kerf, y: rect.y, x2: rect.x2, y2: rect.y2 },
      { tipo: 'vertical', pos: x, desde: rect.y, hasta: rect.y2, largo: rect.y2 - rect.y, kerf },
      dentro, kerf, cap
    ));
  }

  return mejor;
}

// Lexicographic: prefer fewer cuts, then shorter total length.
function esMejorCandidato(a, b) {
  if (a.length !== b.length) return a.length < b.length;
  return largoTotal(a) < largoTotal(b);
}

function largoTotal(cortes) {
  let total = 0;
  for (const c of cortes) total += Math.max(0, c.hasta - c.desde);
  return total;
}

function evaluar(sub1, sub2, corte, piezas, kerf, presupuestoSubtree) {
  if (presupuestoSubtree < 0) return null;
  const c1 = buscarOptimo(sub1, piezas, kerf, presupuestoSubtree);
  if (c1 === null) return null;
  const c2 = buscarOptimo(sub2, piezas, kerf, presupuestoSubtree - c1.length);
  if (c2 === null) return null;
  return [corte, ...c1, ...c2];
}
