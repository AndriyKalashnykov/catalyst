#!/usr/bin/env node
/**
 * route-fidelity — numeric edge-ROUTE fidelity comparator.
 *
 * The connector-fidelity decision base (ADR 0013). factcheck is
 * edge-style-BLIND (it reconstructs emitted points, not the render);
 * arrowskew proves render-SAFETY but not "closer to PlantUML". This
 * instrument measures, on the REAL rendered SVG of BOTH sides, how
 * close catalyst's drawn edge ROUTES are to PlantUML's (the `dot`
 * spline ground truth).
 *
 * Two metrics, both SCALE- and LAYOUT-invariant by construction, so
 * the comparison is immune to the cross-engine node-position
 * false-positive class that plagued factcheck (no coordinate frame
 * alignment, no node identity matching — distributions only):
 *
 *   detour  = arclength(route) / euclidean(firstPt, lastPt)
 *             1.0 = dead straight; ~1.05–1.3 = gentle spline (dot);
 *             ≫1.3 = Manhattan dog-leg.
 *   turn    = Σ|exterior angle| over the RDP-simplified route (rad).
 *             0 = straight; ~π/2 per right angle; smooth spline → small.
 *
 * PlantUML `-tsvg` draws each edge as one `<path id=".." d="M..C..">`
 * (cubic spline, id = src-tgt). drawio-export draws each edge as one
 * open multi-segment `<path d="M..L..(C..)">` (the head is a separate
 * closed `…Z` triangle — excluded). Both are flattened to a polyline;
 * the two metrics need no common frame.
 *
 * The DECISION metric is distribution distance: per catalyst edge
 * style, the corpus-wide mean |detour−1| and mean turn, compared to
 * PlantUML's. The style whose distribution is closest to PlantUML's
 * (and not worse than orthogonal on the common/straight case) wins.
 *
 * Usage:
 *   PUML_SVG_DIR=build/factcheck-svg DRAWIO_SVG_DIR=build/rf-drawio-svg \
 *     node scripts/route-fidelity.mjs            # corpus summary
 *   node scripts/route-fidelity.mjs <stem>       # per-fixture JSON
 *
 * Pure parsers/metrics are exported for tests/route-fidelity.test.mts.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

/* ─────────────────────────  pure geometry  ───────────────────────── */

/** Flatten an SVG path `d` (absolute M/L/H/V/C/Q/Z) into one polyline
 *  per subpath. Cubic/quadratic Béziers are sampled at `steps`
 *  segments. Accepts comma- OR space-separated numbers (PlantUML uses
 *  `M1,2`, drawio uses `M 1 2`). Relative commands are unsupported and
 *  throw (both renderers emit absolute — fail loud, never silently
 *  mis-measure). Returns Array<Array<[x,y]>>. */
export function parsePathD(d, steps = 16) {
  if (typeof d !== 'string' || !d.trim()) return [];
  if (/[mlhvcsqtaz]/.test(d.replace(/[eE][-+]?\d/g, ''))) {
    // a lowercase command letter that is not an exponent → relative
    throw new Error('route-fidelity: relative SVG path commands unsupported');
  }
  const toks = d.match(/[MLHVCQZ]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
  const subs = [];
  let cur = null, cx = 0, cy = 0, i = 0;
  const num = () => {
    const v = parseFloat(toks[i++]);
    if (Number.isNaN(v)) throw new Error(`route-fidelity: bad number in path near tok ${i}`);
    return v;
  };
  const bez = (p0, c1, c2, p1) => {
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, u = 1 - t;
      cur.push([
        u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
        u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
      ]);
    }
  };
  const quad = (p0, c, p1) =>
    bez(p0, [p0[0] + 2 / 3 * (c[0] - p0[0]), p0[1] + 2 / 3 * (c[1] - p0[1])],
            [p1[0] + 2 / 3 * (c[0] - p1[0]), p1[1] + 2 / 3 * (c[1] - p1[1])], p1);
  while (i < toks.length) {
    const cmd = toks[i++];
    switch (cmd) {
      case 'M': cx = num(); cy = num(); cur = [[cx, cy]]; subs.push(cur); break;
      case 'L': cx = num(); cy = num(); cur.push([cx, cy]); break;
      case 'H': cx = num(); cur.push([cx, cy]); break;
      case 'V': cy = num(); cur.push([cx, cy]); break;
      case 'C': { const c1 = [num(), num()], c2 = [num(), num()], p = [num(), num()];
        bez([cx, cy], c1, c2, p); cx = p[0]; cy = p[1]; break; }
      case 'Q': { const c = [num(), num()], p = [num(), num()];
        quad([cx, cy], c, p); cx = p[0]; cy = p[1]; break; }
      case 'Z': break; // close: ignored for open-route metrics
      default: throw new Error(`route-fidelity: unexpected path cmd ${cmd}`);
    }
  }
  return subs;
}

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function arcLength(pts) {
  let L = 0;
  for (let k = 1; k < pts.length; k++) L += dist(pts[k - 1], pts[k]);
  return L;
}

