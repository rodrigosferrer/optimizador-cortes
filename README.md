# Optimizador de Cortes

App web para optimizar cortes de placas de madera/melamina a partir de la lista de piezas de uno o varios muebles. Usa cortes guillotine (compatibles con sierras de panel reales), con multi-estrategia + Simulated Annealing para encontrar el mejor layout.

**▶ Probala online:** https://rodrigosferrer.github.io/optimizador-cortes/

## Uso

### Online
Entrá al link de arriba. Todo corre en el navegador, tus datos quedan en el `localStorage` de tu dispositivo. Funciona offline una vez cargada.

### Local (sin internet)
Cloná el repo y abrí `index.html`. Si tu navegador bloquea ES modules sobre `file://` (algunos lo hacen), serví la carpeta con:

```bash
python -m http.server 8000
# después abrí http://localhost:8000
```

## Flujo de trabajo

1. **Configurar placas stock**: ancho, alto, cantidad, dirección de veta, **precio** y opcionalmente material/espesor.
2. **Configurar globales**: kerf (espesor de la sierra), margen (mm de borde dañado a descontar), estrategia de selección de placa, **precio del tapacanto por metro** y **precio por corte**.
3. **Crear muebles** y cargar piezas en cada uno. Cada pieza tiene nombre, dimensiones, cantidad, dirección de veta, qué lados llevan canto (sup/inf/izq/der) y un flag opcional "acepta ajuste" para que el optimizador sugiera variantes.
4. **Calcular cortes** → SVG con layout por placa, plan de cortes numerado, métricas de aprovechamiento, sobrantes etiquetados, **desglose de costo por mueble** (placa + canto + cortes) y **sugerencias** de extensión de piezas para reducir cortes.
5. **Imprimir / Exportar PDF** con Ctrl+P. La primera página es una tabla resumen con todas las piezas por mueble; las siguientes son una placa por hoja con su layout y plan de cortes.

## Conceptos

| Concepto | Descripción |
|---|---|
| **Mueble** | Grupo lógico de piezas (ej. "Baño", "Dormitorio"). Las piezas se organizan en muebles; el optimizador resuelve todas juntas. |
| **Veta de pieza** | `libre` (puede rotar) / `ancho` (veta a lo largo del ancho) / `alto` (a lo largo del alto). Las direccionales se alinean con la veta de la placa. |
| **Veta de placa** | Horizontal (a lo largo del ancho) o vertical (a lo largo del alto). |
| **Kerf** | Ancho del corte de la sierra (típico 3 mm). Se descuenta entre piezas. |
| **Margen** | mm que se descuentan del borde de cada placa. |
| **Cantos** | Por pieza marcás qué lados llevan tapacanto (sup/inf/izq/der). Se usa para el costeo y se respeta al rotar. |
| **Acepta ajuste** | Flag por pieza: si está activo, el optimizador puede proponer ampliarla un poco para aprovechar sobrantes adyacentes y eliminar cortes. La aplicación de la sugerencia es manual. |
| **Cota teórica** | Mínimo absoluto de placas según área total y stock disponible. No siempre alcanzable con guillotine. |
| **Sobrante** | Pedazo de placa sin usar. Si es grande, podés guardarlo para futuros proyectos. |

## Estrategias de selección de placa

Cuando tenés varios tipos de placa en stock, el optimizador puede elegir cuál abrir primero:

- **Chica primero**: usa la placa chica si la pieza entra, reserva las grandes.
- **Grande primero**: maximiza piezas por placa (menos placas totales).
- **Orden manual**: respeta el orden de la lista de placas.
- **Agotar stock**: pre-abre una placa de cada tipo con stock real antes de pedir placas virtuales (faltantes). Útil para no comprar material si tenés stock guardado.

## Costos y desglose por mueble

Si cargás `precio` en las placas, `precioCantoPorMetro` y `precioPorCorte` en la configuración global, después de calcular vas a ver un desglose por mueble con:

- **Costo de placa**: cada placa se reparte entre muebles **proporcional al área** que cada uno ocupa en esa placa.
- **Costo de canto**: suma de los lados con canto activado de cada pieza × `precioCantoPorMetro`. Se calcula respetando rotación.
- **Costo de cortes**: el total `cantidad_de_cortes × precioPorCorte` se distribuye entre muebles **proporcional a la cantidad de piezas** (no al área — los cortes escalan con piezas, no con superficie).
- **Total por mueble** = placa + canto + cortes.

## Sugerencias automáticas

Para las piezas marcadas como "acepta ajuste", el optimizador analiza si conviene **extenderlas** para tragarse un sobrante adyacente y así ahorrar cortes:

- **Extensión simple**: la pieza tiene un sobrante a la derecha o abajo que cubre toda su altura/ancho; crece esos milímetros.
- **Fila/columna shift-and-grow**: una pieza en una fila/columna con sobrante al final puede crecer `sobrante / N` desplazando las que vienen después.
- **Bonus de borde**: si el sobrante toca el borde de la placa, se suma el kerf reservado en ese borde (un corte menos).

