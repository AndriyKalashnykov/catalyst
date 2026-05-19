// =============================================================================
// Item 1a · P1+P2 — DotLayout eyeball gallery (repeatable visual proof)
// =============================================================================
//
// Numeric gate: tests/dot-layout.test.mts (C1–C6). This is the
// CORROBORATIVE visual artifact (the standing "measure, then eyeball
// as corroboration — never instead of" discipline): it renders each
// corpus fixture's ADAPTED LayoutResult in catalyst's own absolute
// top-left coordinate space, so a human can confirm the P2 transform
// (dot bottom-left → catalyst top-left) yields a sane, faithful
// layout — clusters enclosing children, no overlaps, edges routed.
//
// Deterministic (pinned engine + stable emit) ⇒ re-runnable and
// drift-comparable. Output: build/dot-layout/svg/<fixture>.layout.svg
// plus an index.html contact sheet.
//
// Run: node scripts/dot-layout-gallery.mjs   (after `npm run build`)
// =============================================================================

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { EntityParser } from '../dist/puml/EntityParser.mjs'
import { RelParser } from '../dist/puml/RelParser.mjs'
import { DotLayout } from '../dist/layout/DotLayout.mjs'

const CORPUS = 'tests/fixtures/corpus'
const OUT = 'build/dot-layout'
const PAD = 16

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function svgFor(r) {
  const W = r.width + 2 * PAD, H = r.height + 2 * PAD
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica,Arial,sans-serif" font-size="11">`]
  out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`)
  out.push(`<g transform="translate(${PAD},${PAD})">`)
  // Clusters first (behind), dashed — the boundary visual.
  for (const c of r.clusters)
    out.push(`<rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" fill="#f4f8ff" stroke="#5b8def" stroke-dasharray="6 4"/>` +
      `<text x="${c.x + 6}" y="${c.y + 16}" fill="#5b8def">${esc(c.id)}</text>`)
  // Routed edges (the dot splines, sampled — exactly what the
  // crossing instrument measures).
  for (const e of r.edges) {
    if (!/^rel\d+$/.test(e.name ?? '') || !(e.points?.length >= 2)) continue
    out.push(`<polyline points="${e.points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="#888" stroke-width="1"/>`)
  }
  // Leaf nodes on top.
  for (const n of r.nodes)
    out.push(`<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" fill="#e8eef9" stroke="#1f3a93" rx="3"/>` +
      `<text x="${n.x + n.width / 2}" y="${n.y + n.height / 2 + 4}" text-anchor="middle" fill="#1f3a93">${esc(n.id)}</text>`)
  out.push('</g></svg>')
  return out.join('\n')
}

async function main() {
  mkdirSync(join(OUT, 'svg'), { recursive: true })
  const fixtures = readdirSync(CORPUS).filter(f => f.endsWith('.puml')).sort()
  const cards = []
  for (const f of fixtures) {
    const stem = f.replace(/\.puml$/, '')
    const puml = readFileSync(join(CORPUS, f), 'utf8')
    const entities = new EntityParser().parse(puml)
    const relations = RelParser.getRelations(puml)
    const constraints = RelParser.getLayoutConstraints(puml)
    const r = await DotLayout.calculateLayout(entities, relations, {}, constraints)
    writeFileSync(join(OUT, 'svg', `${stem}.layout.svg`), svgFor(r))
    cards.push(`<figure style="margin:0;border:1px solid #ddd;padding:8px">` +
      `<figcaption style="font:13px monospace;margin-bottom:6px">${esc(stem)} ` +
      `<span style="color:#888">(${r.nodes.length}n ${r.clusters.length}c ${r.edges.length}e ${r.width}×${r.height})</span></figcaption>` +
      `<img src="svg/${stem}.layout.svg" style="max-width:100%;height:auto"/></figure>`)
  }
  writeFileSync(join(OUT, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>DotLayout — P1/P2 eyeball gallery</title>` +
    `<body style="font-family:system-ui;margin:16px"><h1>Item 1a · DotLayout (P1/P2) — adapted LayoutResult</h1>` +
    `<p>Catalyst absolute top-left space. Dashed=cluster, solid=leaf, grey=routed dot spline. Deterministic.</p>` +
    `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px">${cards.join('')}</div></body>`)
  console.log(`DotLayout eyeball gallery: ${fixtures.length} fixtures → ${OUT}/index.html (deterministic)`)
}

main().catch(e => { console.error(e); process.exit(1) })
