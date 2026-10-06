// Safety invariants for every textile × colour × stain combination.
// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { TEXTILES, COLOURS, STAINS, consult, toText } = require('../oracle.js');

const ANIMAL = new Set(['wool', 'silk', 'cashmere']);
const PROTEIN = new Set(['blood', 'sweat', 'egg']);

const combos = [];
for (const t of TEXTILES) for (const c of COLOURS) for (const s of STAINS) combos.push([t, c, s]);

const stepText = (r) => r.steps.map((x) => x.text).join('\n');
const label = (t, c, s) => `${s.id} on ${c.id} ${t.id}`;

test('covers every combination', () => {
  assert.equal(combos.length, TEXTILES.length * COLOURS.length * STAINS.length);
  assert.ok(combos.length >= 13 * 5 * 21);
});

test('chlorine bleach only on white cotton or linen', () => {
  for (const [t, c, s] of combos) {
    const r = consult(t.id, c.id, s.id);
    const mentionsChlorine = /chlorine bleach per|soak .*chlorine/i.test(stepText(r));
    const allowed = c.id === 'white' && (t.id === 'cotton' || t.id === 'linen');
    if (!allowed) assert.ok(!mentionsChlorine, label(t, c, s));
    if (!allowed) assert.notEqual(r.care.bleach, 'any', label(t, c, s));
  }
});

test('no enzymes, oxygen bleach or peroxide on wool, silk or cashmere', () => {
  for (const [t, c, s] of combos) {
    if (!ANIMAL.has(t.id)) continue;
    const r = consult(t.id, c.id, s.id);
    const text = stepText(r);
    assert.ok(!/enzyme|bio\)/i.test(text), `enzymes: ${label(t, c, s)}`);
    assert.ok(!/oxygen bleach|peroxide|percarbonate/i.test(text), `oxygen: ${label(t, c, s)}`);
    assert.ok(!/baking soda/i.test(text), `alkali: ${label(t, c, s)}`);
    assert.equal(r.care.bleach, 'none', label(t, c, s));
  }
});

test('no acetone on acetate or acrylic', () => {
  for (const [t, c, s] of combos) {
    if (t.id !== 'acetate' && t.id !== 'acrylic') continue;
    const r = consult(t.id, c.id, s.id);
    assert.ok(!/dab the back with acetone/i.test(stepText(r)), label(t, c, s));
  }
});

test('no hot water for protein stains', () => {
  for (const [t, c, s] of combos) {
    if (!PROTEIN.has(s.id)) continue;
    const r = consult(t.id, c.id, s.id);
    const text = [...r.firstAid, stepText(r)].join('\n');
    assert.ok(!/boil|hot water|warm water/i.test(text.replace(/away from warm water/i, '')), label(t, c, s));
    assert.ok(r.temps.wash <= 40, label(t, c, s));
  }
});

test('boiling-water pour only on white cotton or linen', () => {
  for (const [t, c, s] of combos) {
    const r = consult(t.id, c.id, s.id);
    if (/just-boiled/.test(stepText(r))) {
      assert.ok(c.id === 'white' && (t.id === 'cotton' || t.id === 'linen'), label(t, c, s));
    }
  }
});

test('every water temperature stays within the fibre and colour limits', () => {
  for (const [t, c, s] of combos) {
    const r = consult(t.id, c.id, s.id);
    const cap = Math.min(t.maxTemp, c.cap);
    assert.ok(r.temps.wash <= cap, label(t, c, s));
    assert.ok(r.temps.soak <= cap, label(t, c, s));
    for (const step of r.steps) {
      if (step.id === 'iron') continue; // iron sole-plate temperatures, not water
      for (const m of step.text.matchAll(/(\d+) °C/g)) {
        assert.ok(Number(m[1]) <= cap, `${m[0]} > ${cap} in ${label(t, c, s)}`);
      }
    }
  }
});

test('no bleach at all on dark colours', () => {
  for (const [t, c, s] of combos) {
    if (c.id !== 'dark') continue;
    const r = consult(t.id, c.id, s.id);
    assert.ok(!/oxygen bleach \(|peroxide|chlorine bleach per/i.test(stepText(r)), label(t, c, s));
    assert.equal(r.care.bleach, 'none', label(t, c, s));
  }
});

test('turmeric never meets baking soda, rust never meets chlorine', () => {
  for (const [t, c] of combos.map(([t, c]) => [t, c])) {
    assert.ok(!/baking soda/i.test(stepText(consult(t.id, c.id, 'curry'))));
    assert.ok(!/chlorine/i.test(stepText(consult(t.id, c.id, 'rust'))));
  }
});

test('nail polish on acetate goes to a professional', () => {
  for (const c of COLOURS) {
    const r = consult('acetate', c.id, 'polish');
    assert.equal(r.difficulty, 4);
    assert.ok(r.care.professional);
  }
});

test('every reading is complete and has no unfilled text', () => {
  for (const [t, c, s] of combos) {
    const r = consult(t.id, c.id, s.id);
    assert.ok(r.steps.length >= 2, `steps: ${label(t, c, s)}`);
    assert.ok(r.firstAid.length >= 1, `first aid: ${label(t, c, s)}`);
    assert.ok(r.never.length >= 2, `never: ${label(t, c, s)}`);
    assert.ok(r.kit.length >= 1, `kit: ${label(t, c, s)}`);
    assert.ok(r.difficulty >= 1 && r.difficulty <= 4, `difficulty: ${label(t, c, s)}`);
    const all = toText(r);
    assert.ok(!/undefined|null|NaN|\{\w+\}/.test(all), `unfilled text in ${label(t, c, s)}`);
    for (const step of r.steps) assert.ok(step.text.trim().length > 10, `empty step in ${label(t, c, s)}`);
  }
});
