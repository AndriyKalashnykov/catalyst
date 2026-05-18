import { describe, it, expect } from 'vitest'
// @ts-expect-error — plain .mjs gate logic, no d.ts (intentional, like
// factcheck-ratio / p4b-svg-geom). The CLI side-effects are isMain-guarded
// so importing for a test never reads the SVG dir or writes a baseline.
import { parsePlantumlSvg } from '../scripts/factcheck-geometry.mjs'

// Contract-lock for the 2026-05-17 like-for-like fix (ADR 0011 C2
// session). `parsePlantumlSvg` MUST return the PlantUML node-box
// extent (maxX−minX over <!--entity|cluster--> rects) for W/H — the
// SAME quantity `factcheck()` derives for catalyst — NOT the SVG
// `viewBox`. The viewBox spans the title banner + page margins + the
// fanned edge-label spread; comparing it against catalyst's node-only
// extent was the asymmetry that made ADR 0011 read "14/20 fixtures at
// wRatio 0.19–0.67" (rel-parallel-duplicate: 92px node column, 464px
// title → false 0.19; true node-vs-node 1.01). A regression here
// re-opens that comparator false-positive class.

/** Build a minimal PlantUML-shaped SVG: a long title text + the given
 *  entity rects, in the attribute order the parser's regex expects
 *  (height, width, x, y). `vb` is the (title-inflated) viewBox width. */
const svg = (vb: number, rects: { a: string; x: number; y: number; w: number; h: number }[]) => `
<svg viewBox="0 0 ${vb} 263">
  <text font-size="14" font-weight="bold" textLength="${vb - 28}">A title far wider than any node box</text>
  ${rects.map(r => `<!--entity ${r.a}--><g id="elem_${r.a}"><rect fill="#eee" height="${r.h}" style="x" width="${r.w}" x="${r.x}" y="${r.y}"/></g>`).join('\n  ')}
</svg>`

describe('factcheck parsePlantumlSvg — like-for-like node-extent (ADR 0011)', () => {
  it('W/H are the NODE-box extent, not the title-inflated viewBox', () => {
    // rel-parallel-duplicate shape: one narrow column, huge title.
    const r = parsePlantumlSvg(svg(492, [
      { a: 'a', x: 195, y: 47, w: 92, h: 58 },
      { a: 'b', x: 195, y: 199, w: 92, h: 58 },
    ]))
    expect(r.nodes).toHaveLength(2)
    expect(r.W).toBe(92)                 // 287 − 195 — NOT 492 (viewBox)
    expect(r.H).toBe(58 + 152)           // (199+58) − 47
  })

  it('spans the full multi-column node extent (maxX+w − minX)', () => {
    const r = parsePlantumlSvg(svg(800, [
      { a: 'a', x: 50, y: 10, w: 100, h: 60 },
      { a: 'b', x: 400, y: 10, w: 120, h: 60 },
    ]))
    expect(r.W).toBe(520 - 50)           // (400+120) − 50, independent of the 800 viewBox
  })

  it('falls back to the viewBox only when no rects are parsed', () => {
    const r = parsePlantumlSvg('<svg viewBox="0 0 333 222"></svg>')
    expect(r.nodes).toHaveLength(0)
    expect(r.W).toBe(333)
    expect(r.H).toBe(222)
  })
})
