import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
// @ts-expect-error — plain .mjs analysis tool, no d.ts (intentional)
import { entityGeom } from '../scripts/p4b-svg-geom.mjs'
import { PUML_LEAF_BOX } from '../src/mx/c4/theme.mjs'

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

// Verbatim `-tsvg` for a 3-line Container leaf "Container" (all-variants
// entity `c`: «container» fs12 + Name fs16 + [Tech] fs12) — extracted
// verbatim from build/factcheck-svg. Locks the Name(16)→tech/desc(12)
// pitch against the real PlantUML oracle, CI-safe (no fs/java).
const LEAF3 = `<!--entity c--><g id="elem_c"><rect fill="#438DD5" height="74.4803" style="stroke:#3C7FC0;stroke-width:0.5;" width="99.3282" x="33" y="382.5679"/><text fill="#FFFFFF" font-family="sans-serif" font-size="12" font-style="italic" lengthAdjust="spacing" textLength="62.1964" x="51.5659" y="405.396">&#171;container&#187;</text><text fill="#FFFFFF" font-family="sans-serif" font-size="16" font-weight="bold" lengthAdjust="spacing" textLength="79.3282" x="43" y="426.0161">Container</text><text fill="#FFFFFF" font-family="sans-serif" font-size="12" font-style="italic" lengthAdjust="spacing" textLength="31.3442" x="66.992" y="443.5322">[Tech]</text></g>`

// EQUIVALENCE GATE — the theme.mts constants `measureNode` actually uses
// MUST equal what is measured from the real PlantUML `-tsvg`, or they
// are an unprovable hardcode (the no-magic taxonomy's category-1
// obligation: a measured literal needs a safeguard that re-derives it).
// This is precisely what caught ADR 0010's prose rounding the
// 12→12 pitch to "16" when the live oracle measures 16.34.
describe('PUML_LEAF_BOX === measured PlantUML oracle (no-hardcode gate)', () => {
  it('INSET / TOP_GAP / BOT_GAP / 12→16 pitch match verbatim entity `d`', () => {
    const [g] = entityGeom(LEAF)                          // contract-locked above
    expect(PUML_LEAF_BOX.INSET).toBeCloseTo(g.left, 2)
    expect(PUML_LEAF_BOX.INSET).toBeCloseTo(g.right, 2)
    expect(PUML_LEAF_BOX.TOP_GAP).toBeCloseTo(g.topGap, 2)
    expect(PUML_LEAF_BOX.BOT_GAP).toBeCloseTo(g.botGap, 2)
    expect(PUML_LEAF_BOX.PITCH['12>16']).toBeCloseTo(
      g.pitches.find((p: { from: number; to: number }) => p.from === 12 && p.to === 16)!.d, 2)
  })

  it('16→12 pitch matches verbatim 3-line Container leaf `c`', () => {
    const [g] = entityGeom(LEAF3)
    const p = g.pitches.find((q: { from: number; to: number }) => q.from === 16 && q.to === 12)!
    expect(PUML_LEAF_BOX.PITCH['16>12']).toBeCloseTo(p.d, 2)
  })

  // Live-oracle scan: the corpus has exactly ONE leaf exercising a real
  // (non-zero) 12→12 line pitch, so it cannot be embedded compactly.
  // When build/factcheck-svg exists (local dev + `make factcheck` flow)
  // assert EVERY constant against the live measurement of ALL leaves —
  // this is the check that detected the 16 vs 16.34 rounding. Skips
  // (loudly) on a bare `npm test` with no SVG dir; the verbatim cases
  // above keep five of six constants CI-guarded regardless.
  const SVG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'factcheck-svg')
  const haveSvg = existsSync(SVG_DIR)
  it.skipIf(!haveSvg)('all PITCH/INSET/gap constants equal the live -tsvg dominant values', () => {
    const nz: Record<string, Set<number>> = {}
    const add = (k: string, v: number) => (nz[k] ??= new Set()).add(+v.toFixed(2))
    for (const f of readdirSync(SVG_DIR)) {
      if (!f.endsWith('.svg')) continue
      for (const g of entityGeom(readFileSync(join(SVG_DIR, f), 'utf-8'), f)) {
        if (g.kind !== 'entity' || g.hasImage) continue
        for (const p of g.pitches as { from: number; to: number; d: number }[])
          if (p.d > 1) add(`${p.from}>${p.to}`, p.d)
      }
    }
    // Each PUML_LEAF_BOX pitch must be a value PlantUML actually emits.
    for (const [k, v] of Object.entries(PUML_LEAF_BOX.PITCH))
      expect([...(nz[k] ?? [])], `pitch ${k}`).toContain(+v.toFixed(2))
  })
})
