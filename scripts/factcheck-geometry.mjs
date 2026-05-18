#!/usr/bin/env node
/**
 * Comprehensive PlantUML→draw.io fidelity comparator — NO eyeballing.
 * Every claim about a fixture must be one of these MEASURED numbers,
 * never a visual judgement of a PNG.
 *
 * SEMANTIC fidelity (parsed C4 model ⟷ emitted draw.io) — "did the
 * conversion preserve everything PlantUML would show":
 *   - entityMiss : parsed entities with no matching emitted object
 *                  (alias + structural c4Type)
 *   - relMiss    : parsed relations with no matching emitted edge
 *   - arrowBad   : emitted edges whose arrowhead COUNT ≠ the C4
 *                  semantic (bidirectional ⇒ 2, one-way Rel/Rel_Back
 *                  ⇒ exactly 1). Catches the P10 "looks bidirectional /
 *                  looks arrowless" class the geometry checks missed.
 *   - labelDrop  : relations whose verb/label text is absent from its
 *                  emitted edge; entities whose name is absent
 *   - attachMerge: same-(unordered)-pair edges whose BOTH endpoint
 *                  attach points are within SEP_MIN — they visually
 *                  collapse into one line (the P10 defect)
 *
 * LAYOUT fidelity (emitted draw.io ⟷ PlantUML `-tsvg` ground truth):
 *   - rankOrder  : same TOP-DOWN node y ordering as PlantUML
 *   - wRatio/hRatio : catalyst node-extent vs PlantUML node-extent
 *                     (BOTH = maxX−minX over entity/cluster rects —
 *                      like-for-like; NOT PlantUML's title-inflated
 *                      SVG viewBox. See parsePlantumlSvg's fix note.)
 *   - labelHit   : edge-label rect over a NON-endpoint LEAF (0 == pass)
 *   - nodeOverlap: PARTIAL node overlaps (containment = legit nesting)
 *   - boundaryBands: each container's title band before its first child
 *
 * A fixture is "clean" iff the EIGHT CONTRACT metrics are 0:
 * entityMiss=relMiss=arrowBad=labelDrop=attachMerge=labelHit=
 * nodeOverlap=0 AND `ratioBad`=0 (see the `clean` predicate below).
 * `ratioBad` (ADR 0011 step 0) PROMOTES the former-advisory
 * `wRatio`/`hRatio` to a CONTRACT via a committed per-fixture
 * RATCHET (`tests/factcheck-ratio-baseline.json`, regen with
 * `UPDATE_FACTCHECK_BASELINE=1`; predicate in `factcheck-ratio.mjs`,
 * unit-tested): `|1−ratio|` may only DECREASE or hold vs baseline —
 * a fidelity regression on EITHER node-extent axis now fails the gate.
 * (The pre-fix viewBox-based metric read "14 fixtures at wRatio
 * 0.19–0.67"; the 2026-05-17 like-for-like fix in `parsePlantumlSvg`
 * showed that was a title-inflated comparator artefact — node-vs-node
 * is 0.73–1.05 corpus-wide; memory `derived-artifact-enforcement-gate`
 * + `factcheck-harness-gate`.) `rankOrder`
 * and `boundaryBands` remain ADVISORY (ELK `layered` and PlantUML
 * `dot` legitimately differ in same-rank order / minor placement;
 * judged via the ratio ratchet, not strict order equality).
 * The path→metric coverage
 * matrix is `docs/FACTCHECK-COVERAGE.md` (#17): every emit path has
 * ≥1 guarding contract metric — no blind spots. A non-zero contract
 * metric is a defect regardless of how the PNG looks.
 *
 * Usage:
 *   make factcheck                       # whole corpus, renders SVG +
 *                                        # prints `CLEAN N/20` (the gate)
 *   node scripts/factcheck-geometry.mjs            # all fixtures, summary
 *   node scripts/factcheck-geometry.mjs <stem> …   # per-fixture JSON
 * Reads the PlantUML ground-truth SVG from $SVG_DIR (default /tmp/svg;
 * `make factcheck` sets it to build/factcheck-svg and renders there).
 * This is a SUPPORTED, repeatable gate — keep it green for every
 * geometry/emit change; extend it (not a throwaway script) when a new
 * fidelity contract is added.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Catalyst } from '../dist/catalyst.mjs'
import { measureEdgeLabel } from '../dist/layout/measureNode.mjs'
// Reuse PRODUCTION code to find draw.io's label anchor: it places an
// edge label at the cumulative-arc-length midpoint of the ROUTED
// polyline, then the emitted `as="offset"` mxPoint displaces it. The
// label-overlap check must use that true position, not the bare A↔B
// midpoint (ignoring the offset falsely flagged every #56 re-seated
// edge — a harness bug, not a product defect).
import { polylineMidpoint } from '../dist/layout/edgeLanes.mjs'
// ADR 0011 step-0 ratio ratchet — pure, contract-locked by
// tests/factcheck-ratio.test.mts (extracted like p4b-svg-geom.mjs).
import { RATIO_TOL, ratioContract } from './factcheck-ratio.mjs'

const SVG_DIR = process.env.SVG_DIR ?? '/tmp/svg'
const CORPUS = process.env.CORPUS_DIR ?? 'tests/fixtures/corpus'
/** File extensions / read encoding — named so the same string isn't
 *  repeated at every readFileSync / fixture-enumeration site. */
