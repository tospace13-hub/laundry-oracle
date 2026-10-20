/*
 * Laundry Day: one oracle for the whole wash.
 *
 * No DOM in here, so it runs in the browser (window.LaundryDay) and in Node (module.exports).
 * It does not repeat the other oracles' knowledge: it sorts a basket into loads, then asks
 *   the Stain Oracle    (../oracle.js)          how and how long to pre-treat each stain,
 *   the Washing Oracle  (../washing/washing.js) which Miele settings each load needs,
 *   When to Wash        (../when/when.js)       when each load fits the weather and the week.
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const S = node ? require('../oracle.js') : root.LaundryOracle;
  const WO = node ? require('../washing/washing.js') : root.WashingOracle;
  const WW = node ? require('../when/when.js') : root.WhenToWash;

  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const TX = byId(S.TEXTILES);
  const COL = byId(S.COLOURS);

  // ---- What goes in the basket ----
  const GARMENTS = [
    { id: 'tshirt', name: 'T-shirts & tops', short: 'T-shirt', fabric: 'cotton', kg: 0.2 },
    { id: 'jeans', name: 'Jeans', short: 'Jeans', fabric: 'denim', kg: 0.7 },
    { id: 'shirt', name: 'Shirts & blouses', short: 'Shirt', fabric: 'cotton', kg: 0.25, creases: true },
    { id: 'trousers', name: 'Trousers & skirts', short: 'Trousers', fabric: 'cotton', kg: 0.5 },
    { id: 'underwear', name: 'Underwear & socks', short: 'Underwear', fabric: 'cotton', kg: 0.06, hygiene: true },
    { id: 'towel', name: 'Towels', short: 'Towel', fabric: 'cotton', kg: 0.6, hygiene: true },
    { id: 'bedding', name: 'Bed linen (set)', short: 'Bed linen', fabric: 'cotton', kg: 1.2, hygiene: true },
    { id: 'teatowel', name: 'Tea towels & cloths', short: 'Tea towel', fabric: 'cotton', kg: 0.1, hygiene: true, soil: 'heavy' },
    { id: 'sport', name: 'Sportswear', short: 'Sportswear', fabric: 'sportswear', kg: 0.2, soil: 'heavy' },
    { id: 'fleece', name: 'Fleece & synthetic knits', short: 'Fleece', fabric: 'polyester', kg: 0.4 },
    { id: 'dress', name: 'Dress or blouse (viscose)', short: 'Dress', fabric: 'viscose', kg: 0.25 },
    { id: 'jumper', name: 'Wool jumper', short: 'Wool jumper', fabric: 'wool', kg: 0.4 },
    { id: 'silk', name: 'Silk scarf or top', short: 'Silk', fabric: 'silk', kg: 0.15 },
  ];
  const G = byId(GARMENTS);

  // An average basket to start from, clearly labelled as an example on the page.
  const EXAMPLE_BASKET = [
    { type: 'tshirt', colour: 'white', count: 2 },
    { type: 'tshirt', colour: 'bright', count: 2 },
    { type: 'jeans', colour: 'dark', count: 2 },
    { type: 'underwear', colour: 'white', count: 6 },
    { type: 'towel', colour: 'light', count: 2 },
    { type: 'shirt', colour: 'white', count: 1, stain: 'coffee' },
    { type: 'jumper', colour: 'dark', count: 1 },
    { type: 'sport', colour: 'bright', count: 2 },
    { type: 'fleece', colour: 'dark', count: 1 },
  ].map((e, i) => ({ id: `e${i + 1}`, stain: null, label: null, ...e }));

  // ---- Care labels (ISO 3758): each symbol cycles through these states; null = not on the label ----
  const LABEL_STATES = {
    wash: [null, '95', '60', '40', '40-1', '30', '30-1', '30-2', 'hand', 'no'],
    bleach: [null, 'any', 'oxygen', 'no'],
    tumble: [null, '2', '1', 'no'],
    iron: [null, '3', '2', '1', 'no'],
    pro: [null, 'P', 'F', 'W', 'no'],
  };

  function decodeLabel(label) {
    const l = label || {};
    const out = { maxTemp: null, gentle: 0, handWash: false, noWash: false, bleach: l.bleach || null, tumble: l.tumble || null, iron: l.iron || null, pro: l.pro || null, lines: [] };
    if (l.wash === 'no') { out.noWash = true; out.lines.push('Do not wash in water.'); }
    else if (l.wash === 'hand') { out.handWash = true; out.maxTemp = 40; out.lines.push('Hand wash, at most 40 °C (Woollens is approved for this).'); }
    else if (l.wash) {
      const [t, bars] = l.wash.split('-');
      out.maxTemp = Number(t);
      out.gentle = Number(bars || 0);
      out.lines.push(`Machine wash at most ${t} °C${out.gentle === 1 ? ', gentle (one bar: synthetics programme)' : out.gentle === 2 ? ', very gentle (two bars: delicates or wool programme)' : ''}.`);
    }
    if (l.bleach === 'any') out.lines.push('Any bleach allowed.');
    if (l.bleach === 'oxygen') out.lines.push('Oxygen bleach only, no chlorine.');
    if (l.bleach === 'no') out.lines.push('No bleach at all.');
    if (l.tumble === '2') out.lines.push('Tumble dry on normal heat.');
    if (l.tumble === '1') out.lines.push('Tumble dry on low heat only.');
    if (l.tumble === 'no') out.lines.push('Do not tumble dry.');
    if (l.iron) out.lines.push(l.iron === 'no' ? 'Do not iron.' : `Iron at ${{ 1: '110', 2: '150', 3: '200' }[l.iron]} °C at most (${l.iron} dot${l.iron === '1' ? '' : 's'}).`);
    if (l.pro === 'P' || l.pro === 'F') out.lines.push(`A dry cleaner can clean it (${l.pro}).`);
    if (l.pro === 'W') out.lines.push('A professional wet cleaner can clean it (W).');
    if (l.pro === 'no') out.lines.push('No professional dry cleaning.');
    return out;
  }

  // ---- Stain pre-treatment timing, read from the Stain Oracle's own steps ----
  const OPTIONAL = /^(If |For any shadow|For a grey shadow|For yellowed|Still pink|On white cotton|Coloured wax leaves)/;
  const AFTER = /^Dry it/;
  function waitOf(text) {
    if (/ice cube/i.test(text)) return 10;
    const m = text.match(/(\d+)(?:\s*(?:to|–|-)\s*\d+)?\s*(minutes?|min|hours?|h)\b/i);
    if (m) return /^h/i.test(m[2]) ? Number(m[1]) * 60 : Number(m[1]);
    if (/\ban hour\b/i.test(text)) return 60;
    return 0;
  }
  function prepFor(textile, colour, stainId) {
    const r = S.consult(textile, colour, stainId);
    if (r.difficulty === 4) return { pro: true, reading: r, minutes: 0, steps: [], optional: [], after: [] };
    const all = r.steps.slice(0, -1); // the last step is the Stain Oracle's own wash step
    const steps = [];
    const optional = [];
    const after = [];
    for (const st of all) {
      if (AFTER.test(st.text)) after.push(st);
      else if (OPTIONAL.test(st.text)) optional.push(st);
      else steps.push({ ...st, wait: waitOf(st.text) });
    }
    const minutes = steps.reduce((sum, st) => sum + st.wait + 5, 0);
    return { pro: false, reading: r, minutes, steps, optional, after };
  }

  // ---- Sorting ----
  const COLOUR_GROUP = { white: 'whites', light: 'whites', bright: 'colours', print: 'colours', dark: 'darks' };
  const GROUP_NAME = { whites: 'whites', colours: 'colours', darks: 'darks' };
  const CLASS_NAME = { cotton: 'Cotton', synthetic: 'Synthetics', mixed: 'Mixed', delicate: 'Delicates', hand: 'Hand wash' };
  const CLASS_ORDER = { cotton: 0, mixed: 1, synthetic: 2, delicate: 3, hand: 4 };
  const SYNTHETIC = new Set(['polyester', 'nylon', 'acrylic', 'sportswear']);
  const COLOUR_RANK = { dark: 0, print: 1, bright: 2, light: 3, white: 4 }; // lower = more restrictive

  function classOf(entry) {
    const g = G[entry.type];
    const t = TX[g.fabric];
    const lab = decodeLabel(entry.label);
    if (lab.noWash) return { cls: 'none', reason: 'The label says not to wash it in water. Take it to a dry cleaner.' };
    if (entry.stain) {
      const prep = prepFor(g.fabric, entry.colour, entry.stain);
      if (prep.pro) return { cls: 'none', reason: `${S.STAINS.find((x) => x.id === entry.stain).name} on ${t.phrase}: the Stain Oracle says take it to a dry cleaner.` };
    }
    if (lab.handWash || t.family === 'animal') return { cls: 'hand' };
    if (lab.gentle === 2 || t.id === 'viscose' || t.id === 'acetate') return { cls: 'delicate' };
    if (SYNTHETIC.has(t.id) || lab.gentle === 1) return { cls: 'synthetic' };
    return { cls: 'cotton' };
  }

  function maxKgFor(cls, machine, entries) {
    const P = WO.PROGRAMMES;
    if (cls === 'cotton') return machine.drumKg;
    if (cls === 'synthetic') return P.minimumIron.maxLoad;
    if (cls === 'mixed') return machine.programmes.includes('automaticPlus') ? P.automaticPlus.maxLoad : P.minimumIron.maxLoad;
    if (cls === 'delicate') return P.delicates.maxLoad;
    const silkOnly = entries.every((e) => G[e.type].fabric === 'silk');
    return silkOnly && machine.programmes.includes('silks') ? P.silks.maxLoad : P.woollens.maxLoad;
  }

  const kgOf = (entries) => entries.reduce((s, e) => s + G[e.type].kg * e.count, 0);
  const round1 = (n) => Math.round(n * 10) / 10;

  function sortBasket(basket, machineId) {
    const machine = WO.MACHINES.find((m) => m.id === machineId) || WO.MACHINES[0];
    const buckets = new Map();
    const outside = [];
    for (const entry of basket) {
      if (!entry.count || !G[entry.type] || !COL[entry.colour]) continue;
      const { cls, reason } = classOf(entry);
      if (cls === 'none') { outside.push({ entry, reason }); continue; }
      const group = COLOUR_GROUP[entry.colour];
      const key = `${cls}|${group}`;
      if (!buckets.has(key)) buckets.set(key, { cls, group, entries: [] });
      buckets.get(key).entries.push(entry);
    }

    // Small loads (under 1 kg) join a compatible one rather than running a nearly empty drum.
    // Whites and darks never meet; cotton and synthetics may share a mixed load.
    const merge = (from, to, cls) => {
      to.entries.push(...from.entries);
      if (cls) to.cls = cls;
      buckets.delete(`${from.cls}|${from.group}`);
    };
    for (const b of [...buckets.values()].sort((a, c) => kgOf(a.entries) - kgOf(c.entries))) {
      if (!buckets.has(`${b.cls}|${b.group}`) || kgOf(b.entries) >= 1) continue;
      const sameGroup = [...buckets.values()].filter((o) => o !== b && o.group === b.group);
      const pairs = { cotton: ['synthetic', 'mixed'], synthetic: ['cotton', 'mixed', 'delicate'], delicate: ['synthetic', 'hand'], hand: ['delicate'] };
      const target = sameGroup.find((o) => (pairs[b.cls] || []).includes(o.cls));
      if (target) {
        const cls = (b.cls === 'cotton' || target.cls === 'cotton') && (b.cls === 'synthetic' || target.cls === 'synthetic' || target.cls === 'mixed') ? 'mixed'
          : CLASS_ORDER[b.cls] > CLASS_ORDER[target.cls] ? b.cls : target.cls;
        const oldKey = `${target.cls}|${target.group}`;
        merge(b, target, cls);
        buckets.delete(oldKey);
        buckets.set(`${target.cls}|${target.group}`, target);
      } else if (b.cls === 'hand') {
        // Hand-wash items are few: colours may join whites or darks, but whites never join darks.
        const other = [...buckets.values()].find((o) => o !== b && o.cls === 'hand' && !(o.group === 'whites' && b.group === 'darks') && !(o.group === 'darks' && b.group === 'whites'));
        if (other) merge(b, other);
      }
    }

    // Split anything over the programme's maximum load.
    const loads = [];
    for (const b of buckets.values()) {
      const max = maxKgFor(b.cls, machine, b.entries);
      const pieces = [];
      for (const e of b.entries) for (let i = 0; i < e.count; i++) pieces.push(e);
      pieces.sort((x, y) => G[y.type].kg - G[x.type].kg);
      const bins = [];
      for (const p of pieces) {
        const kg = G[p.type].kg;
        let bin = bins.find((x) => x.kg + kg <= max + 1e-9);
        if (!bin) { bin = { kg: 0, items: new Map() }; bins.push(bin); }
        bin.kg += kg;
        bin.items.set(p, (bin.items.get(p) || 0) + 1);
      }
      bins.forEach((bin, i) => {
        loads.push({
          cls: b.cls,
          group: b.group,
          part: bins.length > 1 ? i + 1 : 0,
          parts: bins.length,
          maxKg: max,
          kg: round1(bin.kg),
          items: [...bin.items.entries()].map(([entry, count]) => ({ entry, garment: G[entry.type], count })),
        });
      });
    }
    loads.forEach((l) => { l.name = loadName(l); });
    return { machine, loads, outside };
  }

  function loadName(l) {
    const base = l.cls === 'cotton' ? GROUP_NAME[l.group].replace(/^./, (c) => c.toUpperCase()) : `${CLASS_NAME[l.cls]}, ${GROUP_NAME[l.group]}`;
    return l.parts > 1 ? `${base} (${l.part} of ${l.parts})` : base;
  }

  // ---- Microfibre shedding ----
  function microfibre(load, settings) {
    const synth = load.items.filter((i) => SYNTHETIC.has(i.garment.fabric)).reduce((s, i) => s + i.garment.kg * i.count, 0);
    const share = load.kg ? synth / load.kg : 0;
    if (share === 0) return null;
    const p = WO.PROGRAMMES[settings.programme.id];
    const temp = settings.temp == null ? 35 : settings.temp;
    const fillFactor = load.kg / load.maxKg >= 0.8 ? 0.8 : load.kg / load.maxKg >= 0.4 ? 1 : 1.2;
    const score = share * (0.3 + temp / 100 + (p ? p.action : 0.5) * 0.4 + settings.spin / 3200) * fillFactor;
    const level = score < 0.35 ? 'low' : score < 0.65 ? 'medium' : 'high';
    const advice = [
      'Use a microfibre filter bag for the synthetic pieces; it catches the fibres they shed.',
      load.kg / load.maxKg < 0.8 ? 'Fill the drum: a full load rubs each piece less.' : 'The drum is well filled, which keeps friction per piece down.',
      temp > 30 ? 'Washing at 30 °C instead sheds fewer fibres.' : 'Cool washing already keeps shedding down.',
      'Liquid detergent is gentler on fibres than powder.',
      'Skip the tumble dryer for synthetics: it breaks off more fibres.',
      'New fleece sheds most in its first washes.',
    ];
    return { share, score, level, advice };
  }

  // ---- Water hardness and water companies ----
  const HARDNESS = [
    { id: 'soft', name: 'Soft', miele: 'I', range: 'up to 8.4 °dH (below 1.5 mmol/l)', dose: 'the lowest dose on the pack' },
    { id: 'medium', name: 'Medium', miele: 'II', range: '8.4–14 °dH (1.5–2.5 mmol/l)', dose: 'the middle dose on the pack' },
    { id: 'hard', name: 'Hard', miele: 'III', range: 'above 14 °dH (above 2.5 mmol/l)', dose: 'the highest dose on the pack' },
  ];
  const COMPANIES = {
    Vitens: 'https://www.vitens.nl/', 'Waterbedrijf Groningen': 'https://waterbedrijfgroningen.nl/', WMD: 'https://www.wmd.nl/',
    PWN: 'https://www.pwn.nl/', Waternet: 'https://www.waternet.nl/', Dunea: 'https://www.dunea.nl/', Evides: 'https://www.evides.nl/',
    Oasen: 'https://www.oasen.nl/', 'Brabant Water': 'https://www.brabantwater.nl/', WML: 'https://www.wml.nl/',
  };
  const CITY_COMPANY = {
    Vitens: ['Arnhem', 'Nijmegen', 'Apeldoorn', 'Ede', 'Wageningen', 'Doetinchem', 'Winterswijk', 'Zutphen', 'Deventer', 'Enschede', 'Zwolle', 'Kampen', 'Utrecht', 'Amersfoort', 'Hilversum', 'Almere', 'Lelystad', 'Harderwijk', 'Leeuwarden', 'Sneek'],
    'Waterbedrijf Groningen': ['Groningen'],
    WMD: ['Assen', 'Emmen'],
    PWN: ['Haarlem', 'Alkmaar', 'Den Helder', 'Hoorn', 'Zaandam'],
    Waternet: ['Amsterdam'],
    Dunea: ['Den Haag', 'Leiden', 'Zoetermeer'],
    Evides: ['Rotterdam', 'Dordrecht', 'Delft', 'Middelburg', 'Vlissingen', 'Terneuzen'],
    Oasen: ['Gouda'],
    'Brabant Water': ['Eindhoven', 'Tilburg', 'Breda', "'s-Hertogenbosch", 'Helmond', 'Oss', 'Bergen op Zoom'],
    WML: ['Maastricht', 'Heerlen', 'Venlo', 'Roermond'],
  };
  function waterCompany(lat, lon) {
    const near = WW.nearestCity(lat, lon);
    const name = Object.keys(CITY_COMPANY).find((c) => CITY_COMPANY[c].includes(near.city.name)) || 'Vitens';
    return { name, url: COMPANIES[name], city: near.city.name };
  }

  function doseLine(settings, hardnessId, soil, fill) {
    const h = HARDNESS.find((x) => x.id === hardnessId) || HARDNESS[1];
    if (/TwinDos/.test(settings.detergent.name)) return `TwinDos doses itself. Set the water hardness to ${h.miele} (${h.name.toLowerCase()}) once in the machine's settings.`;
    if (/cap$/i.test(settings.detergent.name)) return 'One cap per wash; hardness doesn’t change that.';
    const part = fill === 'full' ? '' : fill === 'half' ? ', about a third less for this half drum' : ', about half for this small load';
    return `${h.name} water (${h.miele}): use ${h.dose} for ${soil} soiling${part}.`;
  }

  // ---- Machine care ----
  const CARE_TASKS = [
    { id: 'hot', name: 'Hot maintenance wash', every: 30, how: 'Run Cottons at 75 °C or hotter, or Clean machine, with an empty drum and universal powder. It clears detergent residue and smells.' },
    { id: 'seal', name: 'Door seal and door', every: 7, how: 'Wipe the rubber seal dry and leave the door and drawer ajar after the last load.' },
    { id: 'filter', name: 'Drain filter', every: 90, how: 'Unscrew the drain filter behind the flap at the bottom (towel ready), rinse out lint and coins.' },
  ];
  function machineCare(lastDone, todayISO) {
    const today = Date.parse(`${todayISO}T12:00:00Z`);
    return CARE_TASKS.map((t) => {
      const last = lastDone && lastDone[t.id] ? Date.parse(`${lastDone[t.id]}T12:00:00Z`) : null;
      const days = last == null ? null : Math.max(0, Math.round((today - last) / 86400000));
      return { ...t, last: lastDone && lastDone[t.id] || null, days, due: days == null || days >= t.every, frac: days == null ? 1 : Math.min(1, days / t.every) };
    });
  }

  // ---- One load: settings, prep, drying, label notes ----
  const corner = (id) => {
    const i = WO.METRICS.findIndex((m) => m.id === id);
    return WO.corners(WO.METRICS.length)[i];
  };

  function settingsFor(load, machineId) {
    const entries = load.items.map((i) => i.entry);
    const labels = entries.map((e) => decodeLabel(e.label));
    // The most restrictive fabric (lowest temperature, synthetics before cotton) and colour.
    const fabrics = [...new Set(load.items.map((i) => i.garment.fabric))];
    let textile = fabrics.sort((a, b) => TX[a].maxTemp - TX[b].maxTemp || (SYNTHETIC.has(b) ? 1 : 0) - (SYNTHETIC.has(a) ? 1 : 0))[0];
    if (load.cls === 'mixed' && !fabrics.some((f) => TX[f].maxTemp < 40)) textile = 'polyester';
    const colour = entries.map((e) => e.colour).sort((a, b) => COLOUR_RANK[a] - COLOUR_RANK[b])[0];
    const caps = labels.map((l) => l.maxTemp).filter((t) => t != null);
    const maxTemp = caps.length ? Math.min(...caps) : undefined;
    const handWash = labels.some((l) => l.handWash);
    const heavy = load.items.some((i) => i.garment.soil === 'heavy');
    const hygiene = load.items.filter((i) => i.garment.hygiene).reduce((s, i) => s + i.garment.kg * i.count, 0) >= load.kg / 2;
    const cap = Math.min(TX[textile].maxTemp, COL[colour].cap, maxTemp == null ? 90 : maxTemp);
    const machine = WO.MACHINES.find((m) => m.id === machineId) || WO.MACHINES[0];
    const fillRatio = load.kg / machine.drumKg;
    const fill = fillRatio <= 0.3 ? 'small' : fillRatio <= 0.65 ? 'half' : 'full';
    const h = corner('hygiene');
    const point = hygiene && cap >= 60 ? { x: h.x * 0.6, y: h.y * 0.6 } : { x: 0, y: 0 };
    const soil = heavy ? 'heavy' : 'normal';
    const advice = WO.advise({ textile, colour, soil, load: fill, machine: machine.id, point, maxTemp, handWash });
    return { advice, textile, colour, soil, fill, hygiene, labels };
  }

  function labelNotes(labels) {
    const notes = [];
    if (labels.some((l) => l.bleach === 'no')) notes.push('One piece says no bleach: leave out oxygen bleach and boosters.');
    else if (labels.some((l) => l.bleach === 'oxygen')) notes.push('One piece allows oxygen bleach only, no chlorine.');
    if (labels.some((l) => l.tumble === 'no')) notes.push('One piece must not go in the tumble dryer: hang or lay it flat.');
    else if (labels.some((l) => l.tumble === '1')) notes.push('Tumble dry on low heat only.');
    const irons = labels.map((l) => l.iron).filter(Boolean);
    if (irons.includes('no')) notes.push('One piece must not be ironed.');
    else if (irons.length) notes.push(`Iron at ${{ 1: '110', 2: '150', 3: '200' }[Math.min(...irons.map(Number))]} °C at most.`);
    return notes;
  }

  // ---- The whole day ----
  function planDay(basket, settings = {}, forecast = null, now = 0) {
    const machineId = settings.machine || 'unknown';
    const hardness = settings.hardness || 'medium';
    const sorted = sortBasket(basket, machineId);
    const when = settings.when || {};

    const loads = sorted.loads.map((load) => {
      const s = settingsFor(load, machineId);
      const prepItems = load.items.filter((i) => i.entry.stain).map((i) => ({ ...i, prep: prepFor(i.garment.fabric, i.entry.colour, i.entry.stain), stainName: S.STAINS.find((x) => x.id === i.entry.stain).name }));
      const prepMin = prepItems.length ? Math.max(...prepItems.map((p) => p.prep.minutes)) + 5 * (prepItems.length - 1) : 0;
      const noTumble = s.labels.some((l) => l.tumble === 'no') || load.cls === 'hand' || load.items.some((i) => i.garment.fabric === 'sportswear');
      const flat = load.cls === 'hand';
      return {
        ...load,
        settings: s.advice,
        fill: s.fill,
        hygiene: s.hygiene,
        prep: { minutes: prepMin, items: prepItems },
        dose: doseLine(s.advice, hardness, s.soil, s.fill),
        micro: microfibre(load, s.advice),
        labelNotes: labelNotes(s.labels),
        drying: { noTumble, flat, outsideOk: !flat },
        timing: null,
      };
    });

    // Hygiene and heavy cotton first, hand wash last.
    loads.sort((a, b) => (b.hygiene - a.hygiene) || (CLASS_ORDER[a.cls] - CLASS_ORDER[b.cls]) || (b.kg - a.kg));

    let days = null;
    if (forecast) {
      const busy = [];
      let firstDay = null;
      for (const l of loads) {
        const base = {
          ...when,
          loads: { per: 'week', count: 1 },
          programme: { name: l.settings.verdict, minutes: l.settings.use.minutes, kwh: l.settings.use.kwh },
          prepMin: l.prep.minutes,
          busy: busy.slice(),
          dryOutside: l.drying.outsideOk,
          drying: { ...(when.drying || WW.DEFAULTS.drying), dryer: l.drying.noTumble ? 'none' : ((when.drying || {}).dryer || 'none') },
        };
        // Keep the laundry on one day when that costs little; otherwise take the best slot of the week.
        const anywhere = WW.plan(base, forecast, now);
        let pick = anywhere.loads[0] || null;
        if (pick && firstDay != null && pick.dayIndex !== firstDay) {
          const same = WW.plan({ ...base, onlyDay: firstDay }, forecast, now).loads[0];
          if (same && same.score >= pick.score * 0.75) pick = same;
        }
        if (pick) {
          busy.push({ start: pick.start, end: pick.end });
          if (firstDay == null) firstDay = pick.dayIndex;
        }
        l.timing = pick;
        l.weights = anywhere.weights;
      }
      const used = [...new Set(loads.filter((l) => l.timing).map((l) => l.timing.dayIndex))].sort((a, b) => a - b);
      days = WW.plan({ ...when }, forecast, now).days.map((d, i) => ({ ...d, index: i, used: used.includes(i) }));
    }

    const hotLoad = loads.some((l) => l.settings.temp != null && l.settings.temp >= 60);
    return {
      machine: sorted.machine,
      loads,
      outside: sorted.outside,
      days,
      hardness: HARDNESS.find((h) => h.id === hardness) || HARDNESS[1],
      notes: hotLoad ? [] : ['None of these loads runs at 60 °C or more. Keep up the monthly hot maintenance wash so the machine stays fresh.'],
      totals: {
        kg: round1(loads.reduce((s, l) => s + l.kg, 0)),
        kwh: Math.round(loads.reduce((s, l) => s + l.settings.use.kwh, 0) * 100) / 100,
        litres: loads.reduce((s, l) => s + l.settings.use.litres, 0),
        minutes: loads.reduce((s, l) => s + l.settings.use.minutes, 0),
      },
    };
  }

  const api = {
    GARMENTS, EXAMPLE_BASKET, LABEL_STATES, HARDNESS, CARE_TASKS, COMPANIES,
    decodeLabel, waitOf, prepFor, classOf, sortBasket, microfibre, waterCompany, doseLine, machineCare, planDay,
  };
  if (node) module.exports = api;
  else root.LaundryDay = api;
})(typeof window !== 'undefined' ? window : globalThis);
