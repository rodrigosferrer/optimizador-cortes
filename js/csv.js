// Minimal CSV: comma-separated, simple double-quote handling.
// Header: nombre,ancho,alto,cantidad,veta,grupo
// veta:  'libre' | 'ancho' | 'alto'
// grupo: free-form text (mueble name). Pieces with the same grupo go together.

import { nuevaPieza, nuevoGrupo } from './state.js';

const HEADER = ['nombre', 'ancho', 'alto', 'cantidad', 'veta', 'grupo'];
const VETAS_VALIDAS = ['libre', 'ancho', 'alto'];

// Parse CSV and return { piezas, grupos } using `proyecto.grupos` as the
// existing list (so we can reuse group ids for matching names).
export function parsearCSV(texto, grupos = []) {
  const lineas = texto.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  if (lineas.length === 0) throw new Error('CSV vacío');

  const head = parsearLinea(lineas[0]).map(s => s.toLowerCase());
  for (const col of HEADER) {
    if (!head.includes(col)) throw new Error(`Falta columna '${col}' en el encabezado`);
  }
  const idx = Object.fromEntries(HEADER.map(c => [c, head.indexOf(c)]));

  const gruposNuevos = [...grupos];
  const idPorNombre = new Map(gruposNuevos.map(g => [g.nombre.toLowerCase(), g.id]));

  const piezas = [];
  for (let i = 1; i < lineas.length; i++) {
    const cells = parsearLinea(lineas[i]);
    const ancho = Number(cells[idx.ancho]);
    const alto = Number(cells[idx.alto]);
    const cantidad = Number(cells[idx.cantidad]);
    const vetaRaw = String(cells[idx.veta] || '').toLowerCase().trim();
    const grupoNombre = String(cells[idx.grupo] || '').trim() || 'Sin clasificar';
    if (!Number.isFinite(ancho) || ancho <= 0) throw new Error(`Fila ${i + 1}: ancho inválido`);
    if (!Number.isFinite(alto) || alto <= 0) throw new Error(`Fila ${i + 1}: alto inválido`);
    if (!Number.isFinite(cantidad) || cantidad < 1) throw new Error(`Fila ${i + 1}: cantidad inválida`);
    if (!VETAS_VALIDAS.includes(vetaRaw)) throw new Error(`Fila ${i + 1}: veta debe ser libre/ancho/alto`);

    const key = grupoNombre.toLowerCase();
    let grupoId = idPorNombre.get(key);
    if (!grupoId) {
      const g = nuevoGrupo(grupoNombre);
      gruposNuevos.push(g);
      idPorNombre.set(key, g.id);
      grupoId = g.id;
    }

    piezas.push({
      ...nuevaPieza(grupoId),
      nombre: cells[idx.nombre] || `Pieza ${i}`,
      ancho, alto, cantidad,
      vetaDireccion: vetaRaw,
    });
  }
  return { piezas, grupos: gruposNuevos };
}

export function serializarCSV(proyecto) {
  const filas = [HEADER.join(',')];
  const nombrePorId = Object.fromEntries(proyecto.grupos.map(g => [g.id, g.nombre]));
  for (const p of proyecto.piezas) {
    filas.push([
      escapar(p.nombre),
      p.ancho, p.alto, p.cantidad,
      p.vetaDireccion || 'libre',
      escapar(nombrePorId[p.grupoId] || 'Sin clasificar'),
    ].join(','));
  }
  return filas.join('\n');
}

function parsearLinea(linea) {
  return linea.split(',').map(s => s.trim().replace(/^"(.*)"$/, '$1'));
}

function escapar(s) {
  if (s.includes(',') || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
