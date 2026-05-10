// Minimal CSV: comma-separated, simple double-quote handling.
// Header: nombre,ancho,alto,cantidad,rotable
// Boolean: 'si'/'no' (also accepts 'true'/'false', '1'/'0').

import { nuevaPieza } from './state.js';

const HEADER = ['nombre', 'ancho', 'alto', 'cantidad', 'rotable'];

export function parsearCSV(texto) {
  const lineas = texto.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  if (lineas.length === 0) throw new Error('CSV vacío');

  const head = parsearLinea(lineas[0]).map(s => s.toLowerCase());
  for (const col of HEADER) {
    if (!head.includes(col)) throw new Error(`Falta columna '${col}' en el encabezado`);
  }
  const idx = Object.fromEntries(HEADER.map(c => [c, head.indexOf(c)]));

  const piezas = [];
  for (let i = 1; i < lineas.length; i++) {
    const cells = parsearLinea(lineas[i]);
    const ancho = Number(cells[idx.ancho]);
    const alto = Number(cells[idx.alto]);
    const cantidad = Number(cells[idx.cantidad]);
    if (!Number.isFinite(ancho) || ancho <= 0) throw new Error(`Fila ${i + 1}: ancho inválido`);
    if (!Number.isFinite(alto) || alto <= 0) throw new Error(`Fila ${i + 1}: alto inválido`);
    if (!Number.isFinite(cantidad) || cantidad < 1) throw new Error(`Fila ${i + 1}: cantidad inválida`);
    piezas.push({
      ...nuevaPieza(),
      nombre: cells[idx.nombre] || `Pieza ${i}`,
      ancho, alto, cantidad,
      rotable: parseBool(cells[idx.rotable]),
    });
  }
  return piezas;
}

export function serializarCSV(piezas) {
  const filas = [HEADER.join(',')];
  for (const p of piezas) {
    filas.push([
      escapar(p.nombre),
      p.ancho, p.alto, p.cantidad,
      p.rotable ? 'si' : 'no',
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

function parseBool(v) {
  const s = String(v).toLowerCase().trim();
  return s === 'si' || s === 'sí' || s === 'true' || s === '1' || s === 'yes';
}
