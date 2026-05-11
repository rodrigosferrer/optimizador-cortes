import { nuevaPieza, nuevoGrupo, repararGrupos } from './state.js';
import { icon } from './icons.js';

let _proyecto, _onChange;
let _dragPiezaId = null;

export function montar(proyecto, onChange) {
  _proyecto = proyecto;
  _onChange = onChange;
  repararGrupos(proyecto);
  render();
  document.getElementById('btn-agregar-mueble').onclick = () => {
    const grupo = nuevoGrupo(`Mueble ${proyecto.grupos.length + 1}`);
    proyecto.grupos.push(grupo);
    render();
    onChange();
  };
}

export function rerender(proyecto, onChange) {
  _proyecto = proyecto;
  _onChange = onChange;
  repararGrupos(proyecto);
  render();
}

function render() {
  const root = document.getElementById('grupos-container');
  root.innerHTML = '';
  root.appendChild(renderTotalGlobal());
  for (const grupo of _proyecto.grupos) {
    root.appendChild(renderGrupo(grupo));
  }
}

function renderTotalGlobal() {
  const total = totalGlobal();
  const div = document.createElement('div');
  div.className = 'total-global';
  div.innerHTML = `
    <span class="total-label">Total</span>
    <span class="total-stats">${total.cant} pieza${total.cant === 1 ? '' : 's'} · ${total.m2.toFixed(2)} m² · ${_proyecto.grupos.length} mueble${_proyecto.grupos.length === 1 ? '' : 's'}</span>
  `;
  return div;
}

function totalGlobal() {
  return {
    cant: _proyecto.piezas.reduce((s, p) => s + (p.cantidad || 0), 0),
    m2: _proyecto.piezas.reduce((s, p) => s + (p.ancho * p.alto * p.cantidad) / 1e6, 0),
  };
}

function renderGrupo(grupo) {
  const piezas = _proyecto.piezas.filter(p => p.grupoId === grupo.id);
  const m2 = piezas.reduce((s, p) => s + (p.ancho * p.alto * p.cantidad) / 1e6, 0);
  const cant = piezas.reduce((s, p) => s + (p.cantidad || 0), 0);

  const card = document.createElement('div');
  card.className = 'grupo-card';
  card.dataset.grupoId = grupo.id;
  card.innerHTML = `
    <div class="grupo-header">
      <input type="text" class="grupo-nombre" value="${escapeAttr(grupo.nombre)}" placeholder="Nombre del mueble">
      <span class="grupo-stats">${cant} pieza${cant === 1 ? '' : 's'} · ${m2.toFixed(2)} m²</span>
      <button class="icon-only btn-rm-grupo" title="Eliminar mueble">${icon('trash')}</button>
    </div>
    <table class="tabla-grupo">
      <thead>
        <tr>
          <th></th><th>Nombre</th><th>Ancho</th><th>Alto</th><th>Cant.</th><th>Veta</th><th class="col-icon" title="Cantos">${icon('panelEdges')}</th><th class="col-icon" title="Aceptar sugerencias de aprovechamiento (esta pieza puede crecer si hay espacio)">${icon('bulb')}</th><th></th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
    <div class="grupo-acciones">
      <button class="btn-add-pieza">${icon('plus')} Pieza</button>
    </div>
  `;

  // Drop target: anything dropped on the card moves the piece into this group.
  card.addEventListener('dragover', (e) => {
    if (!_dragPiezaId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    card.classList.add('drop-target');
  });
  card.addEventListener('dragleave', (e) => {
    // Only clear if we actually left the card (not just moved over a child)
    if (!card.contains(e.relatedTarget)) card.classList.remove('drop-target');
  });
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('drop-target');
    const piezaId = e.dataTransfer.getData('text/plain') || _dragPiezaId;
    const pieza = _proyecto.piezas.find(x => x.id === piezaId);
    if (pieza && pieza.grupoId !== grupo.id) {
      pieza.grupoId = grupo.id;
      render();
      _onChange();
    }
  });

  const inputNombre = card.querySelector('.grupo-nombre');
  inputNombre.oninput = () => { grupo.nombre = inputNombre.value; _onChange(); };

  card.querySelector('.btn-rm-grupo').onclick = () => {
    if (_proyecto.grupos.length === 1) {
      alert('Tiene que haber al menos un mueble.');
      return;
    }
    if (piezas.length > 0 && !confirm(`Eliminar el mueble "${grupo.nombre}" y sus ${piezas.length} pieza(s)?`)) return;
    _proyecto.piezas = _proyecto.piezas.filter(p => p.grupoId !== grupo.id);
    _proyecto.grupos = _proyecto.grupos.filter(g => g.id !== grupo.id);
    render();
    _onChange();
  };

  card.querySelector('.btn-add-pieza').onclick = () => {
    _proyecto.piezas.push(nuevaPieza(grupo.id));
    render();
    _onChange();
  };

  const tbody = card.querySelector('tbody');
  piezas.forEach(p => tbody.appendChild(renderFila(p)));

  return card;
}

