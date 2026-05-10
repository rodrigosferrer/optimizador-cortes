import { cargar, guardar, proyectoVacio, exportarJSON, importarJSON } from './state.js';
import * as uiConfig from './ui-config.js';
import * as uiPiezas from './ui-piezas.js';
import { parsearCSV, serializarCSV } from './csv.js';
import { optimizar } from './optimizer.js';
import { render as renderResultado } from './renderer.js';

let proyecto = cargar();

function onChange() {
  guardar(proyecto);
}

function bootstrap() {
  uiConfig.montar(proyecto, onChange);
  uiPiezas.montar(proyecto, onChange);

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

  document.getElementById('btn-import').onclick = () => {
    document.getElementById('file-import').click();
  };
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

  document.getElementById('btn-importar-csv').onclick = () => {
    document.getElementById('file-csv').click();
  };
  document.getElementById('file-csv').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const piezas = parsearCSV(await f.text());
      proyecto.piezas = piezas;
      uiPiezas.rerender(proyecto, onChange);
      onChange();
    } catch (err) {
      alert('Error en CSV: ' + err.message);
    }
  };
  document.getElementById('btn-exportar-csv').onclick = () => {
    const blob = new Blob([serializarCSV(proyecto.piezas)], { type: 'text/csv' });
    descargar(blob, 'piezas.csv');
  };

  document.getElementById('btn-calcular').onclick = () => {
    if (proyecto.piezas.length === 0) {
      alert('Agregá al menos una pieza antes de calcular.');
      return;
    }
    const r = optimizar(proyecto);
    renderResultado(document.getElementById('resultado'), r);
  };

  document.getElementById('btn-imprimir').onclick = () => window.print();
}

function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

bootstrap();
