# Optimizador de Cortes

App web local (sin build) para optimizar el corte de placas de madera/melamina a partir de la lista de piezas de un mueble. Algoritmo guillotine compatible con sierras de panel reales.

## Uso

Doble clic en `index.html`, o desde la terminal:

```bash
python -m http.server 8000
# después abrir http://localhost:8000
```

### Flujo

1. **Configurar placas stock**: ancho, alto y cantidad de cada tipo de placa que tenés.
2. **Configurar kerf** (espesor de la sierra) y margen (mm a descontar del borde de cada placa).
3. **Cargar piezas**: nombre, ancho, alto, cantidad, y si pueden rotar (destildar si la veta es direccional).
   - Para listas largas, importar un CSV con encabezado `nombre,ancho,alto,cantidad,rotable`.
4. **Calcular cortes**: ver el layout por placa, métricas de aprovechamiento y desperdicio.
5. **Imprimir / Guardar como PDF**: Ctrl+P, una placa por página.

### Datos persistentes

Tu proyecto se guarda automáticamente en `localStorage` del navegador. Para mover o respaldar, usar **Exportar JSON** / **Importar JSON**.

## Tests

Abrir `tests/optimizer.test.html` en el navegador. Los tests corren automáticamente y muestran ✓/✗.

También se pueden correr desde Node:

```bash
node tests/run-node.mjs
```

## Estructura

- `index.html` — shell de la página.
- `styles.css` — estilos (incluye `@media print`).
- `js/optimizer.js` — algoritmo guillotine puro (sin DOM).
- `js/state.js` — modelo de datos + localStorage + JSON IO.
- `js/csv.js` — parse/serialize CSV.
- `js/renderer.js` — dibujo SVG.
- `js/ui-config.js`, `js/ui-piezas.js`, `js/app.js` — UI.

## Limitaciones conocidas

- Heurística greedy (no garantiza óptimo absoluto, pero produce layouts realizables y razonables).
- Cortes solo guillotine (rectos pasantes), por compatibilidad con sierras de panel.
- Sin soporte multi-proyecto simultáneo (un proyecto activo, JSON files para los demás).
