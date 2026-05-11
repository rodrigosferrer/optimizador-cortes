// Pure module: pieces + plates + config -> layout result.
// No DOM, no localStorage, no globals.
//
// Search space explored:
//   - Piece order (permutation)
//   - Per-piece placement rule:  'short-side-fit' | 'long-side-fit' | 'best-area-fit'
//   - Per-piece split rule:      'short-axis' | 'long-axis'
// SA mutates by swapping two pieces OR re-rolling one piece's placement/split rule.

const PLACEMENT_RULES = ['short-side-fit', 'long-side-fit', 'best-area-fit'];
const SPLIT_RULES = ['short-axis', 'long-axis'];

const SORT_STRATEGIES = [
  { nombre: 'area-desc', cmp: (p, q) => (q.ancho * q.alto) - (p.ancho * p.alto) },
  { nombre: 'lado-mayor-desc', cmp: (p, q) => Math.max(q.ancho, q.alto) - Math.max(p.ancho, p.alto) },
  { nombre: 'alto-desc', cmp: (p, q) => q.alto - p.alto },
  { nombre: 'ancho-desc', cmp: (p, q) => q.ancho - p.ancho },
  { nombre: 'perimetro-desc', cmp: (p, q) => (q.ancho + q.alto) - (p.ancho + p.alto) },
];

const SA_DEFAULTS = {
  iteraciones: 5000,
  tempInicialFrac: 0.10,
  tempFinalFrac: 0.0005,
  semilla: 0x9e3779b1,
};

export function optimizar({ piezas, placas, config }) {
  const kerf = config.kerf || 0;
  const margen = config.margenPlaca || 0;
  const estrategiaPlaca = config.estrategiaPlaca || 'chica-primero';
  const sa = { ...SA_DEFAULTS, ...(config.sa || {}) };

  const expandidas = expandirPiezas(piezas);
  const colocables = expandidas.filter(p => cabeEnAlgunStock(p, placas, margen));
  const noColocables = expandidas.filter(p => !cabeEnAlgunStock(p, placas, margen));

  // Phase 1: multi-strategy warm start. Combine each sort with each (pRule, sRule) pair.
  let mejorPlan = null;
  let mejorRun = null;
  let mejorEtiqueta = '';
  for (const estrategia of SORT_STRATEGIES) {
    for (const pRule of PLACEMENT_RULES) {
      for (const sRule of SPLIT_RULES) {
        const ordenadas = [...colocables].sort(estrategia.cmp);
        const plan = ordenadas.map(p => ({ pieza: p, pRule, sRule }));
        const run = correr(plan, placas, kerf, margen, estrategiaPlaca);
        if (esMejor(run, mejorRun)) {
          mejorPlan = plan;
          mejorRun = run;
          mejorEtiqueta = `${estrategia.nombre}/${pRule}/${sRule}`;
        }
      }
    }
  }

  // Phase 2: SA over the joint (order, pRule, sRule) space.
  if (sa.iteraciones > 0 && colocables.length >= 2) {
    const resultado = recocerSimulado(mejorPlan, mejorRun, placas, kerf, margen, sa, estrategiaPlaca);
    if (esMejor(resultado.run, mejorRun)) {
      mejorRun = resultado.run;
      mejorEtiqueta = `sa (mejoró desde ${mejorEtiqueta} en iter ${resultado.iterMejora})`;
    } else {
      mejorEtiqueta += ' (sa no mejoró)';
    }
  }

  const errores = noColocables.map(p => `La pieza '${p.nombre}' no entra en ninguna placa stock`);
  const metricas = calcularMetricas(mejorRun.placasAbiertas, colocables, mejorRun.stock);
  metricas.estrategia = mejorEtiqueta;
  metricas.cotaTeorica = cotaTeoricaPlacas(colocables, placas);
  return {
    placas: mejorRun.placasAbiertas.map(formatearPlaca),
    metricas,
    errores,
  };
}

