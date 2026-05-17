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
import { entityGeom } from './p4b-svg-geom.mjs'

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

// Measured PlantUML element INSET + vertical model (the category-1
// metrics ADR 0010 needs). `entityGeom` is the contract-locked parser
// (scripts/p4b-svg-geom.mjs + tests/p4b-svg-geom.test.mts).
let svgCount = 0
const G = []
for (const dir of FIX) for (const f of readdirSync(dir)) {
  if (!f.endsWith('.puml')) continue
  const stem = f.replace(/\.puml$/, '')
  let svg
  try { svg = readFileSync(join(SVG_DIR, stem + '.svg'), 'utf8') } catch { continue }
  svgCount++
  G.push(...entityGeom(svg, stem))
}
// SAFEGUARD — fail loud, never produce decision data from an empty /
// broken parse (a silent 0-row run would feed the ADR a phantom).
if (svgCount === 0) {
  console.error(`FATAL: no SVGs in ${SVG_DIR}. Run \`make factcheck\` first ` +
    `(then SVG_DIR=build/factcheck-svg node scripts/p4b-box-metrics.mjs).`)
  process.exit(2)
}
const leafCheck = G.filter(g => g.kind === 'entity')
if (leafCheck.length === 0) {
  console.error(`FATAL: parsed ${svgCount} SVGs but 0 leaf entities — the ` +
    `entityGeom regex is broken; refusing to emit fact-check numbers.`)
  process.exit(2)
}
// SELF-CHECK — by construction topGap+Σpitch+botGap === rect.height.
// If a parse regression breaks text-y extraction this fails LOUD
// (an invariant, not a masked tolerance; 0.05px = float noise only).
for (const g of leafCheck) {
  const recon = g.topGap + g.pitches.reduce((s, p) => s + p.d, 0) + g.botGap
  if (Math.abs(recon - g.rh) > 0.05) {
    console.error(`FATAL: vertical parse inconsistent for ${g.stem}/${g.alias}: ` +
      `topGap+Σpitch+botGap=${recon.toFixed(3)} ≠ rect.height=${g.rh}. Parse is broken.`)
    process.exit(2)
  }
}
const uniq = a => [...new Set(a.map(v => Math.round(v)))].sort((x, y) => x - y)
const leaves = G.filter(g => g.kind === 'entity')
const clusters = G.filter(g => g.kind === 'cluster')
console.log(`\n=== Measured PlantUML LEAF element metrics (${leaves.length} leaves; ${clusters.length} clusters excluded — their corner-title inset is not a leaf metric) ===`)

// (2) Horizontal inset — leaves only; classify any !=10.
const L = leaves.map(g => g.left), R = leaves.map(g => g.right)
console.log(`  HORIZONTAL inset  left distinct=${JSON.stringify(uniq(L))} median=${med(L)}  |  right distinct=${JSON.stringify(uniq(R))} median=${med(R)}`)
const off10 = leaves.filter(g => Math.round(g.left) !== 10 || Math.round(g.right) !== 10)
if (off10.length === 0) {
  console.log(`  ⇒ EVERY leaf is exactly 10px L+R. Category-1 horizontal inset = 10 (no outlier, no tail).`)
} else {
  console.log(`  Inset≠10 leaves (${off10.length}/${leaves.length}) — classified (fonts/glyph):`)
  for (const o of off10.sort((a, b) => a.stem.localeCompare(b.stem)))
    console.log(`    ${o.stem}/${o.alias} L=${o.left} R=${o.right} fonts=${o.fonts} nText=${o.nText} hasImage=${o.hasImage} (${o.rw}x${o.rh})`)
}

// (1) Vertical model — leaves only, baseline-relative (no font-metric guess).
const tg = leaves.map(g => g.topGap), bg = leaves.map(g => g.botGap)
console.log(`\n  VERTICAL (baseline-relative, leaves): rect.y→1stBaseline distinct=${JSON.stringify(uniq(tg))} median=${med(tg)}` +
  `  |  lastBaseline→rect.bottom distinct=${JSON.stringify(uniq(bg))} median=${med(bg)}`)
const pitchByFont = new Map()
for (const g of leaves) for (const p of g.pitches) {
  const k = `${p.from}->${p.to}`
  ;(pitchByFont.get(k) ?? pitchByFont.set(k, []).get(k)).push(p.d)
}
console.log(`  Inter-baseline PITCH by font transition (leaves; median px):`)
for (const [k, ds] of [...pitchByFont].sort()) console.log(`    ${k.padEnd(9)} n=${String(ds.length).padStart(3)} median=${med(ds)} distinct=${JSON.stringify(uniq(ds))}`)
console.log(`  ⇒ closed-form leaf min height = topGap + Σ(pitch over the element's actual line set) + botGap`)
console.log(`     (verify: 2-line «stereo»(12)+Name(16) ⇒ ${med(tg)} + ${med(pitchByFont.get('12->16'))} + ${med(bg)} = ${med(tg) + med(pitchByFont.get('12->16') ?? [0]) + med(bg)} vs measured min height)`)

// (4) Empty-description leaves — settles pure-content-fit vs small-floor.
const ed = leaves.filter(g => g.stem === 'edge-empty-descriptions').sort((a, b) => a.rw * a.rh - b.rw * b.rh)
console.log(`\n  Empty-description fixture LEAVES (does PlantUML reserve a blank desc line?):`)
for (const g of ed)
  console.log(`    ${g.alias} ${g.rw}x${g.rh} nText=${g.nText} fonts=${g.fonts} topGap=${g.topGap} botGap=${g.botGap}`)
console.log(`  ⇒ if nText is JUST «stereo»+Name (no empty desc line) at the SAME min height as any`)
console.log(`     2-line element, PlantUML OMITS the empty line ⇒ pure content-fit reproduces it,`)
console.log(`     NO separate empty-description floor needed (Gap 4 settled by measurement).`)
