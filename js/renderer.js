// Renders the optimizer result into an HTML container as SVG.

import { planCortes } from './cuts.js';
import { tip } from './icons.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function render(container, resultado, kerf = 0, proyecto = null) {
  container.innerHTML = '';

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
  resumen.innerHTML = `
    <div>Placas usadas: <strong>${m.placasUsadas}</strong>${
      cota > 0
        ? ` <span class="cota">(mínimo teórico: ${cota}${enOptimo ? ' ✓' : ''})</span>${tip('Mínimo absoluto según el área total de las piezas. Con cortes guillotine no siempre es alcanzable.')}`
        : ''
    }</div>
    <div>Aprovechamiento: <strong>${(m.aprovechamiento * 100).toFixed(1)}%</strong>${tip('Porcentaje del área de las placas usado por piezas (vs. desperdicio).')}</div>
    <div>Desperdicio: <strong>${(m.desperdicio * 100).toFixed(1)}%</strong></div>
    ${metrosCanto > 0 ? `<div>Canto: <strong>${metrosCanto.toFixed(2)} m</strong>${tip('Metros lineales totales de tapacanto necesarios, sumando los bordes marcados de todas las piezas.')}</div>` : ''}
    ${m.costoTotal > 0 ? `<div>Costo total: <strong>${formatearMoneda(m.costoTotal)}</strong>${tip('Suma de los precios de las placas usadas (incluye placas faltantes a comprar).')}</div>` : ''}
    ${m.placasFaltantes > 0 ? `<div class="warn">⚠ Faltan ${m.placasFaltantes} placa(s) en stock</div>` : ''}
  `;
  container.appendChild(resumen);

  // Per-mueble cost breakdown (only if prices were set)
  if (m.costoTotal > 0 && proyecto && proyecto.grupos && proyecto.grupos.length > 0) {
    const desglose = costoPorMueble(resultado, proyecto);
    if (desglose.size > 0) {
      const div = document.createElement('div');
      div.className = 'costo-desglose';
      div.innerHTML = '<h4>Costo por mueble</h4>' +
        '<ul>' +
          [...desglose.entries()].map(([nombre, costo]) =>
            `<li><span>${escapeHtml(nombre)}</span><strong>${formatearMoneda(costo)}</strong></li>`
          ).join('') +
        '</ul>';
      container.appendChild(div);
    }
  }

  // Scale plates proportionally so a small plate visually looks smaller
  // than a large one. The widest plate fills the available width; others
  // are sized proportionally.
  const maxAncho = Math.max(...resultado.placas.map(p => p.ancho), 1);

  resultado.placas.forEach((placa, i) => {
    const cortes = planCortes(placa, kerf);
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

// Distribute each plate's price among muebles based on the area each mueble
// occupies on that plate. Returns Map<grupoNombre, costo>.
function costoPorMueble(resultado, proyecto) {
  const grupoIdPorPieza = new Map(proyecto.piezas.map(p => [p.id, p.grupoId]));
  const nombrePorGrupo = new Map(proyecto.grupos.map(g => [g.id, g.nombre]));
  const costoPorNombre = new Map();
  for (const placa of resultado.placas) {
    if (!placa.precio || placa.colocaciones.length === 0) continue;
    const areaPlaca = placa.ancho * placa.alto;
    const areaPorGrupo = new Map();
    for (const c of placa.colocaciones) {
      const grupoId = grupoIdPorPieza.get(c.piezaId);
      const area = c.ancho * c.alto;
      areaPorGrupo.set(grupoId, (areaPorGrupo.get(grupoId) || 0) + area);
    }
    for (const [grupoId, area] of areaPorGrupo) {
      const nombre = nombrePorGrupo.get(grupoId) || 'Sin grupo';
      const share = area / areaPlaca;
      costoPorNombre.set(nombre, (costoPorNombre.get(nombre) || 0) + share * placa.precio);
    }
  }
  return costoPorNombre;
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