const PUML_EXT = '.puml'
const SVG_EXT = '.svg'
const ENC = 'utf8'

/**
 * ADR 0011 step 0 — `wRatio`/`hRatio` PROMOTED advisory → CONTRACT via a
 * committed per-fixture baseline RATCHET (the golden-snapshot pattern;
 * cf. `tests/golden/`). The contract is fidelity-monotone: for each
 * fixture the distance `|1 − ratio|` (catalyst diagram bbox ÷ PlantUML)
 * may only DECREASE or hold vs the committed baseline — never regress
 * away from PlantUML by more than one quantisation quantum, on EITHER
 * axis. A fix that improves a fixture passes (distance drops); then
 * `UPDATE_FACTCHECK_BASELINE=1` re-commits the tighter baseline so the
 * ratchet converges toward parity (no guessed absolute threshold — the
 * ADR-0010 no-magic discipline). This closes the silent-rot class: 14
 * fixtures at wRatio 0.19–0.67 had shipped "CLEAN" because the axis was
 * advisory (memory `derived-artifact-enforcement-gate`).
 *
 * `RATIO_TOL` + the ratchet predicate live in `factcheck-ratio.mjs`
 * (pure, unit-tested) — imported above; `void RATIO_TOL` keeps the
 * symbol referenced for the doc cross-link without an unused warning.
 */
void RATIO_TOL
const RATIO_BASELINE_FILE = join(
  process.env.CATALYST_ROOT ?? '.', 'tests', 'factcheck-ratio-baseline.json')
const RATIO_BASELINE = existsSync(RATIO_BASELINE_FILE)
  ? JSON.parse(readFileSync(RATIO_BASELINE_FILE, ENC))
  : {}
const UPDATE_BASELINE = process.env.UPDATE_FACTCHECK_BASELINE === '1'

/** draw.io <object>/<mxCell> attribute names this comparator reads. Named
 *  once so a typo can't silently make a check pass (the literals were
 *  repeated across every parse site). */
const ATTR = {
  ID: 'id', C4_TYPE: 'c4Type', C4_NAME: 'c4Name',
  C4_TECH: 'c4Technology', C4_STEREO: 'c4Stereotype',
  VALUE: 'value', STYLE: 'style', SOURCE: 'source', TARGET: 'target',
}
/** mxGraph edge-style keys (the `key=value;` style string). */
const STYLE = {
  START_ARROW: 'startArrow', END_ARROW: 'endArrow',
  EXIT_X: 'exitX', EXIT_Y: 'exitY', ENTRY_X: 'entryX', ENTRY_Y: 'entryY',
}
/** mxGraph defaults: an edge with no explicit arrow has none at the
 *  start and a `classic` head at the end. */
const ARROW_NONE = 'none'
const DEFAULT_END_ARROW = 'classic'
/** Minimum endpoint-attach separation for two edges of the same
 *  unordered pair to read as distinct lines. = 2 × the relationship
 *  arrow-head size (theme `SHAPE.REL_ARROW_SIZE` = 14) so two heads
 *  cannot visually touch. A cited renderer metric, not a guess. */
const ATTACH_SEP_MIN = 28
/** C4 arrowhead-count contract: a bidirectional relation (`BiRel`)
 *  renders an arrow at BOTH ends; every one-way relation (`Rel`,
 *  `Rel_Back`, `RelIndex`) renders EXACTLY one. An edge whose emitted
 *  count differs is the P10 "looks bidirectional / looks arrowless"
 *  defect. */
const ARROWS_BIDIRECTIONAL = 2
const ARROWS_ONE_WAY = 1

