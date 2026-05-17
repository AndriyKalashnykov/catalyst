import { describe, it, expect } from 'vitest'
// @ts-expect-error — plain .mjs analysis tool, no d.ts (intentional)
import { entityGeom } from '../scripts/p4b-svg-geom.mjs'

// Contract-lock for the P4b measurement parser. ADR 0010's category-1
// constants (10px inset; topGap 22.83 / pitch 20.62 / botGap 14.69 ⇒
// 58.14 two-line min) come straight from this parse — a silent
// regex/parse regression here would rot the ADR. These pin the parse
// against the REAL PlantUML `-tsvg` output (entity `d`, verbatim from
// build/factcheck-svg) and lock the leaf-vs-cluster split that the
// measurement-bug fix introduced.

// Verbatim `-tsvg` for a System leaf "Delta" (the canonical minimal
// 2-line element: «system» fs12 + Name fs16).
const LEAF = `<!--entity d--><g id="elem_d"><rect fill="#1168BD" height="58.1362" style="stroke:#3C7FC0;stroke-width:0.5;" width="67.8923" x="180.7072" y="483.0679"/><text fill="#FFFFFF" font-family="sans-serif" font-size="12" font-style="italic" lengthAdjust="spacing" textLength="47.8923" x="190.7072" y="505.896">&#171;system&#187;</text><text fill="#FFFFFF" font-family="sans-serif" font-size="16" font-weight="bold" lengthAdjust="spacing" textLength="42.7841" x="193.2613" y="526.5161">Delta</text></g>`

// A boundary/cluster: big rect, title in the top-left corner — its
// "inset" is meaningless and MUST be tagged 'cluster' so callers drop
// it (the measurement bug was including these).
const CLUSTER = `<!--cluster host--><g id="cluster_host"><rect fill="none" height="910" rx="2.5" style="stroke:#444;" width="1396" x="20" y="30"/><text fill="#444" font-family="sans-serif" font-size="16" font-weight="bold" textLength="60" x="40" y="55">Host</text><text fill="#444" font-family="sans-serif" font-size="12" textLength="50" x="40" y="75">[system]</text></g>`

// A Db cylinder (non-rect glyph present) → hasImage true.
const DB = `<!--entity store--><g id="elem_store"><ellipse cx="100" cy="40" rx="50" ry="8"/><rect height="90" width="100" x="50" y="40"/><text font-size="12" textLength="40" x="80" y="62">&#171;db&#187;</text><text font-size="16" textLength="44" x="78" y="82">Store</text></g>`

describe('entityGeom (P4b parser contract-lock)', () => {
  it('parses a leaf with the exact ADR-0010 measured geometry', () => {
    const [g] = entityGeom(LEAF, 'fix')
    expect(g.kind).toBe('entity')
    expect(g.stem).toBe('fix')
    expect(g.alias).toBe('d')
    expect(g.nText).toBe(2)
    expect(g.fonts).toBe('12+16')
    expect(g.hasImage).toBe(false)
    // horizontal inset — the category-1 10px, both sides, exact
    expect(g.left).toBeCloseTo(10, 2)
    expect(g.right).toBeCloseTo(10, 2)
    // vertical model — the ADR's measured constants
    expect(g.topGap).toBeCloseTo(22.83, 2)
    expect(g.botGap).toBeCloseTo(14.69, 2)
    expect(g.pitches).toEqual([{ from: 12, to: 16, d: 20.62 }])
  })

  it('self-check invariant holds: topGap + Σpitch + botGap === rect.height', () => {
    const [g] = entityGeom(LEAF)
    const recon = g.topGap + g.pitches.reduce((s, p) => s + p.d, 0) + g.botGap
    expect(Math.abs(recon - g.rh)).toBeLessThan(0.05) // float/round noise only
  })

  it('tags a boundary as cluster (so leaf metrics exclude it)', () => {
    const [g] = entityGeom(CLUSTER)
    expect(g.kind).toBe('cluster')
    // its "inset" is the corner-title gap, NOT ~10 — proves why
    // mixing clusters into the leaf stat was a measurement bug
    expect(g.left).toBeGreaterThan(15)
  })

  it('flags a non-rect glyph (db/sprite) via hasImage', () => {
    const [g] = entityGeom(DB)
    expect(g.kind).toBe('entity')
    expect(g.hasImage).toBe(true)
  })

  it('robust: empty input → [], a rect-only group is skipped (no phantom row)', () => {
    expect(entityGeom('')).toEqual([])
    expect(entityGeom('<!--entity x--><g><rect height="10" width="10" x="0" y="0"/></g>')).toEqual([])
  })

  it('handles multiple groups and preserves order', () => {
    const all = entityGeom(LEAF + CLUSTER + DB)
    expect(all.map(g => g.kind)).toEqual(['entity', 'cluster', 'entity'])
    expect(all.map(g => g.alias)).toEqual(['d', 'host', 'store'])
  })
})