/** detour = arclength / straight endpoint distance. Degenerate
 *  (coincident endpoints, e.g. a self-loop) → the loop's own
 *  perimeter-ish ratio is meaningless, so return null (caller
 *  excludes; self-loops are scored by `turn` only). */
export function detour(pts) {
  if (pts.length < 2) return null;
  const e = dist(pts[0], pts[pts.length - 1]);
  if (e < 1e-6) return null;
  return arcLength(pts) / e;
}

/** Ramer–Douglas–Peucker simplification — collapses bezier sampling
 *  and collinear runs so `turn` measures real corners, not the
 *  flattening resolution. */
export function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  let dmax = 0, idx = 0;
  const a = pts[0], b = pts[pts.length - 1];
  const ab = dist(a, b);
  for (let k = 1; k < pts.length - 1; k++) {
    const p = pts[k];
    const d = ab < 1e-9
      ? dist(p, a)
      : Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / ab;
    if (d > dmax) { dmax = d; idx = k; }
  }
  if (dmax > eps) {
    const l = rdp(pts.slice(0, idx + 1), eps);
    const r = rdp(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  return [a, b];
}

/** Total absolute turning angle (radians) over the RDP-simplified
 *  polyline. eps defaults to 2 % of endpoint distance (scale-free). */
export function turn(pts, epsFrac = 0.02) {
  if (pts.length < 3) return 0;
  const eps = Math.max(1e-6, epsFrac * dist(pts[0], pts[pts.length - 1]));
  const s = rdp(pts, eps);
  let t = 0;
  for (let k = 1; k < s.length - 1; k++) {
    const v1 = [s[k][0] - s[k - 1][0], s[k][1] - s[k - 1][1]];
    const v2 = [s[k + 1][0] - s[k][0], s[k + 1][1] - s[k][1]];
    const n1 = Math.hypot(...v1), n2 = Math.hypot(...v2);
    if (n1 < 1e-9 || n2 < 1e-9) continue;
    let c = (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2);
    c = Math.min(1, Math.max(-1, c));
    t += Math.acos(c);
  }
  return t;
}

/* ─────────────────────────  SVG extraction  ──────────────────────── */

const PATH_RE = /<path\b[^>]*\sd="([^"]+)"[^>]*>/g;

/** Edge routes in a PlantUML `-tsvg`. A C4/graphviz EDGE path is
 *  exactly: `fill="none"`, open (no Z), AND carries an `id`
 *  (`src-tgt` / `src-to-tgt`). The `id` is the load-bearing
 *  discriminator — id-less `fill="none"` open paths are decoration
 *  (boundary outlines, the title rule, the C4 legend, sprite curves)
 *  and would otherwise inflate the edge count ~2× on boundary-heavy
 *  fixtures (verified: `topology-hub-spoke` with-id=6=rels,
 *  without-id=0). */