/**
 * Normalise text for a present/absent comparison. The emitted c4Name
 * legitimately differs from the parsed label by: word-wrap `<br/>`
 * insertions (long verbs / `\n`), and XML/HTML escaping (`&amp;`
 * `&lt;` `&gt;` — incl. P8's double-escaped `&amp;lt;`). Stripping
 * those + collapsing whitespace makes "is the text preserved?" a
 * true content check, not a formatting diff. Verified by hand against
 * rel-long-labels / edge-multiline-labels / edge-unicode-specialchars
 * (all were harness false-positives before this).
 */
function norm(s) {
  return (s ?? '')
    .replace(/&lt;br\/?&gt;|<br\/?>/gi, ' ')      // wrap breaks (HTML)
    .replace(/\\n|\n/g, ' ')                      // PlantUML `\n` (literal or real)
    .replace(/&amp;lt;/g, '<').replace(/&amp;gt;/g, '>') // P8 double-escape
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim()
}

/** Parse PlantUML SVG → { nodes:[{alias,x,y,w,h}], w, h }. */
function parsePlantumlSvg(svg) {
  const nodes = []
  // Each entity: `<!--entity ALIAS-->` then its <g id="elem_ALIAS"> with the
  // first <rect ...>. Person/Db shapes differ but all emit a bounding rect.
  const re = /<!--(?:entity|cluster) ([^>]+?)-->.*?<rect[^>]*?height="([\d.]+)"[^>]*?width="([\d.]+)"[^>]*?x="([\-\d.]+)"[^>]*?y="([\-\d.]+)"/gs
  let m
  while ((m = re.exec(svg)) !== null) {
    nodes.push({ alias: m[1].trim(), x: +m[4], y: +m[5], w: +m[3], h: +m[2] })
  }
  // wRatio/hRatio false-positive FIX (fact-check, 2026-05-17 — the
  // ADR-0011 C2 session). P.W/P.H must be the PlantUML **node-box
  // extent** (maxX−minX over the entity/cluster rects) — IDENTICAL to
  // how `factcheck()` derives catalyst's C.W/C.H — NOT the SVG
  // `viewBox`. The viewBox spans the whole canvas: the `title` banner,
  // outer page margins, and the fanned edge-label spread. Comparing
  // catalyst's node-only extent against PlantUML's title-inflated
  // viewBox is not a like-for-like measure — it made
  // `rel-parallel-duplicate` read wRatio 0.19 although its PlantUML
  // node column (a,b @ x=195, w=92) is 92px and catalyst's is 93px
  // (true ratio 1.01); the 0.19 was the 464px title string, not a
  // layout-aspect defect. This asymmetry is what made ADR 0011 read
  // "14/20 fixtures at wRatio 0.19–0.67" (memory
  // `factcheck-harness-gate`: distrust the gate before the product;
  // measure the property in its FULL, like-for-like dimensionality).
  // Node-vs-node is the correct measure of "does catalyst spread its
  // nodes the way Graphviz `dot` does" — the actual ADR 0011 concern.
  // Fallback to the viewBox only when a fixture has no parsed rects
  // (keeps a sane number rather than NaN/−Infinity).
  let W, H
  if (nodes.length) {
    const minX = Math.min(...nodes.map(n => n.x))
    const minY = Math.min(...nodes.map(n => n.y))
    W = Math.max(...nodes.map(n => n.x + n.w)) - minX
    H = Math.max(...nodes.map(n => n.y + n.h)) - minY
  } else {
    const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
    W = vb ? +vb[1] : NaN
    H = vb ? +vb[2] : NaN
  }
  return { nodes, W, H }
}

