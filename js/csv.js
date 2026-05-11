// CSV import supporting two formats:
//   1. Native format (comma-separated with header):
//      nombre,ancho,alto,cantidad,veta,grupo
//   2. CAD export (semicolon-separated, no header, columns 0-5+):
//      ancho;alto;cantidad;material;_;nombre;...

import { nuevaPieza, nuevoGrupo } from './state.js';

const HEADER = ['nombre', 'ancho', 'alto', 'cantidad', 'veta', 'grupo'];
const VETAS_VALIDAS = ['libre', 'ancho', 'alto'];

export function parsearCSV(texto, grupos = []) {
  const lineas = texto.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  if (lineas.length === 0) throw new Error('CSV vacío');

  // Detect format: native CSV has the named header; CAD export uses ; with no header.
  const head = parsearLinea(lineas[0]).map(s => s.toLowerCase());
  const tieneHeader = HEADER.every(col => head.includes(col));

  if (tieneHeader) return parsearNativo(lineas, grupos);
  if (lineas[0].includes(';')) return parsearCAD(lineas, grupos);

  throw new Error(
    'Formato no reconocido. Usá el header "nombre,ancho,alto,cantidad,veta,grupo" ' +
    'o un CSV de exportación de software CAD (separado por ;).'
  );
}

function parsearNativo(lineas, grupos) {
  const head = parsearLinea(lineas[0]).map(s => s.toLowerCase());
  const idx = Object.fromEntries(HEADER.map(c => [c, head.indexOf(c)]));
  // Optional columns
  const idxMaterial = head.indexOf('material');
  const idxEspesor = head.indexOf('espesor');

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
    const material = idxMaterial >= 0 ? (cells[idxMaterial] || '').trim() : '';
    const espesor = idxEspesor >= 0 ? (Number(cells[idxEspesor]) || 0) : 0;
    if (!Number.isFinite(ancho) || ancho <= 0) throw new Error(`Fila ${i + 1}: ancho inválido`);
    if (!Number.isFinite(alto) || alto <= 0) throw new Error(`Fila ${i + 1}: alto inválido`);
    if (!Number.isFinite(cantidad) || cantidad < 1) throw new Error(`Fila ${i + 1}: cantidad inválida`);
    if (!VETAS_VALIDAS.includes(vetaRaw)) throw new Error(`Fila ${i + 1}: veta debe ser libre/ancho/alto`);

    const grupoId = obtenerOCrearGrupo(grupoNombre, gruposNuevos, idPorNombre);
    piezas.push({
      ...nuevaPieza(grupoId),
      nombre: cells[idx.nombre] || `Pieza ${i}`,
      ancho, alto, cantidad,
      vetaDireccion: vetaRaw,
      material, espesor,
    });
  }
  return { piezas, grupos: gruposNuevos };
}

// Parser for PolyBoard's cutting-list CSV export (similar formats from IMOS /
// MueblesCAD also work). Lines are `;`-separated, no header. Columns:
//   0: largo (ancho de la pieza, mm)
//   1: ancho (alto de la pieza, mm)
//   2: cantidad
//   3: material code (ignored)
//   4: (ignored)
//   5: nombre
//   6-8: edge-band flags (ignored)
//   9: grain-along-length flag (1 = veta a lo largo del ancho)
//  10: grain-along-width flag  (1 = veta a lo largo del alto)
//  ... rest ignored
// All pieces land in a single auto-created group "Importado".
function parsearCAD(lineas, grupos) {
  const gruposNuevos = [...grupos];
  const idPorNombre = new Map(gruposNuevos.map(g => [g.nombre.toLowerCase(), g.id]));
  const grupoId = obtenerOCrearGrupo('Importado', gruposNuevos, idPorNombre);

  const piezas = [];
  for (let i = 0; i < lineas.length; i++) {
    const cells = lineas[i].split(';').map(s => s.trim());
    if (cells.length < 6) throw new Error(`Fila ${i + 1}: se esperaban al menos 6 columnas separadas por ';'`);
    const ancho = Number(cells[0].replace(',', '.'));
    const alto = Number(cells[1].replace(',', '.'));
    const cantidad = Number(cells[2]);
    const material = (cells[3] || '').trim();
    const espesor = Number((cells[4] || '0').replace(',', '.')) || 0;
    const nombre = cells[5] || `Pieza ${i + 1}`;
    if (!Number.isFinite(ancho) || ancho <= 0) throw new Error(`Fila ${i + 1}: ancho inválido (col. 1)`);
    if (!Number.isFinite(alto) || alto <= 0) throw new Error(`Fila ${i + 1}: alto inválido (col. 2)`);
    if (!Number.isFinite(cantidad) || cantidad < 1) throw new Error(`Fila ${i + 1}: cantidad inválida (col. 3)`);

    // Veta: PolyBoard flags (col 9 = grain-along-length, col 10 = grain-along-width)
    let vetaDireccion = 'libre';
    if (cells.length > 9) {
      const flagAncho = cells[9] === '1';
      const flagAlto  = cells.length > 10 && cells[10] === '1';
      if (flagAncho) vetaDireccion = 'ancho';
      else if (flagAlto) vetaDireccion = 'alto';
    }

    piezas.push({
      ...nuevaPieza(grupoId),
      nombre,
      ancho, alto, cantidad,
      vetaDireccion,
      material, espesor,
    });
  }
  return { piezas, grupos: gruposNuevos };
}

function obtenerOCrearGrupo(nombre, grupos, idPorNombre) {
  const key = nombre.toLowerCase();
  let id = idPorNombre.get(key);
  if (id) return id;
  const g = nuevoGrupo(nombre);
  grupos.push(g);
  idPorNombre.set(key, g.id);
  return g.id;
}

export function serializarCSV(proyecto) {
  // Include optional material/espesor columns only if any piece has them set.
  const conMaterial = proyecto.piezas.some(p => (p.material || '').trim() !== '');
  const conEspesor  = proyecto.piezas.some(p => Number(p.espesor) > 0);
  const header = [...HEADER];
  if (conMaterial) header.push('material');
  if (conEspesor)  header.push('espesor');

  const filas = [header.join(',')];
  const nombrePorId = Object.fromEntries(proyecto.grupos.map(g => [g.id, g.nombre]));
  for (const p of proyecto.piezas) {
    const fila = [
      escapar(p.nombre),
      p.ancho, p.alto, p.cantidad,
      p.vetaDireccion || 'libre',
      escapar(nombrePorId[p.grupoId] || 'Sin clasificar'),
    ];
    if (conMaterial) fila.push(escapar(p.material || ''));
    if (conEspesor)  fila.push(p.espesor || 0);
    filas.push(fila.join(','));
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
