// Pure module: pieces + plates + config -> layout result.
// No DOM, no localStorage, no globals.

const ESTRATEGIAS = [
  { nombre: 'area-desc', cmp: (p, q) => (q.ancho * q.alto) - (p.ancho * p.alto) },
  { nombre: 'lado-mayor-desc', cmp: (p, q) => Math.max(q.ancho, q.alto) - Math.max(p.ancho, p.alto) },
  { nombre: 'alto-desc', cmp: (p, q) => q.alto - p.alto },
  { nombre: 'ancho-desc', cmp: (p, q) => q.ancho - p.ancho },
  { nombre: 'perimetro-desc', cmp: (p, q) => (q.ancho + q.alto) - (p.ancho + p.alto) },
];

const SA_DEFAULTS = {
  iteraciones: 4000,
  // Temperatures expressed as a FRACTION of one plate's area, so the
  // Metropolis criterion stays meaningful regardless of plate size.
  tempInicialFrac: 0.10,
  tempFinalFrac: 0.0005,
  semilla: 0x9e3779b1, // deterministic by default
};

export function optimizar({ piezas, placas, config }) {
  const kerf = config.kerf || 0;
  const margen = config.margenPlaca || 0;
  const sa = { ...SA_DEFAULTS, ...(config.sa || {}) };

  const expandidas = expandirPiezas(piezas);
  const colocables = expandidas.filter(p => cabeEnAlgunStock(p, placas, margen));
  const noColocables = expandidas.filter(p => !cabeEnAlgunStock(p, placas, margen));

  // Warm start: best of the deterministic strategies.
  let mejorOrden = null;
  let mejorRun = null;
  let mejorEtiqueta = '';
  for (const estrategia of ESTRATEGIAS) {
    const ordenadas = [...colocables].sort(estrategia.cmp);
    const run = correr(ordenadas, placas, kerf, margen);
    if (esMejor(run, mejorRun)) { mejorRun = run; mejorOrden = ordenadas; mejorEtiqueta = estrategia.nombre; }
  }

  // Simulated Annealing: explore permutations of `colocables`.
  if (sa.iteraciones > 0 && colocables.length >= 2) {
    const resultado = recocerSimulado(mejorOrden, mejorRun, placas, kerf, margen, sa);
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
  return {
    placas: mejorRun.placasAbiertas.map(formatearPlaca),
    metricas,
    errores,
  };
}

function recocerSimulado(ordenInicial, runInicial, placas, kerf, margen, sa) {
  const rng = mulberry32(sa.semilla);
  const orden = [...ordenInicial];
  let mejorRun = runInicial;
  let mejorOrden = [...orden];
  let mejorCosto = costo(runInicial, placas);
  let actualCosto = mejorCosto;
  let iterMejora = 0;

  const N = sa.iteraciones;
  const placaArea = placas.length > 0 ? placas[0].ancho * placas[0].alto : 1;
  const tempInicial = sa.tempInicialFrac * placaArea;
  const tempFinal = sa.tempFinalFrac * placaArea;
  const lnRatio = Math.log(tempFinal / tempInicial);

  for (let i = 0; i < N; i++) {
    const T = tempInicial * Math.exp((i / N) * lnRatio);
    // Move: swap two distinct positions
    const a = Math.floor(rng() * orden.length);
    let b = Math.floor(rng() * orden.length);
    if (a === b) b = (b + 1) % orden.length;
    [orden[a], orden[b]] = [orden[b], orden[a]];

    const run = correr(orden, placas, kerf, margen);
    const c = costo(run, placas);
    const delta = c - actualCosto;

    if (delta <= 0 || rng() < Math.exp(-delta / T)) {
      actualCosto = c;
      if (c < mejorCosto) {
        mejorCosto = c;
        mejorRun = run;
        mejorOrden = [...orden];
        iterMejora = i;
      }
    } else {
      // Reject: revert swap
      [orden[a], orden[b]] = [orden[b], orden[a]];
    }
  }
  return { run: mejorRun, orden: mejorOrden, iterMejora };
}

// Cost: heavily penalize extra plates, then minimize wasted area.
function costo(run, placas) {
  const placaArea = placas.length > 0 ? placas[0].ancho * placas[0].alto : 1;
  const numPlacas = run.placasAbiertas.length;
  let areaUsada = 0;
  for (const p of run.placasAbiertas) {
    for (const c of p.colocaciones) areaUsada += c.ancho * c.alto;
  }
  const areaTotal = run.placasAbiertas.reduce((s, p) => s + p.ancho * p.alto, 0);
  const areaSobrante = areaTotal - areaUsada;
  return numPlacas * placaArea + areaSobrante;
}

function correr(piezasOrdenadas, placas, kerf, margen) {
  const stock = [...placas.map(p => ({ ...p }))];
  const placasAbiertas = [];
  for (const pieza of piezasOrdenadas) {
    colocarPieza(pieza, placasAbiertas, stock, kerf, margen);
  }
  return { placasAbiertas, stock };
}

function esMejor(run, mejor) {
  if (!mejor) return true;
  return costo(run, [{ ancho: run.placasAbiertas[0]?.ancho || 1, alto: run.placasAbiertas[0]?.alto || 1 }])
       < costo(mejor, [{ ancho: mejor.placasAbiertas[0]?.ancho || 1, alto: mejor.placasAbiertas[0]?.alto || 1 }]);
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

function colocarPieza(pieza, placasAbiertas, stock, kerf, margen) {
  for (const placa of placasAbiertas) {
    if (intentarColocar(pieza, placa, kerf)) return true;
  }
  const tipo = elegirTipoStock(stock);
  if (!tipo) return false;
  const nueva = abrirPlaca(tipo, margen);
  placasAbiertas.push(nueva);
  return intentarColocar(pieza, nueva, kerf);
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

function abrirPlaca(tipo, margen) {
  return {
    ancho: tipo.ancho,
    alto: tipo.alto,
    libres: [{ x: margen, y: margen, ancho: tipo.ancho - 2 * margen, alto: tipo.alto - 2 * margen }],
    colocaciones: [],
  };
}

function intentarColocar(pieza, placa, kerf) {
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
      const score = Math.min(libre.ancho - ori.w, libre.alto - ori.h);
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

  const sobraW = mejor.ancho - w;
  const sobraH = mejor.alto - h;
  const ocupadoW = w + kerf;
  const ocupadoH = h + kerf;

  const nuevos = [];
  if (sobraW > sobraH) {
    if (mejor.ancho - ocupadoW > 0) {
      nuevos.push({ x: mejor.x + ocupadoW, y: mejor.y, ancho: mejor.ancho - ocupadoW, alto: mejor.alto });
    }
    if (mejor.alto - ocupadoH > 0) {
      nuevos.push({ x: mejor.x, y: mejor.y + ocupadoH, ancho: w, alto: mejor.alto - ocupadoH });
    }
  } else {
    if (mejor.alto - ocupadoH > 0) {
      nuevos.push({ x: mejor.x, y: mejor.y + ocupadoH, ancho: mejor.ancho, alto: mejor.alto - ocupadoH });
    }
    if (mejor.ancho - ocupadoW > 0) {
      nuevos.push({ x: mejor.x + ocupadoW, y: mejor.y, ancho: mejor.ancho - ocupadoW, alto: h });
    }
  }

  placa.libres = placa.libres.filter(l => l !== mejor).concat(nuevos);
  return true;
}

function formatearPlaca(p) {
  // Filter out trivially small free rects (<5mm) to avoid label noise.
  const sobrantes = p.libres.filter(l => l.ancho >= 5 && l.alto >= 5);
  return { ancho: p.ancho, alto: p.alto, colocaciones: p.colocaciones, sobrantes };
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
