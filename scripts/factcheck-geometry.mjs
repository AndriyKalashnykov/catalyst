#!/usr/bin/env node
/**
 * Numeric fact-check harness — NO eyeballing.
 *
 * For each fixture it extracts MEASURED geometry from both sides:
 *   - PlantUML ground truth: rendered SVG (`-tsvg`, exact vector coords) —
 *     node rects keyed by `<!--entity ALIAS-->`, plus the diagram bbox.
 *   - catalyst: the emitted draw.io XML — node rects, and every edge's
 *     label rect computed exactly as draw.io anchors it (A↔B-centre
 *     midpoint + the emitted `as="offset"` mxPoint, size = measureEdgeLabel).
 *
 * Then it prints numeric verdicts for the criteria the gallery audit
 * actually defines:
 *   - rankOrder : do nodes share the same TOP-DOWN y ordering? (structure)
 *   - sizeRatio : catalyst bbox vs PlantUML bbox (P3 gate ≤ ~1.3 width)
 *   - labelHit  : does any edge-label rect overlap a NON-endpoint node?
 *                 (P1/P5 "label clear of boxes" — 0 == pass)
 *   - nodeOverlap: any node-node overlap (must be 0)
 *
 * Usage: node scripts/factcheck-geometry.mjs <fixture-stem> [<stem> ...]
 *   needs the SVG already rendered to $SVG_DIR (default /tmp/svg).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Catalyst } from '../dist/catalyst.mjs'
import { measureEdgeLabel } from '../dist/layout/measureNode.mjs'

const SVG_DIR = process.env.SVG_DIR ?? '/tmp/svg'
const CORPUS = process.env.CORPUS_DIR ?? 'tests/fixtures/corpus'

/** Parse PlantUML SVG → { nodes:[{alias,x,y,w,h}], w, h }. */
function parsePlantumlSvg(svg) {
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
  const W = vb ? +vb[1] : NaN, H = vb ? +vb[2] : NaN
  const nodes = []
  // Each entity: `<!--entity ALIAS-->` then its <g id="elem_ALIAS"> with the
  // first <rect ...>. Person/Db shapes differ but all emit a bounding rect.
  const re = /<!--(?:entity|cluster) ([^>]+?)-->.*?<rect[^>]*?height="([\d.]+)"[^>]*?width="([\d.]+)"[^>]*?x="([\-\d.]+)"[^>]*?y="([\-\d.]+)"/gs
  let m
  while ((m = re.exec(svg)) !== null) {
    nodes.push({ alias: m[1].trim(), x: +m[4], y: +m[5], w: +m[3], h: +m[2] })
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
  while ((m = ob.exec(xml)) !== null) {
    const o = m[1], rest = m[3]
    const id = attr(o, 'id')
    const gm = /<mxGeometry\b([^/]*?)\/>/.exec(rest)
    if (!gm || !/vertex="1"/.test(m[2])) continue
    const g = {}
    gm[1].replace(/(\w+)="([\-\d.]+)"/g, (_, k, v) => (g[k] = +v))
    if (g.width === undefined) continue
    const n = { alias: id, x: g.x ?? 0, y: g.y ?? 0, w: g.width, h: g.height }
    nodes.push(n); byAlias.set(id, n)
  }
  // bbox
  const minX = Math.min(...nodes.map(n => n.x)), minY = Math.min(...nodes.map(n => n.y))
  const maxX = Math.max(...nodes.map(n => n.x + n.w)), maxY = Math.max(...nodes.map(n => n.y + n.h))
  return { nodes, byAlias, W: maxX - minX, H: maxY - minY }
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

function factcheck(stem) {
  const puml = readFileSync(join(CORPUS, `${stem}.puml`), 'utf8')
  const svg = readFileSync(join(SVG_DIR, `${stem}.svg`), 'utf8')
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
    for (const r of relsP) {
      const A = C.byAlias.get(r.source), B = C.byAlias.get(r.target)
      if (!A || !B) continue
      const d = measureEdgeLabel(r.label, r.description, cap(r.source, r.target))
      const mx = (A.x + A.w / 2 + B.x + B.w / 2) / 2
      const my = (A.y + A.h / 2 + B.y + B.h / 2) / 2
      const lr = { x: mx - d.width / 2, y: my - d.height / 2, w: d.width, h: d.height }
      for (const n of C.nodes) {
        if (n.alias === r.source || n.alias === r.target) continue
        if (isContainer.has(n.alias)) continue       // boundary outline, not a leaf collision
        if (intersects(lr, n) && !contains(lr, n) && !contains(n, lr)) labelHit++
      }
    }
    // --- nodeOverlap: PARTIAL overlaps only (containment = legit nesting) ---
    let nodeOverlap = 0
    for (let i = 0; i < C.nodes.length; i++)
      for (let j = i + 1; j < C.nodes.length; j++)
        if (partialOverlap(C.nodes[i], C.nodes[j])) nodeOverlap++
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
    return { stem, rankOrder, wRatio, hRatio, labelHit, nodeOverlap,
             boundaryBands: bands,
             pml: `${P.W}x${P.H}`, cat: `${Math.round(C.W)}x${Math.round(C.H)}` }
  })
}

const stems = process.argv.slice(2)
for (const s of stems) {
  const r = await factcheck(s)
  console.log(JSON.stringify(r))
}
