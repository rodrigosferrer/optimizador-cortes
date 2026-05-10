// Renders the optimizer result into an HTML container as SVG.

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEWPORT_PX = 700;

export function render(container, resultado) {
  container.innerHTML = '';

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
  resumen.innerHTML = `
    <div>Placas usadas: <strong>${m.placasUsadas}</strong>${
      cota > 0
        ? ` <span class="cota" title="Mínimo teórico (cota por área). Con cortes guillotine puede no ser alcanzable.">(mínimo teórico: ${cota}${enOptimo ? ' ✓' : ''})</span>`
        : ''
    }</div>
    <div>Aprovechamiento: <strong>${(m.aprovechamiento * 100).toFixed(1)}%</strong></div>
    <div>Desperdicio: <strong>${(m.desperdicio * 100).toFixed(1)}%</strong></div>
    ${m.placasFaltantes > 0 ? `<div class="warn">⚠ Faltan ${m.placasFaltantes} placa(s) en stock</div>` : ''}
  `;
  container.appendChild(resumen);

  resultado.placas.forEach((placa, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'placa-wrap';
    wrap.innerHTML = `<h3>Placa ${i + 1} — ${placa.ancho}×${placa.alto} mm</h3>`;
    wrap.appendChild(dibujarPlaca(placa));
    wrap.appendChild(listaPiezas(placa));
    container.appendChild(wrap);
  });
}

function dibujarPlaca(placa) {
  const escala = VIEWPORT_PX / placa.ancho;
  const altoPx = placa.alto * escala;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${placa.ancho} ${placa.alto}`);
  svg.setAttribute('width', VIEWPORT_PX);
  svg.setAttribute('height', altoPx);
  svg.setAttribute('class', 'placa-svg');

  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('x', 0); bg.setAttribute('y', 0);
  bg.setAttribute('width', placa.ancho); bg.setAttribute('height', placa.alto);
  bg.setAttribute('fill', '#f5e8c8'); bg.setAttribute('stroke', '#333'); bg.setAttribute('stroke-width', 4);
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

    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', s.x + s.ancho / 2);
    t.setAttribute('y', s.y + s.alto / 2);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('font-size', Math.max(30, Math.min(s.ancho, s.alto) / 10));
    t.setAttribute('fill', '#666');
    t.setAttribute('font-style', 'italic');
    t.textContent = `sobra ${Math.round(s.ancho)}×${Math.round(s.alto)}`;
    svg.appendChild(t);
  }

  for (const c of placa.colocaciones) {
    const g = document.createElementNS(SVG_NS, 'g');

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', c.x); rect.setAttribute('y', c.y);
    rect.setAttribute('width', c.ancho); rect.setAttribute('height', c.alto);
    rect.setAttribute('fill', colorPara(c.nombre));
    rect.setAttribute('stroke', '#222'); rect.setAttribute('stroke-width', 2);
    g.appendChild(rect);

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', c.x + c.ancho / 2);
    label.setAttribute('y', c.y + c.alto / 2);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('font-size', Math.max(40, Math.min(c.ancho, c.alto) / 8));
    label.setAttribute('fill', '#000');
    label.textContent = `${c.nombre} ${c.ancho}×${c.alto}${c.rotada ? ' ↻' : ''}`;
    g.appendChild(label);

    svg.appendChild(g);
  }
  return svg;
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
    line.setAttribute('stroke', '#c9a96a');
    line.setAttribute('stroke-width', 1);
    line.setAttribute('opacity', '0.45');
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

  // Marker definition (only need one per SVG)
  if (!svg.querySelector('defs')) {
    const defs = document.createElementNS(SVG_NS, 'defs');
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
    svg.insertBefore(defs, svg.firstChild);
  }
}

function listaPiezas(placa) {
  const ol = document.createElement('ol');
  ol.className = 'lista-piezas';
  for (const c of placa.colocaciones) {
    const li = document.createElement('li');
    li.textContent = `${c.nombre} — ${c.ancho}×${c.alto} mm @ (${c.x}, ${c.y})${c.rotada ? ' [rotada]' : ''}`;
    ol.appendChild(li);
  }
  return ol;
}

function colorPara(nombre) {
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h}, 55%, 75%)`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