function renderFila(p) {
  const veta = p.vetaDireccion || 'libre';
  if (!p.cantos) p.cantos = { sup: false, inf: false, izq: false, der: false };
  if (p.aceptaAjuste === undefined) p.aceptaAjuste = false;
  const tr = document.createElement('tr');
  tr.dataset.piezaId = p.id;
  tr.innerHTML = `
    <td class="drag-handle" draggable="true" title="Arrastrá para mover a otro mueble">${icon('grip')}</td>
    <td><input type="text" class="nombre" value="${escapeAttr(p.nombre)}"></td>
    <td><input type="number" min="1" value="${p.ancho}"></td>
    <td><input type="number" min="1" value="${p.alto}"></td>
    <td><input type="number" min="1" value="${p.cantidad}"></td>
    <td>
      <select title="Dirección de la veta de la pieza">
        <option value="libre" ${veta === 'libre' ? 'selected' : ''}>libre</option>
        <option value="ancho" ${veta === 'ancho' ? 'selected' : ''}>↔ ancho</option>
        <option value="alto"  ${veta === 'alto'  ? 'selected' : ''}>↕ alto</option>
      </select>
    </td>
    <td class="cantos-cell"></td>
    <td style="text-align:center">
      <input type="checkbox" class="chk-ajuste" ${p.aceptaAjuste ? 'checked' : ''} title="Aceptar sugerencias de aprovechamiento (esta pieza puede crecer si hay espacio)">
    </td>
    <td><button class="icon-only btn-rm-pieza" title="Quitar">${icon('trash')}</button></td>
  `;
  tr.querySelector('.cantos-cell').appendChild(widgetCantos(p, _onChange));
  const inputs = tr.querySelectorAll('input');
  const sel = tr.querySelector('select');
  inputs[0].oninput = () => { p.nombre = inputs[0].value; _onChange(); };
  inputs[1].oninput = () => { p.ancho = Number(inputs[1].value) || 0; _onChange(); rerenderStats(); };
  inputs[2].oninput = () => { p.alto = Number(inputs[2].value) || 0; _onChange(); rerenderStats(); };
  inputs[3].oninput = () => { p.cantidad = Number(inputs[3].value) || 0; _onChange(); rerenderStats(); };
  sel.onchange = () => { p.vetaDireccion = sel.value; _onChange(); };
  const chkAjuste = tr.querySelector('.chk-ajuste');
  if (chkAjuste) chkAjuste.onchange = () => { p.aceptaAjuste = chkAjuste.checked; _onChange(); };
  tr.querySelector('.btn-rm-pieza').onclick = () => {
    _proyecto.piezas = _proyecto.piezas.filter(x => x.id !== p.id);
    render();
    _onChange();
  };

  // Drag source
  const handle = tr.querySelector('.drag-handle');
  handle.addEventListener('dragstart', (e) => {
    _dragPiezaId = p.id;
    e.dataTransfer.setData('text/plain', p.id);
    e.dataTransfer.effectAllowed = 'move';
    tr.classList.add('dragging');
  });
  handle.addEventListener('dragend', () => {
    _dragPiezaId = null;
    tr.classList.remove('dragging');
    document.querySelectorAll('.grupo-card.drop-target').forEach(c => c.classList.remove('drop-target'));
  });

  return tr;
}

