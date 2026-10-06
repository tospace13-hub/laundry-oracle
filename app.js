/* Laundry Oracle: the page. Builds the three questions, asks oracle.js, draws the reading. */
(function () {
  'use strict';

  const O = window.LaundryOracle;
  const app = document.getElementById('app');
  if (!O || !app) return;

  const STORE = 'laundry-oracle:v1';
  const EXAMPLE = { t: 'cotton', c: 'white', s: 'wine' };
  const CARE_REPAIR_URL = 'https://newtexeco.nl/en/projecten/care-repair/';

  const esc = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const has = (list, id) => list.some((x) => x.id === id);

  function loadChoice() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE));
      if (v && has(O.TEXTILES, v.t) && has(O.COLOURS, v.c) && has(O.STAINS, v.s)) return v;
    } catch (e) { /* storage unavailable: fall back to the example */ }
    return null;
  }
  function saveChoice(v) {
    try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (e) { /* not essential */ }
  }

  // ---- Drawings ----

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
          <circle class="ph-bubble" cx="64" cy="50" r="2"/>
        </g>
      </g>
      <circle class="ph-door" cx="60" cy="60" r="44"/>
      <path class="ph-shine" d="M37 46 A26 26 0 0 1 55 33"/>
    </svg>`;
  }

  // ISO 3758 care symbols, drawn in currentColor.
  const svg = (inner) => `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${inner}</svg>`;
  const CROSS = '<path d="M6 6 L42 42 M42 6 L6 42"/>';

  function washSymbol(w) {
    const tub = '<path d="M5 15 L10 37 H38 L43 15"/><path d="M5 15 q4.75 -4 9.5 0 t9.5 0 t9.5 0 t9.5 0"/>';
    const inner = w.hand
      ? '<path d="M18 34 v-9 c0-2 3-2 3 0 v-3 c0-2 3-2 3 0 v1 c0-2 3-2 3 0 v1 c0-2 3-2 3 0 v7 c0 3-2 5-5 5 h-3 c-2 0-4-1-4-2z" stroke-width="2"/>'
      : `<text x="24" y="32" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" stroke="none" font-family="inherit">${w.temp}</text>`;
    const bars = w.hand ? '' : w.gentle === 2 ? '<path d="M10 42 H38 M10 46 H38" stroke-width="2"/>' : w.gentle === 1 ? '<path d="M10 43 H38" stroke-width="2"/>' : '';
    return svg(tub + inner + bars);
  }
  function bleachSymbol(b) {
    const tri = '<path d="M24 7 L43 39 H5 Z"/>';
    if (b === 'oxygen') return svg(tri + '<path d="M19 34 L26 22 M25 34 L32 22" stroke-width="2"/>');
    if (b === 'none') return svg(tri + CROSS);
    return svg(tri);
  }
  function tumbleSymbol(level) {
    const box = '<rect x="7" y="7" width="34" height="34" rx="1"/><circle cx="24" cy="24" r="12"/>';
    if (level === 0) return svg(box + CROSS);
    const dots = level === 1 ? '<circle cx="24" cy="24" r="2.2" fill="currentColor" stroke="none"/>'
      : '<circle cx="20" cy="24" r="2.2" fill="currentColor" stroke="none"/><circle cx="28" cy="24" r="2.2" fill="currentColor" stroke="none"/>';
    return svg(box + dots);
  }
  function ironSymbol(dots) {
    const iron = '<path d="M5 36 L9 24 Q11 18 18 18 H41 V36 Z"/><path d="M19 18 Q19 12 25 12 H41"/>';
    if (dots === 0) return svg(iron + CROSS);
    const xs = { 1: [26], 2: [22, 30], 3: [19, 26, 33] }[dots];
    return svg(iron + xs.map((x) => `<circle cx="${x}" cy="28" r="2" fill="currentColor" stroke="none"/>`).join(''));
  }
  function proSymbol() {
    return svg('<circle cx="24" cy="24" r="17"/><text x="24" y="30" text-anchor="middle" font-size="17" font-weight="700" fill="currentColor" stroke="none" font-family="inherit">P</text>');
  }

  // ---- Static shell ----

  const textileChips = O.TEXTILES.map((t) => `
    <input class="sr" type="radio" name="textile" id="t-${t.id}" value="${t.id}">
    <label class="chip chip--textile" for="t-${t.id}"><span>${esc(t.name)}</span><span class="chip-tag">${esc(O.FAMILY_LABEL[t.family])}</span></label>`).join('');

  const colourChips = O.COLOURS.map((c) => {
    const sw = c.swatch === 'print' ? '<span class="swatch swatch--print"></span>' : `<span class="swatch" style="background:${c.swatch}"></span>`;
    return `
    <input class="sr" type="radio" name="colour" id="c-${c.id}" value="${c.id}">
    <label class="chip" for="c-${c.id}">${sw}<span>${esc(c.name)}</span></label>`;
  }).join('');

  const stainGroups = O.STAIN_FAMILIES.map((f) => {
    const chips = O.STAINS.filter((s) => s.family === f.id).map((s) => `
      <input class="sr" type="radio" name="stain" id="s-${s.id}" value="${s.id}">
      <label class="chip" for="s-${s.id}">${esc(s.name)}</label>`).join('');
    return `<div class="stain-group" role="group" aria-labelledby="g-${f.id}">
      <p class="group-head" id="g-${f.id}"><span class="group-name">${esc(f.name)}</span><span>${esc(f.note)}</span></p>
      <div class="chips">${chips}</div>
    </div>`;
  }).join('');

  app.innerHTML = `
    <header class="masthead">
      <div>
        <nav class="oracle-nav" aria-label="Oracles">
          <a href="./" aria-current="page">Stain Oracle</a>
          <a href="washing/">Washing Oracle</a>
        </nav>
        <p class="brandline">Care &amp; Repair · Laundry Oracle</p>
        <h1>The Stain <span>Oracle</span></h1>
        <p class="lede">Tell the oracle what your garment is made of, what colour it is and what you spilled on it. It tells you how to get the stain out without ruining the fabric.</p>
      </div>
      ${porthole('mast')}
    </header>

    <div class="bench">
      <form class="picker" id="picker" aria-label="Consult the oracle">
        <fieldset class="q">
          <legend><span class="q-num">1</span> What is it made of?</legend>
          <p class="q-hint">Look for the fibre on the care label, usually in a side seam.</p>
          <div class="chips chips--grid">${textileChips}</div>
        </fieldset>
        <fieldset class="q">
          <legend><span class="q-num">2</span> What colour is it?</legend>
          <p class="q-hint">Colour decides which bleach, how hot, and whether sunlight helps or hurts.</p>
          <div class="chips">${colourChips}</div>
        </fieldset>
        <fieldset class="q">
          <legend><span class="q-num">3</span> What did you spill?</legend>
          <p class="q-hint">Stains are grouped by chemistry, because that decides the treatment.</p>
          <div class="stain-groups">${stainGroups}</div>
        </fieldset>
      </form>

      <article class="reading" id="reading" aria-labelledby="prophecy">
        <header class="reading-head">
          ${porthole('reading')}
          <div>
            <p class="eyebrow" id="eyebrow"></p>
            <h2 class="prophecy" id="prophecy" aria-live="polite"></h2>
            <p class="omen" id="omen"></p>
          </div>
        </header>
        <div class="reading-body" id="reading-body"></div>
        <div class="actions">
          <button class="btn" type="button" id="copy">Copy instructions</button>
          <a class="btn btn--ghost" id="to-washing" href="washing/">Next: how to wash it</a>
          <span class="copy-status" id="copy-status" role="status"></span>
          <textarea class="copy-fallback" id="copy-fallback" readonly hidden aria-label="Instructions to copy"></textarea>
        </div>
      </article>
    </div>

    <footer class="site-foot">
      <p>Your care label wins. Always test on a hidden seam first. The oracle gives general advice for home laundry; valuable, vintage or dry-clean-only pieces belong with a professional.</p>
      <p>Part of the <a href="${CARE_REPAIR_URL}" target="_blank" rel="noopener">NewTexEco Care &amp; Repair</a> project.</p>
    </footer>

    <div class="dock" id="dock">
      <span class="dock-sum" id="dock-sum"></span>
      <button class="btn" type="button" id="dock-go">Read the oracle</button>
    </div>
  `;

  // ---- Reading ----

  const $ = (id) => document.getElementById(id);
  const form = $('picker');
  const readingHead = app.querySelector('.reading-head');
  let current = null;

  function renderReading(choice, mode) {
    const r = O.consult(choice.t, choice.c, choice.s);
    current = r;

    $('eyebrow').textContent = {
      example: 'Example reading. Change any answer to ask your own.',
      restored: 'Your last reading',
      live: 'Your reading',
    }[mode];

    $('prophecy').innerHTML = `The oracle sees <em>${esc(r.stain.phrase)}</em> on <em>${esc(r.colour.phrase)} ${esc(r.textile.phrase)}</em>…`;

    const meter = [1, 2, 3, 4].map((n) => `<i class="${n <= r.difficulty ? 'on' : ''}"></i>`).join('');
    $('omen').innerHTML = `<span class="pill" data-level="${r.difficulty}"><span class="meter" aria-hidden="true">${meter}</span>${esc(r.difficultyLabel)}</span><span>${esc(r.omen)}</span>`;

    const li = (items) => items.map((x) => `<li>${esc(x)}</li>`).join('');
    const steps = r.steps.map((s) => `<li><span>${s.caution ? '<span class="caution">Test first</span>' : ''}${esc(s.text)}</span></li>`).join('');

    const c = r.care;
    const washCap = c.wash.hand ? `Hand wash, max ${c.wash.temp} °C` : `${c.wash.temp} °C${c.wash.gentle === 2 ? ', delicates' : c.wash.gentle === 1 ? ', gentle' : ''}`;
    const symbols = [
      { svg: washSymbol(c.wash), cap: washCap },
      { svg: bleachSymbol(c.bleach), cap: { any: 'Any bleach', oxygen: 'Oxygen bleach only', none: 'No bleach' }[c.bleach] },
      { svg: tumbleSymbol(c.tumble), cap: ['No tumble dryer', 'Tumble low', 'Tumble normal'][c.tumble] },
      { svg: ironSymbol(c.iron), cap: c.iron === 0 ? 'Do not iron' : `Iron max ${O.IRON[c.iron].max} °C` },
    ];
    if (c.professional) symbols.push({ svg: proSymbol(), cap: 'Dry cleaner', on: true });
    const symbolRow = symbols.map((s) => `<figure class="care-sym${s.on ? ' is-on' : ''}">${s.svg}<figcaption>${esc(s.cap)}</figcaption></figure>`).join('');

    $('reading-body').innerHTML = `
      <section class="block act-now"><h3>Act now</h3><ul class="list">${li(r.firstAid)}</ul></section>
      <section class="block"><h3>${r.difficulty === 4 ? 'What to do' : 'Treatment'}</h3><ol class="steps">${steps}</ol></section>
      <section class="block forbid"><h3>The oracle forbids</h3><ul class="list">${li(r.never)}</ul></section>
      <section class="block"><h3>Wash &amp; dry</h3>
        <div class="care-row">${symbolRow}</div>
        <ul class="care-lines">${li(c.lines)}</ul>
      </section>
      <section class="block"><h3>You’ll need</h3><ul class="kit-list">${li(r.kit)}</ul></section>
      <p class="tip"><strong>${esc(r.textile.name)} tip.</strong> ${esc(r.handling)}</p>
      <details class="dried">
        <summary>Already dried in, or been through the dryer?</summary>
        <p>${esc(r.dried)}</p>
        <p>If it has been tumble dried or ironed, the heat may have set it. You can still try, but expect a shadow to remain.</p>
      </details>
    `;

    $('dock-sum').textContent = `${r.stain.name} · ${r.colour.phrase} ${r.textile.phrase}`;
    $('copy-status').textContent = '';
    $('copy-fallback').hidden = true;
  }

  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // restart the CSS animation
    el.classList.add(cls);
  }

  function readForm() {
    const v = (name) => (form.querySelector(`input[name="${name}"]:checked`) || {}).value;
    return { t: v('textile'), c: v('colour'), s: v('stain') };
  }

  function setForm(choice) {
    $(`t-${choice.t}`).checked = true;
    $(`c-${choice.c}`).checked = true;
    $(`s-${choice.s}`).checked = true;
  }

  form.addEventListener('change', () => {
    const choice = readForm();
    if (!choice.t || !choice.c || !choice.s) return;
    saveChoice(choice);
    renderReading(choice, 'live');
    replay(readingHead, 'spin');
    replay($('reading-body'), 'fresh');
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  // ---- Copy ----

  // Washing Oracle hand-off: open it with this fabric and colour already chosen.
  $('to-washing').addEventListener('click', () => {
    if (!current) return;
    try {
      const key = 'washing-oracle:v1';
      const prev = JSON.parse(localStorage.getItem(key)) || {};
      localStorage.setItem(key, JSON.stringify({ ...prev, textile: current.textile.id, colour: current.colour.id }));
    } catch (e) { /* storage unavailable: the link still works */ }
  });

  $('copy').addEventListener('click', () => {
    if (!current) return;
    const text = O.toText(current);
    const status = $('copy-status');
    const area = $('copy-fallback');
    const fallback = () => {
      area.value = text;
      area.hidden = false;
      area.focus();
      area.select();
      status.textContent = 'Text selected. Press Ctrl+C (or ⌘C) to copy it.';
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => { status.textContent = 'Copied. Paste it wherever you need it.'; }, fallback);
      } else {
        fallback();
      }
    } catch (e) {
      fallback();
    }
  });

  // ---- Phone dock: shows while the reading is off-screen ----

  const dock = $('dock');
  $('dock-go').addEventListener('click', () => {
    const smooth = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    $('reading').scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((e) => dock.classList.toggle('is-away', e.isIntersecting));
    }, { threshold: 0.15 }).observe($('reading'));
  }

  // ---- Start ----

  const saved = loadChoice();
  const start = saved || EXAMPLE;
  setForm(start);
  renderReading(start, saved ? 'restored' : 'example');
})();