function recocerSimulado(planInicial, runInicial, placas, kerf, margen, sa, estrategiaPlaca) {
  const rng = mulberry32(sa.semilla);
  const plan = planInicial.map(x => ({ ...x }));
  let mejorRun = runInicial;
  let mejorPlan = plan.map(x => ({ ...x }));
  let mejorCosto = costo(runInicial);
  let actualCosto = mejorCosto;
  let iterMejora = 0;

  const N = sa.iteraciones;
  const placaArea = placas.length > 0 ? placas[0].ancho * placas[0].alto : 1;
  const tempInicial = sa.tempInicialFrac * placaArea;
  const tempFinal = sa.tempFinalFrac * placaArea;
  const lnRatio = Math.log(tempFinal / tempInicial);

  for (let i = 0; i < N; i++) {
    const T = tempInicial * Math.exp((i / N) * lnRatio);

    // Choose mutation: 50% swap two positions, 25% reroll pRule, 25% reroll sRule.
    const choice = rng();
    let undo;
    if (choice < 0.5) {
      const a = Math.floor(rng() * plan.length);
      let b = Math.floor(rng() * plan.length);
      if (a === b) b = (b + 1) % plan.length;
      [plan[a], plan[b]] = [plan[b], plan[a]];
      undo = () => { [plan[a], plan[b]] = [plan[b], plan[a]]; };
    } else if (choice < 0.75) {
      const a = Math.floor(rng() * plan.length);
      const prev = plan[a].pRule;
      const next = PLACEMENT_RULES[Math.floor(rng() * PLACEMENT_RULES.length)];
      plan[a].pRule = next;
      undo = () => { plan[a].pRule = prev; };
    } else {
      const a = Math.floor(rng() * plan.length);
      const prev = plan[a].sRule;
      const next = SPLIT_RULES[Math.floor(rng() * SPLIT_RULES.length)];
      plan[a].sRule = next;
      undo = () => { plan[a].sRule = prev; };
    }

    const run = correr(plan, placas, kerf, margen, estrategiaPlaca);
    const c = costo(run);
    const delta = c - actualCosto;

    if (delta <= 0 || rng() < Math.exp(-delta / T)) {
      actualCosto = c;
      if (c < mejorCosto) {
        mejorCosto = c;
        mejorRun = run;
        mejorPlan = plan.map(x => ({ ...x }));
        iterMejora = i;
      }
    } else {
      undo();
    }
  }
  return { run: mejorRun, plan: mejorPlan, iterMejora };
}

// Lexicographic cost: (1) minimize plate count, (2) minimize total waste,
// (3) maximize the largest single leftover rect — this rewards "recoverable"
// waste (one big leftover) over fragmented strips of equal total area.
function costo(run) {
  if (run.placasAbiertas.length === 0) return 0;
  const placaArea = run.placasAbiertas[0].ancho * run.placasAbiertas[0].alto;
  const numPlacas = run.placasAbiertas.length;
  let areaUsada = 0;
  let mayorSobrante = 0;
  for (const p of run.placasAbiertas) {
    for (const c of p.colocaciones) areaUsada += c.ancho * c.alto;
    for (const l of p.libres) {
      const a = l.ancho * l.alto;
      if (a > mayorSobrante) mayorSobrante = a;
    }
  }
  const areaTotal = numPlacas * placaArea;
  const areaSobrante = areaTotal - areaUsada;
  // Lexicographic: plate count >> waste >> -consolidation
  return numPlacas * 1e12 + areaSobrante * 1e3 - mayorSobrante;
}

function esMejor(run, mejor) {
  if (!mejor) return true;
  return costo(run) < costo(mejor);
}

