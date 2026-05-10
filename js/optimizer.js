// Pure module: pieces + plates + config -> layout result.
// No DOM, no localStorage, no globals.

export function optimizar({ piezas, placas, config }) {
  return {
    placas: [],
    metricas: { placasUsadas: 0, placasFaltantes: 0, aprovechamiento: 0, desperdicio: 0, cortesTotales: 0 },
    errores: [],
  };
}
