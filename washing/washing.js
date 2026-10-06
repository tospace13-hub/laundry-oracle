/*
 * Washing Oracle: knowledge base and rule engine.
 *
 * No DOM in here, so it runs in the browser (window.WashingOracle) and in Node (module.exports).
 * Fabrics and colours come from the Stain Oracle (../oracle.js) so both oracles speak the same language.
 *
 * Programme limits, consumption figures, options and symbols come from Miele en-GB operating
 * instructions (WCI 860, WSA123, WEB365, WEG885). Values marked approx: true are interpolated
 * or taken from product sheets rather than a manual page.
 *
 * advise() turns the user's priorities (a point on the balance pad) and their load into
 * candidate settings, scores every candidate on six metrics, and returns the best one plus
 * two alternatives that trade differently.
 */
(function (root) {
  'use strict';

  const stain = typeof module !== 'undefined' && module.exports ? require('../oracle.js') : root.LaundryOracle;
  const T = Object.fromEntries(stain.TEXTILES.map((t) => [t.id, t]));
  const C = Object.fromEntries(stain.COLOURS.map((c) => [c.id, c]));

  // ---- Priorities: one corner of the balance pad each. Opposites face each other. ----
  const METRICS = [
    { id: 'quick', name: 'Quick', omen: 'Fast, and still clean enough.' },
    { id: 'clean', name: 'Clean', omen: 'Every trace of the day comes out.' },
    { id: 'hygiene', name: 'Hygiene', omen: 'Hot enough to deal with germs and allergens.' },
    { id: 'sustainable', name: 'Sustainable', omen: 'Least energy and water for a clean wash.' },
    { id: 'gentle', name: 'Gentle', hint: 'make it last', omen: 'Kind to the fibres, so the clothes last longer.' },
    { id: 'creases', name: 'Fewer creases', omen: 'Less ironing afterwards.' },
  ];

  // Corners of a regular polygon with radius 1, first corner at the top.
  function corners(n) {
    return Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return { x: Math.cos(a), y: Math.sin(a) };
    });
  }

  // Gaussian closeness to each corner, normalised. The centre weighs all metrics equally.
  const SIGMA = 0.5;
  function weightsFromPoint(point, n = METRICS.length) {
    const raw = corners(n).map((v) => Math.exp(-((point.x - v.x) ** 2 + (point.y - v.y) ** 2) / (2 * SIGMA * SIGMA)));
    const sum = raw.reduce((a, b) => a + b, 0);
    return raw.map((r) => r / sum);
  }

  // Keep a point inside the polygon: unchanged if inside, else the nearest point on its edge.
  function clampToPolygon(point, n = METRICS.length) {
    const v = corners(n);
    const inside = v.every((a, i) => {
      const b = v[(i + 1) % n];
      return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) >= 0;
    });
    if (inside) return { x: point.x, y: point.y };
    let best = null;
    let bestD = Infinity;
    v.forEach((a, i) => {
      const b = v[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
      const p = { x: a.x + t * dx, y: a.y + t * dy };
      const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    });
    return best;
  }

  // ---- Machines, grouped by what the control panel looks like ----
  const ALL_EXTRAS = ['short', 'waterPlus', 'prewash', 'soak', 'intensive', 'allergo', 'preIroning'];
  const MACHINES = [
    {
      id: 'unknown', panel: 'generic', name: 'Not sure',
      label: 'Not sure: general Miele W1 advice',
      looks: 'The oracle sticks to programmes every Miele W1 has.',
      models: '', drumKg: 8, spinSteps: [1400, 1200, 900, 600],
      programmes: ['eco', 'cottons', 'minimumIron', 'delicates', 'woollens', 'express20'],
      extras: ['short', 'waterPlus'], twinDos: false, capDosing: 0, singleWash: false, approx: false,
    },
    {
      id: 'A', panel: 'A', name: 'Dial + small digit display',
      label: 'Dial + small digit display, one button steps through temperature and spin',
      looks: 'Temperatures (90 to Cold) and spin speeds are printed in two columns. You touch a thermometer or spiral button to step down them.',
      models: 'WSA, WEA, WCA Active', drumKg: 8, spinSteps: [1400, 1200, 900, 600],
      programmes: ['eco', 'cottons', 'minimumIron', 'delicates', 'woollens', 'express20', 'dark'],
      extras: ['short', 'waterPlus', 'soak'], twinDos: false, capDosing: 1, singleWash: false, approx: false,
    },
    {
      id: 'B', panel: 'B', name: 'Dial + digit display, values to touch',
      label: 'Dial + digit display, every temperature and spin printed to touch',
      looks: 'Each temperature and spin speed has its own touch spot. Extras like "Short" and "Water +" are printed as words.',
      models: 'WEB, WED, WEK, WWB/WWD/WWE 380', drumKg: 8, spinSteps: [1400, 1200, 900, 600],
      programmes: ['eco', 'cottons', 'minimumIron', 'delicates', 'woollens', 'express20', 'quickPowerWash', 'shirts', 'dark'],
      extras: ['short', 'waterPlus', 'prewash'], twinDos: false, capDosing: 3, singleWash: false, approx: false,
    },
    {
      id: 'Btd', panel: 'B', name: 'Digit display with TwinDos',
      label: 'Same touch panel with TwinDos and steam',
      looks: 'Like the panel above, plus "TwinDos Whites" and "TwinDos Colours" touch spots and a Pre-ironing option.',
      models: 'WEG, WEE', drumKg: 9, spinSteps: [1600, 1400, 1200, 900, 600],
      programmes: ['eco', 'cottons', 'minimumIron', 'delicates', 'woollens', 'express20', 'quickPowerWash', 'shirts', 'dark'],
      extras: ['short', 'waterPlus', 'prewash', 'preIroning'], twinDos: true, capDosing: 3, singleWash: false, approx: true,
    },
    {
      id: 'C', panel: 'C', name: 'Dial + one line of text',
      label: 'Dial + one line of text with ∧ ∨ arrows and OK',
      looks: 'A single line of text such as "60°C 1600 2:59", arrow buttons and OK, with sensors for SingleWash, Water +, Extras and TwinDos.',
      models: 'WCI/WCG 860/360, WWG/WWE 360, WWH/WWI 860', drumKg: 9, spinSteps: [1600, 1400, 1200, 900, 600],
      programmes: ['eco', 'cottons', 'minimumIron', 'delicates', 'woollens', 'silks', 'shirts', 'quickPowerWash', 'express20', 'dark', 'sportswear', 'automaticPlus'],
      extras: ALL_EXTRAS, twinDos: true, capDosing: 1, singleWash: true, approx: false,
    },
    {
      id: 'D', panel: 'D', name: 'Colour touchscreen (M Touch)',
      label: 'Colour touchscreen, no dial (M Touch)',
      looks: 'No programme dial. You tap and swipe through programmes on a colour screen.',
      models: 'WWV 980, WCR/WWR 860, WER 865', drumKg: 9, spinSteps: [1600, 1400, 1200, 900, 600],
      programmes: ['eco', 'cottons', 'minimumIron', 'delicates', 'woollens', 'silks', 'shirts', 'quickPowerWash', 'express20', 'dark', 'sportswear', 'automaticPlus'],
      extras: ALL_EXTRAS, twinDos: true, capDosing: 1, singleWash: true, approx: true,
    },
    {
      id: 'W2', panel: 'D', name: 'W2 Nova Edition',
      label: 'Large black glass screen that wakes as you approach (W2)',
      looks: 'A big black glass front that lights up as you walk up, with a motorised door.',
      models: 'WQ 1000, WQ 1200', drumKg: 9, spinSteps: [1600, 1400, 1200, 900, 600],
      programmes: ['eco', 'cottons', 'minimumIron', 'delicates', 'woollens', 'silks', 'shirts', 'quickPowerWash', 'express20', 'dark', 'sportswear', 'automaticPlus'],
      extras: ALL_EXTRAS, twinDos: true, capDosing: 1, singleWash: true, approx: true,
    },
  ];

  // ---- Extras, named exactly as printed on Miele panels ----
  const EXTRAS = {
    short: { name: 'Short', icon: 'short', soil: 'light', minutes: 0.75, kwh: 0.95, water: 1, clean: -0.08, gentle: 0.05, hygiene: 0, creases: 0, why: 'shortens the wash for lightly soiled laundry' },
    waterPlus: { name: 'Water +', icon: 'waterPlus', when: ['hygiene', 'gentle'], minutes: 1.05, kwh: 1.02, water: 1.15, clean: 0.03, gentle: 0.05, hygiene: 0.05, creases: 0.03, why: 'more water, so detergent rinses out better' },
    prewash: { name: 'Pre-wash', icon: 'prewash', soil: 'heavy', addMinutes: 20, addKwh: 0.1, addWater: 15, clean: 0.12, gentle: -0.03, hygiene: 0, creases: 0, why: 'loosens dust, sand and heavy dirt first' },
    soak: { name: 'Soak', icon: 'soak', soil: 'heavy', addMinutes: 30, clean: 0.08, gentle: 0, hygiene: 0, creases: 0, why: 'soaks protein stains like sweat and food before the wash' },
    intensive: { name: 'Intensive', icon: 'intensive', soil: 'heavy', addMinutes: 15, addKwh: 0.05, clean: 0.12, gentle: -0.1, hygiene: 0, creases: -0.03, why: 'more drum action for heavy soiling' },
    allergo: { name: 'AllergoWash', icon: 'allergo', when: ['hygiene'], addMinutes: 20, addKwh: 0.1, addWater: 10, clean: 0.02, gentle: -0.03, hygiene: 0.35, creases: 0, why: 'holds the temperature longer and rinses more, for allergies' },
    preIroning: { name: 'Pre-ironing', icon: 'preIroning', when: ['creases'], addMinutes: 10, clean: 0, gentle: 0, hygiene: 0, creases: 0.3, why: 'smooths the laundry at the end, so it needs less ironing' },
  };

  // ---- Programmes. data[temp] = [kWh, litres, minutes, approx] at the programme's reference load. ----
  const PROGRAMMES = {
    eco: {
      name: 'ECO 40-60', icon: 'eco', temps: null, maxLoad: 'drum', maxSpin: 'max', action: 0.7, clean: 0.7, crease: 0,
      extras: [], twinDos: true,
      eco: { small: [0.18, 28.5, 149], half: [0.32, 53, 168], full: [0.61, 62, 219] },
      note: 'For normally soiled cottons labelled 40 °C or 60 °C, washed together. You cannot set a temperature: it saves energy by washing longer.',
    },
    cottons: {
      name: 'Cottons', icon: 'cottons', temps: [0, 20, 30, 40, 60, 90], maxLoad: 'drum', maxSpin: 'max', action: 0.8, clean: 0.75, crease: 0,
      extras: ALL_EXTRAS, twinDos: true, scales: true,
      data: { 0: [0.25, 66, 189, 1], 20: [0.42, 66, 189], 30: [0.8, 65, 159, 1], 40: [1.2, 65, 159], 60: [1.65, 60, 179], 90: [2.6, 65, 149] },
    },
    minimumIron: {
      name: 'Minimum iron', icon: 'minimumIron', temps: [0, 20, 30, 40, 60], maxLoad: 4, maxSpin: 1200, action: 0.5, clean: 0.6, crease: 0.3,
      extras: ALL_EXTRAS, twinDos: true, scales: true,
      data: { 0: [0.15, 58, 149, 1], 20: [0.25, 58, 149, 1], 30: [0.36, 58, 149], 40: [0.55, 58, 149, 1], 60: [0.95, 58, 149, 1] },
    },
    delicates: {
      name: 'Delicates', icon: 'delicates', temps: [0, 20, 30, 40], maxLoad: 3, maxSpin: 900, action: 0.25, clean: 0.45, crease: 0.25,
      extras: ['short', 'waterPlus', 'prewash', 'soak', 'allergo'], twinDos: true,
      data: { 0: [0.1, 40, 69, 1], 20: [0.15, 40, 69, 1], 30: [0.2, 40, 69], 40: [0.3, 40, 69, 1] },
    },
    woollens: {
      name: 'Woollens', icon: 'woollens', temps: [0, 20, 30, 40], maxLoad: 2, maxSpin: 1200, action: 0.15, clean: 0.35, crease: 0.2,
      extras: [], twinDos: false, cap: 'wool',
      data: { 0: [0.1, 35, 39, 1], 20: [0.17, 35, 39, 1], 30: [0.23, 35, 39], 40: [0.3, 35, 39, 1] },
    },
    silks: {
      name: 'Silks', icon: 'silks', temps: [0, 20, 30], maxLoad: 1, maxSpin: 600, action: 0.1, clean: 0.3, crease: 0.25,
      extras: [], twinDos: false, cap: 'silk',
      data: { 0: [0.08, 30, 41, 1], 20: [0.12, 30, 41, 1], 30: [0.15, 30, 41, 1] },
    },
    shirts: {
      name: 'Shirts', icon: 'shirts', temps: [0, 20, 30, 40, 60], maxLoad: 2, maxSpin: 900, action: 0.4, clean: 0.55, crease: 0.4,
      extras: ['waterPlus', 'prewash', 'soak'], autoExtras: ['preIroning'], twinDos: true,
      data: { 0: [0.2, 40, 91, 1], 20: [0.28, 40, 91, 1], 30: [0.35, 40, 91, 1], 40: [0.45, 40, 91, 1], 60: [0.66, 40, 91] },
      note: 'Made for shirts and blouses: Pre-ironing switches on automatically.',
    },
    quickPowerWash: {
      name: 'QuickPowerWash', icon: 'quickPowerWash', temps: [40, 60], maxLoad: 4, maxSpin: 'max', action: 0.8, clean: 0.75, crease: 0,
      extras: [], autoExtras: ['short'], twinDos: true,
      data: { 40: [0.58, 40, 49], 60: [1.0, 40, 59, 1] },
      note: 'Cleans lightly to normally soiled cottons in 49 minutes.',
    },
    express20: {
      name: 'Express 20', icon: 'express20', temps: [0, 20, 30, 40], maxLoad: 3.5, maxSpin: 1200, action: 0.5, clean: 0.45, crease: 0.05,
      extras: [], autoExtras: ['short'], twinDos: true,
      data: { 0: [0.12, 30, 20, 1], 20: [0.18, 30, 20, 1], 30: [0.23, 30, 20], 40: [0.33, 30, 20] },
      note: 'For a small load that has hardly been worn. 20 minutes, one rinse.',
    },
    dark: {
      name: 'Dark garments/Denim', icon: 'dark', temps: [0, 20, 30, 40, 60], maxLoad: 3, maxSpin: 1200, action: 0.4, clean: 0.55, crease: 0.1,
      extras: ['short', 'waterPlus', 'prewash', 'soak'], twinDos: true, cap: 'dark',
      data: { 0: [0.2, 50, 99, 1], 20: [0.3, 50, 99, 1], 30: [0.45, 50, 99, 1], 40: [0.6, 50, 99, 1], 60: [1.0, 50, 99, 1] },
      note: 'Washes with less friction so dark dyes and denim fade more slowly.',
    },
    sportswear: {
      name: 'Sportswear', icon: 'sportswear', temps: [0, 20, 30, 40, 60], maxLoad: 3, maxSpin: 1200, action: 0.4, clean: 0.55, crease: 0.2,
      extras: ['short', 'waterPlus', 'prewash', 'soak'], twinDos: false, cap: 'sport',
      data: { 0: [0.15, 50, 89, 1], 20: [0.25, 50, 89, 1], 30: [0.35, 50, 89, 1], 40: [0.5, 50, 89, 1], 60: [0.9, 50, 89, 1] },
    },
    automaticPlus: {
      name: 'Automatic plus', icon: 'automaticPlus', temps: [0, 20, 30, 40], maxLoad: 6, maxSpin: 1400, action: 0.5, clean: 0.6, crease: 0.1,
      extras: ['short', 'waterPlus', 'prewash', 'soak', 'intensive', 'allergo'], twinDos: true, scales: true,
      data: { 0: [0.2, 59, 119, 1], 20: [0.3, 59, 119, 1], 30: [0.45, 59, 119, 1], 40: [0.6, 59, 119] },
      note: 'Senses a mixed load of cottons and synthetics and adjusts itself.',
    },
  };

  // How well each programme suits each fabric (1 = made for it). Missing = not suitable.
  const COTTONISH = { eco: 1, cottons: 1, quickPowerWash: 1, express20: 1, automaticPlus: 0.8, shirts: 0.75, minimumIron: 0.7, dark: 1 };
  const FIT = {
    cotton: COTTONISH,
    linen: COTTONISH,
    denim: { dark: 1, cottons: 0.9, eco: 0.85, express20: 0.85, quickPowerWash: 0.8, automaticPlus: 0.85 },
    viscose: { delicates: 1, silks: 0.9, minimumIron: 0.7 },
    acetate: { delicates: 1, silks: 0.95 },
    polyester: { minimumIron: 1, automaticPlus: 0.95, delicates: 0.8, sportswear: 0.85, dark: 0.95, shirts: 0.8 },
    nylon: { minimumIron: 1, delicates: 0.85, automaticPlus: 0.9, sportswear: 0.9, dark: 0.95 },
    acrylic: { delicates: 1, minimumIron: 0.95, automaticPlus: 0.85, dark: 0.9 },
    sportswear: { sportswear: 1, minimumIron: 0.85, delicates: 0.85, dark: 0.8 },
    wool: { woollens: 1 },
    cashmere: { woollens: 1 },
    silk: { silks: 1, woollens: 0.85 },
    unknown: { automaticPlus: 1, delicates: 0.95, minimumIron: 0.8 },
  };

  // Highest spin each fabric should get (rpm).
  const SPIN_CAP = { viscose: 900, acetate: 600, polyester: 1200, nylon: 1200, acrylic: 1200, sportswear: 900, wool: 900, cashmere: 900, silk: 600, unknown: 900 };

  // How heavy a drum of each fabric is, relative to cotton (silk and wool are much lighter).
  const DENSITY = { cotton: 1, linen: 1, denim: 1, viscose: 0.7, acetate: 0.7, polyester: 0.6, nylon: 0.6, acrylic: 0.6, sportswear: 0.5, wool: 0.5, cashmere: 0.5, silk: 0.3, unknown: 0.7 };

  const SOILS = [
    { id: 'light', name: 'Light', hint: 'worn once, no stains' },
    { id: 'normal', name: 'Normal', hint: 'everyday wear' },
    { id: 'heavy', name: 'Heavy', hint: 'mud, sweat, sports, work' },
  ];
  const LOADS = [
    { id: 'small', name: 'Small', hint: 'a few items', fill: 0.25 },
    { id: 'half', name: 'Half', hint: 'about half the drum', fill: 0.5 },
    { id: 'full', name: 'Full', hint: 'a full drum, hand space at the top', fill: 1 },
  ];

  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const M = byId(MACHINES);
  const SOIL = byId(SOILS);
  const LOAD = byId(LOADS);

  const DEFAULTS = { textile: 'cotton', colour: 'bright', soil: 'normal', load: 'half', machine: 'unknown', point: { x: 0, y: 0 } };

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const tempLabel = (p, t) => (p.temps === null ? '40–60 (automatic)' : t === 0 ? 'Cold' : `${t} °C`);
  const hm = (min) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;

  // Consumption for one programme, temperature and load, before extras.
  function baseUse(p, temp, loadId) {
    if (p.temps === null) {
      const [kwh, l, min] = p.eco[loadId];
      return { kwh, litres: l, minutes: min, approx: false };
    }
    const [kwh, l, min, approx] = p.data[temp];
    const scale = p.scales ? { small: [0.5, 0.65, 0.95], half: [0.7, 0.85, 1], full: [1, 1, 1] }[loadId] : [1, 1, 1];
    return { kwh: kwh * scale[0], litres: l * scale[1], minutes: min * scale[2], approx: !!approx };
  }

  function score(m, weights) {
    return METRICS.reduce((sum, metric, i) => sum + weights[i] * m[metric.id], 0);
  }

  // An extra is offered when the soil calls for it, or when the metric it serves weighs more than average.
  const WANTED = 0.22;

  function candidates(input, weights) {
    const t = T[input.textile];
    const c = C[input.colour];
    const machine = M[input.machine];
    const soil = input.soil;
    const load = LOAD[input.load];
    const fit = FIT[t.id];
    const cap = Math.min(t.maxTemp, c.cap);
    const kg = Math.round(machine.drumKg * load.fill * DENSITY[t.id] * 10) / 10;
    const w = Object.fromEntries(METRICS.map((m, i) => [m.id, weights[i]]));
    const out = [];

    for (const pid of machine.programmes) {
      const p = PROGRAMMES[pid];
      const suit = fit[pid];
      if (!suit) continue;
      if (pid === 'dark' && !(c.id === 'dark' || t.id === 'denim')) continue;
      if (pid === 'express20' && (load.id !== 'small' || soil === 'heavy')) continue;
      if (pid === 'quickPowerWash' && soil === 'heavy') continue;
      if (pid === 'eco' && cap < 40) continue;

      const maxLoad = p.maxLoad === 'drum' ? machine.drumKg : p.maxLoad;
      const overload = kg > maxLoad;

      const temps = p.temps === null ? [null] : p.temps.filter((x) => x <= cap);
      // Spin: the highest step the programme and fabric allow, one or two steps lower
      // when Gentle and Fewer creases together carry a lot of weight.
      const machineMax = machine.spinSteps[0];
      const spinTop = Math.min(machineMax, p.maxSpin === 'max' ? machineMax : p.maxSpin, SPIN_CAP[t.id] || machineMax);
      const steps = machine.spinSteps.filter((s) => s <= spinTop);
      if (!steps.length) steps.push(600);
      const soft = w.gentle + w.creases;
      const spins = [steps[Math.min(steps.length - 1, soft > 0.7 ? 2 : soft > 0.45 ? 1 : 0)]];

      const allowed = p.extras.filter((e) => machine.extras.includes(e)).filter((e) => {
        const x = EXTRAS[e];
        if (x.soil && x.soil !== soil) return false;
        if (x.when && !x.when.some((m) => w[m] >= WANTED)) return false;
        if (e === 'preIroning' && load.id === 'full') return false;
        return true;
      });
      const sets = [[]].concat(allowed.map((e) => [e]));
      if (allowed.includes('prewash') && allowed.includes('intensive')) sets.push(['prewash', 'intensive']);
      if (allowed.includes('waterPlus') && allowed.includes('allergo')) sets.push(['waterPlus', 'allergo']);

      for (const temp of temps) {
        const use0 = baseUse(p, temp, load.id);
        const tempForScore = temp === null ? 40 : temp;
        for (const set of sets) {
          const all = set.concat((p.autoExtras || []).filter((e) => !set.includes(e)));
          let { kwh, litres, minutes } = use0;
          let clean = p.clean + ({ 0: -0.15, 20: -0.1, 30: -0.05, 40: 0, 60: 0.1, 90: 0.15 }[tempForScore] || 0) + (soil === 'light' ? 0.1 : soil === 'heavy' ? -0.15 : 0);
          let hygiene = temp === null ? 0.35 : { 0: 0.05, 20: 0.1, 30: 0.2, 40: 0.4, 60: 0.85, 90: 1 }[temp];
          let gentleAdj = 0;
          let creaseAdj = 0;
          for (const e of set) {
            const x = EXTRAS[e];
            minutes = minutes * (x.minutes || 1) + (x.addMinutes || 0);
            kwh = kwh * (x.kwh || 1) + (x.addKwh || 0);
            litres = litres * (x.water || 1) + (x.addWater || 0);
            clean += x.clean;
            hygiene += x.hygiene;
            gentleAdj += x.gentle;
            creaseAdj += x.creases;
          }
          if ((p.autoExtras || []).includes('preIroning')) creaseAdj += 0.15;

          for (const spin of spins) {
            const kgForUse = Math.min(kg, maxLoad) || 0.5;
            const kwhPerKg = kwh / kgForUse;
            const litresPerKg = litres / kgForUse;
            const m = {
              quick: clamp01(1 - (minutes - 20) / 200),
              clean: clamp01(clean),
              hygiene: clamp01(hygiene),
              sustainable: clamp01(1 - clamp01((kwhPerKg - 0.06) / 0.34) * 0.75 - clamp01((litresPerKg - 7) / 23) * 0.25 + 0.06 * (spin / 1600)),
              gentle: clamp01(1 - p.action * 0.5 - (tempForScore / 90) * 0.3 - (spin / 1600) * 0.2 + gentleAdj),
              creases: clamp01(0.35 + p.crease - (spin / 1600) * 0.45 + (load.id !== 'full' ? 0.05 : 0) + creaseAdj),
            };
            out.push({
              programme: pid, temp, spin, extras: all, chosenExtras: set, metrics: m, fit: suit, overload, maxLoad, kg,
              use: { kwh, litres, minutes, approx: use0.approx || machine.approx },
            });
          }
        }
      }
    }
    return out;
  }

  function pick(list, weights) {
    let best = null;
    for (const cand of list) {
      cand.score = score(cand.metrics, weights) - (1 - cand.fit) * 0.5;
      if (!best || cand.score > best.score + 1e-9) best = cand;
    }
    return best;
  }

  // ---- Detergent ----
  function detergent(input, cand) {
    const machine = M[input.machine];
    const p = PROGRAMMES[cand.programme];
    const t = T[input.textile];
    const c = C[input.colour];
    const whites = c.id === 'white' || c.id === 'light';
    const soil = SOIL[input.soil].name.toLowerCase();
    const half = input.load !== 'full';
    const dose = `Dose for ${soil} soiling${half ? ', about a third less than for a full drum' : ''}. Hard water needs the higher dose on the pack.`;
    const extra = [];

    if (machine.capDosing && input.soil === 'heavy' && ['cottons', 'minimumIron', 'eco', 'shirts', 'automaticPlus'].includes(cand.programme)) {
      extra.push({ icon: 'capFlask', name: 'Booster cap', detail: 'Add a Booster cap (flask symbol) for stubborn soiling.' });
    }

    if (machine.twinDos && p.twinDos) {
      return {
        icon: 'twinDos',
        name: whites ? 'TwinDos Whites' : 'TwinDos Colours',
        detail: `Leave TwinDos on and choose ${whites ? 'Whites (adds UltraPhase 2 bleach)' : 'Colours (UltraPhase 1 only)'}, soiling: ${SOIL[input.soil].name}. It doses itself.`,
        extra,
      };
    }
    if (machine.capDosing && p.cap) {
      const capId = t.id === 'silk' ? 'silk' : p.cap;
      const caps = {
        wool: ['WoolCare cap', 'one WoolCare cap (drop symbol) for the main wash'],
        silk: ['SilkCare cap', 'one SilkCare cap (drop symbol) for the main wash'],
        sport: ['Sport cap', 'one Sport cap (drop symbol); no fabric conditioner'],
        dark: ['UltraDark cap', 'one UltraDark cap (drop symbol) to keep blacks black'],
      }[capId];
      return { icon: 'capDrop', name: caps[0], detail: `Touch CapDosing and insert ${caps[1]}.`, extra };
    }
    let name;
    let icon = 'bottle';
    if (t.family === 'animal') name = 'Wool & silk detergent';
    else if (cand.programme === 'sportswear' || t.id === 'sportswear') name = 'Sports detergent, no conditioner';
    else if (cand.programme === 'delicates' || t.id === 'viscose' || t.id === 'acetate') name = 'Delicates detergent';
    else if (c.id === 'dark') name = 'Liquid detergent for darks';
    else if (whites && (t.id === 'cotton' || t.id === 'linen')) { name = 'Universal powder (with bleach)'; icon = 'scoop'; }
    else name = 'Liquid colour detergent';
    if (cand.extras.includes('prewash') && icon === 'bottle') {
      extra.push({ icon: 'scoop', name: 'Powder with Pre-wash', detail: 'With Pre-wash on, use powder for the main wash: liquid would run straight through.' });
    }
    return { icon, name, detail: dose, extra };
  }

  // ---- What to press, per panel type ----
  function panelSteps(machine, cand) {
    const p = PROGRAMMES[cand.programme];
    const tl = tempLabel(p, cand.temp);
    const steps = [];
    const extraNames = cand.chosenExtras.map((e) => EXTRAS[e].name);
    const auto = (p.autoExtras || []).map((e) => EXTRAS[e].name);
    const dial = machine.panel === 'D' ? `Tap Programmes, then ${p.name}.` : `Turn the dial to ${p.name}.`;
    steps.push(dial);
    if (p.temps === null) steps.push('The temperature sets itself in ECO 40-60; you cannot change it.');
    else if (machine.panel === 'A') steps.push(`Touch the thermometer button until ${tl} lights up.`);
    else if (machine.panel === 'B') steps.push(`Touch ${tl}.`);
    else if (machine.panel === 'C') steps.push(`Use ∧ ∨ to set ${tl}, then OK.`);
    else if (machine.panel === 'D') steps.push(`Tap the temperature and choose ${tl}.`);
    else steps.push(`Set the temperature to ${tl}.`);

    const spin = `${cand.spin}`;
    if (machine.panel === 'A') steps.push(`Touch the spiral (spin) button until ${spin} lights up.`);
    else if (machine.panel === 'B') steps.push(`Touch ${spin} for the spin.`);
    else if (machine.panel === 'C') steps.push(`Select the spin speed and set ${spin} with ∧ ∨, then OK.`);
    else if (machine.panel === 'D') steps.push(`Tap the spin speed and choose ${spin}.`);
    else steps.push(`Set the spin to ${spin} rpm.`);

    if (extraNames.length) {
      const list = extraNames.join(' and ');
      if (machine.panel === 'A') steps.push(`Touch the extras button (three lines) until ${list} lights up.`);
      else if (machine.panel === 'C' && cand.chosenExtras.some((e) => e === 'intensive' || e === 'allergo')) steps.push(`Touch Extras, choose ${list}, then OK.`);
      else if (machine.panel === 'D') steps.push(`Tap Extras and choose ${list}.`);
      else steps.push(`Touch ${list}.`);
    }
    if (auto.length) steps.push(`${auto.join(' and ')} switches on automatically in this programme.`);
    return steps;
  }

  function tips(input, best, weights) {
    const t = T[input.textile];
    const c = C[input.colour];
    const machine = M[input.machine];
    const out = [];
    const w = Object.fromEntries(METRICS.map((m, i) => [m.id, weights[i]]));
    if (best.programme === 'eco') out.push('ECO 40-60 saves energy by taking its time: the long run time is normal.');
    if (input.load === 'small' && machine.singleWash) out.push('Under 1 kg? Touch SingleWash and use half the half-load dose of liquid detergent.');
    if (input.load === 'small' && best.programme !== 'express20') out.push('Small loads use almost as much water as full ones. Wait for a fuller drum if you can.');
    if (c.id === 'dark' || t.id === 'denim') out.push('Turn darks and denim inside out to keep the colour.');
    if (t.id === 'sportswear') out.push('Skip fabric conditioner: it clogs the wicking fibres and traps smells.');
    if (t.family === 'animal') out.push('Dry flat on a towel, away from the radiator.');
    if (w.creases > 0.2 || best.programme === 'minimumIron') out.push('Take the laundry out as soon as the programme ends and shake each piece out.');
    if (w.hygiene > 0.2 || best.temp >= 60) out.push('Once a month, or when the i lights up, run an empty Cottons wash at 75 °C or higher (or Clean machine) to keep the drum fresh.');
    out.push('Put tablets or pods in the drum, not in the drawer.');
    if (machine.id === 'W2') out.push('Your W2 also has SmartMatic, an automatic programme for cottons and easy-care laundry at 30 °C.');
    return out;
  }

  function describe(input, cand, weights) {
    const p = PROGRAMMES[cand.programme];
    return {
      programme: { id: cand.programme, name: p.name, icon: p.icon, note: p.note || '' },
      temp: cand.temp,
      tempLabel: tempLabel(p, cand.temp),
      spin: cand.spin,
      spinLabel: `${cand.spin} rpm`,
      extras: cand.extras.map((e) => ({ id: e, name: EXTRAS[e].name, icon: EXTRAS[e].icon, why: EXTRAS[e].why, auto: !cand.chosenExtras.includes(e) })),
      use: { minutes: Math.round(cand.use.minutes), time: hm(cand.use.minutes), kwh: Math.round(cand.use.kwh * 100) / 100, litres: Math.round(cand.use.litres), approx: cand.use.approx },
      metrics: cand.metrics,
      score: score(cand.metrics, weights),
      summary: `${p.name}, ${tempLabel(p, cand.temp)}, ${cand.spin} rpm, ${hm(cand.use.minutes)}`,
    };
  }

  const ALT_LABELS = { quick: 'Fastest', sustainable: 'Greenest', hygiene: 'Most hygienic', gentle: 'Gentlest', clean: 'Cleanest', creases: 'Fewest creases' };

  function advise(raw) {
    const input = { ...DEFAULTS, ...raw, point: clampToPolygon((raw && raw.point) || DEFAULTS.point) };
    if (!T[input.textile] || !C[input.colour] || !SOIL[input.soil] || !LOAD[input.load] || !M[input.machine]) {
      throw new Error(`Unknown input: ${JSON.stringify(raw)}`);
    }
    const weights = weightsFromPoint(input.point);
    const machine = M[input.machine];
    const warnings = [];

    let list = candidates(input, weights);
    const all = list;
    // Strict pass: the load fits and heavy soil gets a thorough wash. Relax only if nothing is left.
    let strict = list.filter((x) => !x.overload);
    if (!strict.length) {
      strict = list;
      const top = pick(list, weights);
      warnings.push(`${PROGRAMMES[top.programme].name} takes at most ${top.maxLoad} kg. Split this load (about ${top.kg} kg) into ${Math.ceil(top.kg / top.maxLoad)} washes.`);
    }
    list = strict;
    if (input.soil === 'heavy') {
      const thorough = list.filter((x) => x.metrics.clean >= 0.45);
      if (thorough.length) list = thorough;
      else warnings.push('Very dirty laundry on a fabric this delicate: pre-treat the worst spots by hand before washing.');
    }
    const best = pick(list, weights);
    if (machine.approx) warnings.push('Settings for this panel come from product sheets, not a manual we could check. Names on your display may differ slightly.');

    // Two alternatives that improve most on what the best choice gives up.
    const sameAs = (a, b) => a.programme === b.programme && a.temp === b.temp && a.chosenExtras.join() === b.chosenExtras.join();
    const alts = [];
    const gains = METRICS.map((m) => {
      let top = null;
      for (const x of list) {
        if (sameAs(x, best)) continue;
        if (!top || x.metrics[m.id] > top.metrics[m.id] + 1e-9 || (Math.abs(x.metrics[m.id] - top.metrics[m.id]) < 1e-9 && x.score > top.score)) top = x;
      }
      return top ? { metric: m.id, cand: top, gain: top.metrics[m.id] - best.metrics[m.id] } : null;
    }).filter((g) => g && g.gain > 0.01).sort((a, b) => b.gain - a.gain);
    for (const g of gains) {
      if (alts.length === 2) break;
      if (alts.some((a) => sameAs(a.cand, g.cand))) continue;
      alts.push(g);
    }

    const leaning = weights.indexOf(Math.max(...weights));
    const balanced = Math.max(...weights) - Math.min(...weights) < 0.08;
    const res = describe(input, best, weights);
    return {
      input,
      weights,
      machine,
      textile: T[input.textile],
      colour: C[input.colour],
      soil: SOIL[input.soil],
      load: { ...LOAD[input.load], kg: best.kg },
      ...res,
      verdict: `${res.programme.name}${best.temp === null ? '' : `, ${res.tempLabel}`}`,
      omen: balanced ? 'A balanced wash for an everyday load.' : METRICS[leaning].omen,
      detergent: detergent(input, best),
      steps: panelSteps(machine, best),
      tips: tips(input, best, weights),
      warnings,
      alternatives: alts.map((g) => ({ label: ALT_LABELS[g.metric], metric: g.metric, ...describe(input, g.cand, weights) })),
      candidates: all.length,
    };
  }

  const api = {
    METRICS, MACHINES, PROGRAMMES, EXTRAS, SOILS, LOADS, FIT, SPIN_CAP, DEFAULTS,
    corners, weightsFromPoint, clampToPolygon, advise, tempLabel,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WashingOracle = api;
})(typeof window !== 'undefined' ? window : globalThis);
