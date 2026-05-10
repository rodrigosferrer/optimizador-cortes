const KEY = 'optimizador_cortes:proyecto';

export function proyectoVacio() {
  return {
    nombre: 'Proyecto sin nombre',
    piezas: [],
    placas: [{ ancho: 2750, alto: 1830, cantidad: 10 }],
    config: { kerf: 3, margenPlaca: 0 },
  };
}

export function cargar() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return proyectoVacio();
    const p = JSON.parse(raw);
    return validarProyecto(p) ? p : proyectoVacio();
  } catch {
    return proyectoVacio();
  }
}

export function guardar(proyecto) {
  localStorage.setItem(KEY, JSON.stringify(proyecto));
}

export function exportarJSON(proyecto) {
  return JSON.stringify(proyecto, null, 2);
}

export function importarJSON(texto) {
  const p = JSON.parse(texto);
  if (!validarProyecto(p)) throw new Error('JSON no es un proyecto válido');
  return p;
}

export function nuevaPieza() {
  return {
    id: crypto.randomUUID(),
    nombre: 'Pieza',
    ancho: 600,
    alto: 400,
    cantidad: 1,
    rotable: true,
  };
}

export function nuevaPlaca() {
  return { ancho: 2750, alto: 1830, cantidad: 1 };
}

function validarProyecto(p) {
  return p && Array.isArray(p.piezas) && Array.isArray(p.placas) && p.config;
}
