// Renders the optimizer result into an HTML container as SVG.

import { planCortes } from './cuts.js';
import { tip } from './icons.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function render(container, resultado, kerf = 0, proyecto = null, callbacks = {}) {
  container.innerHTML = '';
  cerrarPopoverPieza();

  // Build piezaId → "Mueble - Pieza" name map
  const nombrePorPiezaId = construirMapaNombres(proyecto);

  // Print-only summary page (pieces table + project info), shown first when printing
  if (proyecto) container.appendChild(printSummary(proyecto, resultado));

  if (resultado.errores.length > 0) {
    const box = document.createElement('div');
    box.className = 'errores';
    box.innerHTML = '<strong>Avisos:</strong><ul>' +
      resultado.errores.map(e => `<li>${escapeHtml(e)}</li>`).join('') +
      '</ul>';
    container.appendChild(box);
  }

  const m = resultado.metricas;
  const cota = m.cotaTeorica || 0;
  const enOptimo = cota > 0 && m.placasUsadas === cota;
  const resumen = document.createElement('div');
  resumen.className = 'resumen';
  const metrosCanto = calcularMetrosCanto(resultado);
  const precioCanto = (proyecto && proyecto.config && proyecto.config.precioCantoPorMetro) || 0;
  const costoCantoTotal = metrosCanto * precioCanto;
  const costoDesperdicio = m.costoTotal * m.desperdicio;
  // Compute the cut plan for each plate once, reuse below.
  const cortesPorPlaca = resultado.placas.map(p => planCortes(p, kerf));
  const cortesTotal = cortesPorPlaca.reduce((s, arr) => s + arr.length, 0);
  const precioPorCorte = (proyecto && proyecto.config && proyecto.config.precioPorCorte) || 0;
  const costoCortesTotal = cortesTotal * precioPorCorte;
  resumen.innerHTML = `
    <div>Placas usadas: <strong>${m.placasUsadas}</strong>${
      cota > 0
        ? ` <span class="cota">(mínimo teórico: ${cota}${enOptimo ? ' ✓' : ''})</span>${tip('Mínimo absoluto según el área total de las piezas. Con cortes guillotine no siempre es alcanzable.')}`
        : ''
    }</div>
    <div>Aprovechamiento: <strong>${(m.aprovechamiento * 100).toFixed(1)}%</strong>${tip('Porcentaje del área de las placas usado por piezas (vs. desperdicio).')}</div>
    <div>Desperdicio: <strong>${(m.desperdicio * 100).toFixed(1)}%</strong></div>
    <div>Cortes totales: <strong>${cortesTotal}</strong>${costoCortesTotal > 0 ? ` (${formatearMoneda(costoCortesTotal)})` : ''}${tip('Cantidad total de cortes guillotine en todas las placas.')}</div>
    ${metrosCanto > 0 ? `<div>Canto: <strong>${metrosCanto.toFixed(2)} m</strong>${costoCantoTotal > 0 ? ` (${formatearMoneda(costoCantoTotal)})` : ''}${tip('Metros lineales totales de tapacanto necesarios, sumando los bordes marcados de todas las piezas.')}</div>` : ''}
    ${m.costoTotal > 0 ? `<div>Costo placas: <strong>${formatearMoneda(m.costoTotal)}</strong>${tip('Suma de los precios de las placas usadas (incluye placas faltantes a comprar).')}</div>` : ''}
    ${costoDesperdicio > 0 ? `<div>Costo desperdicio: <strong>${formatearMoneda(costoDesperdicio)}</strong>${tip('Costo del material desperdiciado: porcentaje de desperdicio × costo total de las placas.')}</div>` : ''}
    ${(m.costoTotal + costoCantoTotal + costoCortesTotal) > 0 ? `<div class="costo-final">Total proyecto: <strong>${formatearMoneda(m.costoTotal + costoCantoTotal + costoCortesTotal)}</strong>${tip('Suma de placas + canto + cortes.')}</div>` : ''}
    ${m.placasFaltantes > 0 ? `<div class="warn">⚠ Faltan ${m.placasFaltantes} placa(s) en stock</div>` : ''}
  `;
  container.appendChild(resumen);

  // Suggestions: which pieces could grow to absorb adjacent sobrante
  if (proyecto && callbacks.onAplicarSugerencia) {
    const sugerencias = analizarSugerencias(resultado, proyecto, kerf);
    if (sugerencias.length > 0) {
      container.appendChild(renderSugerencias(sugerencias, proyecto, callbacks));
    }
  }

  // Per-mueble detail breakdown
  if (proyecto && proyecto.grupos && proyecto.grupos.length > 0) {
    const precioCanto = (proyecto.config && proyecto.config.precioCantoPorMetro) || 0;
    const desglose = desgloseMuebles(resultado, proyecto, precioCanto, costoCortesTotal);
    if (desglose.size > 0) {
      container.appendChild(renderDesglose(desglose, m, precioCanto, precioPorCorte, costoCortesTotal));
    }
  }

  // Scale plates proportionally so a small plate visually looks smaller
  // than a large one. The widest plate fills the available width; others
  // are sized proportionally.
  const maxAncho = Math.max(...resultado.placas.map(p => p.ancho), 1);

  resultado.placas.forEach((placa, i) => {
    const cortes = cortesPorPlaca[i];
    const wrap = document.createElement('div');
    wrap.className = 'placa-wrap';
    const meta = [];
    if (placa.material) meta.push(escapeHtml(placa.material));
    if (placa.espesor && placa.espesor > 0) meta.push(`${placa.espesor} mm esp.`);
    const metaStr = meta.length ? ` <span class="placa-meta">${meta.join(' · ')}</span>` : '';
    wrap.innerHTML = `<h3>Placa ${i + 1} — ${placa.ancho}×${placa.alto} mm${metaStr}</h3>`;
    const svg = dibujarPlaca(placa, cortes, nombrePorPiezaId);
    const pct = (placa.ancho / maxAncho) * 100;
    svg.style.width = pct + '%';
    wrap.appendChild(svg);
    const detalle = document.createElement('div');
    detalle.className = 'placa-detalle';
    detalle.appendChild(listaPiezas(placa, proyecto, nombrePorPiezaId));
    detalle.appendChild(listaCortes(cortes));
    wrap.appendChild(detalle);
    container.appendChild(wrap);
  });
}

