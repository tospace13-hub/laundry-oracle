// When to Wash: planner, forecast parser and map checks on synthetic Open-Meteo forecasts.
// Run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const W = require('../when/when.js');
const MAP = require('../when/nl-map.js');

// Build a 7-day forecast in Open-Meteo's response format. `day(d, h)` returns the hour's weather.
export function forecast(start, day) {
  const time = [];
  const keys = ['temperature_2m', 'relative_humidity_2m', 'precipitation_probability', 'precipitation', 'cloud_cover',
    'wind_speed_10m', 'global_tilted_irradiance', 'et0_fao_evapotranspiration', 'vapour_pressure_deficit', 'is_day'];
  const hourly = Object.fromEntries(keys.map((k) => [k, []]));
  const daily = { time: [], sunrise: [], sunset: [] };
  const base = new Date(`${start}T12:00:00Z`);
  for (let d = 0; d < 7; d++) {
    const date = new Date(base.getTime() + d * 86400000).toISOString().slice(0, 10);
    daily.time.push(date);
    daily.sunrise.push(`${date}T07:30`);
    daily.sunset.push(`${date}T19:00`);
    for (let h = 0; h < 24; h++) {
      time.push(`${date}T${String(h).padStart(2, '0')}:00`);
      const w = day(d, h);
      for (const k of keys) hourly[k].push(w[k] === undefined ? null : w[k]);
    }
  }
  return { latitude: 51.98, longitude: 5.9, timezone: 'Europe/Amsterdam', hourly: { time, ...hourly }, daily };
}

const bell = (h, peak, from = 8, to = 18) => (h <= from || h >= to ? 0 : peak * Math.sin((Math.PI * (h - from)) / (to - from)));
const sunny = (d, h) => ({
  temperature_2m: 20, relative_humidity_2m: 55, precipitation_probability: 0, precipitation: 0, cloud_cover: 10,
  wind_speed_10m: 4, global_tilted_irradiance: bell(h, 750), et0_fao_evapotranspiration: bell(h, 0.4), vapour_pressure_deficit: 1, is_day: h >= 8 && h < 19 ? 1 : 0,
});
const grey = (d, h) => ({
  temperature_2m: 11, relative_humidity_2m: 92, precipitation_probability: 30, precipitation: 0, cloud_cover: 95,
  wind_speed_10m: 2, global_tilted_irradiance: bell(h, 120), et0_fao_evapotranspiration: bell(h, 0.04), vapour_pressure_deficit: 0.1, is_day: h >= 8 && h < 19 ? 1 : 0,
});
const rainyAfternoons = (d, h) => ({ ...sunny(d, h), precipitation_probability: h >= 12 ? 85 : 5, precipitation: h >= 12 ? 1.2 : 0, cloud_cover: h >= 12 ? 100 : 20 });

// 2026-10-05 is a Monday.
const START = '2026-10-05';
const fc = (fn) => W.parseForecast(forecast(START, fn));

const everyLoad = (p, fn) => p.loads.forEach((l) => fn(l));
const minOfDay = (m) => ((m % 1440) + 1440) % 1440;

test('parser reads Open-Meteo hours and days, and copes with missing values', () => {
  const f = fc(sunny);
  assert.equal(f.hours.length, 7 * 24);
  assert.equal(f.days.length, 7);
  assert.equal(f.hours[0].dow, 1, 'Monday');
  assert.equal(f.days[0].sunset, 19 * 60);
  const holes = W.parseForecast(forecast(START, (d, h) => ({ ...sunny(d, h), global_tilted_irradiance: undefined, et0_fao_evapotranspiration: undefined })));
  assert.ok(holes.hours.every((h) => h.gti === 0 && h.et0 === 0));
  assert.throws(() => W.parseForecast({}), /no hourly/);
});

test('a repeated hour when the clocks go back keeps every day at 24 hours', () => {
  const json = forecast(START, sunny);
  // Insert a second 02:00 on day 3, as Open-Meteo's local time does on the last Sunday of October.
  const i = json.hourly.time.indexOf('2026-10-08T02:00');
  for (const k of Object.keys(json.hourly)) json.hourly[k].splice(i, 0, json.hourly[k][i]);
  const f = W.parseForecast(json);
  assert.equal(f.hours.length, 7 * 24);
  assert.equal(f.hours[3 * 24 + 13].hour, 13);
  assert.equal(f.hours[3 * 24 + 13].date, '2026-10-08');
});

