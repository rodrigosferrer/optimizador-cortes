import { cargar, guardar, proyectoVacio, exportarJSON, importarJSON } from './state.js';
import * as uiConfig from './ui-config.js';
import * as uiPiezas from './ui-piezas.js';
import { parsearCSV, serializarCSV } from './csv.js';
import { optimizar, optimizarMejorVariante } from './optimizer.js';
import { render as renderResultado, registrarCallbacksRender, aplicarPiezaInPlace } from './renderer.js';
import { icon } from './icons.js';

let proyecto = cargar();

function onChange() {
  guardar(proyecto);
  actualizarEmptyState();
}

function bootstrap() {
  // Buttons must be created BEFORE uiPiezas.montar(), which wires up #btn-agregar-pieza.
  montarBotones();
  montarNombre();
  uiConfig.montar(proyecto, onChange);
  uiPiezas.montar(proyecto, onChange);
  inicializarSplitter();
  inicializarTipsTouch();
  actualizarEmptyState();
}

// Empty state: shown in the result panel before the user has any pieces.
// Once pieces exist, the empty state is cleared (replaced by an empty result
// panel or — after calc — by the layout). After calc, we do not overwrite.
function actualizarEmptyState() {
  const r = document.getElementById('resultado');
  if (!r) return;
  const tieneEmpty = !!r.querySelector('.empty-state');
  const tieneCalc = r.children.length > 0 && !tieneEmpty;
  if (proyecto.piezas.length === 0) {
    if (tieneCalc) return; // keep stale layout visible
    renderEmptyState(r);
  } else if (tieneEmpty) {
    r.innerHTML = '';
  }
}

