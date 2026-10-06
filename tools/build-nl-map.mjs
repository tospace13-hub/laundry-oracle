// Builds when/nl-map.js: SVG paths for the Netherlands (plus Belgium and Germany for context)
// from Natural Earth 1:10m country outlines (public domain), as packaged in npm `world-atlas`.
//
// Lakes (IJsselmeer, Markermeer) and rivers (Rijn, Waal, Maas) come from Natural Earth 1:50m,
// as packaged in npm `sane-topojson` (europe_50m.json).
//
//   npm pack world-atlas@2 sane-topojson@4   # then untar both
//   node tools/build-nl-map.mjs world-atlas/countries-10m.json sane-topojson/dist/europe_50m.json > when/nl-map.js
//
// No dependencies: decodes TopoJSON, clips to the map frame, simplifies (Douglas–Peucker)
// and projects with an equirectangular projection scaled by cos(52°).
import { readFileSync } from 'node:fs';

const src = process.argv[2];
const extra = process.argv[3];
if (!src || !extra) {
  console.error('usage: node tools/build-nl-map.mjs countries-10m.json europe_50m.json > when/nl-map.js');
  process.exit(1);
}
const topo = JSON.parse(readFileSync(src, 'utf8'));
const water = JSON.parse(readFileSync(extra, 'utf8'));

// Map frame (degrees) and projection.
const FRAME = { west: 3.2, east: 7.35, south: 50.7, north: 53.62 };
const WIDTH = 500;
const COS = Math.cos((52 * Math.PI) / 180);
const K = WIDTH / ((FRAME.east - FRAME.west) * COS);
const HEIGHT = Math.round((FRAME.north - FRAME.south) * K);
const project = ([lon, lat]) => [(lon - FRAME.west) * COS * K, (FRAME.north - lat) * K];

// ---- TopoJSON decoding ----
function decoder(t) {
  const { scale, translate } = t.transform;
  const arcs = t.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
  const ring = (indices) => {
    const out = [];
    for (const i of indices) {
      const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      out.push(...(out.length ? a.slice(1) : a));
    }
    return out;
  };
  return {
    polygons(geom) {
      if (geom.type === 'Polygon') return [geom.arcs.map(ring)];
      if (geom.type === 'MultiPolygon') return geom.arcs.map((p) => p.map(ring));
      return [];
    },
    lines(geom) {
      if (geom.type === 'LineString') return [ring(geom.arcs)];
      if (geom.type === 'MultiLineString') return geom.arcs.map(ring);
      return [];
    },
  };
}
const land = decoder(topo);
const wet = decoder(water);
const inFrame = ([lon, lat]) => lon >= FRAME.west && lon <= FRAME.east && lat >= FRAME.south && lat <= FRAME.north;

// ---- Clipping to the frame (Sutherland–Hodgman against each edge) ----
function clip(points) {
  const edges = [
    [(p) => p[0] >= FRAME.west, (a, b) => cutX(a, b, FRAME.west)],
    [(p) => p[0] <= FRAME.east, (a, b) => cutX(a, b, FRAME.east)],
    [(p) => p[1] >= FRAME.south, (a, b) => cutY(a, b, FRAME.south)],
    [(p) => p[1] <= FRAME.north, (a, b) => cutY(a, b, FRAME.north)],
  ];
  let out = points;
  for (const [inside, cut] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cut(prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}
const cutX = (a, b, x) => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
const cutY = (a, b, y) => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];

// ---- Douglas–Peucker in projected pixels ----
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  // A closed ring starts and ends on the same point: split it at the point farthest from the start.
  let far = 1;
  pts.forEach((p, i) => { if (Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = i; });
  keep[far] = 1;
  const stack = [[0, far], [far, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0;
    let idx = -1;
    const [x1, y1] = pts[a];
    const [x2, y2] = pts[b];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const area = (pts) => Math.abs(pts.reduce((s, p, i) => {
  const q = pts[(i + 1) % pts.length];
  return s + p[0] * q[1] - q[0] * p[1];
}, 0) / 2);

const toPath = (pts, close) => `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}${close ? 'Z' : ''}`;

function areaPath(geoms, dec, { tol = 0.6, minArea = 2 } = {}) {
  const parts = [];
  for (const geom of geoms) for (const poly of dec.polygons(geom)) {
    for (const r of poly) {
      const clipped = clip(r);
      if (clipped.length < 3) continue;
      const projected = simplify(clipped.map(project), tol);
      if (projected.length < 3 || area(projected) < minArea) continue;
      parts.push(toPath(projected, true));
    }
  }
  return parts.join('');
}

// Rivers: keep the runs of each line that fall inside the frame.
function linePath(geoms, dec, tol = 0.8) {
  const parts = [];
  for (const geom of geoms) for (const line of dec.lines(geom)) {
    let run = [];
    const flush = () => { if (run.length > 1) parts.push(toPath(simplify(run.map(project), tol), false)); run = []; };
    for (const p of line) { if (inFrame(p)) run.push(p); else flush(); }
    flush();
  }
  return parts.join('');
}

function pathFor(name, opts = {}) {
  const geom = topo.objects.countries.geometries.find((g) => g.properties && g.properties.name === name);
  if (!geom) throw new Error(`No ${name} in ${src}`);
  return areaPath([geom], land, opts);
}

function touchesFrame(geom, dec, kind) {
  const sets = kind === 'line' ? dec.lines(geom) : dec.polygons(geom).flat();
  return sets.some((pts) => pts.some(inFrame));
}

const out = {
  frame: FRAME,
  width: WIDTH,
  height: HEIGHT,
  cos: Number(COS.toFixed(6)),
  k: Number(K.toFixed(4)),
  nl: pathFor('Netherlands'),
  be: pathFor('Belgium', { tol: 1 }),
  de: pathFor('Germany', { tol: 1 }),
  lakes: areaPath(water.objects.lakes.geometries.filter((g) => touchesFrame(g, wet, 'area')), wet, { tol: 0.6, minArea: 4 }),
  rivers: linePath(water.objects.rivers.geometries.filter((g) => touchesFrame(g, wet, 'line')), wet),
};

process.stdout.write(`/* Generated by tools/build-nl-map.mjs from Natural Earth 1:10m (public domain) via npm world-atlas.
   Do not edit by hand. Equirectangular projection scaled by cos(52°); 1 unit = 1 SVG pixel. */
(function (root) {
  'use strict';
  const MAP = ${JSON.stringify(out)};
  MAP.project = (lat, lon) => ({ x: (lon - MAP.frame.west) * MAP.cos * MAP.k, y: (MAP.frame.north - lat) * MAP.k });
  MAP.unproject = (x, y) => ({ lat: MAP.frame.north - y / MAP.k, lon: MAP.frame.west + x / (MAP.cos * MAP.k) });
  if (typeof module !== 'undefined' && module.exports) module.exports = MAP;
  else root.NLMap = MAP;
})(typeof window !== 'undefined' ? window : globalThis);
`);
