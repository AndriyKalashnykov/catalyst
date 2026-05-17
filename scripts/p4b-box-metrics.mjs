#!/usr/bin/env node
/**
 * P4b evidence: measure PlantUML's ACTUAL rendered box dimensions per
 * C4 type from the `-tsvg` ground truth, vs catalyst's emitted boxes
 * and the `theme.C4_MIN` floor. Answers "is the per-type minimum-size
 * floor too large vs what PlantUML really draws?" with MEASURED
 * numbers — the fact-check the P4b ADR needs (no eyeballing).
 *
 * Usage: SVG_DIR=build/factcheck-svg node scripts/p4b-box-metrics.mjs
 * (run `make factcheck` once first so build/factcheck-svg is populated)
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Catalyst } from '../dist/catalyst.mjs'

const SVG_DIR = process.env.SVG_DIR ?? 'build/factcheck-svg'
const FIX = ['tests/fixtures', 'tests/fixtures/corpus']

// PlantUML SVG entity rects — same regex the factcheck comparator uses.
function pumlBoxes(svg) {
  const re = /<!--(?:entity|cluster) ([^>]+?)-->.*?<rect[^>]*?height="([\d.]+)"[^>]*?width="([\d.]+)"[^>]*?x="([-\d.]+)"[^>]*?y="([-\d.]+)"/gs
  const out = new Map()
  let m
  while ((m = re.exec(svg)) !== null) out.set(m[1].trim(), { w: +m[3], h: +m[2] })
  return out
}

// catalyst emitted: alias -> {type, w, h} (leaf vertices only)
function catBoxes(xml) {
  const out = new Map()
  const ob = /<object\b([^>]*)>\s*<mxCell\b([^>]*?)(?:\/>|>)([\s\S]*?)<\/object>/g
  const at = (s, n) => (new RegExp(`\\b${n}="([^"]*)"`).exec(s) ?? [])[1]
  let m
  while ((m = ob.exec(xml)) !== null) {
    const id = at(m[1], 'id'), type = at(m[1], 'c4Type')
    if (!/vertex="1"/.test(m[2])) continue
    const gm = /<mxGeometry\b([^/]*?)\/>/.exec(m[3])
    if (!gm) continue
    const g = {}
    gm[1].replace(/(\w+)="([-\d.]+)"/g, (_, k, v) => (g[k] = +v))
    if (g.width === undefined) continue
    out.set(id, { type: type || '?', w: g.width, h: g.height })
  }
  return out
}

// Bucket a c4Type to a C4_MIN family (mirrors measureNode's branch).
const fam = (t) =>
  t.startsWith('System') || t.startsWith('Person') ? 'SYSTEM'
  : t.startsWith('Container') ? 'CONTAINER'
  : t.startsWith('Component') ? 'COMPONENT'
  : t.startsWith('Boundary') || t.endsWith('Boundary') || t === 'Deployment_Node' ? 'BOUNDARY/NODE'
  : 'NODE'

const C4_MIN = { SYSTEM: [220, 140], CONTAINER: [200, 120], COMPONENT: [180, 100], NODE: [160, 90] }

const rows = []
for (const dir of FIX) for (const f of readdirSync(dir)) {
  if (!f.endsWith('.puml')) continue
  const stem = f.replace(/\.puml$/, '')
  let svg
  try { svg = readFileSync(join(SVG_DIR, stem + '.svg'), 'utf8') } catch { continue }
  const pb = pumlBoxes(svg)
  let xml
  try { xml = await Catalyst.convert(readFileSync(join(dir, f), 'utf8')) } catch { continue }
  const cb = catBoxes(xml)
  for (const [alias, c] of cb) {
    const p = pb.get(alias)
    if (!p) continue
    rows.push({ stem, alias, type: c.type, fam: fam(c.type),
      pW: p.w, pH: p.h, cW: c.w, cH: c.h })
  }
}

// Aggregate per family: PlantUML min/median/max vs catalyst vs floor.
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] }
const byFam = new Map()
for (const r of rows) (byFam.get(r.fam) ?? byFam.set(r.fam, []).get(r.fam)).push(r)

console.log(`P4b box metrics — ${rows.length} leaf boxes across the 26-fixture corpus`)
console.log(`\nfamily        n   PlantUML w (min/med/max)   PlantUML h (min/med/max)   catalyst w (min/med/max)  catalyst h  C4_MIN`)
for (const [k, rs] of [...byFam].sort()) {
  const pw = rs.map(r => r.pW), ph = rs.map(r => r.pH)
  const cw = rs.map(r => r.cW), ch = rs.map(r => r.cH)
  const fmt = (a) => `${Math.round(Math.min(...a))}/${Math.round(med(a))}/${Math.round(Math.max(...a))}`
  const flo = C4_MIN[k] ? `${C4_MIN[k][0]}x${C4_MIN[k][1]}` : '—'
  console.log(`${k.padEnd(13)} ${String(rs.length).padStart(3)}  ${fmt(pw).padEnd(24)}  ${fmt(ph).padEnd(24)}  ${fmt(cw).padEnd(23)}  ${fmt(ch).padEnd(10)} ${flo}`)
}
// The key P4b signal: smallest PlantUML box per family vs the floor —
// how much empty space the floor forces on a minimal-content element.
console.log(`\nFloor-vs-PlantUML gap (catalyst floor area ÷ PlantUML's SMALLEST same-type box):`)
for (const [k, rs] of [...byFam].sort()) {
  if (!C4_MIN[k]) continue
  const minP = rs.reduce((a, r) => a.pW * a.pH < r.pW * r.pH ? a : r)
  const fA = C4_MIN[k][0] * C4_MIN[k][1], pA = minP.pW * minP.pH
  console.log(`  ${k.padEnd(13)} floor ${C4_MIN[k][0]}x${C4_MIN[k][1]} (${fA}px²)  vs smallest PlantUML ${Math.round(minP.pW)}x${Math.round(minP.pH)} (${Math.round(pA)}px², ${minP.stem}/${minP.alias})  →  ${(fA / pA).toFixed(1)}× larger`)
}
