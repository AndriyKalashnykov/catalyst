import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { EntityParser } from '../../src/puml/EntityParser.mjs'
import { RelParser } from '../../src/puml/RelParser.mjs'
import { LayoutEngine } from '../../src/layout/LayoutEngine.mjs'
import { renderedLineHeight, spaceAdvance, MX_DEFAULT_FONTSIZE } from '../../src/text/TextMetrics.mjs'
import { ENTERPRISE_BOUNDARY_TITLE_PX } from '../../src/mx/c4/theme.mjs'

// #25 BLOCKING gate — sibling/parent compound title-band clearance.
//
// `LayoutEngine.titlePadding()` reserves a compound's OWN title band as
// `elk.padding[top]`. A NESTED child compound must therefore start at
// least that many units BELOW its parent compound's top, or the child's
// dashed border + its own title band render on top of the parent's
// title band (the `topology-deep-nesting` defect — #23 review).
//
// The required clearance is recomputed here from the SAME public
// primitives `titlePadding()` uses so they co-move (no duplicated magic
// number). This part is, by construction, a self-consistency check.
//
// P6: that self-consistency was NOT enough — the old formula passed here
// while `topology-deep-nesting` VISIBLY collided, because the formula
// under-predicted the ACTUAL drawio-rendered title. So a SECOND,
// non-tautological gate is added below: an ABSOLUTE floor measured
// empirically from a drawio-export probe render (pixel-measured down the
// centre column, scale 1): catalyst's rendered 2-line boundary title
// BOTTOM lands ≈ 33u below the boundary top, and PlantUML's own SVG
// ground truth (the #19 fidelity target) leaves ≈16–20u of clearance
// below its title before the first child. EMPIRICAL_TITLE_BOTTOM_U is a
// category-3 documented-convention constant (a drawio-export pixel
// measurement, cited — not a formula echo); MIN_CLEARANCE_U is one
// real title line of breathing. The emitted band MUST exceed their sum,
// independently of whatever `titlePadding()`'s formula computes.
const REQUIRED_TITLE_CLEARANCE = Math.ceil(
  renderedLineHeight(ENTERPRISE_BOUNDARY_TITLE_PX) + // Name line (tallest boundary title)
  renderedLineHeight(MX_DEFAULT_FONTSIZE) +          // [Type] line
  spaceAdvance(ENTERPRISE_BOUNDARY_TITLE_PX, true) + // font-derived inset off the stroke
  renderedLineHeight(ENTERPRISE_BOUNDARY_TITLE_PX))  // P6: one blank title-line clearance

/** drawio-export probe pixel measurement (scale 1, centre column):
 *  the rendered 2-line boundary title bottom ≈ 33u below the boundary
 *  top. A documented-convention constant — measured, cited, NOT a copy
 *  of the formula above. */
const EMPIRICAL_TITLE_BOTTOM_U = 33
/** PlantUML SVG ground truth leaves ≈16–20u below its title; one title
 *  line (~16u at 13px) is the catalyst-side real-metric equivalent. */
const MIN_CLEARANCE_U = Math.ceil(renderedLineHeight(ENTERPRISE_BOUNDARY_TITLE_PX))
const EMPIRICAL_MIN_BAND_U = EMPIRICAL_TITLE_BOTTOM_U + MIN_CLEARANCE_U

const corpusDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'corpus')
const FIXTURES = readdirSync(corpusDir).filter((f) => f.endsWith('.puml')).sort()

describe('#25/#P6 — nested compound title-band clearance', () => {
  it('the reserved band clears the EMPIRICALLY-measured rendered title (non-tautological)', () => {
    // This is the gate the old self-consistent formula could not be:
    // EMPIRICAL_MIN_BAND_U is a drawio-export pixel measurement + a real
    // clearance line, NOT a function of titlePadding(). Reverting the P6
    // clearance term drops REQUIRED below this floor and fails here.
    expect(
      REQUIRED_TITLE_CLEARANCE,
      `reserved title band ${REQUIRED_TITLE_CLEARANCE}u must exceed the ` +
      `pixel-measured rendered title bottom (${EMPIRICAL_TITLE_BOTTOM_U}u) ` +
      `+ ${MIN_CLEARANCE_U}u clearance = ${EMPIRICAL_MIN_BAND_U}u`,
    ).toBeGreaterThanOrEqual(EMPIRICAL_MIN_BAND_U)
  })

  for (const name of FIXTURES) {
    it(`${name}: every child compound starts ≥ titlePadding below its parent compound`, async () => {
      const puml = readFileSync(join(corpusDir, name), 'utf-8')
      const ents = new EntityParser().parse(puml)
      const r = await LayoutEngine.calculateLayout(
        ents,
        RelParser.getRelations(puml),
        { rankdir: 'TB', nodesep: 50, edgesep: 10, ranksep: 50, marginx: 20, marginy: 20 },
        RelParser.getLayoutConstraints(puml),
      )
      const byId = new Map(r.clusters.map((c) => [c.id, c]))
      const violations: string[] = []
      for (const c of r.clusters) {
        if (!c.parent) continue
        const p = byId.get(c.parent)
        if (!p) continue // parent is a leaf/non-compound — not a title-band case
        const clearance = (c.y ?? 0) - (p.y ?? 0)
        if (clearance < REQUIRED_TITLE_CLEARANCE) {
          violations.push(
            `${c.id} top is only ${Math.round(clearance)}u below parent ${p.id} ` +
            `(need ≥ ${REQUIRED_TITLE_CLEARANCE}u for ${p.id}'s title band)`,
          )
        }
      }
      expect(
        violations,
        `nested compound title bands collide in ${name} (#25)`,
      ).toEqual([])
    })
  }
})