/** Parse catalyst drawio → nodes + edges with computed label rects. */
function parseCatalyst(xml) {
  const nodes = []
  const ob = /<object\b([^>]*)>\s*<mxCell\b([^>]*?)(?:\/>|>)([\s\S]*?)<\/object>/g
  const attr = (s, n) => (new RegExp(`\\b${n}="([^"]*)"`).exec(s) ?? [])[1]
  let m
  const byAlias = new Map()
  // Completeness-invariant: the `__title` cell is the trace element for
  // the source `title` directive (counted by `titleMiss` below). It is
  // diagram chrome, NOT a C4 node — exclude it from the geometry
  // metrics (node-extent / overlap / labelHit) exactly as the PlantUML
  // SVG node-extent regex excludes PlantUML's own title text, keeping
  // wRatio/hRatio like-for-like and the ratchet baseline valid.
  let catTitle
  while ((m = ob.exec(xml)) !== null) {
    const o = m[1], rest = m[3]
    const id = attr(o, ATTR.ID)
    if (id === '__title') { catTitle = attr(o, ATTR.C4_NAME) ?? ''; continue }
    const gm = /<mxGeometry\b([^/]*?)\/>/.exec(rest)
    if (!gm || !/vertex="1"/.test(m[2])) continue
    const g = {}
    gm[1].replace(/(\w+)="([\-\d.]+)"/g, (_, k, v) => (g[k] = +v))
    if (g.width === undefined) continue
    const n = { alias: id, x: g.x ?? 0, y: g.y ?? 0, w: g.width, h: g.height }
    nodes.push(n); byAlias.set(id, n)
  }
  // Objects carry the semantic attrs (c4Type/c4Name/c4Stereotype) on the
  // <object>, geometry on the inner <mxCell>. Re-scan for the attr map.
  const objAttrs = []
  const oa = /<object\b([^>]*)>/g
  while ((m = oa.exec(xml)) !== null) {
    objAttrs.push({
      id: attr(m[1], ATTR.ID), c4Type: attr(m[1], ATTR.C4_TYPE),
      c4Name: attr(m[1], ATTR.C4_NAME), c4Stereotype: attr(m[1], ATTR.C4_STEREO),
      value: attr(m[1], ATTR.VALUE) ?? '',
    })
  }
  // Edges: an edge is `<object c4Name="verb" c4Technology="[tech]" ...>`
  // wrapping `<mxCell edge="1" source target style>`. The LABEL TEXT is
  // the object's c4Name/c4Technology (the `value`/`label` attribute only
  // holds the `%c4Name%` placeholder template — comparing against it was
  // the harness's universal-labelDrop bug). Arrowheads: draw.io default
  // startArrow=none, endArrow=classic; catalyst sets endArrow explicitly
  // and startArrow only for a bidirectional relation.
  const edges = []
  const er = /<(?:object\b([^>]*)>\s*)?<mxCell\b([^>]*?\bedge="1"[^>]*?)(?:\/>|>)([\s\S]*?)<\/mxCell>/g
  while ((m = er.exec(xml)) !== null) {
    const objA = m[1] ?? '', cellA = m[2], body = m[3] ?? ''
    const style = attr(cellA, ATTR.STYLE) ?? ''
    // mxGraph parses the style string into an object, so on a DUPLICATE
    // key the LAST value wins (verified empirically: catalyst appends
    // `;endArrow=none` after the base `endArrow=blockThin` for Rel_Back
    // and the render shows ONE head). Read the last match, not the
    // first — reading the first falsely flagged every Rel_Back as
    // 2-headed (a harness bug, not a product defect).
    const sty = (k) => {
      const all = [...style.matchAll(new RegExp(`(?:^|;)${k}=([^;]*)`, 'g'))]
      return all.length ? all[all.length - 1][1] : undefined
    }
    const hasStart = !!sty(STYLE.START_ARROW) && sty(STYLE.START_ARROW) !== ARROW_NONE
    const hasEnd = (sty(STYLE.END_ARROW) ?? DEFAULT_END_ARROW) !== ARROW_NONE
    const arrowN = [hasStart, hasEnd].filter(Boolean).length // 0 | 1 | 2
    // Bare self-closing mxPoints are the routed waypoints (inside
    // `<Array as="points">`). The label displacement is the SEPARATE
    // `<mxPoint … as="offset"/>`.
    const wps = [...body.matchAll(/<mxPoint x="([\-\d.]+)" y="([\-\d.]+)"\s*\/>/g)]
      .map(p => ({ x: +p[1], y: +p[2] }))
    const offM = /<mxPoint x="([\-\d.]+)" y="([\-\d.]+)" as="offset"\s*\/>/.exec(body)
    const offset = offM ? { x: +offM[1], y: +offM[2] } : { x: 0, y: 0 }
    const numStyle = (k) => sty(k) !== undefined ? +sty(k) : undefined
    edges.push({
      source: attr(cellA, ATTR.SOURCE), target: attr(cellA, ATTR.TARGET),
      verb: attr(objA, ATTR.C4_NAME) ?? '',
      tech: attr(objA, ATTR.C4_TECH) ?? '',
      arrowN, wps, offset,
      exitX: numStyle(STYLE.EXIT_X), entryX: numStyle(STYLE.ENTRY_X),
      exitY: numStyle(STYLE.EXIT_Y), entryY: numStyle(STYLE.ENTRY_Y),
    })
  }
  // bbox
  const minX = Math.min(...nodes.map(n => n.x)), minY = Math.min(...nodes.map(n => n.y))
  const maxX = Math.max(...nodes.map(n => n.x + n.w)), maxY = Math.max(...nodes.map(n => n.y + n.h))
  return { nodes, byAlias, objAttrs, edges, catTitle, W: maxX - minX, H: maxY - minY }
}

