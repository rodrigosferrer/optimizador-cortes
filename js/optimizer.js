// Pure module: pieces + plates + config -> layout result.
// No DOM, no localStorage, no globals.

export function optimizar({ piezas, placas, config }) {
  const kerf = config.kerf || 0;
  const margen = config.margenPlaca || 0;

  const expandidas = expandirPiezas(piezas);
  expandidas.sort((p, q) => (q.ancho * q.alto) - (p.ancho * p.alto));

  const stock = [...placas.map(p => ({ ...p }))];
  const placasAbiertas = [];
  const errores = [];
  const piezasColocables = [];

  for (const pieza of expandidas) {
    if (!cabeEnAlgunStock(pieza, placas, margen)) {
      errores.push(`La pieza '${pieza.nombre}' no entra en ninguna placa stock`);
      continue;
    }
    piezasColocables.push(pieza);
    const colocada = colocarPieza(pieza, placasAbiertas, stock, kerf, margen);
    if (!colocada) errores.push(`No se pudo colocar la pieza '${pieza.nombre}'`);
  }

  const metricas = calcularMetricas(placasAbiertas, piezasColocables, stock);
  return { placas: placasAbiertas.map(formatearPlaca), metricas, errores };
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
  return { ancho: p.ancho, alto: p.alto, colocaciones: p.colocaciones };
}

function calcularMetricas(placas, piezasColocables, stock) {
  const placasUsadas = placas.length;
  const placasFaltantes = stock.reduce((s, x) => s + (x.faltantes || 0), 0);
  const areaPiezas = piezasColocables.reduce((s, p) => s + p.ancho * p.alto, 0);
  const areaTotal = placas.reduce((s, p) => s + p.ancho * p.alto, 0);
  const aprovechamiento = areaTotal > 0 ? areaPiezas / areaTotal : 0;
  // Each piece needs at most 2 cuts to isolate. Useful upper bound for small layouts.
  const cortesTotales = placas.reduce((s, p) => s + p.colocaciones.length * 2, 0);
  return {
    placasUsadas,
    placasFaltantes,
    aprovechamiento,
    desperdicio: 1 - aprovechamiento,
    cortesTotales,
  };
}