function correr(plan, placas, kerf, margen, estrategiaPlaca = 'chica-primero') {
  const stock = [...placas.map(p => ({ ...p }))];
  const placasAbiertas = [];

  // 'agotar-stock': pre-open one plate per stock type with cantidad > 0,
  // smallest first. This lets small pieces find a small plate to live in
  // before getting absorbed by a larger open plate. Empty plates are
  // filtered out at the end.
  if (estrategiaPlaca === 'agotar-stock') {
    const tipos = [...stock].sort((a, b) => (a.ancho * a.alto) - (b.ancho * b.alto));
    for (const tipo of tipos) {
      if (tipo.cantidad > 0) {
        tipo.cantidad--;
        placasAbiertas.push(abrirPlaca(tipo, margen));
      }
    }
  }

  for (const item of plan) {
    colocarPieza(item, placasAbiertas, stock, kerf, margen, estrategiaPlaca);
  }

  // Drop any plate that ended up empty (pre-opened but unused).
  const usadas = placasAbiertas.filter(p => p.colocaciones.length > 0);
  return { placasAbiertas: usadas, stock };
}

function colocarPieza(item, placasAbiertas, stock, kerf, margen, estrategiaPlaca) {
  for (const placa of placasAbiertas) {
    if (intentarColocar(item, placa, kerf)) return true;
  }
  const tipo = elegirTipoStock(stock, item.pieza, margen, estrategiaPlaca);
  if (!tipo) return false;
  const nueva = abrirPlaca(tipo, margen);
  placasAbiertas.push(nueva);
  return intentarColocar(item, nueva, kerf);
}

function intentarColocar(item, placa, kerf) {
  const { pieza, pRule, sRule } = item;
  const orientaciones = orientacionesPermitidas(pieza, placa);

  let mejor = null;
  let mejorScore = Infinity;
  let mejorOri = null;

  for (const ori of orientaciones) {
    for (const libre of placa.libres) {
      if (libre.ancho < ori.w || libre.alto < ori.h) continue;
      const score = scorePlacement(libre, ori, pRule);
      if (score < mejorScore) {
        mejor = libre; mejorScore = score; mejorOri = ori;
      }
    }
  }
  if (!mejor) return false;

  const w = mejorOri.w, h = mejorOri.h;
  placa.colocaciones.push({
    piezaId: pieza.id,
    nombre: pieza.nombre,
    x: mejor.x, y: mejor.y,
    ancho: w, alto: h,
    rotada: mejorOri.rotada,
  });

  const nuevos = splitFreeRect(mejor, w, h, kerf, sRule);
  placa.libres = placa.libres.filter(l => l !== mejor).concat(nuevos);
  return true;
}

function scorePlacement(libre, ori, pRule) {
  const sobraW = libre.ancho - ori.w;
  const sobraH = libre.alto - ori.h;
  switch (pRule) {
    case 'short-side-fit': return Math.min(sobraW, sobraH);
    case 'long-side-fit':  return Math.max(sobraW, sobraH);
    case 'best-area-fit':  return libre.ancho * libre.alto - ori.w * ori.h;
    default:               return Math.min(sobraW, sobraH);
  }
}

function splitFreeRect(libre, w, h, kerf, sRule) {
  const sobraW = libre.ancho - w;
  const sobraH = libre.alto - h;
  const ocupadoW = w + kerf;
  const ocupadoH = h + kerf;
  const nuevos = [];

  // 'short-axis': cut along the shorter leftover axis -> preserves the BIGGER rectangle.
  // 'long-axis':  cut along the longer leftover axis  -> preserves the THIN strip whole.
  const cortarVerticalPrimero = sRule === 'short-axis' ? (sobraW > sobraH) : (sobraH > sobraW);

  if (cortarVerticalPrimero) {
    if (libre.ancho - ocupadoW > 0) {
      nuevos.push({ x: libre.x + ocupadoW, y: libre.y, ancho: libre.ancho - ocupadoW, alto: libre.alto });
    }
    if (libre.alto - ocupadoH > 0) {
      nuevos.push({ x: libre.x, y: libre.y + ocupadoH, ancho: w, alto: libre.alto - ocupadoH });
    }
  } else {
    if (libre.alto - ocupadoH > 0) {
      nuevos.push({ x: libre.x, y: libre.y + ocupadoH, ancho: libre.ancho, alto: libre.alto - ocupadoH });
    }
    if (libre.ancho - ocupadoW > 0) {
      nuevos.push({ x: libre.x + ocupadoW, y: libre.y, ancho: libre.ancho - ocupadoW, alto: h });
    }
  }
  return nuevos;
}