Solo se sugieren extensiones que afectan a **todas las copias** de la pieza (las variantes parciales son una decisión manual). Aceptar la sugerencia actualiza las dimensiones y dispara un recálculo.

## Formato CSV

Hay dos formatos soportados al importar:

### Nativo (separado por comas, con header)

Header obligatorio:

```
nombre,ancho,alto,cantidad,veta,grupo
```

Columnas opcionales: `material`, `espesor` (cualquier orden, se detectan por nombre).

- `veta`: `libre` | `ancho` | `alto`
- `grupo`: nombre del mueble (texto libre; piezas con mismo grupo van juntas)

Ejemplo:

```csv
nombre,ancho,alto,cantidad,veta,grupo,material,espesor
Lateral,2320,150,2,libre,Baño,Melamina blanca,18
Estante,605,445,4,libre,Baño,Melamina blanca,18
Puerta,2000,494.5,2,libre,MA,,
Escritorio,600,1400,1,libre,Dormitorio,,
```

Al exportar, el header sólo incluye `material` y/o `espesor` si alguna pieza tiene esos campos seteados.

### CAD / PolyBoard (separado por `;`, sin header)

Si pegás un CSV con `;` y sin la cabecera nativa, se interpreta como exportación de PolyBoard:

```
ancho;alto;cantidad;material;fibra;nombre;cinta_sup;cinta_inf;grosor_si;cinta_der;cinta_izq;grosor_id;...
```

`fibra`: `0` = libre, `1` = paralela al ancho, `2` = paralela al alto. Las cuatro banderas de cinta (0/1) se cargan en `cantos`. Todas las piezas se importan al grupo "Importado".

## Algoritmo

El optimizador combina varias técnicas:

1. **Warm start multi-estrategia**: prueba todas las combinaciones de
   - 5 órdenes de piezas (por área, perímetro, lado mayor, alto, ancho — todos descendentes)
   - 3 reglas de placement (best-short-side-fit, best-long-side-fit, best-area-fit)
   - 2 reglas de split guillotine (short-axis, long-axis)
2. **Simulated Annealing** sobre el espacio conjunto (orden × placement × split por pieza). Mueve = swap de dos posiciones o reroll de regla de una pieza. Temperatura escalada al área de placa.
3. **Función de costo lexicográfica**: placas usadas >> área desperdiciada >> -mayor sobrante (premia consolidación).
4. **Plan de cortes**: descomposición exhaustiva con branch-and-bound para minimizar la cantidad de cortes guillotine que producen el layout.

Determinístico (semilla fija). Tiempo típico: 100–300 ms para 20–50 piezas.

## Estructura del proyecto

```
optimizador_cortes/
├── index.html              # shell de la página
├── styles.css              # estilos (incluye @media print)
├── favicon.svg
├── js/
│   ├── app.js              # bootstrap, conecta UI ↔ estado, aplica sugerencias
│   ├── state.js            # modelo + localStorage + JSON IO
│   ├── optimizer.js        # algoritmo (puro, sin DOM)
│   ├── cuts.js             # descomposición en plan de cortes
│   ├── renderer.js         # SVG + listas + desglose + sugerencias + página de impresión
│   ├── csv.js              # parse/serialize CSV (nativo + CAD/PolyBoard)
│   ├── ui-config.js        # panel de configuración (placas + globales + precios)
│   ├── ui-piezas.js        # tabla de piezas agrupada por mueble + drag-and-drop
│   └── icons.js            # iconos Lucide inline + helper de tooltip
├── tests/
│   ├── optimizer.test.html # tests en navegador
│   ├── run-node.mjs        # mismos tests para Node (CI)
│   └── harness.js          # mini assertion library
└── docs/superpowers/       # spec original y plan de implementación
```

## Tests

```bash
node tests/run-node.mjs
```

O abrí `tests/optimizer.test.html` en el navegador. 11 tests del optimizer cubren: empty input, single piece, guillotine split, kerf, rotación según veta, stock insuficiente, piezas que no entran.

## Persistencia

Tu proyecto se guarda automáticamente en `localStorage` del navegador. Para respaldar o mover de máquina: **Exportar JSON** / **Importar JSON**. Para listas de piezas: **Exportar CSV** / **Importar CSV**.

## Limitaciones conocidas

- Cortes solo guillotine (rectos pasantes). Layouts no-guillotine (Max-Rects) pack mejor pero no son ejecutables en sierra de panel.
- Sin soporte multi-proyecto simultáneo (un proyecto activo, archivos JSON para los demás).
- El optimizador no considera la posibilidad de stack-cutting (cortar varias placas apiladas a la vez).
- El optimizador no separa por material/espesor: si mezclás materiales distintos, las piezas pueden caer en cualquier placa. Para separar materiales, hacelo en proyectos distintos.

## Stack

HTML5 + CSS3 + JavaScript ES2022 modules. Sin bundler, sin npm, sin frameworks, sin librerías externas. Cero dependencias en runtime.

## Licencia

MIT (sentite libre de usar, modificar y compartir).