const intersects = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
/** a fully contains b (b ⊆ a, with a tiny epsilon for the inset). */
const contains = (a, b, eps = 2) =>
  a.x - eps <= b.x && a.y - eps <= b.y &&
  a.x + a.w + eps >= b.x + b.w && a.y + a.h + eps >= b.y + b.h
/** TRUE (defect) overlap: intersect but neither contains the other.
 *  catalyst emits flat+absolute (no XML nesting) so a boundary visually
 *  CONTAINS its children — that is legitimate compound nesting, not an
 *  overlap. Only partial intersection is a real node-collision defect. */
const partialOverlap = (a, b) =>
  intersects(a, b) && !contains(a, b) && !contains(b, a)

/** PlantUML names its output after the `@startuml <name>` token, NOT
 *  the .puml filename (e.g. c4-all-entity-variants.puml → all-variants).
 *  Resolve the SVG by that token so EVERY fixture is checkable
 *  regardless of filename↔title divergence; fall back to the stem. */
function svgNameFor(stem, puml) {
  const m = /^\s*@startuml\s+(\S+)/m.exec(puml)
  return (m ? m[1] : stem) + SVG_EXT
}

function factcheck(stem, dir = CORPUS) {
  const puml = readFileSync(join(dir, `${stem}${PUML_EXT}`), ENC)
  const svg = readFileSync(join(SVG_DIR, svgNameFor(stem, puml)), ENC)
  const P = parsePlantumlSvg(svg)
  const xmlP = Catalyst.parseEntities(puml)
  const relsP = Catalyst.parseRelations(puml)
  return Catalyst.convert(puml).then((xml) => {
    const C = parseCatalyst(xml)
    // --- rankOrder: shared aliases, compare top-down y ordering ---
    const common = P.nodes.filter(p => C.byAlias.has(p.alias)).map(p => p.alias)
    const pOrder = [...common].sort((a, b) =>
      P.nodes.find(n => n.alias === a).y - P.nodes.find(n => n.alias === b).y)
    const cOrder = [...common].sort((a, b) =>
      C.byAlias.get(a).y - C.byAlias.get(b).y)
    const rankOrder = JSON.stringify(pOrder) === JSON.stringify(cOrder)
    // --- sizeRatio ---
    const wRatio = +(C.W / P.W).toFixed(2), hRatio = +(C.H / P.H).toFixed(2)
    // Containers (boundaries): a node that geometrically contains another.
    // catalyst is flat+absolute so containment is purely geometric.
    const isContainer = new Set()
    for (const a of C.nodes)
      for (const b of C.nodes)
        if (a !== b && contains(a, b)) { isContainer.add(a.alias); break }
    // --- labelHit: edge label rect vs a non-endpoint LEAF node. A label
    // legitimately sits inside the boundary that holds its endpoints, so
    // container rects are excluded — only a real LEAF collision counts. ---
    let labelHit = 0
    const cap = (a, b) => {
      const na = C.byAlias.get(a), nb = C.byAlias.get(b)
      return na && nb ? Math.min(na.w, nb.w) : Infinity
    }
    const ctr = (n) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 })
    // Iterate the EMITTED edges so the true rendered label position is
    // used: anchor = polylineMidpoint([src-centre, …waypoints,
    // tgt-centre]) + the emitted `as="offset"`. Matched to its relation
    // (by unordered endpoints) only for the label text/cap dims.
    const relUsed = new Set()
    for (const g of C.edges) {
      const A = C.byAlias.get(g.source), B = C.byAlias.get(g.target)
      if (!A || !B) continue
      const ri = relsP.findIndex((r, i) => !relUsed.has(i) &&
        ((r.source === g.source && r.target === g.target) ||
         (r.source === g.target && r.target === g.source)))
      if (ri < 0) continue
      relUsed.add(ri)
      const r = relsP[ri]
      const d = measureEdgeLabel(r.label, r.description, cap(g.source, g.target))
      const route = [ctr(A), ...g.wps, ctr(B)]
      const mid = polylineMidpoint(route)
      const cx = mid.x + g.offset.x, cy = mid.y + g.offset.y
      const lr = { x: cx - d.width / 2, y: cy - d.height / 2, w: d.width, h: d.height }
      for (const n of C.nodes) {
        if (n.alias === g.source || n.alias === g.target) continue
        if (isContainer.has(n.alias)) continue       // boundary outline, not a leaf collision
        if (intersects(lr, n) && !contains(lr, n) && !contains(n, lr)) {
          labelHit++
          if (process.env.FACTCHECK_DEBUG)
            process.stderr.write(`  labelHit: "${r.label}" (${g.source}->${g.target}) ` +
              `lr={x:${Math.round(lr.x)},y:${Math.round(lr.y)},w:${Math.round(lr.w)},h:${Math.round(lr.h)}} ` +
              `over leaf ${n.alias} {x:${Math.round(n.x)},y:${Math.round(n.y)},w:${Math.round(n.w)},h:${Math.round(n.h)}} ` +
              `offset={${Math.round(g.offset.x)},${Math.round(g.offset.y)}}\n`)
        }
      }
    }
    // --- nodeOverlap: PARTIAL overlaps only (containment = legit nesting) ---
    let nodeOverlap = 0
    for (let i = 0; i < C.nodes.length; i++)
      for (let j = i + 1; j < C.nodes.length; j++)
        if (partialOverlap(C.nodes[i], C.nodes[j])) {
          nodeOverlap++
          if (process.env.FACTCHECK_DEBUG) {
            const a = C.nodes[i], b = C.nodes[j]
            process.stderr.write(`  nodeOverlap: ${a.alias} ` +
              `{x:${Math.round(a.x)},y:${Math.round(a.y)},w:${Math.round(a.w)},h:${Math.round(a.h)}} ` +
              `~ ${b.alias} ` +
              `{x:${Math.round(b.x)},y:${Math.round(b.y)},w:${Math.round(b.w)},h:${Math.round(b.h)}}\n`)
          }
        }
    // --- boundaryBand: each container's top-inset before its FIRST child
    // (min child.y − container.y) vs PlantUML's measured band. The P6 gate. ---
    const bands = []
    for (const c of C.nodes) {
      if (!isContainer.has(c.alias)) continue
      const kids = C.nodes.filter(n => n !== c && contains(c, n) &&
        !C.nodes.some(z => z !== c && z !== n && contains(c, z) && contains(z, n)))
      if (!kids.length) continue
      bands.push(Math.round(Math.min(...kids.map(k => k.y)) - c.y))
    }
    // ===== SEMANTIC fidelity: parsed C4 model ⟷ emitted draw.io =====
    const flatEnt = []
    const walkE = es => es.forEach(e => { flatEnt.push(e); if (e.children) walkE(e.children) })
    walkE(xmlP)
    const objById = new Map(C.objAttrs.map(o => [o.id, o]))
    // entityMiss: every parsed entity must be an emitted object with the
    // same structural c4Type (and its name present).
    let entityMiss = 0
    for (const e of flatEnt) {
      const o = objById.get(e.alias)
      if (!o || o.c4Type !== e.type) { entityMiss++; continue }
      const nm = norm(e.label)
      if (nm && !norm(o.c4Name).includes(nm) && !norm(o.value).includes(nm)) entityMiss++
    }
    // relMiss + arrowBad + labelDrop, per parsed relation.
    let relMiss = 0, arrowBad = 0, labelDrop = 0
    const usedEdge = new Set()
    for (const r of relsP) {
      // match an emitted edge by unordered endpoints (Rel_Back reverses)
      const idx = C.edges.findIndex((g, i) => !usedEdge.has(i) &&
        ((g.source === r.source && g.target === r.target) ||
         (g.source === r.target && g.target === r.source)))
      if (idx < 0) { relMiss++; continue }
      usedEdge.add(idx)
      const g = C.edges[idx]
      const expectArrows = r.bidirectional ? ARROWS_BIDIRECTIONAL : ARROWS_ONE_WAY
      if (g.arrowN !== expectArrows) arrowBad++
      // Label text lives in the edge object's c4Name (verb) — NOT
      // `value` (that's the `%c4Name%` placeholder template). norm()
      // strips wrap `<br/>` + XML-escaping so this is a content check.
      const verb = norm(r.label)
      if (verb && !norm(g.verb).includes(verb)) labelDrop++
    }
    // attachMerge: same unordered pair, ≥2 edges → their endpoint attach
    // points must be separated on at least ONE end, else they collapse
    // into one visual line (the P10 defect). The attach point is 2-D:
    // (exitX·w, exitY·h) on the source box, (entryX·w, entryY·h) on the
    // target. A FALSE-POSITIVE class (fact-found 2026-05-17,
    // c4-all-rel-variants b→c): comparing only the X component flags a
    // HORIZONTAL same-pair fan — which `assignEdgeLanes` correctly
    // separates in Y (exitY/entryY spread, exitX pinned to the 0/1
    // border) — as "merged" though it is 66 px apart. The contract is
    // EUCLIDEAN attach distance: edges merge only when BOTH ends are
    // within ATTACH_SEP_MIN in the plane. attach x = exitX/entryX·w,
    // y = exitY/entryY·h (or box centre when that axis is
    // unconstrained); ATTACH_SEP_MIN is the cited 2×arrow-head metric.
    const grp = new Map()
    C.edges.forEach((g, i) => {
      if (!g.source || !g.target) return
      const k = JSON.stringify([g.source, g.target].sort())
      ;(grp.get(k) ?? grp.set(k, []).get(k)).push(i)
    })
    const ax = (n, frac) => n ? (frac === undefined ? n.x + n.w / 2 : n.x + frac * n.w) : 0
    const ay = (n, frac) => n ? (frac === undefined ? n.y + n.h / 2 : n.y + frac * n.h) : 0
    let attachMerge = 0
    for (const idxs of grp.values()) {
      if (idxs.length < 2) continue
      for (let i = 0; i < idxs.length; i++)
        for (let j = i + 1; j < idxs.length; j++) {
          const g1 = C.edges[idxs[i]], g2 = C.edges[idxs[j]]
          const s1 = C.byAlias.get(g1.source), t1 = C.byAlias.get(g1.target)
          const s2 = C.byAlias.get(g2.source), t2 = C.byAlias.get(g2.target)
          if (!s1 || !t1 || !s2 || !t2) continue
          const dSrc = Math.hypot(
            ax(s1, g1.exitX) - ax(s2, g2.exitX),
            ay(s1, g1.exitY) - ay(s2, g2.exitY))
          const dTgt = Math.hypot(
            ax(t1, g1.entryX) - ax(t2, g2.entryX),
            ay(t1, g1.entryY) - ay(t2, g2.entryY))
          if (dSrc < ATTACH_SEP_MIN && dTgt < ATTACH_SEP_MIN) {
            attachMerge++
            if (process.env.FACTCHECK_DEBUG) {
              const ay = (n, f) => n ? (f === undefined ? n.y + n.h / 2 : n.y + f * n.h) : 0
              const sx1 = ax(s1, g1.exitX), sy1 = ay(s1, g1.exitY)
              const sx2 = ax(s2, g2.exitX), sy2 = ay(s2, g2.exitY)
              const tx1 = ax(t1, g1.entryX), ty1 = ay(t1, g1.entryY)
              const tx2 = ax(t2, g2.entryX), ty2 = ay(t2, g2.entryY)
              const e2 = (x1, y1, x2, y2) => Math.round(Math.hypot(x1 - x2, y1 - y2))
              process.stderr.write(`  attachMerge: ${g1.source}->${g1.target} ` +
                `[${C.rels?.[idxs[i]]?.label ?? idxs[i]} vs ${C.rels?.[idxs[j]]?.label ?? idxs[j]}] ` +
                `src dX=${Math.round(dSrc)} dY=${Math.round(Math.abs(sy1 - sy2))} d2=${e2(sx1, sy1, sx2, sy2)} | ` +
                `tgt dX=${Math.round(dTgt)} dY=${Math.round(Math.abs(ty1 - ty2))} d2=${e2(tx1, ty1, tx2, ty2)} ` +
                `(exitY ${g1.exitY}/${g2.exitY} entryY ${g1.entryY}/${g2.entryY})\n`)
            }
          }
        }
    }
    // `clean` = the CONTRACTS held: nothing dropped, arrows correct,
    // no visual merge, no label-on-leaf, no node overlap, AND no
    // bbox-ratio fidelity regression (`ratioBad`, ADR 0011). Only
    // `rankOrder` stays ADVISORY: ELK `layered` and PlantUML `dot`
    // legitimately differ in same-rank ordering without dropping or
    // mis-rendering anything (strict order equality false-positives on
    // every large/constrained graph). Over-ranking / over-compaction
    // is now caught by the ratio ratchet, not order equality.
    // ADR 0011: wRatio/hRatio are now a CONTRACT via the baseline
    // ratchet — `ratioBad` joins the clean predicate (no fidelity
    // regression on either bbox axis vs the committed baseline).
    const { ratioBad, missing: ratioMissing } = ratioContract(RATIO_BASELINE, stem, wRatio, hRatio)
    // Completeness invariant (MDE M2M-transformation principle, the
    // FIRST-class structural gate before any visual check): every
    // source construct must trace to a target element — a `title`
    // directive in the .puml MUST yield a non-empty `__title` cell in
    // the .drawio. A silent drop here is the exact class that shipped
    // on 100% of diagrams while the entity/rel-only oracle stayed
    // green (memory `factcheck-harness-gate`: coverage gaps hide real
    // defects — count emitted elements, do not eyeball).
    const srcHasTitle = /^[ \t]*title[ \t]+\S/m.test(puml)
    const titleMiss = srcHasTitle && !(C.catTitle && C.catTitle.trim()) ? 1 : 0
    const clean = entityMiss === 0 && relMiss === 0 && arrowBad === 0 &&
      labelDrop === 0 && attachMerge === 0 && labelHit === 0 &&
      nodeOverlap === 0 && ratioBad === 0 && titleMiss === 0
    return { stem, clean, entityMiss, relMiss, arrowBad, labelDrop,
             attachMerge, rankOrder, wRatio, hRatio, ratioBad, ratioMissing,
             labelHit, nodeOverlap, titleMiss,
             boundaryBands: bands,
             pml: `${P.W}x${P.H}`, cat: `${Math.round(C.W)}x${Math.round(C.H)}` }
  })
}

