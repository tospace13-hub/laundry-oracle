/* When to Wash: the page. Circles and polygons only: map pin, clock rings, compass, round steppers. */
(function () {
  'use strict';

  const W = window.WhenToWash;
  const MAP = window.NLMap;
  const WO = window.WashingOracle;
  const L = window.LaundryOracle;
  const I = window.WashingIcons;
  const app = document.getElementById('app');
  if (!W || !MAP || !app) return;

  const STORE = 'when-to-wash:v1';
  const WEATHER = 'when-to-wash:weather:v1';
  const WEATHER_TTL = 60 * 60 * 1000;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const esc = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const $ = (id) => document.getElementById(id);
  const f1 = (n) => Math.round(n * 10) / 10;
  const rad = (deg) => (deg * Math.PI) / 180;
  const at = (r, deg) => ({ x: r * Math.sin(rad(deg)), y: -r * Math.cos(rad(deg)) });
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function readJSON(key) { try { return JSON.parse(localStorage.getItem(key)) || null; } catch (e) { return null; } }
  function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  function readCookie(name) {
    try {
      const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
      return hit ? decodeURIComponent(hit.split('=')[1]) : null;
    } catch (e) { return null; }
  }

  // ---- Local icons, same 48×48 line style as the Washing Oracle's ----
  const svgIcon = (body, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 48 48" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const ICON = {
    sun: '<circle cx="24" cy="24" r="8"/><path d="M24 6v5M24 37v5M6 24h5M37 24h5M11.3 11.3l3.5 3.5M33.2 33.2l3.5 3.5M11.3 36.7l3.5-3.5M33.2 14.8l3.5-3.5"/>',
    cloud: '<path d="M14 36 a8 8 0 0 1 0-16 a11 11 0 0 1 21-2 a8 8 0 0 1 1 18 Z"/>',
    rain: '<path d="M14 30 a8 8 0 0 1 0-16 a11 11 0 0 1 21-2 a8 8 0 0 1 1 18 Z"/><path d="M17 36l-2 5M25 36l-2 5M33 36l-2 5"/>',
    person: '<circle cx="24" cy="14" r="6"/><path d="M12 40 v-6 a12 12 0 0 1 24 0 v6"/>',
    panel: '<path d="M8 34 L14 14 H40 L34 34 Z"/><path d="M11 24 H37 M21 14 L18 34 M31 14 L28 34"/><path d="M24 34 V41 M17 41 H31"/>',
    moon: '<path d="M30 8 a16 16 0 1 0 10 26 a13 13 0 0 1 -10 -26 Z"/>',
    quiet: '<path d="M10 20 H18 L28 11 V37 L18 28 H10 Z"/><path d="M34 19 L42 29 M42 19 L34 29"/>',
    line: '<path d="M4 12 Q24 20 44 12"/><path d="M14 16 L10 20 L12 34 H22 L23 20 L19 16.5 Q16.5 19 14 16 Z"/><path d="M30 17 L28 34 H38 L37 17 Z"/>',
    rack: '<path d="M8 40 L18 12 M40 40 L30 12 M14 24 H34 M11 32 H37 M18 12 H30"/>',
    dryer: '<rect x="9" y="6" width="30" height="36" rx="4"/><circle cx="24" cy="27" r="9"/><path d="M14 12 h4 M30 12 h4"/><path d="M20 27 q2 -3 4 0 t4 0" stroke-width="2"/>',
    nodryer: '<rect x="9" y="6" width="30" height="36" rx="4"/><circle cx="24" cy="27" r="9"/><path d="M6 44 L42 4"/>',
    heatpump: '<rect x="9" y="6" width="30" height="36" rx="4"/><circle cx="24" cy="27" r="9"/><path d="M24 22 v10 M20 26 l4 -4 l4 4" stroke-width="2"/>',
    locate: '<circle cx="24" cy="24" r="10"/><circle cx="24" cy="24" r="3" fill="currentColor"/><path d="M24 6v6M24 36v6M6 24h6M36 24h6"/>',
    home: '<path d="M8 24 L24 9 L40 24"/><path d="M13 20 V40 H35 V20"/><path d="M21 40 V30 H27 V40"/>',
    plus: '<path d="M24 12 V36 M12 24 H36"/>',
    minus: '<path d="M12 24 H36"/>',
    clock: '<circle cx="24" cy="24" r="16"/><path d="M24 24 V14 M24 24 L31 28"/>',
  };
  const icon = (id, cls) => (ICON[id] ? svgIcon(ICON[id], cls) : I ? I.icon(id, cls) : '');

  // ---- State ----
  const state = JSON.parse(JSON.stringify(W.DEFAULTS));
  const saved = readJSON(STORE);
  if (saved) {
    if (Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) { state.lat = saved.lat; state.lon = saved.lon; }
    if (Number.isInteger(saved.people) && saved.people >= 1 && saved.people <= 10) state.people = saved.people;
    if (saved.loads && ['week', 'day'].includes(saved.loads.per)) state.loads = { per: saved.loads.per, count: Number.isInteger(saved.loads.count) ? saved.loads.count : null };
    for (const k of ['weekday', 'weekend']) if (saved.home && Array.isArray(saved.home[k]) && saved.home[k].length === 24) state.home[k] = saved.home[k].map(Boolean);
    for (const k of ['doneWhenHome', 'dal', 'quiet']) if (typeof saved[k] === 'boolean') state[k] = saved[k];
    if (saved.solar) {
      state.solar.on = !!saved.solar.on;
      if (Number.isInteger(saved.solar.panels) && saved.solar.panels >= 1 && saved.solar.panels <= 40) state.solar.panels = saved.solar.panels;
      if (W.FACINGS[saved.solar.facing]) state.solar.facing = saved.solar.facing;
    }
    if (saved.drying) {
      state.drying.line = saved.drying.line !== false;
      state.drying.rack = saved.drying.rack !== false;
      if (['none', 'heatpump', 'condenser'].includes(saved.drying.dryer)) state.drying.dryer = saved.drying.dryer;
    }
  }
  const persist = () => writeJSON(STORE, { lat: state.lat, lon: state.lon, people: state.people, loads: state.loads, home: state.home, doneWhenHome: state.doneWhenHome, dal: state.dal, quiet: state.quiet, solar: state.solar, drying: state.drying });

  // The programme comes from the Washing Oracle's saved choices on this site.
  function washingChoice() {
    const fallback = { name: 'ECO 40-60', minutes: 168, kwh: 0.32, machine: null, from: 'default' };
    if (!WO || !L) return fallback;
    try {
      const s = readJSON('washing-oracle:v1') || {};
      const machine = readCookie('washing_machine') || s.machine;
      const r = WO.advise({ ...s, machine: WO.MACHINES.some((m) => m.id === machine) ? machine : 'unknown' });
      return { name: r.verdict, minutes: r.use.minutes, kwh: r.use.kwh, machine: r.machine, from: s.textile ? 'saved' : 'default' };
    } catch (e) { return fallback; }
  }

  // Amsterdam wall-clock time, whatever the device's time zone.
  function amsterdamNow() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map((p) => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), clock: `${parts.hour}:${parts.minute}` };
  }

  // ---- Weather ----
  let forecast = null;
  let weatherState = 'loading'; // loading | live | cached | failed
  let weatherAt = null;
  let fetchSeq = 0;

  async function loadWeather() {
    const url = W.forecastUrl(state.lat, state.lon, state.solar.facing);
    const cache = readJSON(WEATHER);
    if (cache && cache.url === url && Date.now() - cache.at < WEATHER_TTL) {
      try {
        forecast = W.parseForecast(cache.json);
        weatherState = 'cached';
        weatherAt = cache.at;
        render(false);
        return;
      } catch (e) { /* fall through to a fresh fetch */ }
    }
    const seq = ++fetchSeq;
    weatherState = 'loading';
    render(false);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (seq !== fetchSeq) return;
      forecast = W.parseForecast(json);
      weatherState = 'live';
      weatherAt = Date.now();
      writeJSON(WEATHER, { url, at: weatherAt, json });
    } catch (e) {
      if (seq !== fetchSeq) return;
      forecast = W.blankForecast(amsterdamNow().date);
      weatherState = 'failed';
    }
    render(true);
  }
  let weatherTimer = 0;
  const loadWeatherSoon = () => { clearTimeout(weatherTimer); weatherTimer = setTimeout(loadWeather, 500); };

  // ---- Drawings ----

  // Annular sector between two minute-of-day values (0 at the top, clockwise).
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

  // A day as a 24-hour clock: home ring, sun or panel output, rain, wash and drying arcs.
  function dayDial(p, dayIndex, loads, opts = {}) {
    const day = p.days[dayIndex];
    const ring = W.isWeekend(day.dow) ? p.input.home.weekend : p.input.home.weekday;
    const hours = p.hourly.slice(dayIndex * 24, dayIndex * 24 + 24);
    let body = '<circle class="dd-face" r="96"/>';
    ring.forEach((home, h) => { if (home) body += `<path class="dd-home" d="${sector(86, 94, h * 60, h * 60 + 60)}"/>`; });
    if (p.weather) {
      const maxPv = p.kwp ? Math.max(0.5, p.kwp * 0.85 * 0.9) : 1;
      hours.forEach((h, i) => {
        if (h.wet) body += `<path class="dd-rain" d="${sector(46, 80, i * 60, i * 60 + 60)}"/>`;
        const strength = p.kwp ? h.pv / maxPv : (h.isDay ? Math.max(0, 1 - h.cloud / 100) * 0.9 : 0);
        if (strength > 0.03) body += `<path class="dd-sun" d="${sector(48, 48 + Math.min(1, strength) * 30, i * 60 + 6, i * 60 + 54)}"/>`;
      });
    }
    for (const l of loads) {
      body += `<path class="dd-wash" d="${arc(40, mod(l.start), mod(l.end))}"/>`;
      if (l.drying.method === 'outside' || l.drying.method === 'outside-then-inside') {
        const to = l.drying.dryBy != null ? mod(l.drying.dryBy) : day.sunset;
        if (to > mod(l.drying.hangAt)) body += `<path class="dd-dry" d="${arc(31, mod(l.drying.hangAt), to)}"/>`;
      }
    }
    if (opts.labels) {
      body += [0, 6, 12, 18].map((h) => { const q = at(106, h * 15); return `<text class="dd-hour" x="${f1(q.x)}" y="${f1(q.y + 4)}" text-anchor="middle">${String(h).padStart(2, '0')}</text>`; }).join('');
    }
    const nowMark = opts.now != null ? (() => { const q = at(96, (mod(opts.now) / 1440) * 360); return `<circle class="dd-now" cx="${f1(q.x)}" cy="${f1(q.y)}" r="4"/>`; })() : '';
    const verdictIcon = { great: 'sun', ok: 'cloud', indoor: 'rain', unknown: 'clock' }[day.verdict];
    const centre = opts.labels
      ? `<g class="dd-centre">${svgIcon(ICON[verdictIcon]).replace('<svg ', '<svg x="-14" y="-22" width="28" height="28" ')}<text y="22" text-anchor="middle">${esc(opts.title || DAY[day.dow])}</text></g>`
      : `<text class="dd-mini" y="5" text-anchor="middle">${esc(DAY[day.dow])}</text>`;
    const vb = opts.labels ? '-122 -122 244 244' : '-100 -100 200 200';
    return `<svg class="daydial${opts.labels ? '' : ' daydial--mini'}" viewBox="${vb}" role="img" aria-label="${esc(opts.aria || '')}">${body}${nowMark}${centre}</svg>`;
  }

  // ---- Controls ----

  const MAP_W = MAP.width;
  const MAP_H = MAP.height;
  function mapMarkup() {
    const dots = W.CITIES.map((c) => { const p = MAP.project(c.lat, c.lon); return `<circle class="map-city" cx="${f1(p.x)}" cy="${f1(p.y)}" r="3"/>`; }).join('');
    return `<div class="map-wrap">
      <svg class="nlmap" id="nlmap" viewBox="0 0 ${MAP_W} ${MAP_H}" tabindex="0" role="application" aria-roledescription="map" aria-label="Map of the Netherlands. Drag the pin or use the arrow keys to set your location." aria-describedby="where-text">
        <rect class="map-sea" width="${MAP_W}" height="${MAP_H}" rx="18"/>
        <path class="map-near" d="${MAP.be}${MAP.de}"/>
        <path class="map-land" d="${MAP.nl}"/>
        <path class="map-lake" d="${MAP.lakes}"/>
        <path class="map-river" d="${MAP.rivers}"/>
        ${dots}
        <text class="map-label" id="pin-label" x="0" y="0"></text>
        <g class="map-pin" id="map-pin"><circle class="pin-halo" r="22"/><circle class="pin-dot" r="11"/></g>
      </svg>
    </div>`;
  }

  function clockMarkup(id, label) {
    let segs = '';
    for (let h = 0; h < 24; h++) segs += `<path class="ck-seg" data-h="${h}" d="${sector(66, 96, h * 60 + 3, h * 60 + 57)}"/>`;
    const nums = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => { const q = at(108, h * 15); return `<text class="ck-num" x="${f1(q.x)}" y="${f1(q.y + 4)}" text-anchor="middle">${h}</text>`; }).join('');
    return `<figure class="clock">
      <svg class="clock-svg" id="${id}" data-ring="${id === 'ck-weekday' ? 'weekday' : 'weekend'}" viewBox="-122 -122 244 244" tabindex="0" role="application" aria-roledescription="24-hour clock" aria-label="${esc(label)}: hours someone is home. Left and right arrows pick an hour, Space switches it.">
        ${segs}
        <path class="ck-quiet" id="${id}-quiet" d=""/>
        <path class="ck-off" id="${id}-off" d=""/>
        <circle class="ck-cursor" id="${id}-cursor" r="6"/>
        ${nums}
        <text class="ck-title" y="-4" text-anchor="middle">${esc(label)}</text>
        <text class="ck-sum" id="${id}-sum" y="18" text-anchor="middle"></text>
      </svg>
    </figure>`;
  }

  function peopleMarkup() {
    const n = 10;
    const icons = Array.from({ length: n }, (_, i) => {
      const q = at(78, (i * 360) / n);
      return `<g class="ppl" data-n="${i + 1}"><circle class="ppl-hit" cx="${f1(q.x)}" cy="${f1(q.y)}" r="20"/>${svgIcon(ICON.person).replace('<svg ', `<svg x="${f1(q.x - 15)}" y="${f1(q.y - 15)}" width="30" height="30" `)}</g>`;
    }).join('');
    return `<div class="sr" role="radiogroup" aria-label="People in the household">${Array.from({ length: 10 }, (_, i) => `<input type="radio" name="people" id="people-${i + 1}" value="${i + 1}"><label for="people-${i + 1}">${i + 1}</label>`).join('')}</div>
      <svg class="people" id="people" viewBox="-110 -110 220 220" aria-hidden="true" focusable="false">
        <circle class="ppl-ring" r="78"/>
        ${icons}
        <text class="ppl-count" id="people-count" y="10" text-anchor="middle"></text>
        <text class="ppl-cap" y="32" text-anchor="middle">people</text>
      </svg>`;
  }

  const stepper = (id, label) => `<div class="stepper" role="group" aria-label="${esc(label)}">
      <button type="button" class="step-btn" id="${id}-minus" aria-label="Fewer">${svgIcon(ICON.minus)}</button>
      <output class="step-face" id="${id}-value" aria-live="polite"></output>
      <button type="button" class="step-btn" id="${id}-plus" aria-label="More">${svgIcon(ICON.plus)}</button>
    </div>`;

  const toggle = (id, iconId, label) => `<button type="button" class="rtoggle" id="${id}" aria-pressed="false"><span class="rtoggle-face">${icon(iconId)}</span><span class="rtoggle-label">${esc(label)}</span></button>`;

  function compassMarkup() {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const btns = dirs.map((d, i) => {
      const q = at(70, i * 45);
      return `<g class="cmp" data-f="${d}"><circle cx="${f1(q.x)}" cy="${f1(q.y)}" r="17"/><text x="${f1(q.x)}" y="${f1(q.y + 5)}" text-anchor="middle">${d}</text></g>`;
    }).join('');
    return `<div class="sr" role="radiogroup" aria-label="Which way the panels face">${Object.entries(W.FACINGS).map(([k, v]) => `<input type="radio" name="facing" id="facing-${k}" value="${k}"><label for="facing-${k}">${esc(v.name)}</label>`).join('')}</div>
      <svg class="compass" id="compass" viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
        <circle class="cmp-ring" r="70"/>
        <g class="cmp-needle" id="cmp-needle"><path d="M0,-46 L8,0 L0,8 L-8,0 Z"/></g>
        ${btns}
        <g class="cmp cmp--flat" data-f="flat"><circle r="22"/><text y="5" text-anchor="middle">Flat</text></g>
      </svg>`;
  }

  const cityOptions = W.CITIES.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');

  app.innerHTML = `
    <header class="masthead">
      <div>
        <nav class="oracle-nav" aria-label="Oracles">
          <a href="../">Stain Oracle</a>
          <a href="../washing/">Washing Oracle</a>
          <a href="./" aria-current="page">When to Wash</a>
        </nav>
        <p class="brandline">Care &amp; Repair · Laundry Oracle</p>
        <h1>When to <span>Wash</span></h1>
        <p class="lede">Tell it where you live and how your week runs. It reads the weather and plans your loads: on sunshine for your panels, with dry hours to hang them out, and finished when you are home.</p>
      </div>
      <div class="mast-sun" aria-hidden="true">${svgIcon(ICON.sun)}</div>
    </header>

    <div class="bench">
      <form class="picker" id="when-form" aria-label="Plan your washing">
        <fieldset class="q">
          <legend><span class="q-num">1</span> Where do you live?</legend>
          <p class="q-hint">Drag the pin, tap the map, or pick the closest city.</p>
          ${mapMarkup()}
          <div class="where-row">
            <div class="select-wrap"><label class="sr" for="city">Closest city</label><select id="city">${cityOptions}</select></div>
            <button type="button" class="round-btn" id="locate"><span class="round-btn-face" aria-hidden="true">${svgIcon(ICON.locate)}</span><span>Use my location</span></button>
          </div>
          <p class="where-text" id="where-text"></p>
        </fieldset>

        <fieldset class="q">
          <legend><span class="q-num">2</span> When is someone home?</legend>
          <p class="q-hint">Tap or drag around a clock to mark the hours someone is home. Loading, hanging out and unloading only happen while someone is home and up (06:30–22:30).</p>
          <div class="clocks">${clockMarkup('ck-weekday', 'Weekdays')}${clockMarkup('ck-weekend', 'Weekend')}</div>
          <div class="toggles">${toggle('t-done', 'home', 'Done when I get home')}</div>
        </fieldset>

        <fieldset class="q">
          <legend><span class="q-num">3</span> Your household</legend>
          <div class="household">
            <div class="hh-people">${peopleMarkup()}</div>
            <div class="hh-loads">
              <p class="mini-h">Loads</p>
              ${stepper('loads', 'Number of loads')}
              <div class="units" role="group" aria-label="Loads per">
                <button type="button" class="unit" id="per-week" aria-pressed="true">a week</button>
                <button type="button" class="unit" id="per-day" aria-pressed="false">a day</button>
              </div>
              <p class="mini-note" id="loads-note"></p>
            </div>
          </div>
        </fieldset>

        <fieldset class="q">
          <legend><span class="q-num">4</span> Energy and neighbours</legend>
          <div class="toggles">
            ${toggle('t-solar', 'panel', 'Solar panels')}
            ${toggle('t-dal', 'moon', 'Double meter (dal)')}
            ${toggle('t-quiet', 'quiet', 'Quiet hours 22–07')}
          </div>
          <div class="solar" id="solar-box">
            <div><p class="mini-h">Panels</p>${stepper('panels', 'Number of panels')}<p class="mini-note" id="kwp-note"></p></div>
            <div><p class="mini-h">They face</p>${compassMarkup()}</div>
          </div>
        </fieldset>

        <fieldset class="q">
          <legend><span class="q-num">5</span> How do you dry?</legend>
          <div class="toggles">
            ${toggle('t-line', 'line', 'Line outside')}
            ${toggle('t-rack', 'rack', 'Rack inside')}
          </div>
          <div class="toggles dryers" role="radiogroup" aria-label="Tumble dryer">
            <button type="button" class="rtoggle" data-dryer="none" role="radio"><span class="rtoggle-face">${svgIcon(ICON.nodryer)}</span><span class="rtoggle-label">No dryer</span></button>
            <button type="button" class="rtoggle" data-dryer="heatpump" role="radio"><span class="rtoggle-face">${svgIcon(ICON.heatpump)}</span><span class="rtoggle-label">Heat pump dryer</span></button>
            <button type="button" class="rtoggle" data-dryer="condenser" role="radio"><span class="rtoggle-face">${svgIcon(ICON.dryer)}</span><span class="rtoggle-label">Condenser dryer</span></button>
          </div>
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
      <p>Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0). Drying uses reference evaporation (FAO-56 ET0): a load counts as dry after about ${W.DRY_MM} mm, before dark and before rain. Solar assumes ${W.PANEL_KWP * 1000} Wp panels and ${Math.round((1 - W.SYSTEM_LOSS) * 100)}% losses, with ${W.BASE_LOAD_KW} kW used by the rest of the house. All estimates. Your location stays in your browser; only the rounded coordinates go to the weather service.</p>
      <p>Part of the <a href="https://newtexeco.nl/en/projecten/care-repair/" target="_blank" rel="noopener">NewTexEco Care &amp; Repair</a> project.</p>
    </footer>

    <div class="dock" id="dock">
      <span class="dock-sum" id="dock-sum"></span>
      <button class="btn" type="button" id="dock-go">See the plan</button>
    </div>
  `;

  // ---- Rendering ----
  let current = null;
  let washing = washingChoice();

  function placeLabel() {
    const near = W.nearestCity(state.lat, state.lon);
    const km = near.km < 1.5 ? '' : ` (${Math.round(near.km)} km)`;
    return { near, text: `Near ${near.city.name}${km} · ${state.lat.toFixed(2)}° N, ${state.lon.toFixed(2)}° E` };
  }

  function renderControls() {
    // Map pin and city
    const p = MAP.project(state.lat, state.lon);
    $('map-pin').setAttribute('transform', `translate(${f1(p.x)} ${f1(p.y)})`);
    const place = placeLabel();
    $('where-text').textContent = place.text;
    $('city').value = place.near.city.name;
    const lbl = $('pin-label');
    lbl.textContent = place.near.city.name;
    lbl.setAttribute('x', f1(p.x));
    lbl.setAttribute('y', f1(p.y - 30));
    lbl.setAttribute('text-anchor', 'middle');

    // Clocks
    for (const ringName of ['weekday', 'weekend']) {
      const id = `ck-${ringName}`;
      const svg = $(id);
      const ring = state.home[ringName];
      svg.querySelectorAll('.ck-seg').forEach((el) => el.classList.toggle('is-home', ring[Number(el.dataset.h)]));
      const homeH = ring.filter(Boolean).length;
      $(`${id}-sum`).textContent = `home ${homeH} h`;
      $(`${id}-quiet`).setAttribute('d', state.quiet ? sector(56, 61, W.QUIET.from * 60, W.QUIET.to * 60) : '');
      $(`${id}-off`).setAttribute('d', state.dal ? (ringName === 'weekend' ? sector(48, 53, 0, 1439.9) : sector(48, 53, W.OFF_PEAK.from * 60, W.OFF_PEAK.to * 60)) : '');
      const c = at(81, (cursor[ringName] + 0.5) * 15);
      const cur = $(`${id}-cursor`);
      cur.setAttribute('cx', f1(c.x));
      cur.setAttribute('cy', f1(c.y));
    }

    // Toggles
    const press = (id, on) => $(id).setAttribute('aria-pressed', on ? 'true' : 'false');
    press('t-done', state.doneWhenHome);
    press('t-solar', state.solar.on);
    press('t-dal', state.dal);
    press('t-quiet', state.quiet);
    press('t-line', state.drying.line);
    press('t-rack', state.drying.rack);
    document.querySelectorAll('[data-dryer]').forEach((b) => b.setAttribute('aria-checked', b.dataset.dryer === state.drying.dryer ? 'true' : 'false'));

    // Household
    $('people-count').textContent = state.people;
    $('people').querySelectorAll('.ppl').forEach((g) => g.classList.toggle('is-on', Number(g.dataset.n) <= state.people));
    const radio = $(`people-${state.people}`);
    if (radio) radio.checked = true;
    const suggested = W.suggestedLoadsPerWeek(state.people);
    const loadsCount = state.loads.count == null ? (state.loads.per === 'week' ? suggested : 1) : state.loads.count;
    $('loads-value').textContent = loadsCount;
    $('per-week').setAttribute('aria-pressed', state.loads.per === 'week' ? 'true' : 'false');
    $('per-day').setAttribute('aria-pressed', state.loads.per === 'day' ? 'true' : 'false');
    $('loads-note').textContent = state.loads.count == null && state.loads.per === 'week'
      ? `Suggested for ${state.people} ${state.people === 1 ? 'person' : 'people'}.`
      : `${loadsCount} ${loadsCount === 1 ? 'load' : 'loads'} ${state.loads.per === 'day' ? 'every day' : 'a week'}.`;

    // Solar
    $('solar-box').hidden = !state.solar.on;
    $('panels-value').textContent = state.solar.panels;
    $('kwp-note').textContent = `about ${f1(state.solar.panels * W.PANEL_KWP)} kWp`;
    const fr = $(`facing-${state.solar.facing}`);
    if (fr) fr.checked = true;
    $('compass').querySelectorAll('.cmp').forEach((g) => g.classList.toggle('is-on', g.dataset.f === state.solar.facing));
    const needleDeg = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 }[state.solar.facing];
    const needle = $('cmp-needle');
    needle.style.transform = needleDeg == null ? 'scale(0)' : `rotate(${needleDeg}deg)`;
  }

  function dayName(p, dayIndex, nowInfo) {
    const d = p.days[dayIndex];
    if (forecast && forecast.days[0] && d.date === nowInfo.date) return 'Today';
    const tomorrow = forecast && forecast.days.findIndex((x) => x.date === nowInfo.date) + 1;
    if (tomorrow === dayIndex) return 'Tomorrow';
    const [y, m, day] = d.date.split('-').map(Number);
    return `${DAY[d.dow]} ${day} ${MONTH[m - 1]}`;
  }
  const dur = (min) => `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')} min` : ''}`;

  function loadSteps(l, p, nowInfo, todayIdx) {
    const steps = [];
    const loadDay = Math.floor(l.loadBy / 1440);
    const whenLoad = loadDay === l.dayIndex ? '' : `${dayName(p, loadDay, nowInfo)}, `;
    if (l.startsInMin > 0) {
      const delay = Math.round(l.startsInMin / 30) * 30;
      steps.push(`${whenLoad}before ${W.hhmm(l.loadBy)}: load the machine, choose the programme and set <strong>Delay start</strong> to ${dur(delay)}, so it starts at ${l.startLabel}.`);
    } else {
      steps.push(`At ${l.startLabel}: load the machine and start it.`);
    }
    const dm = l.drying.method;
    if (dm === 'outside') steps.push(`At ${l.drying.hangLabel}: hang it out. It should be dry by about ${l.drying.dryByLabel}.`);
    else if (dm === 'outside-then-inside') steps.push(`At ${l.drying.hangLabel}: hang it out, and bring it in before dark to finish on the rack.`);
    else if (dm === 'dryer') steps.push(`At ${l.drying.hangLabel}: into the ${state.drying.dryer === 'heatpump' ? 'heat pump dryer' : 'dryer'}${p.input.solar.on ? ', ideally while the sun is on your panels' : ''}.`);
    else steps.push(`At ${l.drying.hangLabel}: onto the rack inside, near an open window or in a ventilated room.`);
    return steps;
  }

  function render(animate) {
    persist();
    renderControls();
    const nowInfo = amsterdamNow();
    const fc = forecast || W.blankForecast(nowInfo.date);
    const todayIdx = Math.max(0, fc.days.findIndex((d) => d.date === nowInfo.date));
    const now = todayIdx * 1440 + nowInfo.minutes;
    const p = W.plan({
      lat: state.lat, lon: state.lon, people: state.people, loads: state.loads, home: state.home,
      doneWhenHome: state.doneWhenHome, solar: state.solar, dal: state.dal, quiet: state.quiet, drying: state.drying,
      programme: { name: washing.name, minutes: washing.minutes, kwh: washing.kwh },
    }, fc, now);
    current = p;

    const place = placeLabel();
    const updated = weatherAt ? new Date(weatherAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }) : '';
    $('eyebrow').textContent = weatherState === 'loading' ? `Reading the sky over ${place.near.city.name}…`
      : weatherState === 'failed' ? `${place.near.city.name} · no weather right now`
        : `Weather for ${place.near.city.name} · updated ${updated}`;

    const first = p.loads[0];
    if (first) {
      $('verdict').innerHTML = `Wash <em>${esc(dayName(p, first.dayIndex, nowInfo).replace(/^(Today|Tomorrow)$/, (m) => m.toLowerCase()))}</em> at <em>${esc(first.startLabel)}</em>`;
      $('omen').textContent = first.why[0] || 'It fits your week.';
    } else {
      $('verdict').textContent = 'Nothing fits yet';
      $('omen').textContent = 'Mark more hours at home, or switch off quiet hours.';
    }
    $('head-dial').innerHTML = first ? dayDial(p, first.dayIndex, p.loads.filter((l) => l.dayIndex === first.dayIndex), { now: first.dayIndex === todayIdx ? now : null }) : '';

    const status = weatherState === 'failed'
      ? `<div class="callout callout--row"><span>The weather service didn’t answer, so this plan ignores sun and rain. It still fits your week, tariff and quiet hours.</span><button type="button" class="btn btn--ghost" id="retry">Try again</button></div>`
      : weatherState === 'loading' ? '<p class="loading">Fetching the forecast…</p>' : '';
    $('status').innerHTML = status;
    if ($('retry')) $('retry').addEventListener('click', () => { try { localStorage.removeItem(WEATHER); } catch (e) { /* ignore */ } loadWeather(); });

    const loadCards = p.loads.map((l, i) => {
      const chips = [];
      if (p.input.solar.on && p.weather) chips.push(`<li class="chip-r"><span class="chip-ic">${svgIcon(ICON.panel)}</span>${Math.round(l.solarShare * 100)}% solar · ${l.solarKWh} kWh</li>`);
      if (p.input.dal) chips.push(`<li class="chip-r"><span class="chip-ic">${svgIcon(ICON.moon)}</span>${Math.round(l.offPeakShare * 100)}% off-peak</li>`);
      const dryIcon = { outside: 'line', 'outside-then-inside': 'line', inside: 'rack', dryer: 'dryer' }[l.drying.method];
      const dryText = { outside: `Dry outside by ${l.drying.dryByLabel}`, 'outside-then-inside': 'Mostly dry outside', inside: 'Rack inside', dryer: 'Dryer' }[l.drying.method];
      chips.push(`<li class="chip-r"><span class="chip-ic">${svgIcon(ICON[dryIcon])}</span>${esc(dryText)}</li>`);
      if (l.dryerSavedKWh) chips.push(`<li class="chip-r"><span class="chip-ic">${svgIcon(ICON.nodryer)}</span>saves ~${l.dryerSavedKWh} kWh</li>`);
      const steps = loadSteps(l, p, nowInfo, todayIdx);
      return `<li class="load${i === 0 ? ' load--next' : ''}">
        ${dayDial(p, l.dayIndex, [l], { labels: true, title: DAY[l.dow], now: l.dayIndex === todayIdx ? now : null, aria: `${dayName(p, l.dayIndex, nowInfo)}: wash ${l.startLabel} to ${l.endLabel}` })}
        <div class="load-text">
          <h3>${esc(dayName(p, l.dayIndex, nowInfo))} · ${esc(l.startLabel)}–${esc(l.endLabel)}</h3>
          <ol class="steps">${steps.map((s) => `<li><span>${s}</span></li>`).join('')}</ol>
          <ul class="chips-r">${chips.join('')}</ul>
          ${l.why.length ? `<p class="why">${esc(l.why.join(' '))}</p>` : ''}
        </div>
      </li>`;
    }).join('');

    const week = p.days.map((d, i) => {
      const verdict = { great: 'Great drying day', ok: 'OK drying day', indoor: 'Indoor drying day', unknown: 'No weather' }[d.verdict];
      const n = p.loads.filter((l) => l.dayIndex === i).length;
      return `<li class="wk${i < todayIdx ? ' is-past' : ''}">
        ${dayDial(p, i, p.loads.filter((l) => l.dayIndex === i), { aria: `${DAY[d.dow]}: ${verdict}` })}
        <span class="wk-v wk-v--${d.verdict}">${esc(verdict.replace(' drying day', ''))}</span>
        <span class="wk-n">${n ? `${n} ${n === 1 ? 'load' : 'loads'}` : '–'}</span>
      </li>`;
    }).join('');

    const warns = p.warnings.length ? `<ul class="callout">${p.warnings.map((w) => `<li>${w.dayIndex != null ? `${esc(dayName(p, w.dayIndex, nowInfo))}: ` : ''}${esc(w.text)}</li>`).join('')}</ul>` : '';
    const machineNote = washing.machine && washing.machine.id !== 'unknown' ? ` on your ${esc(washing.machine.name.toLowerCase())}` : '';

    $('reading-body').innerHTML = `
      ${warns}
      <section class="block"><h3>The week</h3>
        <ul class="week">${week}</ul>
        <ul class="legend legend--dial">
          <li><span class="key key--home"></span>someone home</li>
          <li><span class="key key--sun"></span>${p.input.solar.on ? 'solar power' : 'sunshine'}</li>
          <li><span class="key key--rain"></span>rain</li>
          <li><span class="key key--wash"></span>washing</li>
          <li><span class="key key--dry"></span>drying outside</li>
        </ul>
      </section>
      <section class="block"><h3>Your loads</h3>
        ${loadCards ? `<ol class="loads">${loadCards}</ol>` : '<p class="note">No load fits yet.</p>'}
      </section>
      <section class="block block--last"><h3>Planning with</h3>
        <p class="plan-with"><strong>${esc(washing.name)}</strong>, ${esc(W.hhmm(washing.minutes))} and about ${washing.kwh} kWh a load${machineNote}. ${washing.from === 'saved' ? 'From your Washing Oracle choices.' : 'The Washing Oracle’s everyday default.'} <a href="../washing/">Change it in the Washing Oracle</a>.</p>
      </section>
    `;
    $('dock-sum').textContent = first ? `Next: ${dayName(p, first.dayIndex, nowInfo)} ${first.startLabel}` : 'Nothing fits yet';

    if (animate && !reduceMotion) {
      const head = $('head-dial');
      head.classList.remove('turn');
      void head.offsetWidth;
      head.classList.add('turn');
    }
  }

  // ---- Interaction ----

  function svgPoint(svg, e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  const clampLat = (v) => Math.max(MAP.frame.south + 0.05, Math.min(MAP.frame.north - 0.05, v));
  const clampLon = (v) => Math.max(MAP.frame.west + 0.05, Math.min(MAP.frame.east - 0.05, v));

  // Map: drag the pin, tap to move it, arrows to nudge.
  const map = $('nlmap');
  let dragging = false;
  function mapMove(e) {
    const q = svgPoint(map, e);
    const g = MAP.unproject(q.x, q.y);
    state.lat = clampLat(g.lat);
    state.lon = clampLon(g.lon);
    renderControls();
  }
  map.addEventListener('pointerdown', (e) => { dragging = true; map.setPointerCapture(e.pointerId); mapMove(e); });
  map.addEventListener('pointermove', (e) => { if (dragging) mapMove(e); });
  const mapDone = () => { if (!dragging) return; dragging = false; render(false); loadWeatherSoon(); };
  map.addEventListener('pointerup', mapDone);
  map.addEventListener('pointercancel', mapDone);
  map.addEventListener('keydown', (e) => {
    const step = 0.03;
    const mv = { ArrowUp: [step, 0], ArrowDown: [-step, 0], ArrowLeft: [0, -step * 1.6], ArrowRight: [0, step * 1.6] }[e.key];
    if (mv) {
      e.preventDefault();
      state.lat = clampLat(state.lat + mv[0]);
      state.lon = clampLon(state.lon + mv[1]);
      render(false);
      loadWeatherSoon();
    } else if (e.key === 'Home') {
      e.preventDefault();
      state.lat = W.HOME_CITY.lat;
      state.lon = W.HOME_CITY.lon;
      render(false);
      loadWeatherSoon();
    }
  });
  $('city').addEventListener('change', (e) => {
    const c = W.CITIES.find((x) => x.name === e.target.value);
    if (!c) return;
    state.lat = c.lat;
    state.lon = c.lon;
    render(false);
    loadWeather();
  });
  $('locate').addEventListener('click', () => {
    const where = $('where-text');
    if (!navigator.geolocation) { where.textContent = 'This browser can’t share its location. Drag the pin instead.'; return; }
    where.textContent = 'Finding you…';
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      if (latitude < MAP.frame.south || latitude > MAP.frame.north || longitude < MAP.frame.west || longitude > MAP.frame.east) {
        where.textContent = 'You seem to be outside the Netherlands. Drag the pin to your home instead.';
        return;
      }
      state.lat = latitude;
      state.lon = longitude;
      render(false);
      loadWeather();
    }, () => { where.textContent = 'No location shared. Drag the pin or pick a city.'; }, { timeout: 10000, maximumAge: 600000 });
  });

  // Clock rings: tap or drag to paint hours home or away; arrows and Space from the keyboard.
  const cursor = { weekday: 8, weekend: 10 };
  for (const ringName of ['weekday', 'weekend']) {
    const svg = $(`ck-${ringName}`);
    let paint = null;
    const hourAtPointer = (e) => {
      const q = svgPoint(svg, e);
      const r = Math.hypot(q.x, q.y);
      if (r < 50 || r > 112) return null;
      const deg = ((Math.atan2(q.x, -q.y) * 180) / Math.PI + 360) % 360;
      return Math.floor(deg / 15) % 24;
    };
    svg.addEventListener('pointerdown', (e) => {
      const h = hourAtPointer(e);
      if (h == null) return;
      paint = !state.home[ringName][h];
      state.home[ringName][h] = paint;
      cursor[ringName] = h;
      svg.setPointerCapture(e.pointerId);
      renderControls();
    });
    svg.addEventListener('pointermove', (e) => {
      if (paint == null) return;
      const h = hourAtPointer(e);
      if (h == null || state.home[ringName][h] === paint) return;
      state.home[ringName][h] = paint;
      cursor[ringName] = h;
      renderControls();
    });
    const end = () => { if (paint == null) return; paint = null; render(true); };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); cursor[ringName] = (cursor[ringName] + 1) % 24; renderControls(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); cursor[ringName] = (cursor[ringName] + 23) % 24; renderControls(); }
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); state.home[ringName][cursor[ringName]] = !state.home[ringName][cursor[ringName]]; render(true); }
    });
  }

  // Toggles
  const flip = (id, fn) => $(id).addEventListener('click', () => { fn(); render(true); });
  flip('t-done', () => { state.doneWhenHome = !state.doneWhenHome; });
  flip('t-dal', () => { state.dal = !state.dal; });
  flip('t-quiet', () => { state.quiet = !state.quiet; });
  flip('t-line', () => { state.drying.line = !state.drying.line; });
  flip('t-rack', () => { state.drying.rack = !state.drying.rack; });
  $('t-solar').addEventListener('click', () => { state.solar.on = !state.solar.on; render(true); if (state.solar.on) loadWeather(); });
  document.querySelectorAll('[data-dryer]').forEach((b) => b.addEventListener('click', () => { state.drying.dryer = b.dataset.dryer; render(true); }));

  // People ring
  const form = $('when-form');
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', (e) => {
    if (e.target.name === 'people') { state.people = Number(e.target.value); render(true); }
    if (e.target.name === 'facing') { state.solar.facing = e.target.value; render(true); loadWeather(); }
  });
  $('people').addEventListener('click', (e) => {
    const g = e.target.closest('.ppl');
    if (!g) return;
    state.people = Number(g.dataset.n);
    render(true);
  });

  // Loads stepper and units
  const loadsNow = () => (state.loads.count == null ? (state.loads.per === 'week' ? W.suggestedLoadsPerWeek(state.people) : 1) : state.loads.count);
  $('loads-minus').addEventListener('click', () => { state.loads.count = Math.max(1, loadsNow() - 1); render(true); });
  $('loads-plus').addEventListener('click', () => { state.loads.count = Math.min(state.loads.per === 'day' ? 4 : 21, loadsNow() + 1); render(true); });
  $('per-week').addEventListener('click', () => { if (state.loads.per !== 'week') { state.loads = { per: 'week', count: null }; render(true); } });
  $('per-day').addEventListener('click', () => { if (state.loads.per !== 'day') { state.loads = { per: 'day', count: 1 }; render(true); } });

  // Solar panels and compass
  $('panels-minus').addEventListener('click', () => { state.solar.panels = Math.max(1, state.solar.panels - 1); render(true); });
  $('panels-plus').addEventListener('click', () => { state.solar.panels = Math.min(40, state.solar.panels + 1); render(true); });
  $('compass').addEventListener('click', (e) => {
    const g = e.target.closest('.cmp');
    if (!g || g.dataset.f === state.solar.facing) return;
    state.solar.facing = g.dataset.f;
    render(true);
    loadWeather();
  });

  // Phone dock
  const dock = $('dock');
  $('dock-go').addEventListener('click', () => $('reading').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => entries.forEach((e) => dock.classList.toggle('is-away', e.isIntersecting)), { threshold: 0.1 }).observe($('reading'));
  }

  // Refresh "now" every few minutes so the plan never offers a time that has passed.
  setInterval(() => render(false), 5 * 60 * 1000);
  window.addEventListener('focus', () => { washing = washingChoice(); render(false); });

  render(false);
  loadWeather();
})();
