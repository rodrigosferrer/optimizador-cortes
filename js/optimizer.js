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

  for (const pieza of expandidas) {
    const colocada = colocarPieza(pieza, placasAbiertas, stock, kerf, margen);
    if (!colocada) errores.push(`No se pudo colocar la pieza '${pieza.nombre}'`);
  }

  const metricas = calcularMetricas(placasAbiertas, expandidas, stock);
  return { placas: placasAbiertas.map(formatearPlaca), metricas, errores };
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
  const libre = placa.libres.find(l => l.ancho >= pieza.ancho && l.alto >= pieza.alto);
  if (!libre) return false;
  placa.colocaciones.push({
    piezaId: pieza.id,
    nombre: pieza.nombre,
    x: libre.x, y: libre.y,
    ancho: pieza.ancho, alto: pieza.alto,
    rotada: false,
  });
  placa.libres = placa.libres.filter(l => l !== libre);
  return true;
}

function formatearPlaca(p) {
  return { ancho: p.ancho, alto: p.alto, colocaciones: p.colocaciones };
}

function calcularMetricas(placas, piezas, stock) {
  const placasUsadas = placas.length;
  const placasFaltantes = stock.reduce((s, x) => s + (x.faltantes || 0), 0);
  const areaPiezas = piezas.reduce((s, p) => s + p.ancho * p.alto, 0);
  const areaTotal = placas.reduce((s, p) => s + p.ancho * p.alto, 0);
  const aprovechamiento = areaTotal > 0 ? areaPiezas / areaTotal : 0;
  return {
    placasUsadas,
    placasFaltantes,
    aprovechamiento,
    desperdicio: 1 - aprovechamiento,
    cortesTotales: 0,
  };
}