export function pumlEdges(svg) {
  const out = [];
  for (const m of svg.matchAll(/<path\b([^>]*)\sd="([^"]+)"([^>]*)>/g)) {
    const attrs = m[1] + m[3], d = m[2];
    if (!/fill="none"/.test(attrs)) continue;
    if (/[Zz]/.test(d)) continue;            // closed glyph, not a route
    const id = (attrs.match(/\sid="([^"]+)"/) || [])[1] || null;
    if (!id) continue;                       // id-less ⇒ decoration, not an edge
    out.push({ id, d });
  }
  return out;
}

/** Edge routes in a drawio-export SVG: open multi-segment `<path>`
 *  (≥1 L or C, no Z). The closed `…Z` triangles are arrowheads. */
export function drawioEdges(svg) {
  const out = [];
  for (const m of svg.matchAll(PATH_RE)) {
    const d = m[1];
    if (/[Zz]/.test(d)) continue;                       // arrowhead
    // A route has ≥1 draw segment. Orthogonal ⇒ `L`; curved=1 ⇒ `Q`
    // (quadratic, NO L/C — a too-narrow /[LC]/ filter was a
    // false-negative that dropped 95/104 curved edges); straight ⇒
    // `L`; `C` covered for completeness.
    if (!/[LCQ]/.test(d)) continue;                      // not a route
    out.push({ id: null, d });
  }
  return out;
}

/** One route → its metrics (subpath 0; edges are single-subpath). */
export function routeMetrics(d) {
  const subs = parsePathD(d);
  const pts = subs[0] || [];
  return { n: pts.length, detour: detour(pts), turn: turn(pts) };
}

/* ─────────────────────────  aggregation  ─────────────────────────── */

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Distribution of a side (array of {detour,turn}). The decision
 *  scalars: meanDetourExcess = mean|detour−1| (0 = all straight),
 *  meanTurn (rad). PlantUML's pair is the TARGET; the catalyst style
 *  minimising the L1 distance to it wins. */
export function summarise(rows) {
  const det = rows.map((r) => r.detour).filter((v) => v != null);
  const trn = rows.map((r) => r.turn);
  return {
    edges: rows.length,
    meanDetourExcess: +mean(det.map((v) => Math.abs(v - 1))).toFixed(4),
    medianDetour: +median(det).toFixed(4),
    meanTurn: +mean(trn).toFixed(4),
    medianTurn: +median(trn).toFixed(4),
  };
}

/* ─────────────────────────────  CLI  ─────────────────────────────── */

const PUML_DIR = process.env.PUML_SVG_DIR ?? 'build/factcheck-svg';
const DRAWIO_DIR = process.env.DRAWIO_SVG_DIR ?? 'build/rf-drawio-svg';

function collect(dir, picker, only) {
  const rows = [];
  if (!existsSync(dir)) return rows;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.svg')) continue;
    const stem = basename(f, '.svg').replace(/-Page-1$/, '');
    if (only && stem !== only) continue;
    for (const e of picker(readFileSync(join(dir, f), 'utf8'))) {
      const m = routeMetrics(e.d);
      if (m.n >= 2) rows.push({ stem, id: e.id, ...m });
    }
  }
  return rows;
}

function main() {
  const only = process.argv[2];
  const puml = collect(PUML_DIR, pumlEdges, only);
  const draw = collect(DRAWIO_DIR, drawioEdges, only);
  if (only) {
    console.log(JSON.stringify({ stem: only, plantuml: puml, catalyst: draw }, null, 2));
    return;
  }
  const P = summarise(puml), C = summarise(draw);
  const fmt = (s) => `edges=${s.edges} meanDetourExcess=${s.meanDetourExcess} ` +
    `medianDetour=${s.medianDetour} meanTurn=${s.meanTurn} medianTurn=${s.medianTurn}`;
  console.log(`PlantUML (target) : ${fmt(P)}`);
  console.log(`catalyst          : ${fmt(C)}`);
  const dDet = +Math.abs(C.meanDetourExcess - P.meanDetourExcess).toFixed(4);
  const dTrn = +Math.abs(C.meanTurn - P.meanTurn).toFixed(4);
  console.log(`L1-to-target      : detourExcessΔ=${dDet} turnΔ=${dTrn}  (lower = more PlantUML-faithful)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
