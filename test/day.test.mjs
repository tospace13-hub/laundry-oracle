// Laundry Day: sorting, labels, stain timing, microfibre, water and the whole-day plan.
// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { forecast } from './fixtures.mjs';

const require = createRequire(import.meta.url);
const D = require('../day/day.js');
const W = require('../when/when.js');

const piece = (type, colour, count = 1, extra = {}) => ({ id: `${type}-${colour}-${Math.random()}`, type, colour, count, stain: null, label: null, ...extra });
const groupsIn = (load) => new Set(load.items.map((i) => i.entry.colour));
const DARK = new Set(['dark']);
const WHITE = new Set(['white', 'light']);

const bell = (h, p, f = 8, t = 18) => (h <= f || h >= t ? 0 : p * Math.sin((Math.PI * (h - f)) / (t - f)));
const sunny = (d, h) => ({
  temperature_2m: 20, relative_humidity_2m: 55, precipitation_probability: 0, precipitation: 0, cloud_cover: 10,
  wind_speed_10m: 4, global_tilted_irradiance: bell(h, 750), et0_fao_evapotranspiration: bell(h, 0.4), vapour_pressure_deficit: 1, is_day: h >= 8 && h < 19 ? 1 : 0,
});
const fc = () => W.parseForecast(forecast('2026-10-05', sunny));

test('whites and darks never share a load', () => {
  const basket = [piece('tshirt', 'white', 3), piece('tshirt', 'dark', 1), piece('underwear', 'light', 2), piece('jeans', 'dark', 1), piece('sport', 'dark', 1), piece('sport', 'white', 1)];
  for (const m of ['unknown', 'C']) {
    for (const l of D.sortBasket(basket, m).loads) {
      const colours = groupsIn(l);
      const hasWhite = [...colours].some((c) => WHITE.has(c));
      const hasDark = [...colours].some((c) => DARK.has(c));
      assert.ok(!(hasWhite && hasDark), `${l.name}: ${[...colours]}`);
    }
  }
});

test('wool, cashmere and silk only go in hand-wash loads', () => {
  const basket = [piece('jumper', 'dark'), piece('silk', 'bright'), piece('tshirt', 'bright', 4), piece('jeans', 'dark', 2)];
  const { loads } = D.sortBasket(basket, 'C');
  for (const l of loads) {
    const animal = l.items.some((i) => ['wool', 'silk', 'cashmere'].includes(i.garment.fabric));
    if (animal) assert.equal(l.cls, 'hand', l.name);
    if (l.cls === 'hand') assert.ok(['woollens', 'silks'].includes(D.planDay(basket, { machine: 'C' }).loads.find((x) => x.name === l.name).settings.programme.id));
  }
});

test('no load is heavier than its programme allows: big baskets split', () => {
  const basket = [piece('bedding', 'white', 6), piece('towel', 'white', 8), piece('jumper', 'dark', 7)];
  const { loads } = D.sortBasket(basket, 'unknown');
  for (const l of loads) assert.ok(l.kg <= l.maxKg + 1e-9, `${l.name} ${l.kg} > ${l.maxKg}`);
  assert.ok(loads.filter((l) => l.cls === 'hand').length >= 2, 'wool split over several hand washes');
  assert.ok(loads.some((l) => l.parts > 1), 'shows "1 of 2"');
});

test('a care label lowers the temperature and can keep a piece out of the machine', () => {
  const free = D.planDay([piece('towel', 'white', 4)], { machine: 'unknown' }).loads[0];
  assert.ok(free.settings.temp >= 60, free.settings.summary);
  const capped = D.planDay([piece('towel', 'white', 4, { label: { wash: '30' } })], { machine: 'unknown' }).loads[0];
  assert.ok(capped.settings.temp !== null && capped.settings.temp <= 30, capped.settings.summary);
  const r = D.planDay([piece('dress', 'dark', 1, { label: { wash: 'no' } }), piece('tshirt', 'bright', 2)], { machine: 'unknown' });
  assert.equal(r.outside.length, 1);
  assert.ok(r.loads.every((l) => l.items.every((i) => i.garment.id !== 'dress')));
});

test('stains the Stain Oracle sends to a professional stay out of the machine', () => {
  const r = D.planDay([piece('silk', 'bright', 1, { stain: 'curry' }), piece('tshirt', 'bright', 2)], { machine: 'C' });
  assert.equal(r.outside.length, 1, 'silk with curry goes to a dry cleaner');
  assert.match(r.outside[0].reason, /dry cleaner/);
  assert.ok(r.loads.every((l) => l.items.every((i) => i.garment.id !== 'silk')));
});

