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
        const run = correr(plan, placas, kerf, margen);
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
    const resultado = recocerSimulado(mejorPlan, mejorRun, placas, kerf, margen, sa);
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

function recocerSimulado(planInicial, runInicial, placas, kerf, margen, sa) {
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

    const run = correr(plan, placas, kerf, margen);
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

function correr(plan, placas, kerf, margen) {
  const stock = [...placas.map(p => ({ ...p }))];
  const placasAbiertas = [];
  for (const item of plan) {
    colocarPieza(item, placasAbiertas, stock, kerf, margen);
  }
  return { placasAbiertas, stock };
}

function colocarPieza(item, placasAbiertas, stock, kerf, margen) {
  for (const placa of placasAbiertas) {
    if (intentarColocar(item, placa, kerf)) return true;
  }
  const tipo = elegirTipoStock(stock);
  if (!tipo) return false;
  const nueva = abrirPlaca(tipo, margen);
  placasAbiertas.push(nueva);
  return intentarColocar(item, nueva, kerf);
}

function intentarColocar(item, placa, kerf) {
  const { pieza, pRule, sRule } = item;
  const orientaciones = pieza.rotable && pieza.ancho !== pieza.alto
    ? [{ w: pieza.ancho, h: pieza.alto, rotada: false },
       { w: pieza.alto, h: pieza.ancho, rotada: true }]
    : [{ w: pieza.ancho, h: pieza.alto, rotada: false }];

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
    libres: [{ x: margen, y: margen, ancho: tipo.ancho - 2 * margen, alto: tipo.alto - 2 * margen }],
    colocaciones: [],
  };
}

function elegirTipoStock(stock) {
  for (const s of stock) {
    if (s.cantidad > 0) {
      s.cantidad--;
      return s;
    }
  }
  if (stock.length === 0) return null;
  stock[0].faltantes = (stock[0].faltantes || 0) + 1;
  return stock[0];
}

function cabeEnAlgunStock(pieza, placas, margen) {
  for (const tipo of placas) {
    const w = tipo.ancho - 2 * margen;
    const h = tipo.alto - 2 * margen;
    const fits = pieza.ancho <= w && pieza.alto <= h;
    const fitsRot = pieza.rotable && pieza.ancho <= h && pieza.alto <= w;
    if (fits || fitsRot) return true;
  }
  return false;
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
  return { ancho: p.ancho, alto: p.alto, colocaciones: p.colocaciones, sobrantes };
}

// Lower bound on plate count: total piece area / largest available plate area.
// Optimal layouts can't beat this no matter the algorithm.
function cotaTeoricaPlacas(piezasColocables, placas) {
  if (piezasColocables.length === 0 || placas.length === 0) return 0;
  const areaPiezas = piezasColocables.reduce((s, p) => s + p.ancho * p.alto, 0);
  const placaMayor = placas.reduce((mx, p) => Math.max(mx, p.ancho * p.alto), 0);
  return Math.ceil(areaPiezas / placaMayor);
}

function calcularMetricas(placas, piezasColocables, stock) {
  const placasUsadas = placas.length;
  const placasFaltantes = stock.reduce((s, x) => s + (x.faltantes || 0), 0);
  const areaPiezas = piezasColocables.reduce((s, p) => s + p.ancho * p.alto, 0);
  const areaTotal = placas.reduce((s, p) => s + p.ancho * p.alto, 0);
  const aprovechamiento = areaTotal > 0 ? areaPiezas / areaTotal : 0;
  const cortesTotales = placas.reduce((s, p) => s + p.colocaciones.length * 2, 0);
  return {
    placasUsadas,
    placasFaltantes,
    aprovechamiento,
    desperdicio: 1 - aprovechamiento,
    cortesTotales,
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