// CLI: explicit stems → one JSON line each. No args → audit the WHOLE
// corpus and print only the non-clean fixtures + an N/total summary
// (replaces ad-hoc throwaway audit scripts; same constants discipline).
// "All puml→drawio conversions" = the gallery corpus AND the canonical
// C4-PlantUML-spec fixtures one level up (c4-exhaustive, c4-all-rel-
// variants, …) — the most exhaustive cases. Audit BOTH, non-recursive.
const { readdirSync } = await import('node:fs')
const { dirname } = await import('node:path')
const FIXTURE_DIRS = [CORPUS, dirname(CORPUS)]
const enumerate = () => FIXTURE_DIRS.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(PUML_EXT))
    .map((f) => ({ stem: f.slice(0, -PUML_EXT.length), dir })))

// Pure parsers are exported for unit tests (factcheck-geometry.test.mts);
// the CLI side-effects below run ONLY when this file is the entrypoint,
// so importing it for a test never reads the SVG dir or writes baselines.
export { parsePlantumlSvg }

const { pathToFileURL } = await import('node:url')
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href

const args = process.argv.slice(2)
if (isMain) {
 if (args.length > 0 && !UPDATE_BASELINE) {
  const all = enumerate()
  for (const s of args) {
    const e = all.find((x) => x.stem === s)
    console.log(JSON.stringify(await factcheck(s, e ? e.dir : CORPUS)))
  }
} else {
  const all = enumerate().sort((a, b) => a.stem.localeCompare(b.stem))
  let cleanCount = 0
  const fresh = {}
  for (const { stem, dir } of all) {
    const r = await factcheck(stem, dir)
    fresh[stem] = { w: r.wRatio, h: r.hRatio }
    if (UPDATE_BASELINE) continue
    if (r.clean) { cleanCount++; continue }
    const ratio = r.ratioBad
      ? ` ratioBad=1 (w=${r.wRatio} h=${r.hRatio} vs baseline w=${RATIO_BASELINE[stem]?.w} h=${RATIO_BASELINE[stem]?.h})`
      : (r.ratioMissing ? ` [no ratio baseline — run UPDATE_FACTCHECK_BASELINE=1]` : '')
    console.log(
      `${r.stem.padEnd(26)} arrowBad=${r.arrowBad} attachMerge=${r.attachMerge} ` +
      `labelHit=${r.labelHit} entityMiss=${r.entityMiss} relMiss=${r.relMiss} ` +
      `labelDrop=${r.labelDrop} nodeOverlap=${r.nodeOverlap} titleMiss=${r.titleMiss}${ratio}`)
  }
  if (UPDATE_BASELINE) {
    const sorted = Object.fromEntries(
      Object.keys(fresh).sort().map((k) => [k, fresh[k]]))
    writeFileSync(RATIO_BASELINE_FILE, JSON.stringify(sorted, null, 2) + '\n')
    console.log(`factcheck ratio baseline written: ${RATIO_BASELINE_FILE} (${Object.keys(sorted).length} fixtures)`)
  } else {
    console.log(`CLEAN ${cleanCount}/${all.length}`)
  }
 }
}
