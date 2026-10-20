/* Laundry Day: the page. Basket → loads → day plan. Circles and polygons only. */
(function () {
  'use strict';

  const D = window.LaundryDay;
  const S = window.LaundryOracle;
  const WO = window.WashingOracle;
  const WW = window.WhenToWash;
  const I = window.WashingIcons;
  const app = document.getElementById('app');
  if (!D || !S || !WO || !WW || !I || !app) return;

  const STORE = 'laundry-day:v1';
  const WHEN_STORE = 'when-to-wash:v1';
  const WEATHER = 'when-to-wash:weather:v1'; // shared with When to Wash: same URL, same cache
  const WEATHER_TTL = 60 * 60 * 1000;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const esc = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const $ = (id) => document.getElementById(id);
  const f1 = (n) => Math.round(n * 10) / 10;
  const rad = (deg) => (deg * Math.PI) / 180;
  const at = (r, deg, cx = 0, cy = 0) => ({ x: cx + r * Math.sin(rad(deg)), y: cy - r * Math.cos(rad(deg)) });
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYLONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function readJSON(key) { try { return JSON.parse(localStorage.getItem(key)) || null; } catch (e) { return null; } }
  function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  function readCookie(name) {
    try {
      const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
      return hit ? decodeURIComponent(hit.split('=')[1]) : null;
    } catch (e) { return null; }
  }

  // ---- Icons: garments (our own) and the shared Washing Oracle set ----
  const svg = (body, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 48 48" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const nestSvg = (markup, x, y, size) => markup.replace('<svg ', `<svg x="${f1(x - size / 2)}" y="${f1(y - size / 2)}" width="${size}" height="${size}" `);
  const GICON = {
    tshirt: '<path d="M17 9 L9 13 L5 21 L11 25 L14 22 V40 H34 V22 L37 25 L43 21 L39 13 L31 9 Q28 13 24 13 Q20 13 17 9 Z"/>',
    jeans: '<path d="M13 7 H35 L38 41 H28 L24 18 L20 41 H10 Z"/><path d="M13 13 H35" stroke-width="2"/>',
    shirt: '<path d="M16 8 L7 13 L7 40 H41 V13 L32 8 L24 16 Z"/><path d="M16 8 L20 18 L24 16 L28 18 L32 8 M24 16 V40" stroke-width="2"/>',
    trousers: '<path d="M14 6 H34 L36 42 H27 L24 20 L21 42 H12 Z"/><path d="M24 6 V12" stroke-width="2"/>',
    underwear: '<path d="M19 6 H29 V25 L37 31 A6 6 0 0 1 31 41 L19 33 Z"/><path d="M19 11 H29" stroke-width="2"/>',
    towel: '<rect x="8" y="10" width="32" height="28" rx="3"/><path d="M8 17 H40 M8 31 H40" stroke-width="2"/>',
    bedding: '<rect x="6" y="26" width="36" height="14" rx="3"/><path d="M10 26 V18 Q10 15 13 15 H24 Q27 15 27 18 V26"/>',
    teatowel: '<path d="M14 9 H34 V41 H14 Z"/><path d="M14 33 H34 M14 36 H34" stroke-width="2"/><path d="M20 9 V5 H28 V9"/>',
    sport: '<path d="M6 32 C6 26 10 24 14 24 L20 14 L26 16 L24 22 C30 24 36 26 40 28 C43 29.5 43 34 40 34 H8 C6.5 34 6 33 6 32 Z"/><path d="M6 38 H42" stroke-width="2"/>',
    fleece: '<path d="M16 8 L7 14 V41 H41 V14 L32 8 L24 12 Z"/><path d="M24 12 V41 M22 18 H26 M22 24 H26" stroke-width="2"/>',
    dress: '<path d="M18 6 H30 L28 17 L38 42 H10 L20 17 Z"/><path d="M20 17 H28" stroke-width="2"/>',
    jumper: '<path d="M17 8 L7 14 L5 37 H11 L13 21 V40 H35 V21 L37 37 H43 L41 14 L31 8 Q28 12 24 12 Q20 12 17 8 Z"/><path d="M13 36 H35" stroke-width="2"/>',
    silk: '<path d="M8 10 Q24 21 40 10 L35 23 Q24 29 13 23 Z"/><path d="M30 25 L34 41 M24 27 L22 42" stroke-width="2"/>',
  };
  const gicon = (id) => svg(GICON[id] || GICON.tshirt);
  const UI = {
    pin: '<path d="M24 42 C24 42 11 28 11 19 a13 13 0 0 1 26 0 C37 28 24 42 24 42 Z"/><circle cx="24" cy="19" r="4"/>',
    clock: '<circle cx="24" cy="24" r="16"/><path d="M24 24 V14 M24 24 L31 28"/>',
    machine: '<rect x="9" y="6" width="30" height="36" rx="4"/><circle cx="24" cy="27" r="9"/><path d="M14 12 h4 M30 12 h4"/>',
    drop: '<path d="M24 6 C24 6 11 22 11 30 a13 13 0 0 0 26 0 C37 22 24 6 24 6 Z"/>',
    panel: '<path d="M8 34 L14 14 H40 L34 34 Z"/><path d="M11 24 H37 M21 14 L18 34 M31 14 L28 34"/>',
    plus: '<path d="M24 12 V36 M12 24 H36"/>',
    minus: '<path d="M12 24 H36"/>',
    close: '<path d="M14 14 L34 34 M34 14 L14 34"/>',
    basket: '<path d="M6 20 H42 L37 41 H11 Z"/><path d="M14 20 L20 8 M34 20 L28 8 M17 27 V35 M24 27 V35 M31 27 V35" stroke-width="2"/>',
    fibre: '<path d="M6 30 q6 -10 12 0 t12 0 t12 0"/><path d="M8 20 q5 -6 10 0 t10 0" stroke-width="2"/><circle cx="38" cy="14" r="3"/>',
    check: '<path d="M12 25 L20 33 L36 15"/>',
  };
  const ui = (id) => svg(UI[id]);

  // Stain swatches: the colour of the stuff itself, the same in light and dark.
  const STAIN_COLOUR = {
    blood: '#8B1A1A', sweat: '#E2C66B', egg: '#F2CF5B', coffee: '#6F4E37', tea: '#A0743B', wine: '#722F37', berries: '#5E2A6E',
    oil: '#E3BE6A', grease: '#3A3A3A', makeup: '#E3A08A', ink: '#1F3B8C', curry: '#E1A100', grass: '#4C8C2B', chocolate: '#4E2A1E',
    tomato: '#D2381F', mud: '#7A5C3E', wax: '#EFE0BF', gum: '#F2A3C2', polish: '#D81B60', rust: '#B7410E', mildew: '#6B7F5A',
  };

  // ---- ISO 3758 care symbols for the label decoder ----
  const CROSS = '<path d="M6 6 L42 42 M42 6 L6 42"/>';
  const txt = (x, y, s, size = 12) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" font-weight="700" fill="currentColor" stroke="none" font-family="inherit">${s}</text>`;
  function careSymbol(kind, state) {
    const unknown = state == null;
    let body = '';
    if (kind === 'wash') {
      body = '<path d="M5 15 L10 37 H38 L43 15"/><path d="M5 15 q4.75 -4 9.5 0 t9.5 0 t9.5 0 t9.5 0"/>';
      if (state === 'hand') body += '<path d="M18 34 v-9 c0-2 3-2 3 0 v-3 c0-2 3-2 3 0 v1 c0-2 3-2 3 0 v1 c0-2 3-2 3 0 v7 c0 3-2 5-5 5 h-3 c-2 0-4-1-4-2z" stroke-width="2"/>';
      else if (state === 'no') body += CROSS;
      else if (state) {
        const [t, bars] = state.split('-');
        body += txt(24, 32, t);
        if (bars === '1') body += '<path d="M10 43 H38" stroke-width="2"/>';
        if (bars === '2') body += '<path d="M10 42 H38 M10 46 H38" stroke-width="2"/>';
      }
    } else if (kind === 'bleach') {
      body = '<path d="M24 7 L43 39 H5 Z"/>';
      if (state === 'oxygen') body += '<path d="M19 34 L26 22 M25 34 L32 22" stroke-width="2"/>';
      if (state === 'no') body += CROSS;
    } else if (kind === 'tumble') {
      body = '<rect x="7" y="7" width="34" height="34" rx="1"/><circle cx="24" cy="24" r="12"/>';
      if (state === '1') body += '<circle cx="24" cy="24" r="2.2" fill="currentColor" stroke="none"/>';
      if (state === '2') body += '<circle cx="20" cy="24" r="2.2" fill="currentColor" stroke="none"/><circle cx="28" cy="24" r="2.2" fill="currentColor" stroke="none"/>';
      if (state === 'no') body += CROSS;
    } else if (kind === 'iron') {
      body = '<path d="M5 36 L9 24 Q11 18 18 18 H41 V36 Z"/><path d="M19 18 Q19 12 25 12 H41"/>';
      if (state && state !== 'no') body += [19, 26, 33].slice(0, Number(state)).map((x) => `<circle cx="${x}" cy="28" r="2" fill="currentColor" stroke="none"/>`).join('');
      if (state === 'no') body += CROSS;
    } else if (kind === 'pro') {
      body = '<circle cx="24" cy="24" r="17"/>';
      if (state && state !== 'no') body += txt(24, 30, state, 17);
      if (state === 'no') body += CROSS;
    }
    return svg(body, unknown ? 'is-unknown' : '');
  }
  const LABEL_KINDS = [['wash', 'Washing'], ['bleach', 'Bleach'], ['tumble', 'Tumble dryer'], ['iron', 'Ironing'], ['pro', 'Professional']];

  // ---- State ----
  let uid = 0;
  const newId = () => `p${Date.now().toString(36)}${(uid++).toString(36)}`;
  const validEntry = (e) => e && D.GARMENTS.some((g) => g.id === e.type) && S.COLOURS.some((c) => c.id === e.colour) && Number.isInteger(e.count) && e.count > 0 && e.count < 100;
  const saved = readJSON(STORE) || {};
  const state = {
    basket: Array.isArray(saved.basket) ? saved.basket.filter(validEntry).map((e) => ({ id: e.id || newId(), type: e.type, colour: e.colour, count: e.count, stain: S.STAINS.some((s) => s.id === e.stain) ? e.stain : null, label: e.label && typeof e.label === 'object' ? e.label : null })) : null,
    example: !Array.isArray(saved.basket),
    colour: S.COLOURS.some((c) => c.id === saved.colour) ? saved.colour : 'bright',
    hardness: D.HARDNESS.some((h) => h.id === saved.hardness) ? saved.hardness : 'medium',
    care: saved.care && typeof saved.care === 'object' ? saved.care : {},
    selected: null,
  };
  if (!state.basket) state.basket = D.EXAMPLE_BASKET.map((e) => ({ ...e }));
  const persist = () => writeJSON(STORE, { basket: state.example ? undefined : state.basket, colour: state.colour, hardness: state.hardness, care: state.care });
  const touch = () => { state.example = false; };

  // Household settings come from When to Wash; the machine from the Washing Oracle's cookie.
  function whenSettings() {
    const s = readJSON(WHEN_STORE) || {};
    const d = JSON.parse(JSON.stringify(WW.DEFAULTS));
    return {
      lat: Number.isFinite(s.lat) ? s.lat : d.lat,
      lon: Number.isFinite(s.lon) ? s.lon : d.lon,
      home: s.home && Array.isArray(s.home.weekday) && Array.isArray(s.home.weekend) ? s.home : d.home,
      doneWhenHome: !!s.doneWhenHome,
      solar: s.solar ? { ...d.solar, ...s.solar } : d.solar,
      dal: !!s.dal,
      quiet: !!s.quiet,
      drying: s.drying ? { ...d.drying, ...s.drying } : d.drying,
      saved: !!s.home,
    };
  }
  const machineId = () => {
    const c = readCookie('washing_machine') || (readJSON('washing-oracle:v1') || {}).machine;
    return WO.MACHINES.some((m) => m.id === c) ? c : 'unknown';
  };

  function amsterdamNow() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map((p) => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
  }

  // ---- Weather (same request and cache as When to Wash) ----
  let forecast = null;
  let weatherState = 'loading';
  async function loadWeather() {
    const w = whenSettings();
    const url = WW.forecastUrl(w.lat, w.lon, w.solar.facing);
    const cache = readJSON(WEATHER);
    if (cache && cache.url === url && Date.now() - cache.at < WEATHER_TTL) {
      try { forecast = WW.parseForecast(cache.json); weatherState = 'live'; render(false); return; } catch (e) { /* refetch */ }
    }
    weatherState = 'loading';
    render(false);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      forecast = WW.parseForecast(json);
      weatherState = 'live';
      writeJSON(WEATHER, { url, at: Date.now(), json });
    } catch (e) {
      forecast = WW.blankForecast(amsterdamNow().date);
      weatherState = 'failed';
    }
    render(true);
  }

  // ---- Basket drawing ----
  const RING_R = 162;
  const BASKET_R = 112;
  function basketMarkup() {
    const n = D.GARMENTS.length;
    const ring = D.GARMENTS.map((g, i) => {
      const p = at(RING_R, (i * 360) / n);
      return `<g class="gbtn" data-type="${g.id}" role="button" tabindex="0" aria-label="Add ${esc(g.name)}">
        <circle class="gbtn-face" cx="${f1(p.x)}" cy="${f1(p.y)}" r="25"/>
        ${nestSvg(gicon(g.id), p.x, p.y, 30)}
      </g>`;
    }).join('');
    return `<svg class="basket" id="basket" viewBox="-205 -205 410 410" role="group" aria-label="Basket. Tap a garment around the edge to add one; tap a piece inside to change it.">
      <circle class="bk-rim" r="${BASKET_R + 8}"/>
      <circle class="bk-in" r="${BASKET_R}"/>
      <g class="bk-weave">${Array.from({ length: 24 }, (_, i) => { const a = at(BASKET_R + 4, i * 15); const b = at(BASKET_R + 12, i * 15 + 7); return `<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}"/>`; }).join('')}</g>
      <g id="tokens"></g>
      ${ring}
    </svg>`;
  }

  function tokensMarkup() {
    const n = state.basket.length;
    if (!n) return `<text class="bk-empty" y="-6" text-anchor="middle">Empty basket</text><text class="bk-empty-sub" y="16" text-anchor="middle">Tap a garment around the edge</text>`;
    const k = Math.min(30, (BASKET_R - 26) / Math.sqrt(n));
    return state.basket.map((e, i) => {
      const r = n === 1 ? 0 : k * Math.sqrt(i + 0.5);
      const a = i * 137.508;
      const p = at(r, a);
      const c = S.COLOURS.find((x) => x.id === e.colour);
      const fill = c.swatch === 'print' ? 'url(#tok-print)' : c.swatch;
      const g = D.GARMENTS.find((x) => x.id === e.type);
      const label = `${e.count} ${g.name.toLowerCase()}, ${c.name.toLowerCase()}${e.stain ? `, ${S.STAINS.find((s) => s.id === e.stain).name.toLowerCase()} stain` : ''}${e.label ? ', care label set' : ''}`;
      return `<g class="tok${state.selected === e.id ? ' is-sel' : ''}" data-id="${e.id}" role="button" tabindex="0" aria-pressed="${state.selected === e.id}" aria-label="${esc(label)}">
        <circle class="tok-ring" cx="${f1(p.x)}" cy="${f1(p.y)}" r="21" fill="${fill}"/>
        <circle class="tok-face" cx="${f1(p.x)}" cy="${f1(p.y)}" r="15"/>
        ${nestSvg(gicon(e.type), p.x, p.y, 20)}
        ${e.count > 1 ? `<circle class="tok-badge" cx="${f1(p.x + 15)}" cy="${f1(p.y - 15)}" r="9"/><text class="tok-n" x="${f1(p.x + 15)}" y="${f1(p.y - 11.5)}" text-anchor="middle">${e.count}</text>` : ''}
        ${e.stain ? `<circle class="tok-stain" cx="${f1(p.x - 15)}" cy="${f1(p.y - 15)}" r="6" fill="${STAIN_COLOUR[e.stain]}"/>` : ''}
      </g>`;
    }).join('');
  }

  const swatchBtn = (c, on, attr) => `<button type="button" class="swatch-btn${on ? ' is-on' : ''}" ${attr} aria-pressed="${on}" title="${esc(c.name)}"><span class="swatch${c.swatch === 'print' ? ' swatch--print' : ''}" ${c.swatch === 'print' ? '' : `style="background:${c.swatch}"`}></span><span class="sr">${esc(c.name)}</span></button>`;

  function editorMarkup() {
    const e = state.basket.find((x) => x.id === state.selected);
    if (!e) return `<p class="ed-hint">${ui('basket')}<span>Tap a piece in the basket to change its colour, add a stain or read its care label.</span></p>`;
    const g = D.GARMENTS.find((x) => x.id === e.type);
    const fam = S.STAIN_FAMILIES.map((f) => {
      const items = S.STAINS.filter((s) => s.family === f.id).map((s) => `<button type="button" class="stain-btn${e.stain === s.id ? ' is-on' : ''}" data-stain="${s.id}" aria-pressed="${e.stain === s.id}"><span class="stain-dot" style="background:${STAIN_COLOUR[s.id]}"></span><span class="stain-name">${esc(s.name)}</span></button>`).join('');
      return items;
    }).join('');
    const lab = D.decodeLabel(e.label);
    const syms = LABEL_KINDS.map(([k, name]) => {
      const st = e.label ? e.label[k] : null;
      return `<button type="button" class="sym-btn${st != null ? ' is-on' : ''}" data-kind="${k}" aria-label="${esc(name)}: ${esc(st == null ? 'not set' : st)}. Tap to change.">${careSymbol(k, st)}<span>${esc(name)}</span></button>`;
    }).join('');
    return `<div class="editor" id="editor">
      <div class="ed-head">
        <span class="ed-icon">${gicon(e.type)}</span>
        <h3>${esc(g.name)}</h3>
        <button type="button" class="step-btn ed-close" id="ed-close" aria-label="Done">${ui('check')}</button>
      </div>
      <div class="ed-row">
        <div class="stepper" role="group" aria-label="How many">
          <button type="button" class="step-btn" id="ed-minus" aria-label="One fewer">${ui('minus')}</button>
          <output class="step-face step-face--sm" aria-live="polite">${e.count}</output>
          <button type="button" class="step-btn" id="ed-plus" aria-label="One more">${ui('plus')}</button>
        </div>
        <div class="swatches" role="group" aria-label="Colour">${S.COLOURS.map((c) => swatchBtn(c, c.id === e.colour, `data-ecolour="${c.id}"`)).join('')}</div>
        <button type="button" class="round-btn" id="ed-remove"><span class="round-btn-face" aria-hidden="true">${ui('close')}</span><span>Remove</span></button>
      </div>
      <p class="mini-h">Any stain on it?</p>
      <div class="stains" role="group" aria-label="Stain">
        <button type="button" class="stain-btn${!e.stain ? ' is-on' : ''}" data-stain="" aria-pressed="${!e.stain}"><span class="stain-dot stain-dot--none"></span><span class="stain-name">No stain</span></button>
        ${fam}
      </div>
      <p class="mini-h">Care label <span class="mini-sub">Tap each symbol until it matches the label in the seam.</span></p>
      <div class="syms">${syms}</div>
      ${lab.lines.length ? `<ul class="list label-lines">${lab.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    </div>`;
  }

  // ---- Day dial: 24 h clock with prep, wash and drying arcs ----
  function sector(r1, r2, fromMin, toMin) {
    let to = toMin;
    if (to <= fromMin) to += 1440;
    const a0 = (fromMin / 1440) * 360;
    const a1 = (to / 1440) * 360;
    const large = a1 - a0 > 180 ? 1 : 0;
    const p0 = at(r2, a0); const p1 = at(r2, a1); const p2 = at(r1, a1); const p3 = at(r1, a0);
    return `M${f1(p0.x)},${f1(p0.y)}A${r2},${r2} 0 ${large} 1 ${f1(p1.x)},${f1(p1.y)}L${f1(p2.x)},${f1(p2.y)}A${r1},${r1} 0 ${large} 0 ${f1(p3.x)},${f1(p3.y)}Z`;
  }
  function arc(r, fromMin, toMin) {
    let to = toMin;
    if (to <= fromMin) to += 1440;
    const a0 = (fromMin / 1440) * 360;
    const a1 = (to / 1440) * 360;
    const p0 = at(r, a0); const p1 = at(r, a1);
    return `M${f1(p0.x)},${f1(p0.y)}A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f1(p1.x)},${f1(p1.y)}`;
  }
  const mod = (m) => ((m % 1440) + 1440) % 1440;
  function dayDial(dayIndex, loads, w, title) {
    const day = forecast ? forecast.days[dayIndex] : null;
    const ring = day && WW.isWeekend(day.dow) ? w.home.weekend : w.home.weekday;
    let body = '<circle class="dd-face" r="96"/>';
    ring.forEach((home, h) => { if (home) body += `<path class="dd-home" d="${sector(86, 94, h * 60, h * 60 + 60)}"/>`; });
    if (forecast && forecast.weather) {
      forecast.hours.slice(dayIndex * 24, dayIndex * 24 + 24).forEach((h, i) => {
        if (h.pop >= WW.RAIN_PROB || h.rain >= WW.RAIN_MM) body += `<path class="dd-rain" d="${sector(46, 80, i * 60, i * 60 + 60)}"/>`;
        const strength = h.isDay ? Math.max(0, 1 - h.cloud / 100) * 0.9 : 0;
        if (strength > 0.03) body += `<path class="dd-sun" d="${sector(48, 48 + strength * 30, i * 60 + 6, i * 60 + 54)}"/>`;
      });
    }
    loads.forEach((l) => {
      const t = l.timing;
      if (t.prepAt < t.loadAt) body += `<path class="dd-prep" d="${arc(40, mod(t.prepAt), mod(t.loadAt))}"/>`;
      body += `<path class="dd-wash" d="${arc(40, mod(t.start), mod(t.end))}"/>`;
      const mid = at(40, ((mod(t.start) + ((t.end - t.start) / 2)) / 1440) * 360);
      body += `<circle class="dd-num-bg" cx="${f1(mid.x)}" cy="${f1(mid.y)}" r="9"/><text class="dd-num" x="${f1(mid.x)}" y="${f1(mid.y + 4)}" text-anchor="middle">${l.n}</text>`;
      if (t.drying.method === 'outside' || t.drying.method === 'outside-then-inside') {
        const to = t.drying.dryBy != null ? mod(t.drying.dryBy) : (day ? day.sunset : 19 * 60);
        if (to > mod(t.drying.hangAt)) body += `<path class="dd-dry" d="${arc(29, mod(t.drying.hangAt), to)}"/>`;
      }
    });
    body += [0, 6, 12, 18].map((h) => { const q = at(108, h * 15); return `<text class="dd-hour" x="${f1(q.x)}" y="${f1(q.y + 4)}" text-anchor="middle">${String(h).padStart(2, '0')}</text>`; }).join('');
    body += `<text class="dd-title" y="6" text-anchor="middle">${esc(title)}</text>`;
    return `<svg class="daydial" viewBox="-122 -122 244 244" role="img" aria-label="${esc(title)}: ${loads.length} ${loads.length === 1 ? 'load' : 'loads'}">${body}</svg>`;
  }

  // A load as a drum holding its pieces.
  function drum(load) {
    const pieces = [];
    load.items.forEach((it) => { for (let i = 0; i < it.count; i++) pieces.push(it); });
    const shown = pieces.slice(0, 14);
    const n = shown.length;
    const k = n > 1 ? 30 / Math.sqrt(n) : 0;
    const toks = shown.map((it, i) => {
      const p = at(k * Math.sqrt(i + 0.5) * 1.15, i * 137.508);
      const c = S.COLOURS.find((x) => x.id === it.entry.colour);
      const fill = c.swatch === 'print' ? 'url(#tok-print)' : c.swatch;
      return `<circle class="dr-tok" cx="${f1(p.x)}" cy="${f1(p.y)}" r="9" fill="${fill}"/>${nestSvg(gicon(it.garment.id), p.x, p.y, 12)}`;
    }).join('');
    const fillFrac = Math.min(1, load.kg / load.maxKg);
    const len = 2 * Math.PI * 52;
    return `<svg class="drum" viewBox="-62 -62 124 124" role="img" aria-label="${esc(load.name)}: ${load.kg} of ${load.maxKg} kg">
      <circle class="dr-rim" r="56"/>
      <circle class="dr-track" r="52"/>
      <circle class="dr-fill" r="52" stroke-dasharray="${f1(len * fillFrac)} ${f1(len)}" transform="rotate(-90)"/>
      <circle class="dr-glass" r="44"/>
      ${toks}
      ${pieces.length > shown.length ? `<text class="dr-more" y="40" text-anchor="middle">+${pieces.length - shown.length}</text>` : ''}
    </svg>`;
  }

  function gauge(frac, label) {
    const r = 22;
    const len = 2 * Math.PI * r;
    return `<svg class="mf-gauge" viewBox="0 0 56 56" aria-hidden="true"><circle class="g-track" cx="28" cy="28" r="${r}"/><circle class="g-arc g-arc--${label}" cx="28" cy="28" r="${r}" stroke-dasharray="${f1(len * Math.max(0.05, Math.min(1, frac)))} ${f1(len)}" transform="rotate(-90 28 28)"/></svg>`;
  }

  // ---- Page shell ----
  app.innerHTML = `
    <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><pattern id="tok-print" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="10" height="10" fill="#F15A24"/><rect width="3.3" height="10" fill="#E94B8B"/><rect x="6.6" width="3.4" height="10" fill="#5B2A86"/></pattern></defs></svg>
    <header class="masthead">
      <div>
        <nav class="oracle-nav" aria-label="Oracles">
          <a href="./" aria-current="page">Laundry Day</a>
          <a href="stain/">Stain Oracle</a>
          <a href="washing/">Washing Oracle</a>
          <a href="when/">When to Wash</a>
        </nav>
        <p class="brandline">Care &amp; Repair · Laundry Oracle</p>
        <h1>Laundry <span>Day</span></h1>
        <p class="lede">Put what’s in your basket in the circle. The oracle sorts it into loads, times the stain treatment, gives each load its Miele settings and plans when to run it.</p>
      </div>
      <div class="mast-basket" aria-hidden="true">${ui('basket')}</div>
    </header>

    <div class="bench">
      <form class="picker" id="day-form" aria-label="Your laundry">
        <fieldset class="q">
          <legend><span class="q-num">1</span> What’s in the basket?</legend>
          <p class="q-hint" id="basket-hint"></p>
          <div class="colour-pick" role="group" aria-label="Colour for the next piece">
            <span class="mini-h">Next piece is</span>
            <div class="swatches" id="new-colour">${S.COLOURS.map((c) => swatchBtn(c, c.id === state.colour, `data-ncolour="${c.id}"`)).join('')}</div>
          </div>
          <div class="basket-wrap">${basketMarkup()}</div>
          <div class="basket-actions">
            <button type="button" class="round-btn" id="empty"><span class="round-btn-face" aria-hidden="true">${ui('close')}</span><span>Empty the basket</span></button>
            <button type="button" class="round-btn" id="example"><span class="round-btn-face" aria-hidden="true">${ui('basket')}</span><span>Example basket</span></button>
          </div>
          <div id="editor-slot"></div>
        </fieldset>

        <fieldset class="q">
          <legend><span class="q-num">2</span> Your home and machine</legend>
          <ul class="summary" id="summary"></ul>
          <p class="mini-h">Water hardness</p>
          <div class="hardness" role="radiogroup" aria-label="Water hardness">
            ${D.HARDNESS.map((h) => `<button type="button" class="hard-btn" role="radio" data-hard="${h.id}" aria-checked="${state.hardness === h.id}"><span class="hard-face"><span class="hard-roman">${h.miele}</span></span><span class="hard-name">${esc(h.name)}</span><span class="hard-range">${esc(h.range)}</span></button>`).join('')}
          </div>
          <p class="water-co" id="water-co"></p>
        </fieldset>
      </form>

      <article class="reading" id="reading" aria-labelledby="verdict">
        <header class="reading-head">
          <div class="head-dial" id="head-dial" aria-hidden="true"></div>
          <div>
            <p class="eyebrow" id="eyebrow"></p>
            <h2 class="prophecy" id="verdict" aria-live="polite"></h2>
            <p class="omen" id="omen"></p>
          </div>
        </header>
        <div id="status"></div>
        <div class="reading-body" id="reading-body"></div>
      </article>
    </div>

    <footer class="site-foot">
      <p>Laundry Day combines the <a href="stain/">Stain Oracle</a>, the <a href="washing/">Washing Oracle</a> (Miele W1 operating instructions) and <a href="when/">When to Wash</a>. Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0). Garment weights, times and energy are estimates; your care label always wins. This is an independent tool, not affiliated with Miele.</p>
      <p>Part of the <a href="https://newtexeco.nl/en/projecten/care-repair/" target="_blank" rel="noopener">NewTexEco Care &amp; Repair</a> project.</p>
    </footer>

    <div class="dock" id="dock">
      <span class="dock-sum" id="dock-sum"></span>
      <button class="btn" type="button" id="dock-go">See the plan</button>
    </div>
  `;

  // ---- Rendering ----
  const dur = (min) => `${Math.floor(min / 60)} h${min % 60 ? ` ${String(Math.round(min % 60)).padStart(2, '0')} min` : ''}`;
  const hm = (min) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;

  function dayName(dayIndex, nowInfo) {
    if (!forecast) return '';
    const d = forecast.days[dayIndex];
    const todayIdx = forecast.days.findIndex((x) => x.date === nowInfo.date);
    if (dayIndex === todayIdx) return 'Today';
    if (dayIndex === todayIdx + 1) return 'Tomorrow';
    const [, m, day] = d.date.split('-').map(Number);
    return `${DAYLONG[d.dow]} ${day} ${MONTH[m - 1]}`;
  }

  function renderBasket() {
    $('tokens').innerHTML = tokensMarkup();
    $('editor-slot').innerHTML = editorMarkup();
    const pieces = state.basket.reduce((s, e) => s + e.count, 0);
    const kg = f1(state.basket.reduce((s, e) => s + D.GARMENTS.find((g) => g.id === e.type).kg * e.count, 0));
    $('basket-hint').textContent = state.example
      ? `Example basket: ${pieces} pieces, about ${kg} kg. Tap a garment around the edge to add your own, or a piece to change it.`
      : `${pieces} ${pieces === 1 ? 'piece' : 'pieces'}, about ${kg} kg. Tap a garment around the edge to add one.`;
    document.querySelectorAll('[data-ncolour]').forEach((b) => { const on = b.dataset.ncolour === state.colour; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
    document.querySelectorAll('[data-hard]').forEach((b) => b.setAttribute('aria-checked', b.dataset.hard === state.hardness ? 'true' : 'false'));
  }

  function renderSummary(w, machine) {
    const near = WW.nearestCity(w.lat, w.lon).city.name;
    const away = w.home.weekday.map((h, i) => (!h ? i : null)).filter((x) => x != null);
    const rhythm = away.length ? `out ${String(away[0]).padStart(2, '0')}:00–${String(away[away.length - 1] + 1).padStart(2, '0')}:00 on weekdays` : 'home all day';
    const energy = [w.solar.on ? `${w.solar.panels} solar panels` : null, w.dal ? 'double meter' : null, w.quiet ? 'quiet hours' : null].filter(Boolean).join(', ') || 'no solar, single tariff';
    const items = [
      ['pin', `${near}, ${rhythm}`, 'when/', 'Change in When to Wash'],
      ['panel', energy, 'when/', 'Change in When to Wash'],
      ['machine', machine.id === 'unknown' ? 'Miele W1, panel not chosen' : machine.name, 'washing/#machine-h', 'Choose in the Washing Oracle'],
    ];
    $('summary').innerHTML = items.map(([ic, text, href, link]) => `<li class="sum"><span class="sum-face">${ui(ic)}</span><span class="sum-text">${esc(text)}<a href="${href}">${esc(link)}</a></span></li>`).join('');
    const co = D.waterCompany(w.lat, w.lon);
    $('water-co').innerHTML = `Near ${esc(co.city)} your water probably comes from <strong>${esc(co.name)}</strong>. Look up your postcode on <a href="${co.url}" target="_blank" rel="noopener">their site</a> to find your exact hardness.`;
  }

  function render(animate) {
    persist();
    renderBasket();
    const w = whenSettings();
    const machine = WO.MACHINES.find((m) => m.id === machineId()) || WO.MACHINES[0];
    renderSummary(w, machine);

    const nowInfo = amsterdamNow();
    const fc = forecast || WW.blankForecast(nowInfo.date);
    const todayIdx = Math.max(0, fc.days.findIndex((d) => d.date === nowInfo.date));
    const now = todayIdx * 1440 + nowInfo.minutes;
    const r = D.planDay(state.basket, { machine: machine.id, hardness: state.hardness, when: w }, fc, now);
    r.loads.forEach((l, i) => { l.n = i + 1; });
    const timed = r.loads.filter((l) => l.timing);
    const days = [...new Set(timed.map((l) => l.timing.dayIndex))].sort((a, b) => a - b);

    $('eyebrow').textContent = weatherState === 'loading' ? 'Reading the forecast…' : weatherState === 'failed' ? 'No weather right now' : `Weather for ${WW.nearestCity(w.lat, w.lon).city.name}`;
    if (!r.loads.length) {
      $('verdict').textContent = state.basket.length ? 'Nothing for the machine' : 'The basket is empty';
      $('omen').textContent = state.basket.length ? 'Everything here needs a dry cleaner or hand care.' : 'Tap a garment around the basket to start.';
    } else {
      const when = days.length ? days.map((d) => dayName(d, nowInfo)).join(' and ') : 'whenever suits you';
      $('verdict').innerHTML = `${r.loads.length} ${r.loads.length === 1 ? 'load' : 'loads'}, <em>${esc(when.replace(/^(Today|Tomorrow)/, (m) => m.toLowerCase()))}</em>`;
      $('omen').textContent = `${r.totals.kg} kg of laundry, about ${hm(r.totals.minutes)} of machine time and ${r.totals.kwh} kWh in all.`;
    }
    $('head-dial').innerHTML = days.length ? dayDial(days[0], timed.filter((l) => l.timing.dayIndex === days[0]), w, DAY[fc.days[days[0]].dow]) : '';

    $('status').innerHTML = weatherState === 'failed'
      ? '<div class="callout callout--row"><span>The weather service didn’t answer, so timing ignores sun and rain. It still fits your week.</span><button type="button" class="btn btn--ghost" id="retry">Try again</button></div>'
      : '';
    if ($('retry')) $('retry').addEventListener('click', () => { try { localStorage.removeItem(WEATHER); } catch (e) { /* ignore */ } loadWeather(); });

    const dials = days.length > 1 ? `<div class="day-dials">${days.map((d) => `<figure>${dayDial(d, timed.filter((l) => l.timing.dayIndex === d), w, DAY[fc.days[d].dow])}<figcaption>${esc(dayName(d, nowInfo))}</figcaption></figure>`).join('')}</div>` : '';

    const cards = r.loads.map((l) => loadCard(l, nowInfo, w)).join('');
    const outside = r.outside.length ? `<section class="block"><h3>Not for the machine</h3><ul class="list">${r.outside.map((o) => `<li><strong>${esc(D.GARMENTS.find((g) => g.id === o.entry.type).name)} (${esc(S.COLOURS.find((c) => c.id === o.entry.colour).name.toLowerCase())}).</strong> ${esc(o.reason)}</li>`).join('')}</ul></section>` : '';
    const care = D.machineCare(state.care, nowInfo.date);
    const careRings = care.map((c) => {
      const len = 2 * Math.PI * 26;
      const label = c.days == null ? 'not logged yet' : c.days === 0 ? 'done today' : `${c.days} ${c.days === 1 ? 'day' : 'days'} ago`;
      return `<li class="care${c.due ? ' is-due' : ''}">
        <svg class="care-ring" viewBox="0 0 64 64" aria-hidden="true"><circle class="g-track" cx="32" cy="32" r="26"/><circle class="g-arc" cx="32" cy="32" r="26" stroke-dasharray="${f1(len * Math.max(0.03, c.frac))} ${f1(len)}" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle">${c.days == null ? '?' : c.days}</text></svg>
        <div><strong>${esc(c.name)}</strong><span>Every ${c.every} days · ${esc(label)}${c.due ? ' · due' : ''}</span><span class="care-how">${esc(c.how)}</span>
        <button type="button" class="unit" data-care="${c.id}">Done today</button></div>
      </li>`;
    }).join('');

    $('reading-body').innerHTML = `
      ${dials}
      ${cards ? `<ol class="dloads">${cards}</ol>` : ''}
      ${outside}
      ${r.notes.length ? `<ul class="callout">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <section class="block block--last"><h3>Look after the machine</h3><ul class="cares">${careRings}</ul></section>
    `;
    $('dock-sum').textContent = r.loads.length ? `${r.loads.length} loads${days.length ? `, ${dayName(days[0], nowInfo)}` : ''}` : 'Basket empty';

    if (animate && !reduceMotion) {
      const head = $('head-dial');
      head.classList.remove('turn');
      void head.offsetWidth;
      head.classList.add('turn');
    }
  }

  function loadCard(l, nowInfo, w) {
    const s = l.settings;
    const t = l.timing;
    const tiles = [
      { icon: s.programme.icon, value: s.programme.name, cap: 'Programme' },
      { icon: 'thermometer', value: s.temp === null ? 'Auto' : s.tempLabel, cap: 'Temperature' },
      { icon: 'spin', value: `${s.spin}`, cap: 'Spin, rpm' },
      ...s.extras.map((e) => ({ icon: e.icon, value: e.name, cap: e.auto ? 'Switches on by itself' : 'Extra' })),
      { icon: s.detergent.icon, value: s.detergent.name, cap: 'Detergent' },
    ];
    const sensors = tiles.map((x) => `<li class="sensor"><span class="sensor-face">${I.icon(x.icon)}</span><span class="sensor-value">${esc(x.value)}</span><span class="sensor-cap">${esc(x.cap)}</span></li>`).join('');

    const steps = [];
    if (t) {
      const loadDay = Math.floor(t.loadAt / 1440);
      const dayTag = loadDay !== t.dayIndex ? `${dayName(loadDay, nowInfo)}, ` : '';
      for (const p of l.prep.items) {
        const list = p.prep.steps.map((st) => esc(st.text)).join(' ');
        steps.push(`<strong>${dayTag}${WW.hhmm(t.prepAt)}</strong> · Pre-treat the ${esc(S.COLOURS.find((c) => c.id === p.entry.colour).name.toLowerCase())} ${esc(p.garment.short.toLowerCase())} (${esc(p.stainName.toLowerCase())}): ${list} <a class="more" href="stain/" data-stain-t="${p.garment.fabric}" data-stain-c="${p.entry.colour}" data-stain-s="${p.entry.stain}">Full stain advice</a>`);
      }
      if (t.startsInMin > 0) {
        const delay = Math.round(t.startsInMin / 30) * 30;
        steps.push(`<strong>${dayTag}before ${esc(t.loadLabel)}</strong> · Load it, choose ${esc(s.verdict)} and set <strong>Delay start</strong> to ${dur(delay)}, so it starts at ${esc(t.startLabel)}.`);
      } else {
        steps.push(`<strong>${esc(t.startLabel)}</strong> · Load it and start ${esc(s.verdict)}. Ready at ${esc(t.endLabel)}.`);
      }
      const dm = t.drying.method;
      if (l.drying.flat) steps.push(`<strong>${esc(t.drying.hangLabel)}</strong> · Roll it in a towel to press out water, then dry it flat inside.`);
      else if (dm === 'outside') steps.push(`<strong>${esc(t.drying.hangLabel)}</strong> · Hang it out; dry by about ${esc(t.drying.dryByLabel)}.`);
      else if (dm === 'outside-then-inside') steps.push(`<strong>${esc(t.drying.hangLabel)}</strong> · Hang it out and bring it in before dark to finish inside.`);
      else if (dm === 'dryer' && !l.drying.noTumble) steps.push(`<strong>${esc(t.drying.hangLabel)}</strong> · Into the dryer${w.solar.on ? ', ideally while the sun is on your panels' : ''}.`);
      else steps.push(`<strong>${esc(t.drying.hangLabel)}</strong> · Onto the rack inside, in a ventilated room${l.drying.noTumble && w.drying.dryer !== 'none' ? ' (not in the dryer)' : ''}.`);
    }
    const micro = l.micro ? `<div class="mf mf--${l.micro.level}">
        ${gauge(l.micro.score, l.micro.level)}
        <div><strong>Microfibre shedding: ${esc(l.micro.level)}</strong><span>${Math.round(l.micro.share * 100)}% of this load is synthetic.</span>
        <details><summary>Shed less</summary><ul class="list">${l.micro.advice.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></details></div>
      </div>` : '';
    const notes = l.labelNotes.length ? `<ul class="list label-notes">${l.labelNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
    const where = t ? `${esc(dayName(t.dayIndex, nowInfo))} · ${esc(t.startLabel)}–${esc(t.endLabel)}` : 'No time found this week';
    return `<li class="dload">
      <div class="dload-side">${drum(l)}<span class="dload-n">${l.n}</span></div>
      <div class="dload-main">
        <h3>${esc(l.name)} <span class="dload-kg">${l.kg} of ${l.maxKg} kg</span></h3>
        <p class="dload-when">${where}</p>
        <p class="dload-items">${l.items.map((i) => `${i.count}× ${esc(i.garment.short.toLowerCase())}${i.entry.stain ? ` (${esc(S.STAINS.find((x) => x.id === i.entry.stain).name.toLowerCase())})` : ''}`).join(', ')}</p>
        ${steps.length ? `<ol class="steps">${steps.map((x) => `<li><span>${x}</span></li>`).join('')}</ol>` : ''}
        <ul class="sensors sensors--sm">${sensors}</ul>
        <p class="note">${esc(l.dose)}</p>
        ${notes}
        ${micro}
      </div>
    </li>`;
  }

  // ---- Interaction ----
  const form = $('day-form');
  form.addEventListener('submit', (e) => e.preventDefault());

  function addPiece(type) {
    touch();
    const same = state.basket.find((e) => e.type === type && e.colour === state.colour && !e.stain && !e.label);
    if (same) { same.count += 1; state.selected = same.id; }
    else {
      const e = { id: newId(), type, colour: state.colour, count: 1, stain: null, label: null };
      state.basket.push(e);
      state.selected = e.id;
    }
    render(true);
  }
  const basketEl = $('basket');
  basketEl.addEventListener('click', (e) => {
    const g = e.target.closest('.gbtn');
    if (g) { addPiece(g.dataset.type); return; }
    const tok = e.target.closest('.tok');
    if (tok) { state.selected = state.selected === tok.dataset.id ? null : tok.dataset.id; renderBasket(); }
  });
  basketEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const g = e.target.closest('.gbtn');
    const tok = e.target.closest('.tok');
    if (!g && !tok) return;
    e.preventDefault();
    if (g) addPiece(g.dataset.type);
    else { state.selected = state.selected === tok.dataset.id ? null : tok.dataset.id; renderBasket(); }
  });

  $('new-colour').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ncolour]');
    if (!b) return;
    state.colour = b.dataset.ncolour;
    renderBasket();
    persist();
  });

  $('editor-slot').addEventListener('click', (e) => {
    const entry = state.basket.find((x) => x.id === state.selected);
    if (!entry) return;
    const target = e.target.closest('button');
    if (!target) return;
    touch();
    if (target.id === 'ed-close') { state.selected = null; renderBasket(); return; }
    if (target.id === 'ed-minus') { entry.count -= 1; if (entry.count < 1) { state.basket = state.basket.filter((x) => x !== entry); state.selected = null; } }
    else if (target.id === 'ed-plus') entry.count = Math.min(99, entry.count + 1);
    else if (target.id === 'ed-remove') { state.basket = state.basket.filter((x) => x !== entry); state.selected = null; }
    else if (target.dataset.ecolour) entry.colour = target.dataset.ecolour;
    else if (target.dataset.stain !== undefined) entry.stain = target.dataset.stain || null;
    else if (target.dataset.kind) {
      const k = target.dataset.kind;
      const states = D.LABEL_STATES[k];
      const cur = entry.label ? entry.label[k] : null;
      const next = states[(states.indexOf(cur) + 1) % states.length];
      entry.label = { ...(entry.label || {}), [k]: next };
      if (Object.values(entry.label).every((v) => v == null)) entry.label = null;
    } else return;
    render(true);
    const again = target.id && $(target.id) ? $(target.id) : null;
    if (again) again.focus();
  });

  $('empty').addEventListener('click', () => { state.basket = []; state.selected = null; touch(); render(true); });
  $('example').addEventListener('click', () => { state.basket = D.EXAMPLE_BASKET.map((e) => ({ ...e, id: newId() })); state.selected = null; state.example = true; render(true); });
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hard]');
    if (!b) return;
    state.hardness = b.dataset.hard;
    render(false);
  });

  $('reading-body').addEventListener('click', (e) => {
    const care = e.target.closest('[data-care]');
    if (care) {
      state.care = { ...state.care, [care.dataset.care]: amsterdamNow().date };
      render(false);
      return;
    }
    const more = e.target.closest('[data-stain-s]');
    if (more) writeJSON('laundry-oracle:v1', { t: more.dataset.stainT, c: more.dataset.stainC, s: more.dataset.stainS });
  });

  const dock = $('dock');
  $('dock-go').addEventListener('click', () => $('reading').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => entries.forEach((en) => dock.classList.toggle('is-away', en.isIntersecting)), { threshold: 0.1 }).observe($('reading'));
  }
  setInterval(() => render(false), 5 * 60 * 1000);
  window.addEventListener('focus', () => render(false));

  render(false);
  loadWeather();
})();