test('care-label symbols decode to the right limits', () => {
  const l = D.decodeLabel({ wash: '30-2', bleach: 'oxygen', tumble: 'no', iron: '1', pro: 'P' });
  assert.equal(l.maxTemp, 30);
  assert.equal(l.gentle, 2);
  assert.equal(l.bleach, 'oxygen');
  assert.equal(l.tumble, 'no');
  assert.ok(l.lines.length === 5);
  assert.equal(D.decodeLabel({ wash: 'hand' }).handWash, true);
  assert.equal(D.decodeLabel({ wash: 'no' }).noWash, true);
  for (const [k, states] of Object.entries(D.LABEL_STATES)) {
    for (const st of states) assert.ok(Array.isArray(D.decodeLabel({ [k]: st }).lines));
  }
});

test('stain pre-treatment time comes from the Stain Oracle’s own steps', () => {
  assert.ok(D.prepFor('cotton', 'white', 'blood').minutes >= 30, 'blood soaks 30 minutes');
  const coffee = D.prepFor('cotton', 'white', 'coffee').minutes;
  assert.ok(coffee >= 10 && coffee <= 30, `coffee ${coffee}`);
  assert.equal(D.waitOf('Soak 1 to 6 hours in water'), 60);
  assert.equal(D.waitOf('leave it 15 to 30 minutes'), 15);
  assert.equal(D.waitOf('Rinse with cool water.'), 0);
});

test('microfibre advice only for loads with synthetics, and a full cool wash sheds less', () => {
  const r = D.planDay([piece('tshirt', 'white', 4), piece('fleece', 'dark', 2), piece('jeans', 'dark', 1)], { machine: 'unknown' });
  for (const l of r.loads) {
    const synth = l.items.some((i) => ['polyester', 'nylon', 'acrylic', 'sportswear'].includes(i.garment.fabric));
    assert.equal(!!l.micro, synth, l.name);
  }
  const load = { kg: 4, maxKg: 4, items: [{ garment: { fabric: 'polyester', kg: 0.4 }, count: 10 }] };
  const cool = D.microfibre(load, { programme: { id: 'minimumIron' }, temp: 30, spin: 900 });
  const warm = D.microfibre({ ...load, kg: 1.6 }, { programme: { id: 'minimumIron' }, temp: 40, spin: 1200 });
  assert.ok(cool.score < warm.score);
});

test('the likely water company follows the nearest city', () => {
  assert.equal(D.waterCompany(51.985, 5.899).name, 'Vitens');
  assert.equal(D.waterCompany(51.922, 4.479).name, 'Evides');
  assert.equal(D.waterCompany(50.851, 5.691).name, 'WML');
  assert.equal(D.waterCompany(52.373, 4.893).name, 'Waternet');
  for (const c of W.CITIES) assert.ok(D.COMPANIES[D.waterCompany(c.lat, c.lon).name], c.name);
});

test('the dose follows water hardness', () => {
  const s = { detergent: { name: 'Liquid colour detergent' } };
  assert.match(D.doseLine(s, 'soft', 'normal', 'full'), /lowest/);
  assert.match(D.doseLine(s, 'hard', 'normal', 'full'), /highest/);
  assert.match(D.doseLine({ detergent: { name: 'TwinDos Colours' } }, 'hard', 'normal', 'full'), /III/);
});

test('machine care reminders count days since last done', () => {
  const care = D.machineCare({ hot: '2026-09-01', seal: '2026-10-09' }, '2026-10-11');
  const hot = care.find((c) => c.id === 'hot');
  assert.equal(hot.days, 40);
  assert.equal(hot.due, true);
  assert.equal(care.find((c) => c.id === 'seal').due, false);
  assert.equal(care.find((c) => c.id === 'filter').days, null);
});

test('the whole day: loads never overlap, prep fits, and everything gets a time', () => {
  const when = { home: { weekday: Array(24).fill(true), weekend: Array(24).fill(true) }, solar: { on: true, panels: 10, facing: 'S' } };
  const basket = [...D.EXAMPLE_BASKET, piece('shirt', 'white', 1, { stain: 'blood' })];
  const r = D.planDay(basket, { machine: 'C', when }, fc(), 0);
  const timed = r.loads.filter((l) => l.timing);
  assert.equal(timed.length, r.loads.length, 'every load has a slot');
  const sorted = timed.map((l) => l.timing).sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].start >= sorted[i - 1].end, 'no overlap');
  for (const l of timed) {
    assert.equal(l.timing.end - l.timing.start, l.settings.use.minutes);
    if (l.prep.minutes) assert.equal(l.timing.loadAt - l.timing.prepAt, l.prep.minutes);
    if (l.cls === 'hand') assert.notEqual(l.timing.drying.method, 'outside', 'wool dries flat inside');
  }
  assert.ok(r.days.some((d) => d.used));
});
