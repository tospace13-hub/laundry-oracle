// Washing Oracle invariants over every input combination.
// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { TEXTILES, COLOURS } = require('../oracle.js');
const W = require('../washing/washing.js');

const corners = W.corners(W.METRICS.length);
const POINTS = [{ x: 0, y: 0 }, ...corners, { x: 0.3, y: -0.2 }, { x: -0.4, y: 0.35 }];
const ANIMAL = new Set(['wool', 'cashmere', 'silk']);
const metricIndex = (id) => W.METRICS.findIndex((m) => m.id === id);
const corner = (id) => corners[metricIndex(id)];

const runs = [];
for (const t of TEXTILES) for (const c of COLOURS) for (const soil of W.SOILS) for (const load of W.LOADS) for (const m of W.MACHINES) for (const point of POINTS) {
  const input = { textile: t.id, colour: c.id, soil: soil.id, load: load.id, machine: m.id, point };
  runs.push({ input, r: W.advise(input), t, c, m });
}
const label = ({ input }) => JSON.stringify(input);

test('covers every combination', () => {
  assert.equal(runs.length, TEXTILES.length * COLOURS.length * 3 * 3 * W.MACHINES.length * POINTS.length);
});

test('weights sum to 1 and the centre is balanced', () => {
  for (const p of POINTS) {
    const w = W.weightsFromPoint(p);
    assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  }
  const centre = W.weightsFromPoint({ x: 0, y: 0 });
  for (const w of centre) assert.ok(Math.abs(w - 1 / W.METRICS.length) < 1e-9);
  const top = W.weightsFromPoint(corners[0]);
  assert.ok(top[0] > 0.7, 'a corner dominates');
});

test('points outside the pad are pulled back to its edge', () => {
  const p = W.clampToPolygon({ x: 3, y: 0 });
  assert.ok(Math.hypot(p.x, p.y) <= 1 + 1e-9);
  assert.deepEqual(W.clampToPolygon({ x: 0.1, y: 0.1 }), { x: 0.1, y: 0.1 });
});

test('temperature never exceeds the fabric, colour or programme limit', () => {
  for (const run of runs) {
    const { r, t, c } = run;
    if (r.temp === null) {
      assert.equal(r.programme.id, 'eco', label(run));
      assert.ok(Math.min(t.maxTemp, c.cap) >= 40, `ECO needs a 40 °C fabric: ${label(run)}`);
      continue;
    }
    assert.ok(r.temp <= t.maxTemp && r.temp <= c.cap, label(run));
    assert.ok(W.PROGRAMMES[r.programme.id].temps.includes(r.temp), label(run));
  }
});

test('the programme exists on the chosen machine and suits the fabric', () => {
  for (const run of runs) {
    const { r, t, m } = run;
    assert.ok(m.programmes.includes(r.programme.id), label(run));
    assert.ok(W.FIT[t.id][r.programme.id], `${r.programme.id} for ${t.id}`);
  }
});

test('wool, cashmere and silk never get Cottons, QuickPowerWash, Express 20 or ECO', () => {
  for (const run of runs) {
    if (!ANIMAL.has(run.t.id)) continue;
    assert.ok(['woollens', 'silks'].includes(run.r.programme.id), label(run));
  }
});

test('spin stays within programme, fabric and machine limits', () => {
  for (const run of runs) {
    const { r, t, m } = run;
    const p = W.PROGRAMMES[r.programme.id];
    assert.ok(r.spin <= m.spinSteps[0], label(run));
    if (p.maxSpin !== 'max') assert.ok(r.spin <= p.maxSpin, label(run));
    if (W.SPIN_CAP[t.id]) assert.ok(r.spin <= W.SPIN_CAP[t.id], label(run));
    assert.ok(m.spinSteps.includes(r.spin), label(run));
  }
});

test('the load fits the programme, or the oracle says to split it', () => {
  for (const run of runs) {
    const { r, input } = run;
    const p = W.PROGRAMMES[r.programme.id];
    const max = p.maxLoad === 'drum' ? run.m.drumKg : p.maxLoad;
    if (r.load.kg > max) assert.ok(r.warnings.some((w) => /Split this load/.test(w)), label(run));
    if (r.programme.id === 'express20') {
      assert.equal(input.load, 'small', label(run));
      assert.notEqual(input.soil, 'heavy', label(run));
    }
  }
});

test('extras are ones the programme and machine offer', () => {
  for (const run of runs) {
    const { r, m } = run;
    const p = W.PROGRAMMES[r.programme.id];
    for (const e of r.extras) {
      if (e.auto) assert.ok((p.autoExtras || []).includes(e.id), label(run));
      else {
        assert.ok(p.extras.includes(e.id), `${e.id} not in ${r.programme.id}: ${label(run)}`);
        assert.ok(m.extras.includes(e.id), `${e.id} not on machine ${m.id}`);
      }
    }
    if (['eco', 'woollens', 'silks'].includes(r.programme.id)) assert.equal(r.extras.length, 0, label(run));
  }
});

test('TwinDos and CapDosing advice only where the machine has them', () => {
  for (const run of runs) {
    const { r, m } = run;
    if (/TwinDos/.test(r.detergent.name)) assert.ok(m.twinDos, label(run));
    if (/cap$/i.test(r.detergent.name)) assert.ok(m.capDosing > 0, label(run));
    for (const x of r.detergent.extra) if (/cap/i.test(x.name)) assert.ok(m.capDosing > 0, label(run));
  }
});

test('every reading is complete', () => {
  for (const run of runs) {
    const { r } = run;
    const text = JSON.stringify({ v: r.verdict, o: r.omen, s: r.steps, t: r.tips, d: r.detergent, a: r.alternatives, w: r.warnings });
    assert.ok(!/undefined|NaN|null\b/.test(text.replace(/"temp":null/g, '')), label(run));
    assert.ok(r.steps.length >= 3, label(run));
    assert.ok(r.use.minutes > 0 && r.use.kwh > 0 && r.use.litres > 0, label(run));
    for (const k of W.METRICS) assert.ok(r.metrics[k.id] >= 0 && r.metrics[k.id] <= 1, label(run));
  }
});

test('the defaults give an everyday cottons answer', () => {
  const r = W.advise({});
  assert.ok(['eco', 'cottons'].includes(r.programme.id), r.summary);
  assert.ok(r.temp === null || r.temp === 40, r.summary);
});

test('the Sustainable corner on a full drum of cottons picks ECO 40-60 or a cool wash', () => {
  for (const m of W.MACHINES) {
    const r = W.advise({ point: corner('sustainable'), load: 'full', machine: m.id });
    assert.ok(r.programme.id === 'eco' || (r.programme.id === 'cottons' && r.temp <= 30), `${m.id}: ${r.summary}`);
  }
});

test('the Hygiene corner on white cotton washes at 60 °C or hotter', () => {
  for (const m of W.MACHINES) {
    const r = W.advise({ point: corner('hygiene'), colour: 'white', machine: m.id });
    assert.ok(r.temp >= 60, `${m.id}: ${r.summary}`);
  }
});

test('the Quick corner on a small, lightly soiled cotton load picks Express 20', () => {
  for (const m of W.MACHINES) {
    const r = W.advise({ point: corner('quick'), load: 'small', soil: 'light', machine: m.id });
    assert.equal(r.programme.id, 'express20', `${m.id}: ${r.summary}`);
  }
});
