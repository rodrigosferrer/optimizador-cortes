import { nuevaPlaca } from './state.js';

export function montar(proyecto, onChange) {
  const cfg = proyecto.config;
  const kerfInput = document.getElementById('cfg-kerf');
  const margenInput = document.getElementById('cfg-margen');
  kerfInput.value = cfg.kerf;
  margenInput.value = cfg.margenPlaca;
  kerfInput.oninput = () => { cfg.kerf = Number(kerfInput.value) || 0; onChange(); };
  margenInput.oninput = () => { cfg.margenPlaca = Number(margenInput.value) || 0; onChange(); };

  renderPlacas(proyecto, onChange);
}

function renderPlacas(proyecto, onChange) {
  const root = document.getElementById('config-placas');
  root.innerHTML = '';
  proyecto.placas.forEach((placa, i) => {
    const row = document.createElement('div');
    row.className = 'placa-row';
    row.innerHTML = `
      <strong>Placa ${i + 1}:</strong>
      Ancho <input type="number" min="1" value="${placa.ancho}" data-k="ancho">
      Alto <input type="number" min="1" value="${placa.alto}" data-k="alto">
      Cant. <input type="number" min="0" value="${placa.cantidad}" data-k="cantidad">
      <button data-action="rm" title="Quitar">✕</button>
    `;
    row.querySelectorAll('input').forEach(input => {
      input.oninput = () => {
        placa[input.dataset.k] = Number(input.value) || 0;
        onChange();
      };
    });
    row.querySelector('[data-action=rm]').onclick = () => {
      proyecto.placas.splice(i, 1);
      if (proyecto.placas.length === 0) proyecto.placas.push(nuevaPlaca());
      renderPlacas(proyecto, onChange);
      onChange();
    };
    root.appendChild(row);
  });

  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Otra placa stock';
  addBtn.onclick = () => {
    proyecto.placas.push(nuevaPlaca());
    renderPlacas(proyecto, onChange);
    onChange();
  };
  root.appendChild(addBtn);
}
