# Optimizador de Cortes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only web app (no build step) that takes a list of furniture pieces and produces an optimized guillotine-cut layout across stock plates, with on-screen SVG visualization and print-to-PDF support.

**Architecture:** Plain HTML + ES modules + CSS, loaded directly from disk (`file://`). A pure `optimizer.js` module computes the layout; UI modules read/write `localStorage` and render SVG. Tests run in-browser via a single test page using a minimal assertion harness.

**Tech Stack:** HTML5, CSS3, JavaScript ES2022 modules. No bundler, no npm, no framework, no external libraries. Persistence via `localStorage`. PDF via browser print dialog.

**Spec:** `docs/superpowers/specs/2026-05-10-optimizador-cortes-design.md`

---

## Conventions

- **Units:** all dimensions in millimeters (integers preferred but floats allowed).
- **Coordinate system:** origin top-left of each plate; X increases to the right, Y down. Pieces stored as `{x, y, ancho, alto}`.
- **Module style:** ES modules (`<script type="module">`). Each file uses `export` for its public API. No globals.
- **Testing approach:** TDD for `optimizer.js` (pure logic). Manual browser verification for UI/state/render. Tests run on `tests/optimizer.test.html` with a tiny custom harness.
- **Commit cadence:** after every passing task. Commit messages use present-tense imperative ("add optimizer scaffolding").
- **Git:** initialize a repo at task 1. If user already initialized, skip the `git init`.

---

### Task 1: Project skeleton, test harness, git init

**Files:**
- Create: `.gitignore`
- Create: `README.md`
- Create: `index.html`
- Create: `styles.css`
- Create: `js/optimizer.js`
- Create: `tests/harness.js`
- Create: `tests/optimizer.test.html`

- [ ] **Step 1: Initialize git (if not already)**

Run from project root:
```bash
git init
git config core.autocrlf input
```
If `git status` already works, skip this step.

- [ ] **Step 2: Create `.gitignore`**

```
.superpowers/
.DS_Store
Thumbs.db
*.swp
.vscode/
.idea/
```

- [ ] **Step 3: Create `README.md`**

```markdown
# Optimizador de Cortes

App web local para optimizar cortes de placas de madera/melamina a partir de la lista de piezas de un mueble.

## Uso

Doble clic en `index.html`, o desde la terminal:

```bash
python -m http.server 8000
# después abrir http://localhost:8000
```

Abrir desde el navegador. No requiere instalación ni dependencias.

## Tests

Abrir `tests/optimizer.test.html` en el navegador. Los tests corren automáticamente y muestran ✓/✗ en la página.

## Imprimir / Exportar PDF

Ctrl+P → Guardar como PDF. El CSS de impresión oculta los controles y muestra una placa por página.
```

- [ ] **Step 4: Create empty `index.html` placeholder**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Optimizador de Cortes</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <h1>Optimizador de Cortes</h1>
  <p>En construcción.</p>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 5: Create empty `styles.css`**

```css
:root {
  --bg: #fafafa;
  --fg: #222;
  --border: #ccc;
  --accent: #2c5aa0;
  --warn: #c44;
}

* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--fg); }
```

- [ ] **Step 6: Create stub `js/optimizer.js`**

```js
// Pure module: pieces + plates + config -> layout result.
// No DOM, no localStorage, no globals.

export function optimizar({ piezas, placas, config }) {
  return {
    placas: [],
    metricas: { placasUsadas: 0, placasFaltantes: 0, aprovechamiento: 0, desperdicio: 0, cortesTotales: 0 },
    errores: [],
  };
}
```

- [ ] **Step 7: Create `tests/harness.js` (minimal assertion harness)**

```js
const results = [];

export function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, err: err.message + '\n' + (err.stack || '') });
  }
}

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

export function assertEq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e} got ${a}`);
}

export function assertClose(actual, expected, tol = 0.01, msg = '') {
  if (Math.abs(actual - expected) > tol) throw new Error(`${msg} expected ~${expected} got ${actual}`);
}

export function render() {
  const root = document.getElementById('results');
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  const summary = document.createElement('div');
  summary.style.cssText = `padding:8px;font-weight:bold;${failed === 0 ? 'background:#cfc' : 'background:#fcc'}`;
  summary.textContent = `${passed} passed, ${failed} failed`;
  root.appendChild(summary);
  for (const r of results) {
    const div = document.createElement('div');
    div.style.cssText = `padding:6px;border-bottom:1px solid #eee;${r.ok ? 'color:#080' : 'color:#a00;white-space:pre-wrap;font-family:monospace'}`;
    div.textContent = (r.ok ? '✓ ' : '✗ ') + r.name + (r.ok ? '' : '\n' + r.err);
    root.appendChild(div);
  }
}
```

- [ ] **Step 8: Create `tests/optimizer.test.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Optimizer Tests</title>
  <style>body{font-family:system-ui;margin:20px;max-width:900px}</style>
</head>
<body>
  <h1>Optimizer Tests</h1>
  <div id="results"></div>
  <script type="module">
    import { optimizar } from '../js/optimizer.js';
    import { test, assert, assertEq, assertClose, render } from './harness.js';

    test('empty input returns empty result', () => {
      const r = optimizar({ piezas: [], placas: [], config: { kerf: 3, margenPlaca: 0 } });
      assertEq(r.placas, []);
      assertEq(r.metricas.placasUsadas, 0);
      assertEq(r.errores, []);
    });

    render();
  </script>