function abrirPlaca(tipo, margen) {
  return {
    ancho: tipo.ancho,
    alto: tipo.alto,
    vetaHorizontal: tipo.vetaHorizontal !== false,
    precio: Number(tipo.precio) || 0,
    libres: [{ x: margen, y: margen, ancho: tipo.ancho - 2 * margen, alto: tipo.alto - 2 * margen }],
    colocaciones: [],
  };
}

function elegirTipoStock(stock, pieza, margen, estrategiaPlaca = 'chica-primero') {
  if (stock.length === 0) return null;

  const compatibleConStock = stock.filter(s => piezaCabeEnTipo(pieza, s, margen) && s.cantidad > 0);
  let elegido = null;
  if (compatibleConStock.length > 0) {
    if (estrategiaPlaca === 'orden-manual') {
      // First in user's UI order (preserve original index).
      elegido = compatibleConStock[0];
    } else if (estrategiaPlaca === 'grande-primero') {
      compatibleConStock.sort((a, b) => (b.ancho * b.alto) - (a.ancho * a.alto));
      elegido = compatibleConStock[0];
    } else {
      // 'chica-primero' (default)
      compatibleConStock.sort((a, b) => (a.ancho * a.alto) - (b.ancho * b.alto));
      elegido = compatibleConStock[0];
    }
    elegido.cantidad--;
    return elegido;
  }

  // Stock exhausted. Fall back to the largest compatible type and report
  // it as missing (caller surfaces placasFaltantes in the metrics).
  const compatibles = stock
    .filter(s => piezaCabeEnTipo(pieza, s, margen))
    .sort((a, b) => (b.ancho * b.alto) - (a.ancho * a.alto));
  if (compatibles.length === 0) return null;

  elegido = compatibles[0];
  elegido.faltantes = (elegido.faltantes || 0) + 1;
  return elegido;
}

function piezaCabeEnTipo(pieza, tipo, margen) {
  const w = tipo.ancho - 2 * margen;
  const h = tipo.alto - 2 * margen;
  const placaSim = { ancho: tipo.ancho, alto: tipo.alto, vetaHorizontal: tipo.vetaHorizontal !== false };
  for (const ori of orientacionesPermitidas(pieza, placaSim)) {
    if (ori.w <= w && ori.h <= h) return true;
  }
  return false;
}

function cabeEnAlgunStock(pieza, placas, margen) {
  for (const tipo of placas) {
    const w = tipo.ancho - 2 * margen;
    const h = tipo.alto - 2 * margen;
    const placaSim = { ancho: tipo.ancho, alto: tipo.alto, vetaHorizontal: tipo.vetaHorizontal !== false };
    for (const ori of orientacionesPermitidas(pieza, placaSim)) {
      if (ori.w <= w && ori.h <= h) return true;
    }
  }
  return false;
}