function rerenderStats() {
  // Update only the stats spans without rebuilding inputs (avoid losing focus while typing)
  const cards = document.querySelectorAll('.grupo-card');
  cards.forEach((card, i) => {
    const grupo = _proyecto.grupos[i];
    if (!grupo) return;
    const piezas = _proyecto.piezas.filter(p => p.grupoId === grupo.id);
    const m2 = piezas.reduce((s, p) => s + (p.ancho * p.alto * p.cantidad) / 1e6, 0);
    const cant = piezas.reduce((s, p) => s + (p.cantidad || 0), 0);
    const stats = card.querySelector('.grupo-stats');
    if (stats) stats.textContent = `${cant} pieza${cant === 1 ? '' : 's'} · ${m2.toFixed(2)} m²`;
  });
  const totalEl = document.querySelector('.total-global .total-stats');
  if (totalEl) {
    const t = totalGlobal();
    totalEl.textContent = `${t.cant} pieza${t.cant === 1 ? '' : 's'} · ${t.m2.toFixed(2)} m² · ${_proyecto.grupos.length} mueble${_proyecto.grupos.length === 1 ? '' : 's'}`;
  }
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function widgetCantos(p, onChange) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', 28);
  svg.setAttribute('height', 28);
  svg.classList.add('cantos-widget');
  svg.setAttribute('aria-label', 'Cantos de la pieza');

  // Center panel (visual reference)
  const center = document.createElementNS(SVG_NS, 'rect');
  center.setAttribute('x', 6); center.setAttribute('y', 6);
  center.setAttribute('width', 12); center.setAttribute('height', 12);
  center.setAttribute('fill', '#f5e8c8');
  center.setAttribute('stroke', '#a8a29e');
  center.setAttribute('stroke-width', 0.5);
  svg.appendChild(center);

  const lados = [
    { key: 'sup', x: 5,  y: 2,  w: 14, h: 4,  label: 'superior' },
    { key: 'inf', x: 5,  y: 18, w: 14, h: 4,  label: 'inferior' },
    { key: 'izq', x: 2,  y: 5,  w: 4,  h: 14, label: 'izquierdo' },
    { key: 'der', x: 18, y: 5,  w: 4,  h: 14, label: 'derecho' },
  ];

  for (const lado of lados) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', lado.x); rect.setAttribute('y', lado.y);
    rect.setAttribute('width', lado.w); rect.setAttribute('height', lado.h);
    rect.setAttribute('rx', 1);
    rect.setAttribute('cursor', 'pointer');
    rect.setAttribute('data-lado', lado.key);
    const pintar = () => {
      const activo = !!p.cantos[lado.key];
      rect.setAttribute('fill', activo ? '#a16207' : '#e7dfd1');
      rect.setAttribute('stroke', activo ? '#854d0e' : 'transparent');
      rect.setAttribute('stroke-width', activo ? 0.5 : 0);
    };
    pintar();
    rect.addEventListener('mouseenter', () => {
      if (!p.cantos[lado.key]) rect.setAttribute('fill', '#d4c5a3');
    });
    rect.addEventListener('mouseleave', pintar);
    rect.addEventListener('click', () => {
      p.cantos[lado.key] = !p.cantos[lado.key];
      pintar();
      onChange();
    });
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = `Canto ${lado.label}`;
    rect.appendChild(title);
    svg.appendChild(rect);
  }
  return svg;
}
