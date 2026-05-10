import { nuevaPieza, nuevoGrupo, repararGrupos } from './state.js';
import { icon } from './icons.js';

let _proyecto, _onChange;

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
  for (const grupo of _proyecto.grupos) {
    root.appendChild(renderGrupo(grupo));
  }
}

function renderGrupo(grupo) {
  const piezas = _proyecto.piezas.filter(p => p.grupoId === grupo.id);
  const m2 = piezas.reduce((s, p) => s + (p.ancho * p.alto * p.cantidad) / 1e6, 0);
  const cant = piezas.reduce((s, p) => s + (p.cantidad || 0), 0);

  const card = document.createElement('div');
  card.className = 'grupo-card';
  card.innerHTML = `
    <div class="grupo-header">
      <input type="text" class="grupo-nombre" value="${escapeAttr(grupo.nombre)}" placeholder="Nombre del mueble">
      <span class="grupo-stats">${cant} pieza${cant === 1 ? '' : 's'} · ${m2.toFixed(2)} m²</span>
      <button class="icon-only btn-rm-grupo" title="Eliminar mueble">${icon('trash')}</button>
    </div>
    <table class="tabla-grupo">
      <thead>
        <tr>
          <th>Nombre</th><th>Ancho</th><th>Alto</th><th>Cant.</th><th>Veta</th><th></th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
    <div class="grupo-acciones">
      <button class="btn-add-pieza">${icon('plus')} Pieza</button>
    </div>
  `;

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
  const tr = document.createElement('tr');
  tr.innerHTML = `
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
    <td><button class="icon-only btn-rm-pieza" title="Quitar">${icon('trash')}</button></td>
  `;
  const inputs = tr.querySelectorAll('input');
  const sel = tr.querySelector('select');
  inputs[0].oninput = () => { p.nombre = inputs[0].value; _onChange(); };
  inputs[1].oninput = () => { p.ancho = Number(inputs[1].value) || 0; _onChange(); rerenderStats(); };
  inputs[2].oninput = () => { p.alto = Number(inputs[2].value) || 0; _onChange(); rerenderStats(); };
  inputs[3].oninput = () => { p.cantidad = Number(inputs[3].value) || 0; _onChange(); rerenderStats(); };
  sel.onchange = () => { p.vetaDireccion = sel.value; _onChange(); };
  tr.querySelector('.btn-rm-pieza').onclick = () => {
    _proyecto.piezas = _proyecto.piezas.filter(x => x.id !== p.id);
    render();
    _onChange();
  };
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
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
