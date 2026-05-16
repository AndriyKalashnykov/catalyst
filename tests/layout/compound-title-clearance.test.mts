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
// primitives `titlePadding()` uses (renderedLineHeight of the tallest
// boundary title font + the `[Type]` line + the bold space-advance
// inset) so there is no duplicated magic number — if the title metric
// changes, both move together. layout-quality / compound-boundary only
// check leaf `r.nodes`; NOTHING else asserts compound-vs-compound title
// clearance, so this is the sole guard for #25.
const REQUIRED_TITLE_CLEARANCE = Math.ceil(
  renderedLineHeight(ENTERPRISE_BOUNDARY_TITLE_PX) + // Name line (tallest boundary title)
  renderedLineHeight(MX_DEFAULT_FONTSIZE) +          // [Type] line
  spaceAdvance(ENTERPRISE_BOUNDARY_TITLE_PX, true))  // font-derived inset off the stroke

const corpusDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'corpus')
const FIXTURES = readdirSync(corpusDir).filter((f) => f.endsWith('.puml')).sort()

describe('#25 — nested compound title-band clearance', () => {
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
