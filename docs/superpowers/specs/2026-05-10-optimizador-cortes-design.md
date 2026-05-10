# Optimizador de Cortes — Diseño

**Fecha:** 2026-05-10
**Estado:** Aprobado por el usuario, listo para plan de implementación.

## Propósito

App web local (HTML/JS/CSS sin build) para optimizar el corte de placas de
madera/melamina a partir de la lista de piezas de un mueble. Uso personal /
pequeño taller. Resultado: layout visual por placa + métricas + impresión a PDF
vía navegador.

## Stack y ejecución

- **Frontend:** HTML5 + CSS + JavaScript ES module nativo. Sin React, sin
  bundler, sin npm install.
- **Apertura:** doble clic en `index.html` (file://) o
  `python -m http.server` para acceder desde otra máquina en la red local.
- **Persistencia:** `localStorage` del navegador. Export/import a JSON para
  backup o moverse de máquina.
- **PDF:** vía la vista de impresión del navegador (Ctrl+P → "Guardar como
  PDF"). No se incluye librería de PDF.
- **Tests:** una página HTML que carga el optimizador y corre asserts simples
  contra casos conocidos. Sin framework pesado.

## Modelo de datos

```js
Proyecto {
  nombre: string,
  piezas: Pieza[],
  placas: PlacaStock[],
  config: Config,
}

Pieza {
  id: string,
  nombre: string,         // ej. "Lateral izquierdo"
  ancho: number,          // mm
  alto: number,           // mm
  cantidad: number,       // se expande a `cantidad` piezas iguales
  rotable: boolean,       // false si la veta es direccional
}

PlacaStock {
  ancho: number,          // mm — default 2750
  alto: number,           // mm — default 1830
  cantidad: number,       // disponible
}

Config {
  kerf: number,           // mm — default 3
  margenPlaca: number,    // mm que se descuentan del borde — default 0
}
```

Estado guardado en `localStorage` bajo la clave `optimizador_cortes:proyecto`.
Una sola "ranura" de proyecto a la vez; export/import JSON para tener
históricos.

## Algoritmo de optimización

**Tipo: guillotine, heurística First-Fit Decreasing.**

Razón de guillotine: las sierras de panel solo hacen cortes rectos pasantes.
Un layout no-guillotine (tipo Tetris) no se puede ejecutar en una sierra real,
así que ahorrar % desperdicio en papel no sirve si el corte no es factible.

### Algoritmo

1. **Expandir piezas:** convertir `Pieza{cantidad: N}` en N instancias
   independientes.
2. **Ordenar** piezas por área descendente (`ancho × alto`). Empate: por
   dimensión mayor descendente.
3. **Inicializar placas abiertas:** vacío. Cada placa abierta mantiene una
   lista de "rectángulos libres" (al inicio: uno solo del tamaño de la placa
   menos el `margenPlaca`).
4. **Para cada pieza:**
   a. Buscar la mejor (placa, rectángulo libre, orientación). Criterio:
      "best short side fit" — el rectángulo libre cuyo lado más corto sobrante
      es mínimo después de colocar la pieza. Empate: menor área sobrante.
   b. Si la pieza permite rotar, probar las dos orientaciones y elegir la
      mejor.
   c. Si no entra en ninguna placa abierta, abrir una nueva placa stock
      (respetando `cantidad` disponible).
   d. Colocar la pieza en la esquina superior-izquierda del rectángulo libre
      elegido. Partir el rectángulo libre restante con un corte guillotine
      horizontal o vertical (la elección se hace para maximizar el área del
      rectángulo libre más grande generado, regla "split shorter axis").
   e. Sumar `kerf` al ancho/alto de la pieza al calcular cuánto espacio
      consumió (porque el corte físico se come 3 mm).
5. **Si quedan piezas sin colocar y no hay placas stock disponibles:** seguir
   abriendo placas "virtuales" del primer tipo de stock para devolver un
   resultado completo, marcando que faltan N placas reales.

### Salida

```js
Resultado {
  placas: PlacaUsada[],
  metricas: {
    placasUsadas: number,
    placasFaltantes: number,    // 0 si stock alcanzó
    aprovechamiento: number,    // 0..1, área de piezas / área total de placas
    desperdicio: number,        // 1 - aprovechamiento
    cortesTotales: number,      // estimación: cantidad de cortes guillotine
  },
  errores: string[],            // ej. "La pieza 'Top' no entra en ninguna placa"
}

PlacaUsada {
  indice: number,
  ancho: number,
  alto: number,
  colocaciones: Colocacion[],
}

Colocacion {
  piezaId: string,
  nombre: string,
  x: number, y: number,         // mm desde esquina superior izquierda
  ancho: number, alto: number,  // dimensiones reales (post-rotación)
  rotada: boolean,
}
```

`optimizer.js` es un módulo **puro**: recibe piezas + placas + config, devuelve
`Resultado`. Sin acceso al DOM, sin `localStorage`, sin `console`. Eso lo hace
trivialmente testeable y reemplazable.

## Interfaz de usuario

Una sola pantalla, dos columnas:

```
┌──────────────────────────────────────────────────────────────┐
│ Optimizador de Cortes      [Nuevo] [Guardar] [Cargar JSON]   │
├──────────────────────────┬───────────────────────────────────┤
│  CONFIGURACIÓN           │  RESULTADO                        │
│                          │                                   │
│  Placa stock             │  ┌─────────────────┐              │
│  Ancho [2750] mm         │  │ Placa 1         │              │
│  Alto  [1830] mm         │  │ ████ ░░ ████    │ Placas: 2/10 │
│  Cant. [10]              │  │ ████ ░░ ████    │ Aprov.: 87%  │
│  [+ otra placa stock]    │  │                 │ Cortes: ~14  │
│                          │  └─────────────────┘              │
│  Kerf [3] mm             │  ┌─────────────────┐              │
│  Margen [0] mm           │  │ Placa 2         │ ⚠ Faltan 0   │
│                          │  │ ███ ░░░░░░      │   placas     │
│  PIEZAS                  │  │ ███ ░░░░░░      │              │
│  ┌────┬─────┬─────┬──┬─┐ │  └─────────────────┘              │
│  │Nom.│ A   │ Alt │Q │↻│ │                                   │
│  │Lat │ 600 │1800 │ 2│✓│ │ [▶ CALCULAR CORTES]               │
│  │Top │ 800 │ 400 │ 1│✗│ │ [🖨 Imprimir / Guardar PDF]       │
│  │... │...  │...  │..│ │ │                                   │
│  └────┴─────┴─────┴──┴─┘ │                                   │
│  [+ Agregar pieza]       │                                   │
│  [⬇ Importar CSV]        │                                   │
│  [⬆ Exportar CSV]        │                                   │
└──────────────────────────┴───────────────────────────────────┘
```

- **Configuración:** inputs numéricos para placa stock (ancho, alto, cantidad,
  + agregar variantes), kerf, margen.
- **Piezas:** tabla editable inline. Columnas: nombre, ancho, alto, cantidad,
  rotable (checkbox; tildado = sin veta o veta indistinta). Botón "+" agrega
  fila, botón "✕" en cada fila la borra.
- **Importar CSV:** acepta encabezado `nombre,ancho,alto,cantidad,rotable`.
  Reemplaza la tabla actual.
- **Resultado:** lista vertical de placas. Cada placa es un SVG escalado a un
  ancho fijo (ej. 700 px), las piezas se dibujan como rectángulos coloreados
  (color hash del nombre para que misma pieza = mismo color), con etiquetas
  `nombre` + `ancho×alto`. Hover en una pieza la resalta.
- **Métricas:** resumen al lado del primer placa: placas usadas, %
  aprovechamiento, % desperdicio, estimación de cortes, advertencia si faltan
  placas o si alguna pieza no entra.

### Vista de impresión

Al hacer Ctrl+P el CSS de impresión:
- Oculta la columna de configuración y los botones.
- Saca scrollbars y fondos.
- Una placa por página, a tamaño máximo de la hoja.
- Lista numerada de piezas debajo de cada placa con sus dimensiones, posición
  y si va rotada.

## Estructura de archivos

```
optimizador_cortes/
├── index.html              # estructura + <script type="module">
├── styles.css              # screen + @media print
├── js/
│   ├── app.js              # bootstrap, conecta state ↔ UI
│   ├── state.js            # modelo + load/save localStorage + import/export JSON
│   ├── optimizer.js        # algoritmo guillotine (puro, sin DOM)
│   ├── renderer.js         # dibujo SVG de los layouts
│   ├── ui-config.js        # form de configuración
│   ├── ui-piezas.js        # tabla de piezas + CSV
│   └── csv.js              # parse/serialize CSV
├── tests/
│   └── optimizer.test.html # casos del optimizer (auto-corre, muestra ✓/✗)
├── docs/
│   └── superpowers/specs/2026-05-10-optimizador-cortes-design.md
└── README.md
```

Cada archivo JS es un módulo ES con responsabilidad acotada. `optimizer.js`
no depende de ningún otro módulo del proyecto.

## Manejo de errores y casos borde

| Caso | Comportamiento |
|---|---|
| Pieza más grande que cualquier placa stock | Mostrar error rojo, listar la pieza, no abortar el resto del cálculo |
| Sin piezas | Botón "Calcular" muestra aviso, no calcula |
| Sin placas stock configuradas | Default 2750×1830, cantidad 10 |
| Stock insuficiente | Calcula con placas "virtuales", mostrar `⚠ Faltan N placas` |
| Pieza con cantidad 0 o dimensiones 0 | Validación en la tabla, fila resaltada en rojo |
| CSV mal formado | Mensaje de error, no reemplaza piezas existentes |
| Kerf > dimensión más chica de pieza | Validación en config, mensaje claro |

## Lo que NO entra en este alcance (YAGNI)

- Cuentas / login / multiusuario.
- Sincronización en la nube.
- Múltiples proyectos abiertos a la vez (uno activo, archivos JSON para los demás).
- Optimización inter-proyecto (juntar piezas de varios muebles).
- Cortes con ángulo / no rectangulares / curvos.
- Algoritmos no-guillotine (max-rects, simulated annealing, etc.).
- Etiquetado físico (códigos de barra, QR para piezas).
- Cálculo de costos / precios / lista de materiales más allá de las placas.
- Internacionalización (queda en español).

## Plan de testing

Tests del optimizador en `tests/optimizer.test.html`. Casos mínimos:

1. **Una pieza que cabe exactamente en una placa.** Aprovechamiento ≈ 100%.
2. **Dos piezas iguales que entran en una placa.** Una placa, layout correcto.
3. **Pieza más grande que la placa.** Error en `errores`, no se aborta.
4. **Stock insuficiente.** `placasFaltantes > 0`, todas las piezas colocadas.
5. **Kerf > 0.** Verificar que dos piezas A+B con A.ancho + B.ancho == placa.ancho NO entran lado a lado.
6. **Rotación obligatoria** (rotable=true): pieza alta y angosta entra rotada en placa ancha y baja.
7. **Veta direccional** (rotable=false): misma pieza no rota, requiere más placas.
8. **Caso real chico**: 8 piezas de un módulo simple, verificar que resuelve sin crash y aprovechamiento > 70%.

UI: validación manual en navegador (no hay tests automáticos de UI en este alcance).
