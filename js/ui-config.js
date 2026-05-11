import { nuevaPlaca } from './state.js';
import { icon } from './icons.js';

function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}

export function montar(proyecto, onChange) {
  const cfg = proyecto.config;
  if (!cfg.estrategiaPlaca) cfg.estrategiaPlaca = 'chica-primero';

  const kerfInput = document.getElementById('cfg-kerf');
  const margenInput = document.getElementById('cfg-margen');
  const estrategiaSel = document.getElementById('cfg-estrategia');
  const precioCantoInput = document.getElementById('cfg-precio-canto');
  kerfInput.value = cfg.kerf;
  margenInput.value = cfg.margenPlaca;
  if (estrategiaSel) estrategiaSel.value = cfg.estrategiaPlaca;
  if (precioCantoInput) precioCantoInput.value = cfg.precioCantoPorMetro || 0;

  kerfInput.oninput = () => { cfg.kerf = Number(kerfInput.value) || 0; onChange(); };
  margenInput.oninput = () => { cfg.margenPlaca = Number(margenInput.value) || 0; onChange(); };
  if (estrategiaSel) {
    estrategiaSel.onchange = () => { cfg.estrategiaPlaca = estrategiaSel.value; onChange(); };
  }
  if (precioCantoInput) {
    precioCantoInput.oninput = () => { cfg.precioCantoPorMetro = Number(precioCantoInput.value) || 0; onChange(); };
  }

  renderPlacas(proyecto, onChange);
}

function renderPlacas(proyecto, onChange) {
  const root = document.getElementById('config-placas');
  root.innerHTML = '';
  proyecto.placas.forEach((placa, i) => {
    if (placa.vetaHorizontal === undefined) placa.vetaHorizontal = true;
    if (placa.precio === undefined) placa.precio = 0;
    if (placa.material === undefined) placa.material = '';
    if (placa.espesor === undefined) placa.espesor = 0;
    const row = document.createElement('div');
    row.className = 'placa-row';
    row.innerHTML = `
      <strong>Placa ${i + 1}:</strong>
      Ancho <input type="number" min="1" value="${placa.ancho}" data-k="ancho">
      Alto <input type="number" min="1" value="${placa.alto}" data-k="alto">
      Cant. <input type="number" min="0" value="${placa.cantidad}" data-k="cantidad">
      $ <input type="number" min="0" step="0.01" value="${placa.precio}" data-k="precio" title="Precio por placa">
      <label title="Dirección de la veta de la placa">
        Veta:
        <select data-k="vetaHorizontal">
          <option value="h" ${placa.vetaHorizontal ? 'selected' : ''}>↔ horizontal</option>
          <option value="v" ${!placa.vetaHorizontal ? 'selected' : ''}>↕ vertical</option>
        </select>
      </label>
      Material <input type="text" value="${escapeAttr(placa.material)}" data-k="material" data-type="string" placeholder="(cualquiera)" title="Código de material — vacío = cualquier material" style="width:90px">
      Esp. <input type="number" min="0" step="0.1" value="${placa.espesor}" data-k="espesor" title="Espesor (mm) — 0 = cualquiera" style="width:60px">
      <span class="placa-m2"></span>
      <button class="icon-only" data-action="rm" title="Quitar">${icon('trash')}</button>
    `;
    const m2Span = row.querySelector('.placa-m2');
    const actualizarM2 = () => {
      const m2 = (placa.ancho * placa.alto) / 1e6;
      const total = m2 * (placa.cantidad || 0);
      m2Span.textContent = `${m2.toFixed(2)} m² · ${total.toFixed(2)} m² total`;
    };
    actualizarM2();
    row.querySelectorAll('input').forEach(input => {
      input.oninput = () => {
        const k = input.dataset.k;
        placa[k] = input.dataset.type === 'string' ? input.value : (Number(input.value) || 0);
        actualizarM2();
        onChange();
      };
    });
    const sel = row.querySelector('select[data-k=vetaHorizontal]');
    sel.onchange = () => { placa.vetaHorizontal = sel.value === 'h'; onChange(); };
    row.querySelector('[data-action=rm]').onclick = () => {
      proyecto.placas.splice(i, 1);
      if (proyecto.placas.length === 0) proyecto.placas.push(nuevaPlaca());
      renderPlacas(proyecto, onChange);
      onChange();
    };
    root.appendChild(row);
  });

  const addBtn = document.createElement('button');
  addBtn.innerHTML = `${icon('plus')} Otra placa stock`;
  addBtn.onclick = () => {
    proyecto.placas.push(nuevaPlaca());
    renderPlacas(proyecto, onChange);
    onChange();
  };
  root.appendChild(addBtn);
}