function renderEmptyState(container) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">${icon('filePlus')}</div>
      <h3>Empezá tu proyecto</h3>
      <p>Agregá piezas a un mueble en el panel de la izquierda, importá un CSV con tu lista de cortes o cargá un proyecto previamente exportado.</p>
      <div class="empty-actions">
        <button id="es-add" class="primary">${icon('plus')} Primera pieza</button>
        <button id="es-csv">${icon('upload')} Importar CSV</button>
        <button id="es-import">${icon('upload')} Importar proyecto</button>
      </div>
      <p class="empty-hint">Tip: si trabajás en taller, exportá un PDF con Ctrl+P al final — la primera página es resumen y luego viene una placa por hoja.</p>
    </div>
  `;
  container.querySelector('#es-add').onclick = () => {
    const btn = document.querySelector('.grupo-card .btn-add-pieza');
    if (btn) btn.click();
  };
  container.querySelector('#es-csv').onclick = () => document.getElementById('btn-importar-csv').click();
  container.querySelector('#es-import').onclick = () => document.getElementById('btn-import').click();
}

// Make tooltips tap-friendly on touch devices: tapping a .tip toggles
// .tip-active (mirrored in CSS to :hover behavior). Tapping elsewhere closes.
function inicializarTipsTouch() {
  document.addEventListener('click', (e) => {
    const tip = e.target.closest('.tip');
    document.querySelectorAll('.tip.tip-active').forEach(t => {
      if (t !== tip) t.classList.remove('tip-active');
    });
    if (tip) {
      e.preventDefault();
      tip.classList.toggle('tip-active');
    }
  });
}

// Briefly highlight the table row of `piezaId` after a suggestion is applied,
// so the user can see which pieza changed.
function flashPiezaRow(piezaId) {
  // The row may not exist yet because uiPiezas.rerender is synchronous but
  // the DOM update needs to be queried after; rAF is enough.
  requestAnimationFrame(() => {
    const tr = document.querySelector(`tr[data-pieza-id="${piezaId}"]`);
    if (!tr) return;
    tr.classList.remove('flash');
    void tr.offsetWidth; // restart animation if class was just removed
    tr.classList.add('flash');
    setTimeout(() => tr.classList.remove('flash'), 1300);
  });
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
    <button id="btn-buscar-variante" title="Prueba 20 variantes y se queda con la mejor (~3-5s)">${icon('sparkles')} Buscar mejor variante</button>
    <button id="btn-imprimir">${icon('printer')} Imprimir / PDF</button>
    <span id="progreso-variante" class="progreso-variante" hidden></span>
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

  // Holds the last optimizer result so in-place edits operate on the live layout.
  let _ultimoResultado = null;

  const renderConCallbacks = (r) => {
    _ultimoResultado = r;
    const kerf = proyecto.config.kerf || 0;
    const callbacks = {
      onAplicarSugerencia: (piezaId, eje, valorNuevo) => {
        const pieza = proyecto.piezas.find(p => p.id === piezaId);
        if (!pieza) return;
        pieza[eje] = valorNuevo;
        onChange();
        uiPiezas.rerender(proyecto, onChange);
        flashPiezaRow(piezaId);
        // Try to apply the change WITHOUT moving any other piece.
        const ok = aplicarPiezaInPlace(_ultimoResultado, pieza, kerf);
        if (ok) {
          renderConCallbacks(_ultimoResultado);
        } else {
          // Fallback (shouldn't happen for valid suggestions): re-run optimizer.
          renderConCallbacks(optimizar(proyecto));
        }
      },
      onCrearVariante: (sugerencia) => {
        const original = proyecto.piezas.find(p => p.id === sugerencia.piezaId);
        if (!original) return;
        const K = sugerencia.cantidadAfectada;
        const N = sugerencia.cantidadTotal;
        // Create a new pieza variant cloned from original
        const variante = JSON.parse(JSON.stringify(original));
        variante.id = crypto.randomUUID();
        variante.cantidad = K;
        variante[sugerencia.eje] = sugerencia.valorNuevo;
        variante.nombre = original.nombre + ' (ext.)';
        // Reduce original cantidad
        original.cantidad = N - K;
        // Insert variant right after original in proyecto.piezas for visual continuity
        const idx = proyecto.piezas.indexOf(original);
        proyecto.piezas.splice(idx + 1, 0, variante);
        // Update affected colocaciones in-place
        for (const c of sugerencia.colocaciones) {
          c.piezaId = variante.id;
          c.nombre = variante.nombre;
          // Grow the layout dimension that maps to this piece axis
          const ejeEsAncho = sugerencia.eje === 'ancho';
          const layoutAxis = (ejeEsAncho && !c.rotada) || (!ejeEsAncho && c.rotada) ? 'ancho' : 'alto';
          c.cantos = variante.cantos;
          c[layoutAxis] += sugerencia.extension;
        }
        // Recompute sobrantes on affected plates
        const placasAfectadas = new Set();
        for (const placa of _ultimoResultado.placas) {
          for (const c of placa.colocaciones) {
            if (sugerencia.colocaciones.includes(c)) { placasAfectadas.add(placa); break; }
          }
        }
        for (const placa of placasAfectadas) {
          // Use the renderer's helper indirectly via aplicarPiezaInPlace?
          // Simpler: trigger a no-op in-place application to recompute sobrantes.
          // We can call aplicarPiezaInPlace with the variant — it walks the layout
          // and recomputes sobrantes on the variant's plates.
        }
        // Force sobrantes refresh via aplicarPiezaInPlace (variants's dims unchanged
        // post-creation, so this is just a sobrantes recompute).
        aplicarPiezaInPlace(_ultimoResultado, variante, kerf);
        onChange();
        uiPiezas.rerender(proyecto, onChange);
        flashPiezaRow(variante.id);
        renderConCallbacks(_ultimoResultado);
      },
      onAplicarFila: (s) => {
        // Only the SELECTED pieza grows. Each of its instances in the row
        // gains `s.extension` mm. Other piezas in the row don't change
        // dimensionally — they just shift along the row to keep kerfs intact.
        const pieza = proyecto.piezas.find(p => p.id === s.piezaId);
        if (!pieza) return;
        pieza[s.eje] += s.extension;
        const horizontal = s.orientacion === 'horizontal';
        const sorted = [...s.colocaciones].sort((a, b) => horizontal ? a.x - b.x : a.y - b.y);
        let acumulado = 0;
        for (const c of sorted) {
          if (horizontal) {
            c.x += acumulado;
            if (c.piezaId === pieza.id) {
              c.ancho += s.extension;
              acumulado += s.extension;
            }
          } else {
            c.y += acumulado;
            if (c.piezaId === pieza.id) {
              c.alto += s.extension;
              acumulado += s.extension;
            }
          }
        }
        aplicarPiezaInPlace(_ultimoResultado, pieza, kerf);
        onChange();
        uiPiezas.rerender(proyecto, onChange);
        flashPiezaRow(pieza.id);
        renderConCallbacks(_ultimoResultado);
      },
      onEditarPieza: (piezaId, cambios) => {
        const pieza = proyecto.piezas.find(p => p.id === piezaId);
        if (!pieza) return;
        Object.assign(pieza, cambios);
        onChange();
        uiPiezas.rerender(proyecto, onChange);
        // Try in-place first; if the edit doesn't fit, fall back to full re-optimization.
        const ok = aplicarPiezaInPlace(_ultimoResultado, pieza, kerf);
        if (ok) {
          renderConCallbacks(_ultimoResultado);
        } else {
          if (!confirm('Las nuevas dimensiones no caben en la posición actual. ¿Recalcular el layout completo?')) return;
          renderConCallbacks(optimizar(proyecto));
        }
      },
    };
    registrarCallbacksRender(callbacks, proyecto);
    renderResultado(document.getElementById('resultado'), r, kerf, proyecto, callbacks);
  };

  document.getElementById('btn-calcular').onclick = () => {
    if (proyecto.piezas.length === 0) {
      alert('Agregá al menos una pieza antes de calcular.');
      return;
    }
    const r = optimizar(proyecto);
    renderConCallbacks(r);
  };

  document.getElementById('btn-buscar-variante').onclick = async () => {
    if (proyecto.piezas.length === 0) {
      alert('Agregá al menos una pieza antes de calcular.');
      return;
    }
    const btn = document.getElementById('btn-buscar-variante');
    const btnCalc = document.getElementById('btn-calcular');
    const progreso = document.getElementById('progreso-variante');
    btn.disabled = true;
    btnCalc.disabled = true;
    progreso.hidden = false;
    progreso.textContent = 'Buscando…';
    try {
      const N = 20;
      const r = await optimizarMejorVariante(proyecto, N, (i, n, best) => {
        progreso.textContent = `Variante ${i}/${n} · mejor de la tanda: ${best.metricas.placasUsadas} placa${best.metricas.placasUsadas === 1 ? '' : 's'}, ${(best.metricas.aprovechamiento*100).toFixed(1)}%`;
      });
      const costoActual = _ultimoResultado ? costoLayout(_ultimoResultado) : Infinity;
      const costoNuevo = costoLayout(r);
      if (costoNuevo < costoActual) {
        renderConCallbacks(r);
        progreso.textContent = `✓ Mejoró: ${r.metricas.placasUsadas} placa${r.metricas.placasUsadas === 1 ? '' : 's'}, ${(r.metricas.aprovechamiento*100).toFixed(1)}%`;
      } else {
        progreso.textContent = `⊘ Ninguna de ${N} variantes mejoró el resultado actual`;
      }
      setTimeout(() => { progreso.hidden = true; }, 4000);
    } finally {
      btn.disabled = false;
      btnCalc.disabled = false;
    }
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

// Same lexicographic key used internally by the optimizer to rank results.
function costoLayout(r) {
  if (!r) return Infinity;
  return r.metricas.placasUsadas * 1e9 + r.metricas.desperdicio * 1e6;
}

function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

bootstrap();