test('forecast URL asks Open-Meteo for the right place, panels and time zone', () => {
  const url = W.forecastUrl(51.985, 5.899, 'SW');
  assert.match(url, /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
  assert.match(url, /latitude=51\.98&longitude=5\.90/);
  assert.match(url, /azimuth=45/);
  assert.match(url, /timezone=Europe%2FAmsterdam/);
  assert.match(url, /et0_fao_evapotranspiration/);
});

test('Arnhem is the default and its own nearest city; the map projection round-trips', () => {
  assert.equal(W.nearestCity(W.DEFAULTS.lat, W.DEFAULTS.lon).city.name, 'Arnhem');
  assert.equal(W.nearestCity(52.37, 4.9).city.name, 'Amsterdam');
  for (const c of W.CITIES) {
    const p = MAP.project(c.lat, c.lon);
    assert.ok(p.x > 0 && p.x < MAP.width && p.y > 0 && p.y < MAP.height, `${c.name} on the map`);
    const back = MAP.unproject(p.x, p.y);
    assert.ok(Math.abs(back.lat - c.lat) < 1e-6 && Math.abs(back.lon - c.lon) < 1e-6);
  }
  assert.ok(MAP.nl.length > 1000 && MAP.lakes.length > 100);
});

test('suggested loads grow with the household', () => {
  assert.equal(W.suggestedLoadsPerWeek(1), 2);
  assert.equal(W.suggestedLoadsPerWeek(2), 4);
  assert.ok(W.suggestedLoadsPerWeek(7) >= 11);
});

test('every load can be loaded and unloaded by someone at home', () => {
  for (const f of [fc(sunny), fc(grey), fc(rainyAfternoons)]) {
    const p = W.plan({}, f, 6 * 60);
    assert.ok(p.loads.length > 0);
    everyLoad(p, (l) => {
      assert.ok(l.unloadLabel, 'has an unload time');
      assert.ok(l.delayMin >= 0 && l.delayMin <= W.DELAY_MAX_MIN);
      assert.ok(l.end - l.start === p.input.programme.minutes);
    });
  }
});

test('no load runs during quiet hours', () => {
  const p = W.plan({ quiet: true, loads: { per: 'day', count: 2 } }, fc(sunny), 0);
  everyLoad(p, (l) => {
    for (let m = l.start; m < l.end; m += 15) {
      const h = Math.floor(minOfDay(m) / 60);
      assert.ok(!(h >= 22 || h < 7), `${l.startLabel}–${l.endLabel} on day ${l.dayIndex}`);
    }
  });
});

test('"done when I get home" finishes within an hour before arrival on away days', () => {
  const p = W.plan({ doneWhenHome: true, solar: { on: true } }, fc(sunny), 0);
  everyLoad(p, (l) => {
    const weekend = W.isWeekend(l.dow);
    const end = minOfDay(l.end);
    const homeAtEnd = (weekend ? p.input.home.weekend : p.input.home.weekday)[Math.floor(end / 60)];
    if (!homeAtEnd) assert.ok(end <= 17 * 60 && end >= 16 * 60, `ends ${l.endLabel}`);
  });
});

test('five kids: two loads every day, never overlapping', () => {
  const p = W.plan({ people: 7, loads: { per: 'day', count: 2 } }, fc(sunny), 0);
  const byDay = {};
  everyLoad(p, (l) => { byDay[l.dayIndex] = (byDay[l.dayIndex] || 0) + 1; });
  for (let d = 0; d < 7; d++) assert.equal(byDay[d], 2, `day ${d}`);
  const sorted = p.loads.slice().sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].start >= sorted[i - 1].end, 'no overlap');
});

test('rain means no drying outside', () => {
  const p = W.plan({ loads: { per: 'day', count: 1 } }, fc(rainyAfternoons), 0);
  everyLoad(p, (l) => {
    if (l.drying.method === 'outside') {
      assert.ok(minOfDay(l.drying.dryBy) <= 12 * 60, `dry before the afternoon rain, got ${l.drying.dryByLabel}`);
    }
  });
  const g = W.plan({}, fc(grey), 0);
  everyLoad(g, (l) => assert.notEqual(l.drying.method, 'outside'));
  assert.ok(g.days.every((d) => d.verdict === 'indoor'));
});

test('with solar on, a sunny day puts the wash around midday; with solar off the solar score is ignored', () => {
  const on = W.plan({ solar: { on: true, panels: 10 }, home: { weekday: Array(24).fill(true), weekend: Array(24).fill(true) }, loads: { per: 'day', count: 1 } }, fc(sunny), 0);
  everyLoad(on, (l) => {
    const s = minOfDay(l.start);
    assert.ok(s >= 9 * 60 && s <= 14 * 60, `starts ${l.startLabel}`);
    assert.ok(l.solarShare > 0.8, `solar ${l.solarShare}`);
  });
  const off = W.plan({}, fc(sunny), 0);
  assert.equal(off.weights.solar, undefined);
});

test('double meter with quiet hours: off-peak washes stay outside quiet hours', () => {
  const p = W.plan({ dal: true, quiet: true, drying: { line: false }, home: { weekday: Array(24).fill(true), weekend: Array(24).fill(true) }, loads: { per: 'day', count: 1 } }, fc(grey), 0);
  everyLoad(p, (l) => {
    for (let m = l.start; m < l.end; m += 15) {
      const h = Math.floor(minOfDay(m) / 60);
      assert.ok(!(h >= 22 || h < 7));
    }
    if (!W.isWeekend(l.dow)) assert.ok(l.offPeakShare === 0 || minOfDay(l.end) <= 22 * 60);
  });
});

test('without weather the household side still plans', () => {
  const p = W.plan({}, W.blankForecast(START), 0);
  assert.equal(p.weather, false);
  assert.ok(p.loads.length > 0);
  assert.equal(p.weights.drying, undefined);
  everyLoad(p, (l) => assert.ok(['inside', 'dryer'].includes(l.drying.method)));
});

test('nobody ever home: nothing fits and the plan says why', () => {
  const p = W.plan({ home: { weekday: Array(24).fill(false), weekend: Array(24).fill(false) } }, fc(sunny), 0);
  assert.equal(p.loads.length, 0);
  assert.ok(p.warnings.some((w) => /Nothing fits/.test(w.text)));
});