function dibujarPlaca(placa, cortes = [], nombrePorPiezaId = null) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${placa.ancho} ${placa.alto}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'placa-svg');

  // Drop-shadow filter for pieces
  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.innerHTML = `
    <filter id="piezaShadow" x="-5%" y="-5%" width="110%" height="115%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.18"/>
    </filter>
  `;
  svg.appendChild(defs);

  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('x', 0); bg.setAttribute('y', 0);
  bg.setAttribute('width', placa.ancho); bg.setAttribute('height', placa.alto);
  bg.setAttribute('rx', 8); bg.setAttribute('ry', 8);
  bg.setAttribute('fill', '#f5e8c8'); bg.setAttribute('stroke', '#44403c'); bg.setAttribute('stroke-width', 3);
  svg.appendChild(bg);

  // Wood grain lines, drawn behind everything (sobrantes are translucent so grain shows through there)
  dibujarVeta(svg, placa);

  // Draw sobrantes (free rects) first so pieces overlay them
  for (const s of (placa.sobrantes || [])) {
    const r = document.createElementNS(SVG_NS, 'rect');
    r.setAttribute('x', s.x); r.setAttribute('y', s.y);
    r.setAttribute('width', s.ancho); r.setAttribute('height', s.alto);
    r.setAttribute('fill', '#ddd');
    r.setAttribute('fill-opacity', '0.5');
    r.setAttribute('stroke', '#888');
    r.setAttribute('stroke-width', 1);
    r.setAttribute('stroke-dasharray', '12 8');
    svg.appendChild(r);

    svg.appendChild(etiquetaRect({
      x: s.x, y: s.y, ancho: s.ancho, alto: s.alto,
      linea1: 'sobra',
      linea2: `${Math.round(s.ancho)}×${Math.round(s.alto)}`,
      color: '#666',
      italic: true,
    }));
  }

  placa.colocaciones.forEach((c, idx) => {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'pieza-grupo');
    g.dataset.piezaId = c.piezaId;
    g.style.cursor = 'pointer';

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', c.x); rect.setAttribute('y', c.y);
    rect.setAttribute('width', c.ancho); rect.setAttribute('height', c.alto);
    rect.setAttribute('rx', 6); rect.setAttribute('ry', 6);
    rect.setAttribute('fill', colorPara(c.nombre));
    rect.setAttribute('stroke', '#1c1917'); rect.setAttribute('stroke-width', 1.5);
    rect.setAttribute('filter', 'url(#piezaShadow)');
    g.appendChild(rect);

    // Edge bands (cantos) - thick colored stripes along marked edges.
    // c.cantos was rotated/mirrored by the optimizer if the piece was rotated;
    // otherwise sup/inf/izq/der map directly to top/bottom/left/right.
    if (c.cantos) dibujarCantosDePieza(g, c);

    const nombreCompleto = (nombrePorPiezaId && nombrePorPiezaId.get(c.piezaId)) || c.nombre;
    g.appendChild(etiquetaPieza(c, idx + 1, nombreCompleto));

    g.addEventListener('click', (e) => {
      e.stopPropagation();
      mostrarPopoverPieza(c, e.clientX, e.clientY);
    });

    svg.appendChild(g);
  });

  // Cut lines on top of pieces
  dibujarCortes(svg, placa, cortes);

  return svg;
}

function dibujarCortes(svg, placa, cortes) {
  const dim = Math.min(placa.ancho, placa.alto);
  const fontSize = Math.max(40, dim * 0.025);
  for (const corte of cortes) {
    const line = document.createElementNS(SVG_NS, 'line');
    if (corte.tipo === 'horizontal') {
      line.setAttribute('x1', corte.desde); line.setAttribute('y1', corte.pos);
      line.setAttribute('x2', corte.hasta); line.setAttribute('y2', corte.pos);
    } else {
      line.setAttribute('x1', corte.pos); line.setAttribute('y1', corte.desde);
      line.setAttribute('x2', corte.pos); line.setAttribute('y2', corte.hasta);
    }
    line.setAttribute('stroke', '#d0021b');
    line.setAttribute('stroke-width', 4);
    line.setAttribute('stroke-dasharray', '20 10');
    svg.appendChild(line);

    // Numbered badge at the start of the cut
    const cx = corte.tipo === 'horizontal' ? corte.desde + fontSize : corte.pos;
    const cy = corte.tipo === 'horizontal' ? corte.pos : corte.desde + fontSize;
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', cx); circle.setAttribute('cy', cy);
    circle.setAttribute('r', fontSize * 0.85);
    circle.setAttribute('fill', '#d0021b');
    circle.setAttribute('stroke', '#fff');
    circle.setAttribute('stroke-width', 3);
    svg.appendChild(circle);

    const num = document.createElementNS(SVG_NS, 'text');
    num.setAttribute('x', cx); num.setAttribute('y', cy);
    num.setAttribute('text-anchor', 'middle');
    num.setAttribute('dominant-baseline', 'middle');
    num.setAttribute('font-size', fontSize);
    num.setAttribute('font-weight', 'bold');
    num.setAttribute('fill', '#fff');
    num.textContent = corte.n;
    svg.appendChild(num);
  }
}

