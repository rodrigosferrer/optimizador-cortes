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
