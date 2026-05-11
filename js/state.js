const KEY = 'optimizador_cortes:proyecto';

export function proyectoVacio() {
  const grupoInicial = nuevoGrupo('Mueble 1');
  return {
    nombre: 'Proyecto sin nombre',
    grupos: [grupoInicial],
    piezas: [],
    placas: [{ ancho: 2600, alto: 1830, cantidad: 10, vetaHorizontal: true }],
    config: { kerf: 3, margenPlaca: 0, estrategiaPlaca: 'chica-primero' },
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

export function nuevaPieza(grupoId) {
  return {
    id: crypto.randomUUID(),
    grupoId: grupoId || '',
    nombre: 'Pieza',
    ancho: 600,
    alto: 400,
    cantidad: 1,
    vetaDireccion: 'libre',
  };
}

export function nuevaPlaca() {
  return { ancho: 2600, alto: 1830, cantidad: 1, vetaHorizontal: true };
}

export function nuevoGrupo(nombre = 'Mueble') {
  return { id: crypto.randomUUID(), nombre };
}

// Find group by id; if missing, returns the first group (fallback) or null.
export function obtenerGrupo(proyecto, grupoId) {
  return proyecto.grupos.find(g => g.id === grupoId) || null;
}

// Reassign pieces with unknown grupoId to the first group, ensuring there's
// always at least one group.
export function repararGrupos(proyecto) {
  if (!Array.isArray(proyecto.grupos) || proyecto.grupos.length === 0) {
    proyecto.grupos = [nuevoGrupo()];
  }
  const validIds = new Set(proyecto.grupos.map(g => g.id));
  const fallback = proyecto.grupos[0].id;
  for (const p of proyecto.piezas) {
    if (!validIds.has(p.grupoId)) p.grupoId = fallback;
  }
}

function validarProyecto(p) {
  return p && Array.isArray(p.piezas) && Array.isArray(p.placas) && p.config;
}