function dibujarCantosDePieza(g, c) {
  const grosor = Math.max(8, Math.min(c.ancho, c.alto) * 0.04);
  const banda = (x, y, w, h) => {
    const r = document.createElementNS(SVG_NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('fill', '#a16207');
    r.setAttribute('opacity', '0.85');
    g.appendChild(r);
  };
  // sup/inf/izq/der are in the piece's NON-rotated frame. If c.rotada, swap.
  let sup, inf, izq, der;
  if (c.rotada) {
    // 90° rotation: piece original ancho was placed along Y. Original "sup" (top) ends up on the LEFT edge of the displayed rectangle.
    sup = c.cantos.izq;
    inf = c.cantos.der;
    izq = c.cantos.inf;
    der = c.cantos.sup;
  } else {
    ({ sup, inf, izq, der } = c.cantos);
  }
  if (sup) banda(c.x, c.y, c.ancho, grosor);
  if (inf) banda(c.x, c.y + c.alto - grosor, c.ancho, grosor);
  if (izq) banda(c.x, c.y, grosor, c.alto);
  if (der) banda(c.x + c.ancho - grosor, c.y, grosor, c.alto);
}

function etiquetaPieza(c, n, nombreCompleto) {
  return etiquetaRect({
    x: c.x, y: c.y, ancho: c.ancho, alto: c.alto,
    linea1: `${n}. ${nombreCompleto || c.nombre}`,
    linea2: `${Math.round(c.ancho)}×${Math.round(c.alto)}${c.rotada ? ' ↻' : ''}`,
    color: '#000',
    italic: false,
  });
}

function construirMapaNombres(proyecto) {
  if (!proyecto) return null;
  const grupoPorId = new Map((proyecto.grupos || []).map(g => [g.id, g.nombre]));
  const map = new Map();
  for (const p of proyecto.piezas) {
    const grupoNombre = grupoPorId.get(p.grupoId);
    map.set(p.id, grupoNombre ? `${grupoNombre} - ${p.nombre}` : p.nombre);
  }
  return map;
}

// Auto-fit two-line label inside a rectangle. Rotates 90° if rect is much taller than wide.
function etiquetaRect({ x, y, ancho, alto, linea1, linea2, color, italic }) {
  const tall = alto > ancho * 1.4;
  const longSide = tall ? alto : ancho;
  const shortSide = tall ? ancho : alto;
  const maxChars = Math.max(linea1.length, linea2.length);

  // Width budget: maxChars * fontSize * 0.55 ≈ longSide * 0.92.
  // Height budget: 2 lines + gap ≈ fontSize * 2.4 ≤ shortSide * 0.85.
  const fontByLong = (longSide * 0.92) / Math.max(maxChars * 0.55, 1);
  const fontByShort = (shortSide * 0.85) / 2.4;
  const fontSize = Math.max(10, Math.min(fontByLong, fontByShort, 80));

  const cx = x + ancho / 2;
  const cy = y + alto / 2;

  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', cx);
  text.setAttribute('y', cy);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('font-size', fontSize);
  text.setAttribute('fill', color);
  if (italic) text.setAttribute('font-style', 'italic');
  if (tall) text.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);

  const t1 = document.createElementNS(SVG_NS, 'tspan');
  t1.setAttribute('x', cx);
  t1.setAttribute('dy', `-${fontSize * 0.55}`);
  t1.textContent = linea1;

  const t2 = document.createElementNS(SVG_NS, 'tspan');
  t2.setAttribute('x', cx);
  t2.setAttribute('dy', `${fontSize * 1.1}`);
  t2.textContent = linea2;

  text.appendChild(t1);
  text.appendChild(t2);
  return text;
}

function dibujarVeta(svg, placa) {
  const horizontal = placa.vetaHorizontal !== false;
  const espaciado = 60; // mm entre líneas de veta
  const long = horizontal ? placa.ancho : placa.alto;
  const ancho = horizontal ? placa.alto : placa.ancho;

  for (let pos = espaciado / 2; pos < ancho; pos += espaciado) {
    const line = document.createElementNS(SVG_NS, 'line');
    if (horizontal) {
      line.setAttribute('x1', 0); line.setAttribute('y1', pos);
      line.setAttribute('x2', long); line.setAttribute('y2', pos);
    } else {
      line.setAttribute('x1', pos); line.setAttribute('y1', 0);
      line.setAttribute('x2', pos); line.setAttribute('y2', long);
    }
    line.setAttribute('stroke', '#a07432');
    line.setAttribute('stroke-width', 3);
    line.setAttribute('opacity', '0.7');
    svg.appendChild(line);
  }

  // Indicador "↔ veta" en la esquina inferior izquierda
  const margen = 25;
  const largoFlecha = Math.min(placa.ancho, placa.alto) * 0.06;
  const cy = placa.alto - margen;
  const cx = margen;
  const arrow = document.createElementNS(SVG_NS, 'g');
  const linea = document.createElementNS(SVG_NS, 'line');
  if (horizontal) {
    linea.setAttribute('x1', cx); linea.setAttribute('y1', cy);
    linea.setAttribute('x2', cx + largoFlecha); linea.setAttribute('y2', cy);
  } else {
    linea.setAttribute('x1', cx); linea.setAttribute('y1', cy);
    linea.setAttribute('x2', cx); linea.setAttribute('y2', cy - largoFlecha);
  }
  linea.setAttribute('stroke', '#7a5a2a');
  linea.setAttribute('stroke-width', 4);
  linea.setAttribute('marker-end', 'url(#flecha-veta)');
  linea.setAttribute('marker-start', 'url(#flecha-veta)');
  arrow.appendChild(linea);

  const txt = document.createElementNS(SVG_NS, 'text');
  txt.setAttribute('x', horizontal ? cx + largoFlecha + 12 : cx + 14);
  txt.setAttribute('y', horizontal ? cy + 4 : cy - largoFlecha / 2 + 4);
  txt.setAttribute('font-size', Math.max(28, largoFlecha / 3));
  txt.setAttribute('fill', '#7a5a2a');
  txt.textContent = 'veta';
  arrow.appendChild(txt);
  svg.appendChild(arrow);

  // Marker definition for the grain arrow (added to existing <defs>)
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  if (!defs.querySelector('#flecha-veta')) {
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', 'flecha-veta');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '5'); marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '5'); marker.setAttribute('markerHeight', '5');
    marker.setAttribute('orient', 'auto');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    path.setAttribute('fill', '#7a5a2a');
    marker.appendChild(path);
    defs.appendChild(marker);
  }
}