</body>
</html>
```

- [ ] **Step 9: Verify tests run**

Open `tests/optimizer.test.html` in the browser. Expected: green box "1 passed, 0 failed".

- [ ] **Step 10: Commit**

```bash
git add .gitignore README.md index.html styles.css js/optimizer.js tests/harness.js tests/optimizer.test.html docs/
git commit -m "chore: initialize project skeleton with test harness"
```

---

### Task 2: Optimizer — place a single piece on a single plate

**Files:**
- Modify: `js/optimizer.js`
- Modify: `tests/optimizer.test.html`

- [ ] **Step 1: Add failing test**

Insert in `tests/optimizer.test.html` before `render()`:

```js
test('one piece fits in one plate at origin', () => {
  const r = optimizar({
    piezas: [{ id: 'a', nombre: 'A', ancho: 600, alto: 400, cantidad: 1, rotable: true }],
    placas: [{ ancho: 2750, alto: 1830, cantidad: 5 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assertEq(r.metricas.placasUsadas, 1);
  assertEq(r.placas.length, 1);
  assertEq(r.placas[0].colocaciones.length, 1);
  const c = r.placas[0].colocaciones[0];
  assertEq([c.x, c.y, c.ancho, c.alto, c.rotada], [0, 0, 600, 400, false]);
});
```

- [ ] **Step 2: Run tests, confirm new test fails**

Reload `tests/optimizer.test.html`. Expected: 1 passed, 1 failed.

- [ ] **Step 3: Implement minimal optimizer**

Replace `js/optimizer.js` body with:

```js
export function optimizar({ piezas, placas, config }) {
  const kerf = config.kerf || 0;
  const margen = config.margenPlaca || 0;

  const expandidas = expandirPiezas(piezas);
  expandidas.sort((p, q) => (q.ancho * q.alto) - (p.ancho * p.alto));

  const stock = [...placas.map(p => ({ ...p }))];
  const placasAbiertas = [];
  const errores = [];

  for (const pieza of expandidas) {
    const colocada = colocarPieza(pieza, placasAbiertas, stock, kerf, margen);
    if (!colocada) errores.push(`No se pudo colocar la pieza '${pieza.nombre}'`);
  }

  const metricas = calcularMetricas(placasAbiertas, expandidas, stock);
  return { placas: placasAbiertas.map(formatearPlaca), metricas, errores };
}

function expandirPiezas(piezas) {
  const out = [];
  for (const p of piezas) {
    for (let i = 0; i < p.cantidad; i++) {
      out.push({ ...p, instancia: i });
    }
  }
  return out;
}

function colocarPieza(pieza, placasAbiertas, stock, kerf, margen) {
  // Try open plates first
  for (const placa of placasAbiertas) {
    if (intentarColocar(pieza, placa, kerf)) return true;
  }
  // Open a new plate
  const tipo = elegirTipoStock(stock);
  if (!tipo) return false;
  const nueva = abrirPlaca(tipo, margen);
  placasAbiertas.push(nueva);
  return intentarColocar(pieza, nueva, kerf);
}

function elegirTipoStock(stock) {
  for (const s of stock) {
    if (s.cantidad > 0) {
      s.cantidad--;
      return s;
    }
  }
  // Stock exhausted: use first type as virtual
  if (stock.length === 0) return null;
  stock[0].faltantes = (stock[0].faltantes || 0) + 1;
  return stock[0];
}

function abrirPlaca(tipo, margen) {
  return {
    ancho: tipo.ancho,
    alto: tipo.alto,
    libres: [{ x: margen, y: margen, ancho: tipo.ancho - 2 * margen, alto: tipo.alto - 2 * margen }],
    colocaciones: [],
  };
}

function intentarColocar(pieza, placa, kerf) {
  const libre = placa.libres.find(l => l.ancho >= pieza.ancho && l.alto >= pieza.alto);
  if (!libre) return false;
  placa.colocaciones.push({
    piezaId: pieza.id,
    nombre: pieza.nombre,
    x: libre.x, y: libre.y,
    ancho: pieza.ancho, alto: pieza.alto,
    rotada: false,
  });
  // Remove the used free rect (will be re-added in next task with proper splitting)
  placa.libres = placa.libres.filter(l => l !== libre);
  return true;
}

function formatearPlaca(p) {
  return { ancho: p.ancho, alto: p.alto, colocaciones: p.colocaciones };
}

function calcularMetricas(placas, piezas, stock) {
  const placasUsadas = placas.length;
  const placasFaltantes = stock.reduce((s, x) => s + (x.faltantes || 0), 0);
  const areaPiezas = piezas.reduce((s, p) => s + p.ancho * p.alto, 0);
  const areaTotal = placas.reduce((s, p) => s + p.ancho * p.alto, 0);
  const aprovechamiento = areaTotal > 0 ? areaPiezas / areaTotal : 0;
  return {
    placasUsadas,
    placasFaltantes,
    aprovechamiento,
    desperdicio: 1 - aprovechamiento,
    cortesTotales: 0,
  };
}
```

- [ ] **Step 4: Run tests, confirm both pass**

Reload tests page. Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add js/optimizer.js tests/optimizer.test.html
git commit -m "feat(optimizer): place single piece in single plate"
```

---

### Task 3: Optimizer — guillotine split for two pieces

**Files:**
- Modify: `js/optimizer.js`
- Modify: `tests/optimizer.test.html`

- [ ] **Step 1: Add failing test**

Insert in `tests/optimizer.test.html`:

```js
test('two pieces side by side use one plate', () => {
  const r = optimizar({
    piezas: [
      { id: 'a', nombre: 'A', ancho: 1000, alto: 500, cantidad: 1, rotable: true },
      { id: 'b', nombre: 'B', ancho: 800, alto: 500, cantidad: 1, rotable: true },
    ],
    placas: [{ ancho: 2750, alto: 1830, cantidad: 1 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assertEq(r.metricas.placasUsadas, 1);
  assertEq(r.placas[0].colocaciones.length, 2);
  assertEq(r.errores, []);
  const xs = r.placas[0].colocaciones.map(c => c.x).sort((a,b)=>a-b);
  assertEq(xs, [0, 1000]);
});

test('two pieces stacked vertically use one plate', () => {
  const r = optimizar({
    piezas: [
      { id: 'a', nombre: 'A', ancho: 2000, alto: 800, cantidad: 1, rotable: true },
      { id: 'b', nombre: 'B', ancho: 2000, alto: 600, cantidad: 1, rotable: true },
    ],
    placas: [{ ancho: 2750, alto: 1830, cantidad: 1 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assertEq(r.metricas.placasUsadas, 1);
  assertEq(r.placas[0].colocaciones.length, 2);
});
```

- [ ] **Step 2: Run tests, confirm new tests fail**

Expected: 2 passed (the 2 from before), 2 failed.

- [ ] **Step 3: Replace `intentarColocar` to do guillotine splitting**

In `js/optimizer.js`, replace the `intentarColocar` function with:

```js
function intentarColocar(pieza, placa, kerf) {
  // Find best free rect: short-side-fit (smallest leftover short side)
  let mejor = null;
  let mejorScore = Infinity;
  for (const libre of placa.libres) {
    if (libre.ancho < pieza.ancho || libre.alto < pieza.alto) continue;
    const sobraW = libre.ancho - pieza.ancho;
    const sobraH = libre.alto - pieza.alto;
    const score = Math.min(sobraW, sobraH);
    if (score < mejorScore) { mejor = libre; mejorScore = score; }
  }
  if (!mejor) return false;

  placa.colocaciones.push({
    piezaId: pieza.id,
    nombre: pieza.nombre,
    x: mejor.x, y: mejor.y,
    ancho: pieza.ancho, alto: pieza.alto,
    rotada: false,
  });

  // Guillotine split: remove `mejor`, add up to two new free rects.
  // Split axis: split along the SHORTER leftover dimension to keep the
  // larger remaining rect intact (split-shorter-axis rule).
  const sobraW = mejor.ancho - pieza.ancho;
  const sobraH = mejor.alto - pieza.alto;
  const ocupadoW = pieza.ancho + kerf;
  const ocupadoH = pieza.alto + kerf;

  const nuevos = [];
  if (sobraW > sobraH) {
    // Vertical cut first (keep right strip full-height)
    if (mejor.ancho - ocupadoW > 0) {
      nuevos.push({ x: mejor.x + ocupadoW, y: mejor.y, ancho: mejor.ancho - ocupadoW, alto: mejor.alto });
    }
    if (mejor.alto - ocupadoH > 0) {
      nuevos.push({ x: mejor.x, y: mejor.y + ocupadoH, ancho: pieza.ancho, alto: mejor.alto - ocupadoH });
    }
  } else {
    // Horizontal cut first (keep bottom strip full-width)
    if (mejor.alto - ocupadoH > 0) {
      nuevos.push({ x: mejor.x, y: mejor.y + ocupadoH, ancho: mejor.ancho, alto: mejor.alto - ocupadoH });
    }
    if (mejor.ancho - ocupadoW > 0) {
      nuevos.push({ x: mejor.x + ocupadoW, y: mejor.y, ancho: mejor.ancho - ocupadoW, alto: pieza.alto });
    }
  }

  placa.libres = placa.libres.filter(l => l !== mejor).concat(nuevos);
  return true;
}
```

- [ ] **Step 4: Run tests, confirm all pass**

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add js/optimizer.js tests/optimizer.test.html
git commit -m "feat(optimizer): guillotine split with short-side-fit"
```

---

### Task 4: Optimizer — kerf consumes space

**Files:**
- Modify: `tests/optimizer.test.html`

- [ ] **Step 1: Add failing test**

```js
test('kerf 3mm forces extra plate when pieces tight', () => {
  // Plate 100x100, two pieces 50x100. Without kerf, both fit. With kerf=3,
  // they need 50+3+50 = 103 > 100, so second piece needs another plate.
  const r = optimizar({
    piezas: [
      { id: 'a', nombre: 'A', ancho: 50, alto: 100, cantidad: 2, rotable: false },
    ],
    placas: [{ ancho: 100, alto: 100, cantidad: 5 }],
    config: { kerf: 3, margenPlaca: 0 },
  });
  assertEq(r.metricas.placasUsadas, 2);
});

test('kerf 0 packs both pieces in one plate', () => {
  const r = optimizar({
    piezas: [
      { id: 'a', nombre: 'A', ancho: 50, alto: 100, cantidad: 2, rotable: false },
    ],
    placas: [{ ancho: 100, alto: 100, cantidad: 5 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assertEq(r.metricas.placasUsadas, 1);
});
```

- [ ] **Step 2: Run tests**

The kerf logic was already added in Task 3 via `ocupadoW = pieza.ancho + kerf`. Both tests should pass on the first run.

Expected: 6 passed. If they fail, re-check Task 3 step 3.

- [ ] **Step 3: Commit**

```bash
git add tests/optimizer.test.html
git commit -m "test(optimizer): verify kerf consumes space between pieces"
```

---

### Task 5: Optimizer — rotation when allowed

**Files:**
- Modify: `js/optimizer.js`
- Modify: `tests/optimizer.test.html`

- [ ] **Step 1: Add failing tests**

```js
test('rotable piece rotates to fit', () => {
  // 100x600 piece, plate 700x150. Cannot fit upright (600 > 150).
  // Rotated to 600x100, fits.
  const r = optimizar({
    piezas: [{ id: 'a', nombre: 'A', ancho: 100, alto: 600, cantidad: 1, rotable: true }],
    placas: [{ ancho: 700, alto: 150, cantidad: 1 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assertEq(r.errores, []);
  assertEq(r.placas[0].colocaciones[0].rotada, true);
  assertEq(r.placas[0].colocaciones[0].ancho, 600);
  assertEq(r.placas[0].colocaciones[0].alto, 100);
});

test('non-rotable piece does not rotate', () => {
  const r = optimizar({
    piezas: [{ id: 'a', nombre: 'A', ancho: 100, alto: 600, cantidad: 1, rotable: false }],
    placas: [{ ancho: 700, alto: 150, cantidad: 1 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assert(r.errores.length === 1, 'should error: piece does not fit');
});
```

- [ ] **Step 2: Run tests, confirm both fail**

The first fails because rotation isn't implemented. The second incorrectly succeeds (or fails for the wrong reason).

- [ ] **Step 3: Update `intentarColocar` to consider rotation**

In `js/optimizer.js`, replace `intentarColocar` with:

```js
function intentarColocar(pieza, placa, kerf) {
  // Try both orientations if rotable; pick the one with the best fit.
  const orientaciones = pieza.rotable && pieza.ancho !== pieza.alto
    ? [{ w: pieza.ancho, h: pieza.alto, rotada: false },
       { w: pieza.alto, h: pieza.ancho, rotada: true }]
    : [{ w: pieza.ancho, h: pieza.alto, rotada: false }];

  let mejor = null;
  let mejorScore = Infinity;
  let mejorOri = null;

  for (const ori of orientaciones) {
    for (const libre of placa.libres) {
      if (libre.ancho < ori.w || libre.alto < ori.h) continue;
      const score = Math.min(libre.ancho - ori.w, libre.alto - ori.h);
      if (score < mejorScore) {
        mejor = libre; mejorScore = score; mejorOri = ori;
      }
    }
  }
  if (!mejor) return false;

  const w = mejorOri.w, h = mejorOri.h;
  placa.colocaciones.push({
    piezaId: pieza.id,
    nombre: pieza.nombre,
    x: mejor.x, y: mejor.y,
    ancho: w, alto: h,
    rotada: mejorOri.rotada,
  });

  const sobraW = mejor.ancho - w;
  const sobraH = mejor.alto - h;
  const ocupadoW = w + kerf;
  const ocupadoH = h + kerf;

  const nuevos = [];
  if (sobraW > sobraH) {
    if (mejor.ancho - ocupadoW > 0) {
      nuevos.push({ x: mejor.x + ocupadoW, y: mejor.y, ancho: mejor.ancho - ocupadoW, alto: mejor.alto });
    }
    if (mejor.alto - ocupadoH > 0) {
      nuevos.push({ x: mejor.x, y: mejor.y + ocupadoH, ancho: w, alto: mejor.alto - ocupadoH });
    }
  } else {
    if (mejor.alto - ocupadoH > 0) {
      nuevos.push({ x: mejor.x, y: mejor.y + ocupadoH, ancho: mejor.ancho, alto: mejor.alto - ocupadoH });
    }
    if (mejor.ancho - ocupadoW > 0) {
      nuevos.push({ x: mejor.x + ocupadoW, y: mejor.y, ancho: mejor.ancho - ocupadoW, alto: h });
    }
  }

  placa.libres = placa.libres.filter(l => l !== mejor).concat(nuevos);
  return true;
}
```

Also, in `colocarPieza`, change the "open new plate" path to retry placement on the new plate (already does this). And in the main loop in `optimizar`, the "piece doesn't fit anywhere" path needs to detect when the piece is bigger than any stock plate. Update `optimizar`:

```js
export function optimizar({ piezas, placas, config }) {
  const kerf = config.kerf || 0;
  const margen = config.margenPlaca || 0;

  const expandidas = expandirPiezas(piezas);
  expandidas.sort((p, q) => (q.ancho * q.alto) - (p.ancho * p.alto));

  const stock = [...placas.map(p => ({ ...p }))];
  const placasAbiertas = [];
  const errores = [];

  for (const pieza of expandidas) {
    if (!cabeEnAlgunStock(pieza, placas, margen)) {
      errores.push(`La pieza '${pieza.nombre}' no entra en ninguna placa stock`);
      continue;
    }
    const colocada = colocarPieza(pieza, placasAbiertas, stock, kerf, margen);
    if (!colocada) errores.push(`No se pudo colocar la pieza '${pieza.nombre}'`);
  }

  const metricas = calcularMetricas(placasAbiertas, expandidas.filter(p => cabeEnAlgunStock(p, placas, margen)), stock);
  return { placas: placasAbiertas.map(formatearPlaca), metricas, errores };
}

function cabeEnAlgunStock(pieza, placas, margen) {
  for (const tipo of placas) {
    const w = tipo.ancho - 2 * margen;
    const h = tipo.alto - 2 * margen;
    const fits = pieza.ancho <= w && pieza.alto <= h;
    const fitsRot = pieza.rotable && pieza.ancho <= h && pieza.alto <= w;
    if (fits || fitsRot) return true;
  }
  return false;
}
```

- [ ] **Step 4: Run tests, confirm all pass**

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add js/optimizer.js tests/optimizer.test.html
git commit -m "feat(optimizer): rotation honored only when piece is rotable"
```

---

### Task 6: Optimizer — stock limits and missing-plate accounting

**Files:**
- Modify: `tests/optimizer.test.html`

- [ ] **Step 1: Add failing test**

```js
test('stock insufficient: places all pieces and reports faltantes', () => {
  // 5 large pieces, only 1 plate available -> 4 missing plates
  const r = optimizar({
    piezas: [{ id: 'a', nombre: 'A', ancho: 2000, alto: 1500, cantidad: 5, rotable: false }],
    placas: [{ ancho: 2750, alto: 1830, cantidad: 1 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assertEq(r.metricas.placasUsadas, 5);
  assertEq(r.metricas.placasFaltantes, 4);
  // All 5 pieces placed
  const total = r.placas.reduce((s, p) => s + p.colocaciones.length, 0);
  assertEq(total, 5);
});

test('stock sufficient: placasFaltantes is 0', () => {
  const r = optimizar({
    piezas: [{ id: 'a', nombre: 'A', ancho: 2000, alto: 1500, cantidad: 2, rotable: false }],
    placas: [{ ancho: 2750, alto: 1830, cantidad: 5 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assertEq(r.metricas.placasFaltantes, 0);
});
```

- [ ] **Step 2: Run tests**

Expected: 9 passed, 1 failed (or both pass — depends on whether previous code already supports this; it does, but verify).

If the first test fails because `placasFaltantes` is not tracked correctly, the existing `elegirTipoStock` already sets `stock[0].faltantes++` when stock is exhausted. Verify.

- [ ] **Step 3: If failing, fix `elegirTipoStock`**

If the test for "places all pieces and reports faltantes" fails, ensure `elegirTipoStock` returns the type even when exhausted (does not return null when stock has at least one type). Re-read the function from Task 2:

```js
function elegirTipoStock(stock) {
  for (const s of stock) {
    if (s.cantidad > 0) {
      s.cantidad--;
      return s;
    }
  }
  if (stock.length === 0) return null;
  stock[0].faltantes = (stock[0].faltantes || 0) + 1;
  return stock[0];
}
```

This is correct. If tests fail, check the spread copy in `optimizar` — `stock` must be a fresh copy so we mutate `cantidad` and `faltantes` independently from the caller's input. The line `const stock = [...placas.map(p => ({ ...p }))];` already does this.

- [ ] **Step 4: Confirm all tests pass**

Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add tests/optimizer.test.html
git commit -m "test(optimizer): verify stock exhaustion reports faltantes"
```

---

### Task 7: Optimizer — error when piece doesn't fit any stock

**Files:**
- Modify: `tests/optimizer.test.html`

- [ ] **Step 1: Add failing test**

```js
test('piece bigger than stock yields error, others still placed', () => {
  const r = optimizar({
    piezas: [
      { id: 'a', nombre: 'Gigante', ancho: 5000, alto: 5000, cantidad: 1, rotable: true },
      { id: 'b', nombre: 'Normal', ancho: 600, alto: 400, cantidad: 1, rotable: true },
    ],
    placas: [{ ancho: 2750, alto: 1830, cantidad: 5 }],
    config: { kerf: 0, margenPlaca: 0 },
  });
  assert(r.errores.some(e => e.includes('Gigante')), 'expected error mentioning Gigante');
  // Normal piece still placed
  const total = r.placas.reduce((s, p) => s + p.colocaciones.length, 0);
  assertEq(total, 1);
});
```

- [ ] **Step 2: Run tests, confirm pass**

Should already pass thanks to `cabeEnAlgunStock` from Task 5.

Expected: 11 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/optimizer.test.html
git commit -m "test(optimizer): oversize piece reported, others still placed"
```

---

### Task 8: State module + localStorage

**Files:**
- Create: `js/state.js`

- [ ] **Step 1: Create `js/state.js`**

```js
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
```

- [ ] **Step 2: Manual smoke test (optional, no commit yet)**

In a browser console on `index.html`, type:
```js
const m = await import('./js/state.js');
const p = m.proyectoVacio();
m.guardar(p);
m.cargar();
```
Should not throw and should return the same shape.

- [ ] **Step 3: Commit**

```bash
git add js/state.js
git commit -m "feat(state): project model with localStorage and JSON IO"
```

---

### Task 9: CSV module

**Files:**
- Create: `js/csv.js`

- [ ] **Step 1: Create `js/csv.js`**

```js
// Minimal CSV: comma-separated, no quoting beyond simple double-quote handling.
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
  // Simple split, trims each cell, strips surrounding quotes.
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
```

- [ ] **Step 2: Commit**

```bash
git add js/csv.js
git commit -m "feat(csv): parse and serialize pieces CSV"
```

---

### Task 10: SVG renderer

**Files:**
- Create: `js/renderer.js`

- [ ] **Step 1: Create `js/renderer.js`**

```js
// Renders the optimizer result into an HTML container as SVG.

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEWPORT_PX = 700; // visual width of each plate

export function render(container, resultado) {
  container.innerHTML = '';

  if (resultado.errores.length > 0) {
    const box = document.createElement('div');
    box.className = 'errores';
    box.innerHTML = '<strong>Avisos:</strong><ul>' +
      resultado.errores.map(e => `<li>${escapeHtml(e)}</li>`).join('') +
      '</ul>';
    container.appendChild(box);
  }

  const m = resultado.metricas;
  const resumen = document.createElement('div');
  resumen.className = 'resumen';
  resumen.innerHTML = `
    <div>Placas usadas: <strong>${m.placasUsadas}</strong></div>
    <div>Aprovechamiento: <strong>${(m.aprovechamiento * 100).toFixed(1)}%</strong></div>
    <div>Desperdicio: <strong>${(m.desperdicio * 100).toFixed(1)}%</strong></div>
    ${m.placasFaltantes > 0 ? `<div class="warn">⚠ Faltan ${m.placasFaltantes} placa(s) en stock</div>` : ''}
  `;
  container.appendChild(resumen);

  resultado.placas.forEach((placa, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'placa-wrap';
    wrap.innerHTML = `<h3>Placa ${i + 1} — ${placa.ancho}×${placa.alto} mm</h3>`;
    wrap.appendChild(dibujarPlaca(placa));
    wrap.appendChild(listaPiezas(placa));
    container.appendChild(wrap);
  });
}

function dibujarPlaca(placa) {
  const escala = VIEWPORT_PX / placa.ancho;
  const altoPx = placa.alto * escala;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${placa.ancho} ${placa.alto}`);
  svg.setAttribute('width', VIEWPORT_PX);
  svg.setAttribute('height', altoPx);
  svg.setAttribute('class', 'placa-svg');

  // Plate background
  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('x', 0); bg.setAttribute('y', 0);
  bg.setAttribute('width', placa.ancho); bg.setAttribute('height', placa.alto);
  bg.setAttribute('fill', '#f5e8c8'); bg.setAttribute('stroke', '#333'); bg.setAttribute('stroke-width', 4);
  svg.appendChild(bg);

  for (const c of placa.colocaciones) {
    const g = document.createElementNS(SVG_NS, 'g');

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', c.x); rect.setAttribute('y', c.y);
    rect.setAttribute('width', c.ancho); rect.setAttribute('height', c.alto);
    rect.setAttribute('fill', colorPara(c.nombre));
    rect.setAttribute('stroke', '#222'); rect.setAttribute('stroke-width', 2);
    g.appendChild(rect);

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', c.x + c.ancho / 2);
    label.setAttribute('y', c.y + c.alto / 2);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('font-size', Math.max(40, Math.min(c.ancho, c.alto) / 8));
    label.setAttribute('fill', '#000');
    label.textContent = `${c.nombre} ${c.ancho}×${c.alto}${c.rotada ? ' ↻' : ''}`;
    g.appendChild(label);

    svg.appendChild(g);
  }
  return svg;
}

function listaPiezas(placa) {
  const ol = document.createElement('ol');
  ol.className = 'lista-piezas';
  for (const c of placa.colocaciones) {
    const li = document.createElement('li');
    li.textContent = `${c.nombre} — ${c.ancho}×${c.alto} mm @ (${c.x}, ${c.y})${c.rotada ? ' [rotada]' : ''}`;
    ol.appendChild(li);
  }
  return ol;
}

function colorPara(nombre) {
  // Stable hash -> pastel HSL color
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h}, 55%, 75%)`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
```

- [ ] **Step 2: Commit**

```bash
git add js/renderer.js
git commit -m "feat(renderer): SVG layout per plate with metrics summary"
```

---

### Task 11: UI shell — index.html and styles

**Files:**
- Modify: `index.html`
- Modify: `styles.css`

- [ ] **Step 1: Replace `index.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Optimizador de Cortes</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <h1>Optimizador de Cortes</h1>
    <div class="acciones">
      <button id="btn-nuevo">Nuevo</button>
      <button id="btn-export">Exportar JSON</button>
      <button id="btn-import">Importar JSON</button>
      <input type="file" id="file-import" accept=".json" hidden>
    </div>
  </header>

  <main>
    <section class="config-panel" id="config-panel">
      <h2>Configuración</h2>
      <div id="config-placas"></div>
      <div class="config-globals">
        <label>Kerf (mm) <input type="number" id="cfg-kerf" min="0" step="0.1"></label>
        <label>Margen (mm) <input type="number" id="cfg-margen" min="0" step="0.1"></label>
      </div>

      <h2>Piezas</h2>
      <table id="tabla-piezas">
        <thead>
          <tr><th>Nombre</th><th>Ancho</th><th>Alto</th><th>Cant.</th><th>Rota</th><th></th></tr>
        </thead>
        <tbody></tbody>
      </table>
      <div class="acciones">
        <button id="btn-agregar-pieza">+ Pieza</button>
        <button id="btn-importar-csv">Importar CSV</button>
        <button id="btn-exportar-csv">Exportar CSV</button>
        <input type="file" id="file-csv" accept=".csv,text/csv" hidden>
      </div>
    </section>

    <section class="resultado-panel" id="resultado-panel">
      <div class="acciones acciones-resultado">
        <button id="btn-calcular" class="primary">▶ Calcular cortes</button>
        <button id="btn-imprimir">🖨 Imprimir / PDF</button>
      </div>
      <div id="resultado"></div>
    </section>
  </main>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Replace `styles.css`**

```css
:root {
  --bg: #fafafa;
  --fg: #222;
  --border: #ccc;
  --accent: #2c5aa0;
  --warn: #c44;
  --panel: #fff;
}

* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--fg); }

header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 20px; background: var(--accent); color: #fff;
}
header h1 { margin: 0; font-size: 1.3em; }

main {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 16px;
  padding: 16px;
}

.config-panel, .resultado-panel {
  background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
  padding: 16px; overflow: auto;
}

h2 { margin-top: 0; font-size: 1.05em; border-bottom: 1px solid var(--border); padding-bottom: 4px; }

.acciones { display: flex; gap: 8px; flex-wrap: wrap; }
.acciones-resultado { margin-bottom: 12px; }

button {
  padding: 6px 12px; border: 1px solid var(--border); background: #f0f0f0; border-radius: 4px; cursor: pointer;
}
button:hover { background: #e6e6e6; }
button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
button.primary:hover { background: #234a85; }

input[type=number], input[type=text] {
  width: 80px; padding: 4px; border: 1px solid var(--border); border-radius: 3px;
}
input[type=text].nombre { width: 130px; }

label { display: inline-flex; align-items: center; gap: 4px; margin-right: 12px; }

#config-placas .placa-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
.config-globals { margin: 12px 0; }

table { border-collapse: collapse; width: 100%; margin: 8px 0; }
th, td { padding: 4px 6px; border: 1px solid var(--border); text-align: left; }
th { background: #f0f0f0; font-size: 0.9em; }

.resumen { display: flex; gap: 24px; margin-bottom: 16px; flex-wrap: wrap; padding: 8px; background: #f5f5f5; border-radius: 4px; }
.resumen .warn { color: var(--warn); }

.errores { background: #fee; border: 1px solid var(--warn); padding: 8px; border-radius: 4px; margin-bottom: 12px; }

.placa-wrap { margin-bottom: 24px; }
.placa-svg { display: block; max-width: 100%; height: auto; border: 1px solid #888; }
.lista-piezas { font-size: 0.9em; columns: 2; }

@media print {
  header, .config-panel, .acciones-resultado, .errores, button { display: none !important; }
  main { display: block; padding: 0; }
  .resultado-panel { border: none; padding: 0; }
  .placa-wrap { page-break-after: always; }
  .placa-wrap:last-child { page-break-after: auto; }
  .placa-svg { max-width: 100%; }
  body { background: #fff; }
}
```

- [ ] **Step 3: Verify shell loads**

Open `index.html`. Expected: header + two empty panels with section headings. The browser console should show "app.js not found" or similar — that's fine, fixed in next task.

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "feat(ui): page shell with config and result panels"
```

---

### Task 12: UI — Config panel (plates + global config)

**Files:**
- Create: `js/ui-config.js`

- [ ] **Step 1: Create `js/ui-config.js`**

```js
// Wires the config panel inputs to the project state.
// onChange callback fires after every edit.

import { nuevaPlaca } from './state.js';

export function montar(proyecto, onChange) {
  const cfg = proyecto.config;
  const kerfInput = document.getElementById('cfg-kerf');
  const margenInput = document.getElementById('cfg-margen');
  kerfInput.value = cfg.kerf;
  margenInput.value = cfg.margenPlaca;
  kerfInput.oninput = () => { cfg.kerf = Number(kerfInput.value) || 0; onChange(); };
  margenInput.oninput = () => { cfg.margenPlaca = Number(margenInput.value) || 0; onChange(); };

  renderPlacas(proyecto, onChange);
}

function renderPlacas(proyecto, onChange) {
  const root = document.getElementById('config-placas');
  root.innerHTML = '';
  proyecto.placas.forEach((placa, i) => {
    const row = document.createElement('div');
    row.className = 'placa-row';
    row.innerHTML = `
      <strong>Placa ${i + 1}:</strong>
      Ancho <input type="number" min="1" value="${placa.ancho}" data-k="ancho">
      Alto <input type="number" min="1" value="${placa.alto}" data-k="alto">
      Cant. <input type="number" min="0" value="${placa.cantidad}" data-k="cantidad">
      <button data-action="rm" title="Quitar">✕</button>
    `;
    row.querySelectorAll('input').forEach(input => {
      input.oninput = () => {
        placa[input.dataset.k] = Number(input.value) || 0;
        onChange();
      };
    });
    row.querySelector('[data-action=rm]').onclick = () => {
      proyecto.placas.splice(i, 1);
      if (proyecto.placas.length === 0) proyecto.placas.push(nuevaPlaca());
      renderPlacas(proyecto, onChange);
      onChange();
    };
    root.appendChild(row);
  });

  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Otra placa stock';
  addBtn.onclick = () => {
    proyecto.placas.push(nuevaPlaca());
    renderPlacas(proyecto, onChange);
    onChange();
  };
  root.appendChild(addBtn);
}
```

- [ ] **Step 2: Commit**

```bash
git add js/ui-config.js
git commit -m "feat(ui): config panel for plates and globals"
```

---

### Task 13: UI — Pieces table

**Files:**
- Create: `js/ui-piezas.js`

- [ ] **Step 1: Create `js/ui-piezas.js`**

```js
import { nuevaPieza } from './state.js';

export function montar(proyecto, onChange) {
  render(proyecto, onChange);
  document.getElementById('btn-agregar-pieza').onclick = () => {
    proyecto.piezas.push(nuevaPieza());
    render(proyecto, onChange);
    onChange();
  };
}

export function rerender(proyecto, onChange) {
  render(proyecto, onChange);
}

function render(proyecto, onChange) {
  const tbody = document.querySelector('#tabla-piezas tbody');
  tbody.innerHTML = '';
  proyecto.piezas.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="nombre" value="${escapeAttr(p.nombre)}"></td>
      <td><input type="number" min="1" value="${p.ancho}"></td>
      <td><input type="number" min="1" value="${p.alto}"></td>
      <td><input type="number" min="1" value="${p.cantidad}"></td>
      <td style="text-align:center"><input type="checkbox" ${p.rotable ? 'checked' : ''}></td>
      <td><button title="Quitar">✕</button></td>
    `;
    const inputs = tr.querySelectorAll('input');
    inputs[0].oninput = () => { p.nombre = inputs[0].value; onChange(); };
    inputs[1].oninput = () => { p.ancho = Number(inputs[1].value) || 0; onChange(); };
    inputs[2].oninput = () => { p.alto = Number(inputs[2].value) || 0; onChange(); };
    inputs[3].oninput = () => { p.cantidad = Number(inputs[3].value) || 0; onChange(); };
    inputs[4].onchange = () => { p.rotable = inputs[4].checked; onChange(); };
    tr.querySelector('button').onclick = () => {
      proyecto.piezas.splice(i, 1);
      render(proyecto, onChange);
      onChange();
    };
    tbody.appendChild(tr);
  });
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
```

- [ ] **Step 2: Commit**

```bash
git add js/ui-piezas.js
git commit -m "feat(ui): editable pieces table"
```

---

### Task 14: App bootstrap — wire everything together

**Files:**
- Create: `js/app.js`

- [ ] **Step 1: Create `js/app.js`**

```js
import { cargar, guardar, proyectoVacio, exportarJSON, importarJSON } from './state.js';
import * as uiConfig from './ui-config.js';
import * as uiPiezas from './ui-piezas.js';
import { parsearCSV, serializarCSV } from './csv.js';
import { optimizar } from './optimizer.js';
import { render as renderResultado } from './renderer.js';

let proyecto = cargar();

function onChange() {
  guardar(proyecto);
}

function bootstrap() {
  uiConfig.montar(proyecto, onChange);
  uiPiezas.montar(proyecto, onChange);

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

  document.getElementById('btn-import').onclick = () => {
    document.getElementById('file-import').click();
  };
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

  document.getElementById('btn-importar-csv').onclick = () => {
    document.getElementById('file-csv').click();
  };
  document.getElementById('file-csv').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const piezas = parsearCSV(await f.text());
      proyecto.piezas = piezas;
      uiPiezas.rerender(proyecto, onChange);
      onChange();
    } catch (err) {
      alert('Error en CSV: ' + err.message);
    }
  };
  document.getElementById('btn-exportar-csv').onclick = () => {
    const blob = new Blob([serializarCSV(proyecto.piezas)], { type: 'text/csv' });
    descargar(blob, 'piezas.csv');
  };

  document.getElementById('btn-calcular').onclick = () => {
    if (proyecto.piezas.length === 0) {
      alert('Agregá al menos una pieza antes de calcular.');
      return;
    }
    const r = optimizar(proyecto);
    renderResultado(document.getElementById('resultado'), r);
  };

  document.getElementById('btn-imprimir').onclick = () => window.print();
}

function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

bootstrap();
```

- [ ] **Step 2: Manual verification**

Open `index.html`. Verify:
1. Page loads with default project (1 plate type 2750×1830 cant.10, kerf 3, no pieces).
2. Click "+ Pieza" — a row appears, edit values inline.
3. Click "▶ Calcular cortes" — see SVG layout in the right panel.
4. Reload page — values persist (localStorage).
5. Click "Exportar JSON" — downloads a JSON file.
6. Click "Imprimir / PDF" — print dialog opens, preview shows one plate per page, no controls visible.

If any step fails, debug before committing.

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat(app): wire state, UI, optimizer, and renderer"
```

---

### Task 15: Final polish — README and validation

**Files:**
- Modify: `README.md`
- Modify: `js/optimizer.js` (estimación de cortes)

- [ ] **Step 1: Implement `cortesTotales` estimate**

In `js/optimizer.js`, replace `calcularMetricas` with:

```js
function calcularMetricas(placas, piezasColocables, stock) {
  const placasUsadas = placas.length;
  const placasFaltantes = stock.reduce((s, x) => s + (x.faltantes || 0), 0);
  const areaPiezas = piezasColocables.reduce((s, p) => s + p.ancho * p.alto, 0);
  const areaTotal = placas.reduce((s, p) => s + p.ancho * p.alto, 0);
  const aprovechamiento = areaTotal > 0 ? areaPiezas / areaTotal : 0;
  // Each piece needs at most 2 cuts to isolate (one to detach a strip, one to crosscut).
  // For small layouts this overcounts shared cuts but is a useful upper bound.
  const cortesTotales = placas.reduce((s, p) => s + p.colocaciones.length * 2, 0);
  return {
    placasUsadas,
    placasFaltantes,
    aprovechamiento,
    desperdicio: 1 - aprovechamiento,
    cortesTotales,
  };
}
```

- [ ] **Step 2: Update `README.md` with full usage**

```markdown
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
```

- [ ] **Step 3: Run tests one more time**

Open `tests/optimizer.test.html`. Expected: 11 passed, 0 failed.

- [ ] **Step 4: Manual sanity check on index.html**

Add 8 sample pieces, calculate, verify reasonable layout. Print preview.

- [ ] **Step 5: Commit**

```bash
git add README.md js/optimizer.js
git commit -m "feat(optimizer): cuts estimate; docs: full README"
```

---

## Self-Review Notes

- **Spec coverage:** All sections of the spec map to a task:
  - Stack/execution: Task 1, 11, 14.
  - Modelo de datos: Task 8 (`state.js`).
  - Algoritmo guillotine: Tasks 2-7.
  - Interfaz: Tasks 11, 12, 13, 14.
  - Estructura de archivos: matches Task 1's tree exactly.
  - Manejo de errores: covered in Tasks 6, 7, 14 (alert on empty pieces, CSV errors, etc.).
  - Plan de testing: Tasks 2-7 cover the 8 listed cases.
- **Placeholder scan:** No TBDs, no "implement later", every code step has full code.
- **Type consistency:** `Pieza`, `PlacaStock`, `Config`, `Resultado` shapes match across spec, optimizer, state, renderer.
- **Single ambiguity resolved inline:** the spec mentions "best short side fit" as the placement criterion AND "split shorter axis" as the split rule — both are different concerns and both are implemented in Task 3 / Task 5.
