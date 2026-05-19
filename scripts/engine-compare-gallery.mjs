// =============================================================================
// Item 1a / ADR 0014 — C4 ELK-vs-`dot` comparison gallery (P6 evidence)
// =============================================================================
//
// The committed eyeball companion to the measured numbers (the
// standing "measure, then eyeball as corroboration" discipline). For
// every C4 corpus fixture it places, side by side:
//
//   PlantUML (the ground-truth `dot` render) | catalyst-ELK | catalyst-`dot`
//
// as deterministic VECTOR SVGs (never AA-jittery PNGs), each annotated
// with its measured non-incident edge-crossing count (the project's
// own `countCrossings`) so the 30→0 swap result is visible per
// fixture, not just in aggregate.
//
// Sequence diagrams are intentionally NOT compared: `src/seq/*` uses
// neither `LayoutEngine` nor `DotLayout` (verified — grep is empty),
// so the seq pipeline is engine-INDEPENDENT and dot≡elk by
// construction (proven separately: `make seq-gallery-verify` passes
// byte-identical under both). Building a seq comparison would compare
// a thing against itself.
//
// Inputs (rendered beforehand — this script only assembles + measures):
//   docs/gallery/svg/<stem>.puml.svg     PlantUML ground truth
//   docs/gallery/svg/<stem>.drawio.svg   catalyst @ default (now dot)
//   build/elk-gallery/svg/<stem>.drawio.svg   catalyst @ LAYOUT_ENGINE=elk
//
// Output (committed): docs/gallery-compare/{puml,elk,dot}/<stem>.svg
//                     docs/gallery-compare/index.html
//
// Run: node scripts/engine-compare-gallery.mjs
// =============================================================================

import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { edgePolys, countCrossings, NODE_R } from './edgecross-svg.mjs'

const DOT_SVG = 'docs/gallery/svg'              // committed default (dot, P6)
const ELK_SVG = 'build/elk-gallery/svg'         // scratch ELK render
const OUT = 'docs/gallery-compare'

const xings = (file, kind) =>
  existsSync(file)
    ? countCrossings(edgePolys(readFileSync(file, 'utf8'), kind), { nodeR: NODE_R }).total
    : -1

mkdirSync(join(OUT, 'puml'), { recursive: true })
mkdirSync(join(OUT, 'elk'), { recursive: true })
mkdirSync(join(OUT, 'dot'), { recursive: true })

const stems = readdirSync(DOT_SVG)
  .filter(f => f.endsWith('.drawio.svg'))
  .map(f => f.replace('.drawio.svg', ''))
  .sort()

let totElk = 0, totDot = 0, totPuml = 0
const rows = []
for (const stem of stems) {
  const pumlSrc = join(DOT_SVG, `${stem}.puml.svg`)
  const elkSrc = join(ELK_SVG, `${stem}.drawio.svg`)
  const dotSrc = join(DOT_SVG, `${stem}.drawio.svg`)
  if (existsSync(pumlSrc)) copyFileSync(pumlSrc, join(OUT, 'puml', `${stem}.svg`))
  if (existsSync(elkSrc)) copyFileSync(elkSrc, join(OUT, 'elk', `${stem}.svg`))
  if (existsSync(dotSrc)) copyFileSync(dotSrc, join(OUT, 'dot', `${stem}.svg`))

  const pX = xings(pumlSrc, 'puml')
  const eX = xings(elkSrc, 'drawio')
  const dX = xings(dotSrc, 'drawio')
  if (pX >= 0) totPuml += pX
  if (eX >= 0) totElk += eX
  if (dX >= 0) totDot += dX
  rows.push({ stem, pX, eX, dX })
}

const cell = (sub, stem, label, x, ref) => {
  const cls = x === ref ? 'ok' : (x > ref ? 'bad' : 'note')
  return `<figure><figcaption>${label} — <span class="${cls}">` +
    `${x < 0 ? 'n/a' : `${x} crossing${x === 1 ? '' : 's'}`}</span></figcaption>` +
    `<img loading="lazy" src="${sub}/${stem}.svg" alt="${stem} ${label}"></figure>`
}

const cards = rows.map(r =>
  `<section><h2>${r.stem} <small>ELK ${r.eX} → dot ${r.dX} (PlantUML ${r.pX})</small></h2>` +
  `<div class="row">${cell('puml', r.stem, 'PlantUML (ground truth)', r.pX, r.pX)}` +
  `${cell('elk', r.stem, 'catalyst · ELK (legacy)', r.eX, r.pX)}` +
  `${cell('dot', r.stem, 'catalyst · dot (default, P6)', r.dX, r.pX)}</div></section>`).join('\n')

writeFileSync(join(OUT, 'index.html'),
`<!doctype html><meta charset="utf-8">
<title>catalyst — ELK vs dot (item 1a / ADR 0014)</title>
<style>
 body{font:14px/1.5 system-ui;margin:24px;max-width:1500px}
 h1{margin-bottom:4px} .sum{color:#444;margin:0 0 20px}
 section{border-top:2px solid #eee;padding-top:12px;margin-top:24px}
 h2 small{font-weight:400;color:#666}
 .row{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:start}
 figure{margin:0;border:1px solid #ddd;border-radius:6px;padding:8px;background:#fff}
 figcaption{font:12px/1.4 monospace;margin-bottom:6px}
 img{width:100%;height:auto;background:#fff}
 .ok{color:#137333;font-weight:700}.bad{color:#c5221f;font-weight:700}.note{color:#9a6700}
</style>
<h1>catalyst — ELK vs <code>dot</code> layout engine</h1>
<p class="sum">Item 1a / ADR 0014. Non-incident edge crossings (Purchase 1997),
measured on the real drawio-export render-truth.
<b>Corpus totals: ELK ${totElk} → dot ${totDot} &nbsp;|&nbsp; PlantUML ${totPuml}.</b>
Sequence diagrams are engine-independent (<code>src/seq</code> uses neither
engine) so are not compared. Vector SVGs, deterministic.</p>
${cards}`)

console.log(`engine-compare gallery: ${stems.length} C4 fixtures → ${OUT}/index.html`)
console.log(`corpus non-incident crossings: ELK=${totElk}  dot=${totDot}  PlantUML=${totPuml}`)
