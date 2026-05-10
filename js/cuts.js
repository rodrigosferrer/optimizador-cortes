// Decompose a placa layout (pieces with x/y/ancho/alto) into a sequence of
// guillotine cuts that the operator must perform on the panel saw.
//
// Algorithm: recursive top-down decomposition. For each rectangle, find a
// horizontal or vertical cut line that no piece straddles, splitting the
// rectangle into two halves. Recurse on each half. Stop when the rectangle
// contains 0 or 1 pieces.

const TOL = 0.5; // mm tolerance for "is on edge"

export function planCortes(placa, kerf = 0) {
  const piezas = placa.colocaciones.map((c, i) => ({
    idx: i + 1,
    nombre: c.nombre,
    x: c.x, y: c.y,
    x2: c.x + c.ancho,
    y2: c.y + c.alto,
  }));
  const cortes = [];
  decomponer({ x: 0, y: 0, x2: placa.ancho, y2: placa.alto }, piezas, cortes, kerf);
  return cortes.map((c, i) => ({ n: i + 1, ...c }));
}

function decomponer(rect, piezas, cortes, kerf) {
  const dentro = piezas.filter(p =>
    p.x >= rect.x - TOL && p.y >= rect.y - TOL &&
    p.x2 <= rect.x2 + TOL && p.y2 <= rect.y2 + TOL
  );
  // No pieces in this region: nothing to cut (the operator just keeps the leftover slab).
  if (dentro.length === 0) return;
  // One piece that exactly fills the rect: no further cut needed.
  if (dentro.length === 1) {
    const p = dentro[0];
    const fillsX = p.x <= rect.x + TOL && p.x2 >= rect.x2 - TOL;
    const fillsY = p.y <= rect.y + TOL && p.y2 >= rect.y2 - TOL;
    if (fillsX && fillsY) return;
  }

  // Try horizontal cut first (any y-line not straddled by any piece)
  const candY = new Set();
  for (const p of dentro) { candY.add(p.y); candY.add(p.y2); }
  const ysOrdenados = [...candY].filter(y => y > rect.y + TOL && y < rect.y2 - TOL).sort((a, b) => a - b);
  for (const y of ysOrdenados) {
    if (dentro.some(p => p.y < y - TOL && p.y2 > y + TOL)) continue;
    // Lower sub-rect starts AFTER the kerf so we don't re-cut the kerf gap.
    const sup = { x: rect.x, y: rect.y, x2: rect.x2, y2: y };
    const inf = { x: rect.x, y: y + kerf, x2: rect.x2, y2: rect.y2 };
    cortes.push({
      tipo: 'horizontal',
      pos: y,
      desde: rect.x, hasta: rect.x2,
      largo: rect.x2 - rect.x,
      kerf,
    });
    decomponer(sup, dentro, cortes, kerf);
    decomponer(inf, dentro, cortes, kerf);
    return;
  }

  // Vertical cut
  const candX = new Set();
  for (const p of dentro) { candX.add(p.x); candX.add(p.x2); }
  const xsOrdenados = [...candX].filter(x => x > rect.x + TOL && x < rect.x2 - TOL).sort((a, b) => a - b);
  for (const x of xsOrdenados) {
    if (dentro.some(p => p.x < x - TOL && p.x2 > x + TOL)) continue;
    const izq = { x: rect.x, y: rect.y, x2: x, y2: rect.y2 };
    const der = { x: x + kerf, y: rect.y, x2: rect.x2, y2: rect.y2 };
    cortes.push({
      tipo: 'vertical',
      pos: x,
      desde: rect.y, hasta: rect.y2,
      largo: rect.y2 - rect.y,
      kerf,
    });
    decomponer(izq, dentro, cortes, kerf);
    decomponer(der, dentro, cortes, kerf);
    return;
  }
  // Should not reach here for a valid guillotine layout.
}
