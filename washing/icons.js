/*
 * Washing Oracle icons: 48×48 line icons drawn in currentColor.
 *
 * Panel symbols follow the shapes printed on Miele W1 control panels and in their operating
 * instructions (thermometer, open spiral, CapDosing cup, delay diamond, ▶❙❙ and so on).
 * Programme pictograms are our own: Miele dials name programmes in words.
 * Independent drawings; not affiliated with Miele.
 */
(function (root) {
  'use strict';

  const dot = (x, y, r = 2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
  const text = (x, y, s, size = 11, weight = 700) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" font-weight="${weight}" fill="currentColor" stroke="none" font-family="inherit">${s}</text>`;
  const tub = 'M7 16 L11 38 H37 L41 16';
  const wave = 'M7 16 q4.25 -3.5 8.5 0 t8.5 0 t8.5 0 t8.5 0';
  const cup = 'M13 15 V33 a6 6 0 0 0 6 6 H29 a6 6 0 0 0 6 -6 V15';
  const shirt = 'M17 9 L9 13 L5 21 L11 25 L14 22 V40 H34 V22 L37 25 L43 21 L39 13 L31 9 Q28 13 24 13 Q20 13 17 9 Z';

  const ICONS = {
    // ---- Panel symbols ----
    thermometer: `<path d="M21 9 a3 3 0 0 1 6 0 v20 a7 7 0 1 1 -6 0 Z"/>${dot(24, 35, 3.5)}<path d="M24 34 V18"/>`,
    spin: '<path d="M24 24 a2.5 2.5 0 1 1 2.5 2.5 a6 6 0 0 1 -6 -6 a9.5 9.5 0 0 1 9.5 -9.5 a13 13 0 0 1 13 13 a16.5 16.5 0 0 1 -16.5 16.5"/>',
    extras: `<path d="M16 15 H39 M16 24 H39 M16 33 H39"/>${dot(10, 15, 2.2)}`,
    capPlain: `<path d="${cup}"/>`,
    capFlower: `<path d="${cup}"/><g stroke-width="1.8"><circle cx="38" cy="6.5" r="2.4"/><circle cx="42" cy="10.5" r="2.4"/><circle cx="38" cy="14.5" r="2.4"/><circle cx="34" cy="10.5" r="2.4"/></g>${dot(38, 10.5, 1.4)}`,
    capFlask: `<path d="${cup}"/><path d="M34 5 h5 M35 5 v4 l-3 6 h9 l-3 -6 v-4" stroke-width="2"/>`,
    capDrop: `<path d="${cup}"/><path d="M37 4 C37 4 32 10 32 13 a5 5 0 0 0 10 0 C42 10 37 4 37 4 Z" stroke-width="2"/>`,
    capText: `<rect x="8" y="14" width="32" height="20" rx="3"/>${text(24, 29, 'CAP', 11)}`,
    delay: '<path d="M24 7 L41 24 L24 41 L7 24 Z"/><path d="M24 24 V15 M24 24 L30 27"/>',
    start: `<path d="M8 14 L21 24 L8 34 Z" fill="currentColor"/><path d="M30 14 V34 M38 14 V34" stroke-width="3.5"/>`,
    rinseHold: '<path d="M11 18 V31 a7 7 0 0 0 7 7 H30 a7 7 0 0 0 7 -7 V18"/><path d="M7 18 H41"/><path d="M15 28 q4.5 -3 9 0 t9 0" stroke-width="2"/>',
    noSpin: '<circle cx="24" cy="24" r="16"/><path d="M13 35 L35 13"/>',
    tapDrop: '<path d="M8 14 H26 a6 6 0 0 1 6 6 v3 H26 v-3 H8 Z"/><path d="M29 30 C29 30 25 35 25 37.5 a4 4 0 0 0 8 0 C33 35 29 30 29 30 Z" stroke-width="2"/>',
    overdose: '<circle cx="24" cy="24" r="16"/><path d="M8 24 a16 16 0 0 0 32 0 Z" fill="currentColor"/>',
    info: `${dot(24, 12, 3)}<path d="M24 20 V37" stroke-width="4"/>`,
    padlock: '<rect x="11" y="21" width="26" height="19" rx="3"/><path d="M16 21 v-5 a8 8 0 0 1 16 0 v5"/>',
    mobileStart: '<rect x="15" y="10" width="15" height="28" rx="3"/><path d="M34 16 a7 7 0 0 1 0 10 M38 12 a12 12 0 0 1 0 18" stroke-width="2"/>',
    cog: '<circle cx="24" cy="24" r="6"/><path d="M24 7 v5 M24 36 v5 M7 24 h5 M36 24 h5 M12 12 l3.5 3.5 M32.5 32.5 l3.5 3.5 M12 36 l3.5 -3.5 M32.5 15.5 l3.5 -3.5"/><circle cx="24" cy="24" r="12"/>',
    power: '<path d="M16 13 a14 14 0 1 0 16 0"/><path d="M24 7 V24"/>',
    soilLight: `<path d="${shirt}"/>`,
    soilNormal: `<path d="${shirt}"/>${dot(21, 28, 2.5)}`,
    soilHeavy: `<path d="${shirt}"/>${dot(20, 24, 2.5)}${dot(28, 31, 3)}${dot(25, 36, 1.8)}`,
    ecoFeedback: `${dot(14, 13, 2.5)}<path d="M14 19 V35" stroke-width="3.5"/><path d="M24 36 C24 22 32 14 41 13 C41 25 35 34 24 36 Z M24 36 L35 22" stroke-width="2"/>`,
    twinDos: `<path d="M9 17 V37 a3 3 0 0 0 3 3 H19 a3 3 0 0 0 3 -3 V17 l-3 -5 H12 Z"/><path d="M26 17 V37 a3 3 0 0 0 3 3 H36 a3 3 0 0 0 3 -3 V17 l-3 -5 H29 Z"/>${text(15.5, 32, '1', 10)}${text(32.5, 32, '2', 10)}`,
    singleWash: `<path d="${tub}"/><path d="${wave}"/><path d="M20 24 h5 v9 a3 3 0 0 1 -3 3 h-3 a2.5 2.5 0 0 1 0 -5 h1 Z" stroke-width="2"/>`,
    preIroning: '<path d="M5 37 L9 26 Q11 21 17 21 H40 V37 Z"/><path d="M18 21 Q18 16 23 16 H40"/><path d="M14 14 q-2 -3 0 -6 M20 13 q-2 -3 0 -6" stroke-width="2"/>',
    short: '<circle cx="24" cy="26" r="14"/><path d="M20 8 h8 M24 26 V18 M24 26 L30 30"/><path d="M38 12 l3 -3" stroke-width="2"/>',
    waterPlus: '<path d="M20 8 C20 8 10 21 10 28 a10 10 0 0 0 20 0 C30 21 20 8 20 8 Z"/><path d="M38 14 V26 M32 20 H44"/>',
    prewash: `<path d="${tub}"/><path d="${wave}"/><path d="M24 22 V34" stroke-width="3.5"/>`,
    soak: `<path d="${tub}"/><path d="${wave}"/><path d="M15 27 q4.5 -3 9 0 t9 0 M15 33 q4.5 -3 9 0 t9 0" stroke-width="2"/>`,
    intensive: '<circle cx="24" cy="24" r="16"/><path d="M15 17 L24 24 L15 31 M24 17 L33 24 L24 31" stroke-width="3"/>',
    allergo: '<path d="M18 9 C18 9 9 21 9 28 a9 9 0 0 0 18 0 C27 21 18 9 18 9 Z"/><circle cx="36" cy="14" r="4"/><path d="M36 6 v2 M36 20 v2 M28 14 h2 M42 14 h2 M30.5 8.5 l1.5 1.5 M40 18 l1.5 1.5 M30.5 19.5 l1.5 -1.5 M40 10 l1.5 -1.5" stroke-width="1.6"/>',
    steam: '<path d="M14 40 q-4 -6 0 -12 t0 -12 M24 40 q-4 -6 0 -12 t0 -12 M34 40 q-4 -6 0 -12 t0 -12"/>',
    scoop: '<path d="M8 22 H32 V30 a8 8 0 0 1 -8 8 H16 a8 8 0 0 1 -8 -8 Z"/><path d="M32 26 H42"/><path d="M13 18 l1 -2 M19 16 l1 -3 M25 18 l1 -2" stroke-width="2"/>',
    bottle: `<path d="M16 15 V38 a3 3 0 0 0 3 3 H29 a3 3 0 0 0 3 -3 V15 l-3 -4 H19 Z"/><path d="M20 11 V6 H28 V11"/><path d="M16 22 H32" stroke-width="2"/>`,
    clock: '<circle cx="24" cy="24" r="16"/><path d="M24 24 V14 M24 24 L31 28"/>',
    energy: '<path d="M27 5 L12 27 H23 L20 43 L36 20 H25 Z"/>',
    water: '<path d="M24 6 C24 6 11 22 11 30 a13 13 0 0 0 26 0 C37 22 24 6 24 6 Z"/><path d="M18 31 a6 6 0 0 0 6 6" stroke-width="2"/>',
    stain: `<path d="${shirt}"/><path d="M22 25 c3 -2 7 0 6 3 c-1 3 -6 4 -8 2 c-1.5 -1.5 0 -4 2 -5 Z" fill="currentColor" stroke="none"/>`,

    // ---- Programme pictograms (our own; Miele dials use words) ----
    eco: `<path d="M10 36 C10 18 22 9 40 8 C40 26 30 37 10 36 Z M10 36 L28 19"/>${text(26, 45, '40-60', 8)}`,
    cottons: '<circle cx="24" cy="20" r="6"/><circle cx="16" cy="25" r="6"/><circle cx="32" cy="25" r="6"/><circle cx="24" cy="29" r="6"/><path d="M14 33 Q24 42 34 33 M24 35 V43"/>',
    minimumIron: '<path d="M5 31 L9 20 Q11 15 17 15 H40 V31 Z"/><path d="M18 15 Q18 10 23 10 H40"/><path d="M8 40 q4 -3 8 0 t8 0 t8 0 t8 0" stroke-width="2"/>',
    delicates: '<path d="M38 8 C24 10 14 22 12 38 C26 36 36 24 38 8 Z"/><path d="M12 38 L30 18 M20 30 h-5 M25 24 h-4 M30 18 h-3" stroke-width="2"/>',
    woollens: `<path d="${tub}"/><path d="${wave}"/><path d="M18 34 v-9 c0-2 3-2 3 0 v-3 c0-2 3-2 3 0 v1 c0-2 3-2 3 0 v1 c0-2 3-2 3 0 v7 c0 3-2 5-5 5 h-3 c-2 0-4-1-4-2z" stroke-width="2"/>`,
    silks: `<path d="${tub}"/><path d="${wave}"/><path d="M15 31 q4.5 -5 9 0 t9 0" stroke-width="2"/>${dot(24, 26, 1.6)}`,
    shirts: '<path d="M16 8 L7 13 L7 40 H41 V13 L32 8 L24 16 Z"/><path d="M16 8 L20 18 L24 16 L28 18 L32 8 M24 16 V40" stroke-width="2"/>',
    quickPowerWash: `<path d="${tub}"/><path d="${wave}"/><path d="M26 19 L19 29 H25 L22 37 L30 26 H24 Z" fill="currentColor" stroke-width="1.5"/>`,
    express20: `<circle cx="24" cy="27" r="15"/><path d="M20 8 h8 M24 8 v4"/>${text(24, 32, '20', 13)}`,
    dark: '<path d="M13 7 H35 L38 41 H28 L24 18 L20 41 H10 Z"/><path d="M13 13 H35" stroke-width="2"/>',
    sportswear: '<path d="M6 32 C6 26 10 24 14 24 L20 14 L26 16 L24 22 C30 24 36 26 40 28 C43 29.5 43 34 40 34 H8 C6.5 34 6 33 6 32 Z"/><path d="M6 38 H42" stroke-width="2"/>',
    automaticPlus: `<path d="${tub}"/><path d="${wave}"/>${text(24, 34, 'A+', 12)}`,
  };

  function icon(id, cls = '') {
    const body = ICONS[id] || ICONS.info;
    return `<svg class="icon ${cls}" viewBox="0 0 48 48" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  }

  const api = { ICONS, icon };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WashingIcons = api;
})(typeof window !== 'undefined' ? window : globalThis);
