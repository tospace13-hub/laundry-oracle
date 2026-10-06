/* Washing Oracle: the page. Round and polygonal controls only, like the machine itself. */
(function () {
  'use strict';

  const W = window.WashingOracle;
  const L = window.LaundryOracle;
  const I = window.WashingIcons;
  const app = document.getElementById('app');
  if (!W || !L || !I || !app) return;

  const STORE = 'washing-oracle:v1';
  const STAIN_STORE = 'laundry-oracle:v1';
  const COOKIE = 'washing_machine';
  const N = W.METRICS.length;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const esc = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const $ = (id) => document.getElementById(id);
  const rad = (deg) => (deg * Math.PI) / 180;
  // Point at radius r and angle deg, measured clockwise from 12 o'clock.
  const at = (r, deg, cx = 0, cy = 0) => ({ x: cx + r * Math.sin(rad(deg)), y: cy - r * Math.cos(rad(deg)) });
  const f = (n) => Math.round(n * 10) / 10;
  const pts = (list) => list.map((p) => `${f(p.x)},${f(p.y)}`).join(' ');
  const nest = (id, x, y, size, cls = '') => I.icon(id, cls).replace('<svg ', `<svg x="${f(x - size / 2)}" y="${f(y - size / 2)}" width="${size}" height="${size}" `);

  // ---- State: inputs in localStorage, machine in a cookie (localStorage as fallback) ----

  function readCookie(name) {
    try {
      const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
      return hit ? decodeURIComponent(hit.split('=')[1]) : null;
    } catch (e) { return null; }
  }
  function writeCookie(name, value) {
    try {
      const path = location.pathname.replace(/washing\/?(index\.html)?$/, '') || '/';
      document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=31536000; Path=${path}; SameSite=Lax`;
    } catch (e) { /* cookies blocked */ }
  }
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; } catch (e) { return null; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
  }

  const valid = {
    textile: (v) => L.TEXTILES.some((x) => x.id === v),
    colour: (v) => L.COLOURS.some((x) => x.id === v),
    soil: (v) => W.SOILS.some((x) => x.id === v),
    load: (v) => W.LOADS.some((x) => x.id === v),
    machine: (v) => W.MACHINES.some((x) => x.id === v),
  };

  const state = { ...W.DEFAULTS, point: { ...W.DEFAULTS.point } };
  const saved = readJSON(STORE);
  if (saved) {
    for (const k of ['textile', 'colour', 'soil', 'load']) if (valid[k](saved[k])) state[k] = saved[k];
    if (saved.point && Number.isFinite(saved.point.x) && Number.isFinite(saved.point.y)) state.point = W.clampToPolygon(saved.point);
  }
  let machineSaved = readCookie(COOKIE);
  if (!valid.machine(machineSaved)) machineSaved = saved && saved.machine;
  if (valid.machine(machineSaved)) state.machine = machineSaved;

  function persist() {
    writeJSON(STORE, { textile: state.textile, colour: state.colour, soil: state.soil, load: state.load, point: state.point, machine: state.machine });
  }

  // ---- Shared drawings ----

  function porthole(uid) {
    return `<svg class="porthole" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <defs><clipPath id="glass-${uid}"><circle cx="60" cy="60" r="40"/></clipPath></defs>
      <circle class="ph-rim" cx="60" cy="60" r="57"/>
      <circle class="ph-glass" cx="60" cy="60" r="40"/>
      <g clip-path="url(#glass-${uid})">
        <path class="ph-water" d="M14 72 C 30 64, 44 80, 60 72 S 90 64, 106 72 V 106 H 14 Z"/>
        <g class="ph-drum">
          <rect class="ph-a" x="33" y="31" width="26" height="12" rx="6" transform="rotate(-24 46 37)"/>
          <path class="ph-b" d="M68 34 h10 v20 a6 6 0 0 1 -6 6 h-12 a5 5 0 0 1 0 -10 h8 z"/>
          <circle class="ph-c" cx="50" cy="78" r="9"/>
          <circle class="ph-bubble" cx="78" cy="76" r="4"/>
          <circle class="ph-bubble" cx="40" cy="58" r="2.5"/>
        </g>
      </g>
      <circle class="ph-door" cx="60" cy="60" r="44"/>
      <path class="ph-shine" d="M37 46 A26 26 0 0 1 55 33"/>
    </svg>`;
  }

  const hex = (scale = 1) => W.corners(N).map((c) => ({ x: c.x * scale, y: c.y * scale }));
  // Weight shape: an even split draws a half-size polygon, a dominant metric reaches its corner.
  const weightShape = (weights, R) => W.corners(N).map((c, i) => {
    const r = R * Math.min(1, weights[i] * N * 0.5);
    return { x: c.x * r, y: c.y * r };
  });

  function radar(metrics, weights, opts = {}) {
    const R = opts.R || 90;
    const labels = opts.labels !== false;
    const vb = labels ? '-178 -128 356 256' : '-100 -100 200 200';
    const rings = [1 / 3, 2 / 3, 1].map((s) => `<polygon class="rd-ring" points="${pts(hex(R * s))}"/>`).join('');
    const spokes = hex(R).map((p) => `<line class="rd-spoke" x1="0" y1="0" x2="${f(p.x)}" y2="${f(p.y)}"/>`).join('');
    const setting = W.corners(N).map((c, i) => ({ x: c.x * R * Math.max(0.04, metrics[W.METRICS[i].id]), y: c.y * R * Math.max(0.04, metrics[W.METRICS[i].id]) }));
    const names = labels ? hex(R + 14).map((p, i) => {
      const anchor = p.x > 5 ? 'start' : p.x < -5 ? 'end' : 'middle';
      const words = W.METRICS[i].name.split(' ');
      const dy = p.y < -R ? -2 - (words.length - 1) * 14 : p.y > R ? 12 : 4 - (words.length - 1) * 7;
      const lines = words.map((w, k) => `<tspan x="${f(p.x)}" dy="${k ? 14 : 0}">${esc(w)}</tspan>`).join('');
      return `<text class="rd-label" x="${f(p.x)}" y="${f(p.y + dy)}" text-anchor="${anchor}">${lines}</text>`;
    }).join('') : '';
    return `<svg class="radar${labels ? '' : ' radar--mini'}" viewBox="${vb}" role="img" aria-label="${esc(opts.title || 'How this setting scores')}">
      ${rings}${spokes}
      <polygon class="rd-want" points="${pts(weightShape(weights, R))}"/>
      <polygon class="rd-got" points="${pts(setting)}"/>
      ${names}
    </svg>`;
  }

  function gauge(id, value, max, valueText, caption) {
    const r = 30;
    const len = 2 * Math.PI * r;
    const frac = Math.max(0.03, Math.min(1, value / max));
    return `<figure class="gauge">
      <svg viewBox="0 0 80 80" aria-hidden="true" focusable="false">
        <circle class="g-track" cx="40" cy="40" r="${r}"/>
        <circle class="g-arc" cx="40" cy="40" r="${r}" stroke-dasharray="${f(len * frac)} ${f(len)}" transform="rotate(-90 40 40)"/>
        ${nest(id, 40, 40, 30)}
      </svg>
      <figcaption><strong>${esc(valueText)}</strong><span>${esc(caption)}</span></figcaption>
    </figure>`;
  }

  // ---- Control panel drawings, one per panel type ----

  function panelDial(cx, cy, machine, r) {
    const progs = machine.programmes.map((id) => W.PROGRAMMES[id]);
    const sel = machine.programmes.indexOf(r.programme.id);
    const n = progs.length;
    const ang = (i) => -135 + (i * 270) / Math.max(1, n - 1);
    const ticks = progs.map((p, i) => {
      const a = at(48, ang(i), cx, cy);
      const b = at(i === sel ? 60 : 56, ang(i), cx, cy);
      return `<line class="pn-tick${i === sel ? ' is-lit' : ''}" x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}"/>`;
    }).join('');
    const tip = at(34, ang(sel), cx, cy);
    const off = at(53, 180, cx, cy);
    return `<circle class="pn-bezel" cx="${cx}" cy="${cy}" r="62"/>
      ${ticks}
      <circle class="pn-knob" cx="${cx}" cy="${cy}" r="40"/>
      <line class="pn-pointer" x1="${cx}" y1="${cy}" x2="${f(tip.x)}" y2="${f(tip.y)}"/>
      <circle class="pn-hub" cx="${cx}" cy="${cy}" r="5"/>
      ${nest('power', off.x, off.y, 12, 'pn-dim')}
      <text class="pn-callout" x="${cx}" y="${cy + 84}" text-anchor="middle">${esc(r.programme.name)}</text>`;
  }

  const pill = (x, y, w, label, lit, cls = '') => `<g class="pn-pill${lit ? ' is-lit' : ''} ${cls}"><rect x="${f(x - w / 2)}" y="${y - 11}" width="${w}" height="22" rx="11"/><text x="${x}" y="${y + 4}" text-anchor="middle">${esc(label)}</text></g>`;
  const sensor = (x, y, iconId, lit, caption) => `<g class="pn-sensor${lit ? ' is-lit' : ''}"><circle cx="${x}" cy="${y}" r="16"/>${nest(iconId, x, y, 20)}${caption ? `<text class="pn-cap" x="${x}" y="${y + 30}" text-anchor="middle">${esc(caption)}</text>` : ''}</g>`;
  const tempText = (t) => (t === 0 ? 'Cold' : `${t}`);

  function panelSVG(machine, r) {
    const lit = new Set(r.extras.map((e) => e.id));
    const usesTwinDos = /TwinDos/.test(r.detergent.name);
    const usesCap = /cap$/i.test(r.detergent.name) || r.detergent.extra.some((x) => /cap/i.test(x.name));
    const whites = r.colour.id === 'white' || r.colour.id === 'light';
    let body = '';

    if (machine.panel === 'D') {
      const list = machine.programmes;
      const i = list.indexOf(r.programme.id);
      const around = [list[(i - 1 + list.length) % list.length], list[i], list[(i + 1) % list.length]];
      const tiles = around.map((id, k) => {
        const y = 30 + k * 40;
        const on = k === 1;
        return `<g class="scr-tile${on ? ' is-lit' : ''}"><rect x="34" y="${y}" width="190" height="32" rx="8"/><text x="50" y="${y + 21}">${esc(W.PROGRAMMES[id].name)}</text></g>`;
      }).join('');
      const chips = [r.temp === null ? 'Auto 40–60' : r.tempLabel, `${r.spin} rpm`, ...r.extras.map((e) => e.name), ...(usesTwinDos ? [whites ? 'TwinDos Whites' : 'TwinDos Colours'] : [])];
      let cx = 250;
      let cy = 44;
      const chipSvg = chips.map((c) => {
        const w = Math.max(56, c.length * 7.4 + 22);
        if (cx + w > 500) { cx = 250; cy += 34; }
        const s = `<g class="scr-chip"><rect x="${cx}" y="${cy - 13}" width="${f(w)}" height="26" rx="13"/><text x="${f(cx + w / 2)}" y="${cy + 5}" text-anchor="middle">${esc(c)}</text></g>`;
        cx += w + 8;
        return s;
      }).join('');
      body = `<rect class="scr" x="14" y="14" width="492" height="152" rx="14"/>
        ${tiles}${chipSvg}
        <g class="scr-start"><rect x="404" y="124" width="88" height="30" rx="15"/><text x="448" y="144" text-anchor="middle">Start</text></g>
        ${machine.id === 'W2' ? '<text class="scr-brand" x="492" y="34" text-anchor="end">W2</text>' : ''}`;
      return `<svg class="panel" viewBox="0 0 520 180" role="img" aria-label="${esc(`${machine.name} with ${r.programme.name} selected`)}">${body}</svg>`;
    }

    body += `<rect class="pn-fascia" x="2" y="2" width="516" height="176" rx="16"/>`;
    body += panelDial(96, 82, machine, r);

    if (machine.panel === 'A') {
      const temps = [90, 60, 40, 30, 20, 0];
      const spins = [1400, 1200, 900, 600];
      body += `<rect class="pn-screen" x="186" y="22" width="92" height="40" rx="6"/><text class="pn-digits" x="232" y="50" text-anchor="middle">${esc(r.use.time)}</text>`;
      body += temps.map((t, k) => `<g class="pn-led${r.temp === t ? ' is-lit' : ''}"><circle cx="304" cy="${26 + k * 20}" r="4"/><text x="314" y="${30 + k * 20}">${tempText(t)}</text></g>`).join('');
      body += spins.map((s, k) => `<g class="pn-led${r.spin === s ? ' is-lit' : ''}"><circle cx="374" cy="${26 + k * 20}" r="4"/><text x="384" y="${30 + k * 20}">${s}</text></g>`).join('');
      body += `${nest('rinseHold', 380, 106, 16, 'pn-dim')}${nest('noSpin', 380, 126, 16, 'pn-dim')}`;
      body += sensor(318, 152, 'thermometer', r.temp !== null, '');
      body += sensor(390, 152, 'spin', true, '');
      body += sensor(468, 34, 'extras', lit.has('short') || lit.has('waterPlus') || lit.has('soak'), 'Extras');
      body += sensor(468, 92, 'capPlain', usesCap, 'Cap');
      body += sensor(468, 150, 'start', false, '');
    } else if (machine.panel === 'B' || machine.panel === 'generic') {
      body += `<rect class="pn-screen" x="186" y="18" width="108" height="40" rx="6"/><text class="pn-digits" x="240" y="46" text-anchor="middle">${esc(r.use.time)}</text>`;
      if (machine.panel === 'generic') {
        body += `<text class="pn-note" x="186" y="92">${esc(r.temp === null ? 'Temperature: automatic' : `Temperature: ${r.tempLabel}`)}</text>`;
        body += `<text class="pn-note" x="186" y="116">${esc(`Spin: ${r.spin} rpm`)}</text>`;
        body += `<text class="pn-note" x="186" y="140">${esc(r.extras.length ? `Extras: ${r.extras.map((e) => e.name).join(', ')}` : 'Extras: none')}</text>`;
        body += `<text class="pn-hint" x="186" y="164">Panels differ. Pick yours at the bottom of the page.</text>`;
      } else {
        if (machine.twinDos) {
          body += pill(346, 38, 76, 'Whites', usesTwinDos && whites) + pill(428, 38, 76, 'Colours', usesTwinDos && !whites);
        }
        body += `<g class="pn-sensor"><circle cx="490" cy="38" r="16"/>${nest('start', 490, 38, 20)}</g>`;
        const temps = [0, 20, 30, 40, 60, 90];
        body += temps.map((t, k) => pill(212 + k * 52, 90, 44, tempText(t), r.temp === t)).join('');
        const spins = machine.spinSteps.slice().reverse();
        body += spins.map((s, k) => pill(214 + k * 58, 124, 52, `${s}`, r.spin === s)).join('');
        body += machine.extras.map((id, k) => pill(222 + k * 84, 158, 76, W.EXTRAS[id].name, lit.has(id))).join('');
      }
    } else if (machine.panel === 'C') {
      const line = `${r.temp === null ? 'ECO' : r.temp === 0 ? 'Cold' : `${r.temp}°C`}  ${r.spin}  ${r.use.time}`;
      body += `<rect class="pn-screen" x="186" y="24" width="232" height="40" rx="6"/><text class="pn-line" x="200" y="51">${esc(line)}</text>`;
      body += `<g class="pn-sensor"><circle cx="440" cy="44" r="14"/><text class="pn-sym" x="440" y="49" text-anchor="middle">∧</text></g>`;
      body += `<g class="pn-sensor"><circle cx="472" cy="44" r="14"/><text class="pn-sym" x="472" y="49" text-anchor="middle">∨</text></g>`;
      body += `<g class="pn-sensor"><circle cx="504" cy="44" r="13"/><text class="pn-sym pn-sym--ok" x="504" y="48" text-anchor="middle">OK</text></g>`;
      const row = [
        ['singleWash', false, 'Single'],
        ['preIroning', lit.has('preIroning'), 'Iron'],
        ['waterPlus', lit.has('waterPlus'), 'Water+'],
        ['extras', ['short', 'prewash', 'soak', 'intensive', 'allergo'].some((x) => lit.has(x)), 'Extras'],
        ['twinDos', usesTwinDos, 'TwinDos'],
        ['soilNormal', usesTwinDos, 'Soil'],
        ['capText', usesCap, 'Cap'],
        ['start', false, 'Start'],
      ];
      body += row.map(([id, on, cap], k) => sensor(206 + k * 42, 112, id, on, cap)).join('');
    }
    return `<svg class="panel" viewBox="0 0 520 180" role="img" aria-label="${esc(`${machine.name}: dial on ${r.programme.name}`)}">${body}</svg>`;
  }

  // ---- Controls ----

  const PAD_R = 100;
  const SHORT_NAME = { cotton: 'Cotton', linen: 'Linen', denim: 'Denim', viscose: 'Viscose', acetate: 'Acetate', polyester: 'Polyester', nylon: 'Nylon', acrylic: 'Acrylic', sportswear: 'Sport', wool: 'Wool', cashmere: 'Cashmere', silk: 'Silk', unknown: 'Not sure' };

  function padMarkup() {
    const corners = hex(PAD_R);
    const spokes = corners.map((p) => `<line class="pad-spoke" x1="0" y1="0" x2="${f(p.x)}" y2="${f(p.y)}"/>`).join('');
    const labels = W.METRICS.map((m, i) => {
      const c = corners[i];
      const side = c.x > 5 ? 'start' : c.x < -5 ? 'end' : 'middle';
      const lx = c.x + (side === 'start' ? 14 : side === 'end' ? -14 : 0);
      const ly = c.y < -50 ? c.y - 30 : c.y > 50 ? c.y + 22 : c.y - 6;
      const words = m.name.split(' ');
      const nameLines = words.length > 1 ? `<tspan x="${f(lx)}" dy="0">${esc(words[0])}</tspan><tspan x="${f(lx)}" dy="14">${esc(words.slice(1).join(' '))}</tspan>` : `<tspan x="${f(lx)}" dy="0">${esc(m.name)}</tspan>`;
      return `<g class="corner" data-i="${i}" tabindex="0" role="button" aria-label="Lean fully towards ${esc(m.name)}">
        <circle class="corner-hit" cx="${f(c.x)}" cy="${f(c.y)}" r="16"/>
        <circle class="corner-dot" cx="${f(c.x)}" cy="${f(c.y)}" r="5"/>
        <text class="corner-name" x="${f(lx)}" y="${f(ly)}" text-anchor="${side}">${nameLines}<tspan class="corner-pct" x="${f(lx)}" dy="15" id="pct-${i}"></tspan></text>
      </g>`;
    }).join('');
    return `<div class="pad-wrap">
      <svg class="pad" id="pad" viewBox="-178 -152 356 300" tabindex="0" role="application" aria-roledescription="balance pad" aria-label="What matters most. Arrow keys move the point, Home returns to the centre." aria-describedby="pad-live">
        <polygon class="pad-face" points="${pts(corners)}"/>
        <polygon class="pad-ring" points="${pts(hex(PAD_R / 2))}"/>
        ${spokes}
        <polygon class="pad-weights" id="pad-weights" points=""/>
        ${labels}
        <g class="pad-handle" id="pad-handle"><circle class="handle-halo" r="16"/><circle class="handle-dot" r="9"/></g>
      </svg>
      <button type="button" class="round-btn" id="pad-reset"><span class="round-btn-face" aria-hidden="true">${I.icon('cog')}</span><span>Balanced</span></button>
      <p class="sr" id="pad-live" aria-live="polite"></p>
    </div>`;
  }

  function radios(name, list, labelFn) {
    return `<div class="sr" role="radiogroup" aria-label="${esc(name)}">${list.map((x) => `<input type="radio" name="${name}" id="${name}-${x.id}" value="${x.id}"><label for="${name}-${x.id}">${esc(labelFn(x))}</label>`).join('')}</div>`;
  }

  function dialMarkup() {
    const n = L.TEXTILES.length;
    const step = 360 / n;
    const ticks = L.TEXTILES.map((t, i) => {
      const a = at(98, i * step);
      const b = at(110, i * step);
      return `<line class="dial-tick" data-i="${i}" x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}"/>`;
    }).join('');
    const labels = L.TEXTILES.map((t, i) => {
      const p = at(124, i * step);
      const s = Math.sin(rad(i * step));
      const anchor = s > 0.3 ? 'start' : s < -0.3 ? 'end' : 'middle';
      return `<text class="dial-label" data-i="${i}" x="${f(p.x)}" y="${f(p.y + 5)}" text-anchor="${anchor}">${esc(SHORT_NAME[t.id] || t.name)}</text>`;
    }).join('');
    return `<div class="dial-wrap">
      ${radios('textile', L.TEXTILES, (t) => t.name)}
      <svg class="dial" id="dial" viewBox="-210 -168 420 336" aria-hidden="true" focusable="false">
        <circle class="dial-bezel" r="112"/>
        ${ticks}${labels}
        <g class="knob" id="knob">
          <circle class="knob-face" r="86"/>
          <circle class="knob-ring" r="72"/>
          <g class="knob-pointer" id="knob-pointer"><rect x="-6" y="-84" width="12" height="30" rx="6"/></g>
          <text class="knob-name" id="knob-name" y="2" text-anchor="middle"></text>
          <text class="knob-tag" id="knob-tag" y="24" text-anchor="middle"></text>
        </g>
      </svg>
    </div>`;
  }

  const PRINT_FILL = 'url(#print-fill)';
  function colourMarkup() {
    const angles = [-72, -36, 0, 36, 72];
    const sw = L.COLOURS.map((c, i) => {
      const p = at(84, angles[i], 0, 22);
      const fill = c.swatch === 'print' ? PRINT_FILL : c.swatch;
      return `<g class="sw" data-i="${i}"><circle class="sw-ring" cx="${f(p.x)}" cy="${f(p.y)}" r="19"/><circle class="sw-fill" cx="${f(p.x)}" cy="${f(p.y)}" r="13" fill="${fill}"/></g>`;
    }).join('');
    return `<div class="mini-wrap">
      ${radios('colour', L.COLOURS, (c) => c.name)}
      <svg class="mini" id="colours" viewBox="-124 -90 248 196" aria-hidden="true" focusable="false">
        <defs><pattern id="print-fill" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="12" height="12" fill="#F15A24"/><rect width="4" height="12" fill="#E94B8B"/><rect x="8" width="4" height="12" fill="#5B2A86"/></pattern></defs>
        ${sw}
        <circle class="mini-rim" cx="0" cy="22" r="46"/>
        <circle class="mini-glass" id="colour-glass" cx="0" cy="22" r="35"/>
        <path class="mini-shine" d="M-20 6 A24 24 0 0 1 -4 -6"/>
        <text class="mini-caption" id="colour-name" x="0" y="96" text-anchor="middle"></text>
      </svg>
    </div>`;
  }

  const SOIL_ANGLES = [-58, 0, 58];
  const SOIL_ICON = { light: 'soilLight', normal: 'soilNormal', heavy: 'soilHeavy' };
  function soilMarkup() {
    const opts = W.SOILS.map((s, i) => {
      const p = at(76, SOIL_ANGLES[i], 0, 30);
      return `<g class="opt" data-i="${i}">
        <circle class="opt-hit" cx="${f(p.x)}" cy="${f(p.y)}" r="20"/>
        ${nest(SOIL_ICON[s.id], p.x, p.y, 28, 'opt-icon')}
        <text class="opt-label" x="${f(p.x)}" y="${f(p.y + 30)}" text-anchor="middle">${esc(s.name)}</text>
      </g>`;
    }).join('');
    return `<div class="mini-wrap">
      ${radios('soil', W.SOILS, (s) => `${s.name}: ${s.hint}`)}
      <svg class="mini" id="soil" viewBox="-124 -90 248 196" aria-hidden="true" focusable="false">
        ${opts}
        <g class="knob knob--small" id="soil-knob">
          <circle class="knob-face" cx="0" cy="30" r="40"/>
          <g class="knob-pointer" id="soil-pointer" style="transform-origin: 0px 30px"><rect x="-5" y="-6" width="10" height="26" rx="5"/></g>
        </g>
        <text class="mini-caption" id="soil-hint" x="0" y="96" text-anchor="middle"></text>
      </svg>
    </div>`;
  }

  const LEVEL = { small: 0.32, half: 0.56, full: 0.86 };
  function loadMarkup() {
    const marks = W.LOADS.map((l, i) => {
      const y = 22 + 44 - LEVEL[l.id] * 88;
      return `<g class="opt" data-i="${i}">
        <circle class="opt-hit" cx="64" cy="${f(y)}" r="14"/>
        <circle class="lvl-dot" cx="64" cy="${f(y)}" r="5"/>
        <text class="opt-label" x="76" y="${f(y + 4)}">${esc(l.name)}</text>
      </g>`;
    }).join('');
    return `<div class="mini-wrap">
      ${radios('load', W.LOADS, (l) => `${l.name}: ${l.hint}`)}
      <svg class="mini" id="drum" viewBox="-124 -90 248 196" aria-hidden="true" focusable="false">
        <defs><clipPath id="drum-glass"><circle cx="-6" cy="22" r="44"/></clipPath></defs>
        <circle class="mini-rim" cx="-6" cy="22" r="56"/>
        <circle class="mini-glass" cx="-6" cy="22" r="44"/>
        <g clip-path="url(#drum-glass)"><path class="drum-load" id="drum-load" d=""/></g>
        <circle class="drum-door" cx="-6" cy="22" r="48"/>
        ${marks}
        <text class="mini-caption" id="load-hint" x="0" y="96" text-anchor="middle"></text>
      </svg>
    </div>`;
  }

  // ---- Page shell ----

  const machineOptions = W.MACHINES.map((m) => `<option value="${m.id}">${esc(m.label)}${m.models ? ` (${esc(m.models)})` : ''}</option>`).join('');

  app.innerHTML = `
    <header class="masthead">
      <div>
        <nav class="oracle-nav" aria-label="Oracles">
          <a href="../">Stain Oracle</a>
          <a href="./" aria-current="page">Washing Oracle</a>
          <a href="../when/">When to Wash</a>
        </nav>
        <p class="brandline">Care &amp; Repair</p>
        <h1>The Washing <span>Oracle</span></h1>
        <p class="lede">Tell the oracle what matters to you and what is in the drum. It shows the programme, temperature, spin and detergent to use on your Miele, button by button.</p>
      </div>
      ${porthole('mast')}
    </header>

    <div class="bench">
      <form class="picker fascia-form" id="w-form" aria-label="Ask the Washing Oracle">
        <fieldset class="q">
          <legend><span class="q-num">1</span> What matters most?</legend>
          <p class="q-hint">Drag the point towards what you care about. In the middle, everything counts the same.</p>
          ${padMarkup()}
        </fieldset>
        <fieldset class="q">
          <legend><span class="q-num">2</span> What is it made of?</legend>
          <p class="q-hint">Turn the dial, or tap a fabric. The care label in the side seam tells you.</p>
          ${dialMarkup()}
        </fieldset>
        <div class="q-row">
          <fieldset class="q q--mini">
            <legend><span class="q-num">3</span> Colour</legend>
            ${colourMarkup()}
          </fieldset>
          <fieldset class="q q--mini">
            <legend><span class="q-num">4</span> How dirty?</legend>
            ${soilMarkup()}
          </fieldset>
          <fieldset class="q q--mini">
            <legend><span class="q-num">5</span> How full?</legend>
            ${loadMarkup()}
          </fieldset>
        </div>
        <a class="stain-link" id="stain-link" href="../">
          <span class="round-btn-face" aria-hidden="true">${I.icon('stain')}</span>
          <span><strong>Stains?</strong> Treat them first in the Stain Oracle. Your fabric and colour come along.</span>
        </a>
      </form>

      <article class="reading" id="reading" aria-labelledby="verdict">
        <header class="reading-head">
          ${porthole('reading')}
          <div>
            <p class="eyebrow" id="eyebrow"></p>
            <h2 class="prophecy" id="verdict" aria-live="polite"></h2>
            <p class="omen" id="omen"></p>
          </div>
        </header>
        <div class="reading-body" id="reading-body"></div>
      </article>
    </div>

    <section class="machine" aria-labelledby="machine-h">
      <div class="machine-text">
        <h2 id="machine-h">Your machine</h2>
        <p>Pick the control panel that looks like yours. The oracle remembers it on this device.</p>
        <label class="machine-label" for="machine-select">Control panel</label>
        <div class="select-wrap"><select id="machine-select">${machineOptions}</select></div>
        <p class="machine-looks" id="machine-looks"></p>
        <details class="dried">
          <summary>How do I tell?</summary>
          <ul class="tell">${W.MACHINES.filter((m) => m.id !== 'unknown').map((m) => `<li><strong>${esc(m.name)}.</strong> ${esc(m.looks)}${m.models ? ` Models such as ${esc(m.models)}.` : ''}</li>`).join('')}</ul>
          <p>The letters on the type plate inside the door don’t reliably tell the panel apart, so go by what you see.</p>
        </details>
      </div>
      <div class="machine-preview" id="machine-preview"></div>
    </section>

    <footer class="site-foot">
      <p>Settings come from Miele operating instructions for W1 machines (2018–2024) and Miele product sheets. Times and energy are the manuals’ figures for a typical load; your machine adjusts them to the actual load. Icons are drawn after Miele’s panel symbols. This is an independent tool, not affiliated with Miele.</p>
      <p>Part of the <a href="https://newtexeco.nl/en/projecten/care-repair/" target="_blank" rel="noopener">NewTexEco Care &amp; Repair</a> project.</p>
    </footer>

    <div class="dock" id="dock">
      <span class="dock-sum" id="dock-sum"></span>
      <button class="btn" type="button" id="dock-go">See the settings</button>
    </div>
  `;

  // ---- Rendering ----

  const pad = $('pad');
  const dialSvg = $('dial');
  let current = null;
  let knobAngle = 0;
  let soilAngle = 0;
  let frame = 0;

  function renderPad() {
    const weights = W.weightsFromPoint(state.point);
    $('pad-weights').setAttribute('points', pts(weightShape(weights, PAD_R)));
    $('pad-handle').setAttribute('transform', `translate(${f(state.point.x * PAD_R)} ${f(state.point.y * PAD_R)})`);
    const max = Math.max(...weights);
    weights.forEach((w, i) => {
      $(`pct-${i}`).textContent = `${Math.round(w * 100)}%`;
      pad.querySelector(`.corner[data-i="${i}"]`).classList.toggle('is-strong', w === max && max - Math.min(...weights) > 0.08);
    });
    $('pad-live').textContent = W.METRICS.map((m, i) => `${m.name} ${Math.round(weights[i] * 100)}%`).join(', ');
  }

  function shortestTurn(prev, target) {
    const delta = ((((target - prev) % 360) + 540) % 360) - 180;
    return prev + delta;
  }

  function renderControls() {
    // Fabric dial
    const ti = L.TEXTILES.findIndex((t) => t.id === state.textile);
    knobAngle = shortestTurn(knobAngle, (ti * 360) / L.TEXTILES.length);
    $('knob-pointer').style.transform = `rotate(${knobAngle}deg)`;
    const t = L.TEXTILES[ti];
    $('knob-name').textContent = SHORT_NAME[t.id] || t.name;
    $('knob-tag').textContent = L.FAMILY_LABEL[t.family];
    dialSvg.querySelectorAll('.dial-label, .dial-tick').forEach((el) => el.classList.toggle('is-on', Number(el.dataset.i) === ti));

    // Colour
    const ci = L.COLOURS.findIndex((c) => c.id === state.colour);
    const c = L.COLOURS[ci];
    $('colour-glass').setAttribute('fill', c.swatch === 'print' ? PRINT_FILL : c.swatch);
    $('colour-name').textContent = c.name;
    $('colours').querySelectorAll('.sw').forEach((el) => el.classList.toggle('is-on', Number(el.dataset.i) === ci));

    // Soil knob
    const si = W.SOILS.findIndex((s) => s.id === state.soil);
    soilAngle = SOIL_ANGLES[si];
    $('soil-pointer').style.transform = `rotate(${soilAngle}deg)`;
    $('soil').querySelectorAll('.opt').forEach((el) => el.classList.toggle('is-on', Number(el.dataset.i) === si));
    $('soil-hint').textContent = W.SOILS[si].hint;

    // Load drum
    const li = W.LOADS.findIndex((l) => l.id === state.load);
    const level = LEVEL[state.load];
    const top = 22 + 44 - level * 88;
    $('drum-load').setAttribute('d', `M-60 ${f(top)} q 7.5 -9 15 0 t 15 0 t 15 0 t 15 0 t 15 0 t 15 0 t 15 0 t 15 0 V 80 H -60 Z`);
    $('drum').querySelectorAll('.opt').forEach((el) => el.classList.toggle('is-on', Number(el.dataset.i) === li));

    for (const [name, value] of [['textile', state.textile], ['colour', state.colour], ['soil', state.soil], ['load', state.load]]) {
      const input = $(`${name}-${value}`);
      if (input) input.checked = true;
    }
    $('machine-select').value = state.machine;
  }

  function renderReading(animate) {
    const r = W.advise(state);
    current = r;
    const m = r.machine;

    $('eyebrow').textContent = m.id === 'unknown' ? 'General Miele advice' : `For: ${m.name}`;
    $('verdict').innerHTML = `The oracle says: <em>${esc(r.programme.name)}</em>${r.temp === null ? '' : ` at <em>${esc(r.tempLabel)}</em>`}`;
    $('omen').innerHTML = `<span>${esc(r.omen)}</span>${r.use.approx ? '<span class="pill" data-level="2">Approximate</span>' : ''}`;
    $('load-hint').textContent = `about ${r.load.kg} kg`;

    const tiles = [
      { icon: r.programme.icon, value: r.programme.name, cap: 'Programme' },
      { icon: 'thermometer', value: r.temp === null ? 'Auto' : r.tempLabel, cap: r.temp === null ? '40–60, set by the machine' : 'Temperature' },
      { icon: 'spin', value: `${r.spin}`, cap: 'Spin, rpm' },
      ...r.extras.map((e) => ({ icon: e.icon, value: e.name, cap: e.auto ? 'Switches on by itself' : 'Extra' })),
      { icon: r.detergent.icon, value: r.detergent.name, cap: 'Detergent' },
    ];
    const sensors = tiles.map((x) => `<li class="sensor"><span class="sensor-face">${I.icon(x.icon)}</span><span class="sensor-value">${esc(x.value)}</span><span class="sensor-cap">${esc(x.cap)}</span></li>`).join('');
    const warn = r.warnings.length ? `<ul class="callout">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '';
    const alts = r.alternatives.map((a) => `<li class="alt">${radar(a.metrics, r.weights, { labels: false, title: `${a.label}: ${a.summary}` })}<div><strong>${esc(a.label)}</strong><span>${esc(a.summary)}</span></div></li>`).join('');
    const det = [r.detergent, ...r.detergent.extra].map((d) => `<li class="det"><span class="sensor-face sensor-face--sm">${I.icon(d.icon)}</span><div><strong>${esc(d.name)}</strong><span>${esc(d.detail)}</span></div></li>`).join('');

    $('reading-body').innerHTML = `
      ${warn}
      <section class="block"><h3>Your settings</h3><ul class="sensors">${sensors}</ul>
        ${r.programme.note ? `<p class="note">${esc(r.programme.note)}</p>` : ''}
      </section>
      <section class="block"><h3>What it takes${r.use.approx ? ' (approximate)' : ''}</h3>
        <div class="gauges">
          ${gauge('clock', r.use.minutes, 240, r.use.time, 'hours:minutes')}
          ${gauge('energy', r.use.kwh, 2.6, `${r.use.kwh} kWh`, 'electricity')}
          ${gauge('water', r.use.litres, 90, `${r.use.litres} L`, 'water')}
        </div>
      </section>
      <section class="block"><h3>On your machine</h3>
        <div class="panel-scroll">${panelSVG(m, r)}</div>
        <ol class="steps">${r.steps.map((s) => `<li><span>${esc(s)}</span></li>`).join('')}<li><span>Touch Start.</span></li></ol>
      </section>
      <section class="block"><h3>Detergent</h3><ul class="dets">${det}</ul></section>
      <section class="block"><h3>How it balances</h3>
        <div class="balance">
          ${radar(r.metrics, r.weights, { title: 'This setting compared with your priorities' })}
          <ul class="legend"><li><span class="key key--got"></span>This setting</li><li><span class="key key--want"></span>Your priorities</li></ul>
        </div>
        ${alts ? `<h4 class="alts-h">Or, if you’d rather</h4><ul class="alts">${alts}</ul>` : ''}
      </section>
      <section class="block block--last"><h3>Tips</h3><ul class="list">${r.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>
    `;

    $('machine-preview').innerHTML = `<div class="panel-scroll">${panelSVG(m, r)}</div>`;
    $('machine-looks').textContent = `${m.looks}${m.models ? ` Models such as ${m.models}.` : ''}`;
    $('dock-sum').textContent = r.summary;

    if (animate && !reduceMotion) {
      const head = document.querySelector('.reading-head');
      head.classList.remove('spin');
      void head.offsetWidth;
      head.classList.add('spin');
    }
  }

  function update(animate = true) {
    persist();
    renderPad();
    renderControls();
    renderReading(animate);
  }
  function updateSoon() {
    renderPad();
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      persist();
      renderReading(false);
    });
  }

  // ---- Interaction ----

  function svgPoint(svg, e) {
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }

  // Balance pad: drag, tap, corner buttons, arrow keys.
  let dragging = false;
  function padMove(e) {
    const p = svgPoint(pad, e);
    state.point = W.clampToPolygon({ x: p.x / PAD_R, y: p.y / PAD_R });
    updateSoon();
  }
  pad.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.corner')) return;
    dragging = true;
    pad.setPointerCapture(e.pointerId);
    padMove(e);
  });
  pad.addEventListener('pointermove', (e) => { if (dragging) padMove(e); });
  const endDrag = () => { if (dragging) { dragging = false; update(true); } };
  pad.addEventListener('pointerup', endDrag);
  pad.addEventListener('pointercancel', endDrag);
  pad.querySelectorAll('.corner').forEach((el) => {
    const go = () => { state.point = { ...W.corners(N)[Number(el.dataset.i)] }; update(true); };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  pad.addEventListener('keydown', (e) => {
    if (e.target !== pad) return;
    const step = 0.1;
    const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (move) {
      e.preventDefault();
      state.point = W.clampToPolygon({ x: state.point.x + move[0], y: state.point.y + move[1] });
      update(false);
    } else if (e.key === 'Home') {
      e.preventDefault();
      state.point = { x: 0, y: 0 };
      update(true);
    }
  });
  $('pad-reset').addEventListener('click', () => { state.point = { x: 0, y: 0 }; update(true); });

  // Radio-backed round controls: hidden radios for keyboard and screen readers, SVG for pointers.
  const form = $('w-form');
  form.addEventListener('change', (e) => {
    const { name, value } = e.target;
    if (['textile', 'colour', 'soil', 'load'].includes(name)) {
      state[name] = value;
      update(true);
    }
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  function choose(name, list, i) {
    const id = list[(i + list.length) % list.length].id;
    if (state[name] === id) return;
    state[name] = id;
    update(true);
  }

  // Fabric dial: tap a name or turn the knob.
  let turning = false;
  function dialPick(e) {
    const p = svgPoint(dialSvg, e);
    const deg = (Math.atan2(p.x, -p.y) * 180) / Math.PI;
    const n = L.TEXTILES.length;
    choose('textile', L.TEXTILES, Math.round((((deg % 360) + 360) % 360) / (360 / n)) % n);
  }
  dialSvg.addEventListener('pointerdown', (e) => {
    const label = e.target.closest('.dial-label');
    if (label) { choose('textile', L.TEXTILES, Number(label.dataset.i)); return; }
    turning = true;
    dialSvg.setPointerCapture(e.pointerId);
    dialPick(e);
  });
  dialSvg.addEventListener('pointermove', (e) => { if (turning) dialPick(e); });
  dialSvg.addEventListener('pointerup', () => { turning = false; });
  dialSvg.addEventListener('pointercancel', () => { turning = false; });

  $('colours').addEventListener('click', (e) => {
    const sw = e.target.closest('.sw');
    if (sw) choose('colour', L.COLOURS, Number(sw.dataset.i));
  });

  const soilSvg = $('soil');
  soilSvg.addEventListener('pointerdown', (e) => {
    const opt = e.target.closest('.opt');
    if (opt) { choose('soil', W.SOILS, Number(opt.dataset.i)); return; }
    if (e.target.closest('#soil-knob')) {
      const si = W.SOILS.findIndex((s) => s.id === state.soil);
      choose('soil', W.SOILS, (si + 1) % W.SOILS.length);
    }
  });

  const drumSvg = $('drum');
  let filling = false;
  function drumPick(e) {
    const p = svgPoint(drumSvg, e);
    const ratio = (22 + 44 - p.y) / 88;
    let best = 0;
    W.LOADS.forEach((l, i) => { if (Math.abs(LEVEL[l.id] - ratio) < Math.abs(LEVEL[W.LOADS[best].id] - ratio)) best = i; });
    choose('load', W.LOADS, best);
  }
  drumSvg.addEventListener('pointerdown', (e) => {
    const opt = e.target.closest('.opt');
    if (opt) { choose('load', W.LOADS, Number(opt.dataset.i)); return; }
    filling = true;
    drumSvg.setPointerCapture(e.pointerId);
    drumPick(e);
  });
  drumSvg.addEventListener('pointermove', (e) => { if (filling) drumPick(e); });
  drumSvg.addEventListener('pointerup', () => { filling = false; });
  drumSvg.addEventListener('pointercancel', () => { filling = false; });

  // Machine: remembered in a cookie, with localStorage as a fallback.
  $('machine-select').addEventListener('change', (e) => {
    if (!valid.machine(e.target.value)) return;
    state.machine = e.target.value;
    writeCookie(COOKIE, state.machine);
    update(true);
  });

  // Stain Oracle hand-off: open it with this fabric and colour already chosen.
  $('stain-link').addEventListener('click', () => {
    const prev = readJSON(STAIN_STORE) || {};
    writeJSON(STAIN_STORE, { t: state.textile, c: state.colour, s: prev.s || 'wine' });
  });

  // Phone dock: jump to the reading while it is off-screen.
  const dock = $('dock');
  $('dock-go').addEventListener('click', () => {
    $('reading').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((e) => dock.classList.toggle('is-away', e.isIntersecting));
    }, { threshold: 0.1 }).observe($('reading'));
  }

  update(false);
})();