function listaPiezas(placa, proyecto, nombrePorPiezaId) {
  const wrap = document.createElement('div');
  wrap.className = 'detalle-col';
  const titulo = document.createElement('h4');
  titulo.textContent = 'Piezas';
  wrap.appendChild(titulo);

  // Build piezaId -> grupoNombre map. If no proyecto, render flat.
  const grupoPorPiezaId = new Map();
  if (proyecto && proyecto.grupos) {
    const nombrePorGrupo = new Map(proyecto.grupos.map(g => [g.id, g.nombre]));
    for (const p of proyecto.piezas) {
      grupoPorPiezaId.set(p.id, nombrePorGrupo.get(p.grupoId) || 'Sin grupo');
    }
  }

  // Group placa.colocaciones by mueble, preserving placement order.
  // The original index in placa.colocaciones is the badge number.
  const porGrupo = new Map();
  placa.colocaciones.forEach((c, idx) => {
    const grupo = grupoPorPiezaId.get(c.piezaId) || 'Sin grupo';
    if (!porGrupo.has(grupo)) porGrupo.set(grupo, []);
    porGrupo.get(grupo).push({ c, idx: idx + 1 });
  });

  if (porGrupo.size === 0) {
    wrap.appendChild(document.createElement('p'));
    return wrap;
  }

  for (const [grupoNombre, items] of porGrupo) {
    const h5 = document.createElement('h5');
    h5.className = 'lista-grupo-titulo';
    h5.textContent = grupoNombre;
    wrap.appendChild(h5);
    const ul = document.createElement('ul');
    ul.className = 'lista-piezas lista-piezas-grupo';
    for (const { c, idx } of items) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="lista-num">${idx}.</span> ${escapeHtml(c.nombre)} — ${c.ancho}×${c.alto} mm${c.rotada ? ' <span class="lista-flag">↻</span>' : ''}`;
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  }
  return wrap;
}

function listaCortes(cortes) {
  const wrap = document.createElement('div');
  wrap.className = 'detalle-col';
  const titulo = document.createElement('h4');
  titulo.innerHTML = `Plan de cortes (en orden) ${tip('Secuencia de cortes guillotine ejecutables en una sierra de panel. Cada corte va de borde a borde del pedazo en el que estás trabajando en ese momento.')}`;
  wrap.appendChild(titulo);
  if (cortes.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'Sin cortes (una sola pieza ocupa la placa).';
    wrap.appendChild(p);
    return wrap;
  }
  const ol = document.createElement('ol');
  ol.className = 'lista-cortes';
  for (const c of cortes) {
    const li = document.createElement('li');
    if (c.tipo === 'horizontal') {
      li.textContent = `Corte horizontal a y = ${Math.round(c.pos)} mm (largo ${Math.round(c.largo)} mm)`;
    } else {
      li.textContent = `Corte vertical a x = ${Math.round(c.pos)} mm (largo ${Math.round(c.largo)} mm)`;
    }
    ol.appendChild(li);
  }
  wrap.appendChild(ol);
  return wrap;
}

function colorPara(nombre) {
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h}, 55%, 75%)`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// =========================================================================
// Suggestions (Level 1): detect pieces that could grow into adjacent sobrante
// =========================================================================

// For each pieza, build per-instance extension data. Then surface:
//   - "extender" suggestion if ALL instances can grow by the same amount.
//   - "variante" suggestion if only some instances can — proposes splitting
//     the pieza into two definitions: an original (remaining copies) and a
//     variant with the new (extended) dimension.
// `colocaciones` in each suggestion is the list of layout instances to
// modify when the suggestion is applied.
function analizarSugerencias(resultado, proyecto, kerf) {
  const TOL = 2;
  const piezaPorId = new Map(proyecto.piezas.map(p => [p.id, p]));

  // Map<piezaId, [{ colocacion, ext_ancho, ext_alto }]>
  const datos = new Map();

  for (const placa of resultado.placas) {
    for (const c of placa.colocaciones) {
      const pieza = piezaPorId.get(c.piezaId);
      if (!pieza) continue;
      if (!pieza.aceptaAjuste) continue;
      if (!datos.has(c.piezaId)) datos.set(c.piezaId, []);
      const cx2 = c.x + c.ancho;
      const cy2 = c.y + c.alto;

      let rightExt = 0;
      for (const s of placa.sobrantes || []) {
        if (Math.abs(s.x - (cx2 + kerf)) <= TOL &&
            s.y <= c.y + TOL &&
            (s.y + s.alto) >= cy2 - TOL) {
          let extra = Math.floor(s.ancho);
          // Bonus: if sobrante reaches the plate's right edge, the kerf
          // reserved at that edge can also be consumed (no cut needed at
          // the plate boundary).
          if (Math.abs((s.x + s.ancho) - placa.ancho) <= TOL) extra += kerf;
          rightExt = Math.max(rightExt, extra);
        }
      }
      let bottomExt = 0;
      for (const s of placa.sobrantes || []) {
        if (Math.abs(s.y - (cy2 + kerf)) <= TOL &&
            s.x <= c.x + TOL &&
            (s.x + s.ancho) >= cx2 - TOL) {
          let extra = Math.floor(s.alto);
          if (Math.abs((s.y + s.alto) - placa.alto) <= TOL) extra += kerf;
          bottomExt = Math.max(bottomExt, extra);
        }
      }
      // Map layout extension → piece axis extension (rotation-aware).
      const ext_ancho = c.rotada ? bottomExt : rightExt;
      const ext_alto  = c.rotada ? rightExt  : bottomExt;
      datos.get(c.piezaId).push({ colocacion: c, placa, ext_ancho, ext_alto });
    }
  }

  const sugerencias = [];
  for (const [piezaId, instancias] of datos) {
    const pieza = piezaPorId.get(piezaId);
    if (!pieza) continue;
    if (instancias.length < pieza.cantidad) continue; // missing data; skip

    for (const eje of ['ancho', 'alto']) {
      const key = eje === 'ancho' ? 'ext_ancho' : 'ext_alto';
      // Sort instances by available growth descending so we can pick the
      // best K-of-N subset (largest K * min(growth in subset) score).
      const orden = [...instancias].sort((a, b) => b[key] - a[key]);

      let mejorK = 0, mejorGrowth = 0, mejorScore = 0;
      for (let k = 1; k <= orden.length; k++) {
        const growth = orden[k - 1][key]; // min of top-k
        if (growth < 20) break;
        const score = k * growth;
        if (score > mejorScore) { mejorScore = score; mejorK = k; mejorGrowth = growth; }
      }
      if (mejorK === 0) continue;

      const valorActual = pieza[eje];
      const valorNuevo = valorActual + mejorGrowth;
      const colocacionesAfectadas = orden.slice(0, mejorK).map(x => x.colocacion);

      // Only surface "all instances grow X" suggestions automatically.
      // Variants (partial growth) are intentionally NOT auto-suggested —
      // splitting a pieza into copies is a manual decision the user makes.
      if (mejorK === pieza.cantidad) {
        sugerencias.push({
          type: 'extender',
          piezaId, piezaNombre: pieza.nombre,
          eje, valorActual, extension: mejorGrowth, valorNuevo,
          cantidad: pieza.cantidad,
          colocaciones: colocacionesAfectadas,
        });
      }
    }
  }
  // Row/column shift-and-grow suggestions: only when ALL instances of the
  // pieza are in this row/column (so no variant split is needed).
  for (const s of detectarFilasYColumnas(resultado, proyecto, kerf)) {
    if (s.cantidadAfectada === s.cantidadTotal) sugerencias.push(s);
  }

  return sugerencias.sort((a, b) => {
    const ka = a.extension * (a.cantidadAfectada || a.cantidad || 1);
    const kb = b.extension * (b.cantidadAfectada || b.cantidad || 1);
    return kb - ka;
  });
}

// Detect rows/columns of pieces (possibly mixed) with a sobrante at the END
// of the line that spans the perpendicular range. Each piece can grow by
// `sobrante / N`, shifting subsequent pieces to keep kerfs intact.
//
// To avoid implicit variant creation, we ONLY surface a row if every distinct
// pieza in the row has all its copies inside the row (count in row == cantidad).
function detectarFilasYColumnas(resultado, proyecto, kerf) {
  const TOL = 2;
  const piezaPorId = new Map(proyecto.piezas.map(p => [p.id, p]));
  const out = [];

  // Build one suggestion PER candidate pieza in the line. A candidate is a
  // pieza in the line whose all copies are inside it (no variant required)
  // and which accepts adjustments.
  //
  // When pieza P grows, pieces BEFORE the first P in the line don't move;
  // P and pieces AFTER it shift. So the sobrante at the line's end only
  // needs to cover the perpendicular dimension of the SHIFTING set, not
  // the whole line.
  const procesarLinea = (linea, esHorizontal, sobrante, placa) => {
    if (linea.length < 2) return [];
    // Sobrante size, with plate-edge kerf bonus when applicable.
    let S = esHorizontal ? sobrante.ancho : sobrante.alto;
    if (esHorizontal && Math.abs((sobrante.x + sobrante.ancho) - placa.ancho) <= TOL) S += kerf;
    if (!esHorizontal && Math.abs((sobrante.y + sobrante.alto) - placa.alto) <= TOL) S += kerf;
    const haveTransversal = esHorizontal ? sobrante.alto : sobrante.ancho;

    const conteo = new Map();
    for (const c of linea) {
      conteo.set(c.piezaId, (conteo.get(c.piezaId) || 0) + 1);
    }

    const sugs = [];
    for (const [pid, count] of conteo) {
      const pieza = piezaPorId.get(pid);
      if (!pieza) continue;
      if (!pieza.aceptaAjuste) continue;
      if (pieza.cantidad !== count) continue;
      const ext = S / count;
      if (ext < 20) continue;

      // Find first index where pieza appears; everything from there shifts.
      const firstIdx = linea.findIndex(c => c.piezaId === pid);
      const shifting = linea.slice(firstIdx);
      const maxTransversal = Math.max(...shifting.map(c => esHorizontal ? c.alto : c.ancho));
      if (haveTransversal < maxTransversal - 0.5) continue; // sobrante not deep enough

      const someColoc = linea.find(c => c.piezaId === pid);
      const eje = esHorizontal
        ? (someColoc.rotada ? 'alto' : 'ancho')
        : (someColoc.rotada ? 'ancho' : 'alto');
      const valorActual = pieza[eje];
      sugs.push({
        type: 'fila',
        orientacion: esHorizontal ? 'horizontal' : 'vertical',
        piezaId: pid,
        piezaNombre: pieza.nombre,
        eje, valorActual,
        extension: Math.floor(ext * 10) / 10,
        valorNuevo: Math.floor((valorActual + ext) * 10) / 10,
        cantidadEnLinea: count,
        totalEnLinea: linea.length,
        colocaciones: [...linea],
        sobrante, placa, kerf,
      });
    }
    return sugs;
  };

  for (const placa of resultado.placas) {
    // Horizontal "rows" — pieces that share the same TOP edge (y).
    // The row's "alto" is the MAX alto of its pieces; the sobrante at the
    // right must start at the same y and be at least as tall as the row max.
    const rows = new Map();
    for (const c of placa.colocaciones) {
      const key = c.y;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(c);
    }
    for (const fila of rows.values()) {
      if (fila.length < 2) continue;
      fila.sort((a, b) => a.x - b.x);
      const ult = fila[fila.length - 1];
      const ux2 = ult.x + ult.ancho;
      // Per-candidate check inside procesarLinea handles the sobrante alto.
      for (const s of placa.sobrantes || []) {
        if (Math.abs(s.x - (ux2 + kerf)) <= TOL &&
            Math.abs(s.y - fila[0].y) <= TOL) {
          for (const r of procesarLinea(fila, true, s, placa)) out.push(r);
          break;
        }
      }
    }
    // Vertical "columns" — pieces sharing the same LEFT edge (x).
    const cols = new Map();
    for (const c of placa.colocaciones) {
      const key = c.x;
      if (!cols.has(key)) cols.set(key, []);
      cols.get(key).push(c);
    }
    for (const col of cols.values()) {
      if (col.length < 2) continue;
      col.sort((a, b) => a.y - b.y);
      const ult = col[col.length - 1];
      const uy2 = ult.y + ult.alto;
      for (const s of placa.sobrantes || []) {
        if (Math.abs(s.y - (uy2 + kerf)) <= TOL &&
            Math.abs(s.x - col[0].x) <= TOL) {
          for (const r of procesarLinea(col, false, s, placa)) out.push(r);
          break;
        }
      }
    }
  }
  return out;
}

function renderSugerencias(sugerencias, proyecto, callbacks) {
  const div = document.createElement('div');
  div.className = 'sugerencias';
  const nombrePorGrupo = new Map(proyecto.grupos.map(g => [g.id, g.nombre]));
  const piezaPorId = new Map(proyecto.piezas.map(p => [p.id, p]));
  div.innerHTML = `<h4>💡 Sugerencias de aprovechamiento (${sugerencias.length})</h4><ul class="sugerencias-lista"></ul>`;
  const ul = div.querySelector('ul');
  for (const s of sugerencias) {
    const pieza = piezaPorId.get(s.piezaId);
    const grupo = pieza ? (nombrePorGrupo.get(pieza.grupoId) || '') : '';
    const li = document.createElement('li');
    li.className = 'sugerencia-item';
    let texto;
    if (s.type === 'extender') {
      texto = `<strong>${escapeHtml(grupo)} · ${escapeHtml(s.piezaNombre)}</strong>:
        extender <em>${s.eje}</em> de <strong>${s.valorActual}</strong> a <strong>${s.valorNuevo}</strong> mm
        (+${s.extension} mm${s.cantidad > 1 ? `, afecta ${s.cantidad} copias` : ''})`;
    } else if (s.type === 'variante') {
      texto = `<strong>${escapeHtml(grupo)} · ${escapeHtml(s.piezaNombre)}</strong>:
        <strong>${s.cantidadAfectada} de ${s.cantidadTotal}</strong> copias pueden extender
        <em>${s.eje}</em> a <strong>${s.valorNuevo}</strong> mm (+${s.extension} mm).
        <span class="sug-nota">Se crea una variante separada con el nuevo tamaño.</span>`;
    } else { // 'fila'
      const detalle = s.cantidadEnLinea === 1
        ? `crece ${s.extension} mm consumiendo todo el sobrante`
        : `${s.cantidadEnLinea} copias crecen ${s.extension} mm cada una`;
      texto = `<strong>${escapeHtml(grupo)} · ${escapeHtml(s.piezaNombre)}</strong>
        en ${s.orientacion === 'horizontal' ? 'fila' : 'columna'}:
        ${detalle} (sobrante ${Math.round(s.sobrante.ancho)}×${Math.round(s.sobrante.alto)}).
        <span class="sug-nota">Las otras piezas de la ${s.orientacion === 'horizontal' ? 'fila' : 'columna'} se desplazan para mantener el kerf.</span>`;
    }
    li.innerHTML = `<span class="sug-texto">${texto}</span><button class="sug-aplicar primary">Aplicar</button>`;
    li.querySelector('.sug-aplicar').onclick = () => {
      if (s.type === 'extender') {
        callbacks.onAplicarSugerencia(s.piezaId, s.eje, s.valorNuevo);
      } else if (s.type === 'variante' && callbacks.onCrearVariante) {
        callbacks.onCrearVariante(s);
      } else if (s.type === 'fila' && callbacks.onAplicarFila) {
        callbacks.onAplicarFila(s);
      }
    };
    ul.appendChild(li);
  }
  return div;
}

// =========================================================================
// Click-on-piece popover (Level 2)
// =========================================================================

let _popoverEl = null;
let _popoverCallbacks = null;

function setPopoverCallbacks(callbacks, proyecto) {
  _popoverCallbacks = { callbacks, proyecto };
}

function cerrarPopoverPieza() {
  if (_popoverEl) {
    _popoverEl.remove();
    _popoverEl = null;
  }
}

function mostrarPopoverPieza(colocacion, clickX, clickY) {
  cerrarPopoverPieza();
  if (!_popoverCallbacks) return;
  const { callbacks, proyecto } = _popoverCallbacks;
  const pieza = proyecto.piezas.find(p => p.id === colocacion.piezaId);
  if (!pieza) return;

  const grupo = proyecto.grupos.find(g => g.id === pieza.grupoId);
  const grupoNombre = grupo ? grupo.nombre : 'Sin grupo';

  const div = document.createElement('div');
  div.className = 'popover-pieza';
  div.innerHTML = `
    <div class="popover-header">
      <strong>${escapeHtml(grupoNombre)} · ${escapeHtml(pieza.nombre)}</strong>
      <button class="popover-cerrar" title="Cerrar">✕</button>
    </div>
    <div class="popover-body">
      <label>Ancho (mm) <input type="number" min="1" data-k="ancho" value="${pieza.ancho}"></label>
      <label>Alto (mm) <input type="number" min="1" data-k="alto" value="${pieza.alto}"></label>
      <label>Cantidad <input type="number" min="1" data-k="cantidad" value="${pieza.cantidad}"></label>
      ${pieza.cantidad > 1 ? '<p class="popover-warn">⚠ Esta pieza tiene varias copias. El cambio afecta a todas.</p>' : ''}
      <div class="popover-acciones">
        <button class="popover-aplicar primary">Aplicar</button>
        <button class="popover-cancelar">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(div);

  // Position near click, keep within viewport
  const w = 280, h = 220;
  let x = clickX + 12, y = clickY + 12;
  if (x + w > window.innerWidth - 10) x = window.innerWidth - w - 10;
  if (y + h > window.innerHeight - 10) y = clickY - h - 12;
  if (y < 10) y = 10;
  div.style.left = x + 'px';
  div.style.top = y + 'px';

  const inputs = {};
  div.querySelectorAll('input').forEach(i => { inputs[i.dataset.k] = i; });
  div.querySelector('.popover-cerrar').onclick = cerrarPopoverPieza;
  div.querySelector('.popover-cancelar').onclick = cerrarPopoverPieza;
  div.querySelector('.popover-aplicar').onclick = () => {
    const cambios = {
      ancho: Number(inputs.ancho.value) || pieza.ancho,
      alto: Number(inputs.alto.value) || pieza.alto,
      cantidad: Number(inputs.cantidad.value) || pieza.cantidad,
    };
    cerrarPopoverPieza();
    if (callbacks.onEditarPieza) callbacks.onEditarPieza(pieza.id, cambios);
  };
  // Esc to close
  const onKey = (e) => {
    if (e.key === 'Escape') { cerrarPopoverPieza(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);
  _popoverEl = div;
  inputs.ancho.focus();
  inputs.ancho.select();
}

// Click outside the popover closes it. Guard for non-DOM environments (Node).
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (_popoverEl && !_popoverEl.contains(e.target) && !e.target.closest('.pieza-grupo')) {
      cerrarPopoverPieza();
    }
  });
}

// Exported so app.js can register callbacks before render() runs.
export function registrarCallbacksRender(callbacks, proyecto) {
  setPopoverCallbacks(callbacks, proyecto);
}

// =========================================================================
// In-place layout update: resize a piece without re-running the optimizer.
// Used when applying a suggestion (or a small popover edit that fits).
// Returns true if applied, false if any instance can't accommodate the change.
// =========================================================================
export function aplicarPiezaInPlace(resultado, pieza, kerf) {
  // First pass: validate every instance can take the new dimensions.
  // We need to check, per placa, that for each instance of `pieza`:
  //   - The new layout footprint doesn't overlap any other piece.
  //   - The new footprint stays inside the placa bounds.
  const cambios = [];
  for (const placa of resultado.placas) {
    for (const c of placa.colocaciones) {
      if (c.piezaId !== pieza.id) continue;
      const nuevoLW = c.rotada ? pieza.alto : pieza.ancho;
      const nuevoLH = c.rotada ? pieza.ancho : pieza.alto;
      // Future footprint
      const nx = c.x, ny = c.y, nx2 = c.x + nuevoLW, ny2 = c.y + nuevoLH;
      // Inside plate?
      if (nx2 > placa.ancho + 0.5 || ny2 > placa.alto + 0.5) return false;
      // No overlap with other pieces (account for kerf gap)
      for (const otra of placa.colocaciones) {
        if (otra === c) continue;
        const ox2 = otra.x + otra.ancho, oy2 = otra.y + otra.alto;
        const overlapX = nx < ox2 + kerf - 0.5 && nx2 > otra.x - kerf + 0.5;
        const overlapY = ny < oy2 + kerf - 0.5 && ny2 > otra.y - kerf + 0.5;
        if (overlapX && overlapY) return false;
      }
      cambios.push({ placa, c, nuevoLW, nuevoLH });
    }
  }
  // Second pass: apply
  for (const { c, nuevoLW, nuevoLH } of cambios) {
    c.ancho = nuevoLW;
    c.alto = nuevoLH;
    if (pieza.cantos) c.cantos = pieza.cantos;
  }
  // Recompute sobrantes per affected placa.
  const placasAfectadas = new Set(cambios.map(x => x.placa));
  for (const placa of placasAfectadas) {
    placa.sobrantes = recomputarSobrantes(placa, kerf);
  }
  return true;
}

// Recompute sobrantes by subtracting each piece (with kerf padding) from the
// full placa rectangle. Simple geometric subtraction; resulting rects may be
// overlapping/non-canonical but display-wise that's fine.
function recomputarSobrantes(placa, kerf) {
  let libres = [{ x: 0, y: 0, ancho: placa.ancho, alto: placa.alto }];
  for (const c of placa.colocaciones) {
    // The piece occupies [c.x, c.x + c.ancho] x [c.y, c.y + c.alto].
    // Surrounding kerf (on the right and bottom only — left/top kerf was consumed
    // by the cut that created this piece's region) is part of the cut, not the piece.
    libres = restarRect(libres, c.x, c.y, c.ancho + kerf, c.alto + kerf);
  }
  return libres.filter(r => r.ancho >= 5 && r.alto >= 5);
}

function restarRect(libres, rx, ry, rw, rh) {
  const out = [];
  const rx2 = rx + rw, ry2 = ry + rh;
  for (const l of libres) {
    const lx2 = l.x + l.ancho, ly2 = l.y + l.alto;
    // No overlap → keep as-is
    if (lx2 <= rx || l.x >= rx2 || ly2 <= ry || l.y >= ry2) { out.push(l); continue; }
    // Up to 4 strips around the subtraction
    if (l.y < ry)    out.push({ x: l.x, y: l.y, ancho: l.ancho, alto: ry - l.y });
    if (ly2 > ry2)   out.push({ x: l.x, y: ry2, ancho: l.ancho, alto: ly2 - ry2 });
    if (l.x < rx) {
      const top = Math.max(l.y, ry), bot = Math.min(ly2, ry2);
      if (bot > top) out.push({ x: l.x, y: top, ancho: rx - l.x, alto: bot - top });
    }
    if (lx2 > rx2) {
      const top = Math.max(l.y, ry), bot = Math.min(ly2, ry2);
      if (bot > top) out.push({ x: rx2, y: top, ancho: lx2 - rx2, alto: bot - top });
    }
  }
  return out;
}

// Detailed per-mueble breakdown: piezas count, total area (m²), edge band
// length (m), plate cost share (area-weighted), edge band cost.
// Returns Map<grupoNombre, { piezas, area_m2, canto_m, costoPlaca, costoCanto }>
function desgloseMuebles(resultado, proyecto, precioCantoPorMetro, costoCortesTotal = 0) {
  const grupoIdPorPieza = new Map(proyecto.piezas.map(p => [p.id, p.grupoId]));
  const nombrePorGrupo = new Map(proyecto.grupos.map(g => [g.id, g.nombre]));
  const data = new Map();
  const ensure = nombre => {
    if (!data.has(nombre)) data.set(nombre, { piezas: 0, area_mm2: 0, canto_mm: 0, costoPlaca: 0, costoCanto: 0 });
    return data.get(nombre);
  };

  for (const placa of resultado.placas) {
    const areaPlaca = placa.ancho * placa.alto;
    const precio = placa.precio || 0;
    // First pass: area used per grupo on this plate, for cost distribution.
    const areaPorGrupo = new Map();
    for (const c of placa.colocaciones) {
      const grupoId = grupoIdPorPieza.get(c.piezaId);
      const nombre = nombrePorGrupo.get(grupoId) || 'Sin grupo';
      const area = c.ancho * c.alto;
      areaPorGrupo.set(nombre, (areaPorGrupo.get(nombre) || 0) + area);
    }
    for (const [nombre, area] of areaPorGrupo) {
      const share = areaPlaca > 0 ? area / areaPlaca : 0;
      ensure(nombre).costoPlaca += share * precio;
    }
    // Per-piece counts, area and canto length
    for (const c of placa.colocaciones) {
      const grupoId = grupoIdPorPieza.get(c.piezaId);
      const nombre = nombrePorGrupo.get(grupoId) || 'Sin grupo';
      const d = ensure(nombre);
      d.piezas += 1;
      d.area_mm2 += c.ancho * c.alto;
      if (c.cantos) {
        const ladoSupInf = c.rotada ? c.alto : c.ancho;
        const ladoIzqDer = c.rotada ? c.ancho : c.alto;
        if (c.cantos.sup) d.canto_mm += ladoSupInf;
        if (c.cantos.inf) d.canto_mm += ladoSupInf;
        if (c.cantos.izq) d.canto_mm += ladoIzqDer;
        if (c.cantos.der) d.canto_mm += ladoIzqDer;
      }
    }
  }
  // Distribute cut cost by PIECE count (cuts scale with piece count, not area).
  const totalPiezas = [...data.values()].reduce((s, d) => s + d.piezas, 0);
  for (const d of data.values()) {
    d.area_m2 = d.area_mm2 / 1e6;
    d.canto_m = d.canto_mm / 1000;
    d.costoCanto = d.canto_m * precioCantoPorMetro;
    d.costoCortes = totalPiezas > 0 ? (d.piezas / totalPiezas) * costoCortesTotal : 0;
    d.costoTotal = d.costoPlaca + d.costoCanto + d.costoCortes;
  }
  return data;
}

function renderDesglose(desglose, metricas, precioCanto, precioCorte, costoCortesTotal) {
  const div = document.createElement('div');
  div.className = 'desglose-muebles';
  const muestraCostoCanto = precioCanto > 0;
  const muestraCostoPlaca = metricas.costoTotal > 0;
  const muestraCostoCortes = (precioCorte || 0) > 0;
  const muestraTotal = muestraCostoPlaca || muestraCostoCanto || muestraCostoCortes;
  const costoDesperdicio = metricas.costoTotal * metricas.desperdicio;

  const filas = [...desglose.entries()].map(([nombre, d]) => `
    <tr>
      <td>${escapeHtml(nombre)}</td>
      <td style="text-align:right">${d.piezas}</td>
      <td style="text-align:right">${d.area_m2.toFixed(2)} m²</td>
      <td style="text-align:right">${d.canto_m.toFixed(2)} m</td>
      ${muestraCostoPlaca ? `<td style="text-align:right">${formatearMoneda(d.costoPlaca)}</td>` : ''}
      ${muestraCostoCanto ? `<td style="text-align:right">${formatearMoneda(d.costoCanto)}</td>` : ''}
      ${muestraCostoCortes ? `<td style="text-align:right">${formatearMoneda(d.costoCortes)}</td>` : ''}
      ${muestraTotal ? `<td style="text-align:right"><strong>${formatearMoneda(d.costoTotal)}</strong></td>` : ''}
    </tr>
  `).join('');

  const totales = [...desglose.values()].reduce((s, d) => ({
    piezas: s.piezas + d.piezas,
    area: s.area + d.area_m2,
    canto: s.canto + d.canto_m,
    costoPlaca: s.costoPlaca + d.costoPlaca,
    costoCanto: s.costoCanto + d.costoCanto,
    costoCortes: s.costoCortes + d.costoCortes,
    costoTotal: s.costoTotal + d.costoTotal,
  }), {piezas:0,area:0,canto:0,costoPlaca:0,costoCanto:0,costoCortes:0,costoTotal:0});

  div.innerHTML = `
    <h4>Detalle por mueble</h4>
    <table class="tabla-detalle">
      <thead>
        <tr>
          <th>Mueble</th>
          <th style="text-align:right">Piezas</th>
          <th style="text-align:right">Área</th>
          <th style="text-align:right">Canto</th>
          ${muestraCostoPlaca ? '<th style="text-align:right">Costo placa</th>' : ''}
          ${muestraCostoCanto ? '<th style="text-align:right">Costo canto</th>' : ''}
          ${muestraCostoCortes ? '<th style="text-align:right">Costo cortes</th>' : ''}
          ${muestraTotal ? '<th style="text-align:right">Total</th>' : ''}
        </tr>
      </thead>
      <tbody>${filas}</tbody>
      <tfoot>
        <tr>
          <td><strong>Total (${desglose.size} mueble${desglose.size === 1 ? '' : 's'})</strong></td>
          <td style="text-align:right"><strong>${totales.piezas}</strong></td>
          <td style="text-align:right"><strong>${totales.area.toFixed(2)} m²</strong></td>
          <td style="text-align:right"><strong>${totales.canto.toFixed(2)} m</strong></td>
          ${muestraCostoPlaca ? `<td style="text-align:right"><strong>${formatearMoneda(totales.costoPlaca)}</strong></td>` : ''}
          ${muestraCostoCanto ? `<td style="text-align:right"><strong>${formatearMoneda(totales.costoCanto)}</strong></td>` : ''}
          ${muestraCostoCortes ? `<td style="text-align:right"><strong>${formatearMoneda(totales.costoCortes)}</strong></td>` : ''}
          ${muestraTotal ? `<td style="text-align:right"><strong>${formatearMoneda(totales.costoTotal)}</strong></td>` : ''}
        </tr>
        ${muestraCostoPlaca && costoDesperdicio > 0 ? `
          <tr class="fila-desperdicio">
            <td colspan="${4 + (muestraCostoPlaca ? 1 : 0) + (muestraCostoCanto ? 1 : 0) + (muestraCostoCortes ? 1 : 0)}" style="text-align:right">
              Costo desperdicio (${(metricas.desperdicio * 100).toFixed(1)}% de las placas):
            </td>
            <td style="text-align:right"><strong>${formatearMoneda(costoDesperdicio)}</strong></td>
          </tr>
        ` : ''}
      </tfoot>
    </table>
  `;
  return div;
}

// Total linear meters of edge banding needed. For each placed piece, sum the
// length of each marked edge. Returns meters.
function calcularMetrosCanto(resultado) {
  let mm = 0;
  for (const placa of resultado.placas) {
    for (const c of placa.colocaciones) {
      if (!c.cantos) continue;
      // The piece's logical (sup/inf/izq/der) maps to its physical edges in
      // the layout differently when rotated. Length of an edge is the edge's
      // ACTUAL length, which depends on the orientation in the layout.
      // sup/inf in the piece's own frame = its width = its original ancho.
      // After rotation, that "width" becomes the placed `alto`.
      const ladoSupInfMM = c.rotada ? c.alto : c.ancho;
      const ladoIzqDerMM = c.rotada ? c.ancho : c.alto;
      if (c.cantos.sup) mm += ladoSupInfMM;
      if (c.cantos.inf) mm += ladoSupInfMM;
      if (c.cantos.izq) mm += ladoIzqDerMM;
      if (c.cantos.der) mm += ladoIzqDerMM;
    }
  }
  return mm / 1000;
}

function formatearMoneda(n) {
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n);
  } catch {
    return '$ ' + (Math.round(n * 100) / 100).toFixed(2);
  }
}

function printSummary(proyecto, resultado) {
  const wrap = document.createElement('section');
  wrap.className = 'print-only print-summary';
  const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
  const m = resultado.metricas;
  const totalPiezas = proyecto.piezas.reduce((s, p) => s + (p.cantidad || 0), 0);

  const grupos = proyecto.grupos || [];
  const seccionesGrupo = grupos.map(g => {
    const piezasGrupo = proyecto.piezas.filter(p => p.grupoId === g.id);
    if (piezasGrupo.length === 0) return '';
    const m2 = piezasGrupo.reduce((s, p) => s + (p.ancho * p.alto * p.cantidad) / 1e6, 0);
    const cant = piezasGrupo.reduce((s, p) => s + (p.cantidad || 0), 0);
    const filas = piezasGrupo.map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(p.nombre || '')}</td>
        <td style="text-align:right">${p.ancho}</td>
        <td style="text-align:right">${p.alto}</td>
        <td style="text-align:right">${p.cantidad}</td>
        <td>${p.vetaDireccion || 'libre'}</td>
      </tr>
    `).join('');
    return `
      <h3 class="grupo-titulo">${escapeHtml(g.nombre)} <span class="meta">(${cant} pieza${cant === 1 ? '' : 's'} · ${m2.toFixed(2)} m²)</span></h3>
      <table>
        <thead>
          <tr><th>#</th><th>Nombre</th><th>Ancho (mm)</th><th>Alto (mm)</th><th>Cant.</th><th>Veta</th></tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    `;
  }).join('');

  wrap.innerHTML = `
    <h2>${escapeHtml(proyecto.nombre || 'Optimizador de Cortes')}</h2>
    <div class="meta">${fecha} — ${totalPiezas} piezas, ${m.placasUsadas} placa(s), ${(m.aprovechamiento * 100).toFixed(1)}% de aprovechamiento</div>
    ${seccionesGrupo}
  `;
  return wrap;
}
