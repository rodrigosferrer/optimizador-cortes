import { nuevaPieza } from './state.js';

export function montar(proyecto, onChange) {
  render(proyecto, onChange);
  document.getElementById('btn-agregar-pieza').onclick = () => {
    proyecto.piezas.push(nuevaPieza());
    render(proyecto, onChange);
    onChange();
  };
}

export function rerender(proyecto, onChange) {
  render(proyecto, onChange);
}

function render(proyecto, onChange) {
  const tbody = document.querySelector('#tabla-piezas tbody');
  tbody.innerHTML = '';
  proyecto.piezas.forEach((p, i) => {
    const tr = document.createElement('tr');
    const veta = p.vetaDireccion || 'libre';
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
      <td><button title="Quitar">✕</button></td>
    `;
    const inputs = tr.querySelectorAll('input');
    const sel = tr.querySelector('select');
    inputs[0].oninput = () => { p.nombre = inputs[0].value; onChange(); };
    inputs[1].oninput = () => { p.ancho = Number(inputs[1].value) || 0; onChange(); };
    inputs[2].oninput = () => { p.alto = Number(inputs[2].value) || 0; onChange(); };
    inputs[3].oninput = () => { p.cantidad = Number(inputs[3].value) || 0; onChange(); };
    sel.onchange = () => { p.vetaDireccion = sel.value; onChange(); };
    tr.querySelector('button').onclick = () => {
      proyecto.piezas.splice(i, 1);
      render(proyecto, onChange);
      onChange();
    };
    tbody.appendChild(tr);
  });
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
