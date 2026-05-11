import { cargar, guardar, proyectoVacio, exportarJSON, importarJSON } from './state.js';
import * as uiConfig from './ui-config.js';
import * as uiPiezas from './ui-piezas.js';
import { parsearCSV, serializarCSV } from './csv.js';
import { optimizar } from './optimizer.js';
import { render as renderResultado } from './renderer.js';
import { icon } from './icons.js';

let proyecto = cargar();

function onChange() {
  guardar(proyecto);
}

function bootstrap() {
  // Buttons must be created BEFORE uiPiezas.montar(), which wires up #btn-agregar-pieza.
  montarBotones();
  montarNombre();
  uiConfig.montar(proyecto, onChange);
  uiPiezas.montar(proyecto, onChange);
  inicializarSplitter();
}

function montarNombre() {
  const input = document.getElementById('cfg-nombre');
  const titulo = document.querySelector('header h1');
  const sincronizarTitulo = () => {
    const nombre = (proyecto.nombre || '').trim();
    titulo.textContent = nombre ? `Optimizador · ${nombre}` : 'Optimizador de Cortes';
    document.title = nombre ? `${nombre} — Optimizador de Cortes` : 'Optimizador de Cortes';
  };
  input.value = proyecto.nombre === 'Proyecto sin nombre' ? '' : (proyecto.nombre || '');
  input.oninput = () => {
    proyecto.nombre = input.value || 'Proyecto sin nombre';
    sincronizarTitulo();
    onChange();
  };
  sincronizarTitulo();
}

function montarBotones() {
  // Header actions
  const header = document.getElementById('acciones-header');
  header.innerHTML = `
    <button id="btn-nuevo">${icon('filePlus')} Nuevo</button>
    <button id="btn-export" title="Exportar proyecto completo a archivo">${icon('download')} Exportar proyecto</button>
    <button id="btn-import" title="Importar proyecto previamente exportado">${icon('upload')} Importar proyecto</button>
  `;
  // Pieces actions (group-level — "+ Pieza" now lives inside each group card)
  const piezas = document.getElementById('acciones-piezas');
  piezas.innerHTML = `
    <button id="btn-agregar-mueble" class="primary">${icon('plus')} Mueble</button>
    <button id="btn-importar-csv">${icon('upload')} Importar CSV</button>
    <button id="btn-exportar-csv">${icon('download')} Exportar CSV</button>
  `;
  // Result actions
  const resultado = document.getElementById('acciones-resultado');
  resultado.innerHTML = `
    <button id="btn-calcular" class="primary">${icon('play')} Calcular cortes</button>
    <button id="btn-imprimir">${icon('printer')} Imprimir / PDF</button>
  `;

  document.getElementById('btn-nuevo').onclick = () => {
    if (!confirm('¿Empezar un proyecto nuevo? Se descartará el actual.')) return;
    proyecto = proyectoVacio();
    onChange();
    location.reload();
  };

  document.getElementById('btn-export').onclick = () => {
    const blob = new Blob([exportarJSON(proyecto)], { type: 'application/json' });
    descargar(blob, (proyecto.nombre || 'proyecto') + '.json');
  };

  document.getElementById('btn-import').onclick = () => document.getElementById('file-import').click();
  document.getElementById('file-import').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      proyecto = importarJSON(await f.text());
      onChange();
      location.reload();
    } catch (err) {
      alert('Error al importar: ' + err.message);
    }
  };

  document.getElementById('btn-importar-csv').onclick = () => document.getElementById('file-csv').click();
  document.getElementById('file-csv').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const { piezas, grupos } = parsearCSV(await f.text(), []);
      proyecto.grupos = grupos;
      proyecto.piezas = piezas;
      uiPiezas.rerender(proyecto, onChange);
      onChange();
    } catch (err) {
      alert('Error en CSV: ' + err.message);
    }
  };
  document.getElementById('btn-exportar-csv').onclick = () => {
    const blob = new Blob([serializarCSV(proyecto)], { type: 'text/csv' });
    descargar(blob, (proyecto.nombre || 'piezas') + '.csv');
  };

  document.getElementById('btn-calcular').onclick = () => {
    if (proyecto.piezas.length === 0) {
      alert('Agregá al menos una pieza antes de calcular.');
      return;
    }
    const r = optimizar(proyecto);
    renderResultado(document.getElementById('resultado'), r, proyecto.config.kerf || 0, proyecto);
  };

  document.getElementById('btn-imprimir').onclick = () => window.print();
}

function inicializarSplitter() {
  const splitter = document.getElementById('splitter');
  if (!splitter) return;
  const KEY = 'optimizador_cortes:configWidth';
  const guardado = parseFloat(localStorage.getItem(KEY));
  if (Number.isFinite(guardado)) {
    document.documentElement.style.setProperty('--config-width', guardado + 'px');
  }

  let arrastrando = false;
  splitter.onmousedown = (e) => {
    arrastrando = true;
    splitter.classList.add('dragging');
    document.body.classList.add('splitter-dragging');
    e.preventDefault();
  };
  document.addEventListener('mousemove', (e) => {
    if (!arrastrando) return;
    const padding = 16;
    let w = e.clientX - padding;
    w = Math.max(220, Math.min(w, window.innerWidth - 320));
    document.documentElement.style.setProperty('--config-width', w + 'px');
  });
  document.addEventListener('mouseup', () => {
    if (!arrastrando) return;
    arrastrando = false;
    splitter.classList.remove('dragging');
    document.body.classList.remove('splitter-dragging');
    const w = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--config-width'));
    if (Number.isFinite(w)) localStorage.setItem(KEY, w);
  });
}

function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

bootstrap();