// Return the orientations a piece is allowed to take given the plate's grain direction.
// vetaDireccion: 'libre' (any), 'ancho' (grain along piece's ancho axis), 'alto' (grain along piece's alto axis).
// placa.vetaHorizontal: true (grain along plate width), false (grain along plate height).
function orientacionesPermitidas(pieza, placa) {
  const direccion = pieza.vetaDireccion || 'libre';
  const noRotada = { w: pieza.ancho, h: pieza.alto, rotada: false };
  const rotada   = { w: pieza.alto,  h: pieza.ancho, rotada: true  };

  if (direccion === 'libre') {
    return pieza.ancho === pieza.alto ? [noRotada] : [noRotada, rotada];
  }
  // Grain must align with plate grain.
  // Piece's grain axis (in non-rotated state): 'ancho' or 'alto'.
  // After rotation 90°, what was 'ancho' axis becomes 'alto' axis and vice versa.
  // Plate grain axis: 'ancho' if vetaHorizontal else 'alto'.
  const ejePlaca = placa.vetaHorizontal !== false ? 'ancho' : 'alto';
  // Piece's grain axis in NON-rotated state is `direccion`.
  // After rotation, piece's grain axis flips to the other.
  if (direccion === ejePlaca) return [noRotada];
  return pieza.ancho !== pieza.alto ? [rotada] : [noRotada];
}

function expandirPiezas(piezas) {
  const out = [];
  for (const p of piezas) {
    for (let i = 0; i < p.cantidad; i++) {
      out.push({ ...p, instancia: i });
    }
  }
  return out;
}

function formatearPlaca(p) {
  const sobrantes = p.libres.filter(l => l.ancho >= 5 && l.alto >= 5);
  return {
    ancho: p.ancho,
    alto: p.alto,
    vetaHorizontal: p.vetaHorizontal,
    precio: p.precio || 0,
    colocaciones: p.colocaciones,
    sobrantes,
  };
}

// Lower bound on plate count given heterogeneous stock: greedy from the
// largest-area type first, respecting per-type stock cantidad. Returns the
// minimum number of plates whose combined area covers the total piece area.
// If stock is exhausted before that, returns the entire stock count (caller
// reports the missing plates separately via placasFaltantes).
function cotaTeoricaPlacas(piezasColocables, placas) {
  if (piezasColocables.length === 0 || placas.length === 0) return 0;
  const areaPiezas = piezasColocables.reduce((s, p) => s + p.ancho * p.alto, 0);
  const tipos = [...placas].sort((a, b) => (b.ancho * b.alto) - (a.ancho * a.alto));

  let count = 0;
  let areaCubierta = 0;
  for (const t of tipos) {
    const tArea = t.ancho * t.alto;
    if (tArea <= 0) continue;
    const cantidad = Math.max(0, t.cantidad || 0);
    for (let i = 0; i < cantidad && areaCubierta < areaPiezas; i++) {
      count++;
      areaCubierta += tArea;
    }
    if (areaCubierta >= areaPiezas) break;
  }

  // Fallback: stock is empty (all cantidad=0). Use largest type alone.
  if (count === 0) {
    const placaMayor = tipos[0].ancho * tipos[0].alto;
    if (placaMayor > 0) return Math.ceil(areaPiezas / placaMayor);
  }
  return count;
}

function calcularMetricas(placas, piezasColocables, stock) {
  const placasUsadas = placas.length;
  const placasFaltantes = stock.reduce((s, x) => s + (x.faltantes || 0), 0);
  const areaPiezas = piezasColocables.reduce((s, p) => s + p.ancho * p.alto, 0);
  const areaTotal = placas.reduce((s, p) => s + p.ancho * p.alto, 0);
  const aprovechamiento = areaTotal > 0 ? areaPiezas / areaTotal : 0;
  const cortesTotales = placas.reduce((s, p) => s + p.colocaciones.length * 2, 0);
  // Total cost = sum of prices of all plates used. Virtual plates (faltantes)
  // are already part of `placas` because they get opened — counting them
  // again from `stock.faltantes` would double-count.
  const costoTotal = placas.reduce((s, p) => s + (p.precio || 0), 0);
  return {
    placasUsadas,
    placasFaltantes,
    aprovechamiento,
    desperdicio: 1 - aprovechamiento,
    cortesTotales,
    costoTotal,
  };
}

// Mulberry32 PRNG — small, fast, deterministic.
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
