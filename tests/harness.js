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
