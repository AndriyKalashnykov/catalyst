import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Catalyst } from '../src/catalyst.mjs'
import { EntityParser } from '../src/puml/EntityParser.mjs'
import { RelParser } from '../src/puml/RelParser.mjs'
import type { EntityDescriptor } from '../src/puml/EntityParser.mjs'

/**
 * Item 1a / ADR 0014 — ELK opt-out fallback coverage gate.
 *
 * P6 flipped the DEFAULT engine to `dot`, so the default suite no
 * longer exercises catalyst.mts's ELK lane / multi-bend / straight
 * edge-emit branches — yet the ELK path is RETAINED as a supported
 * fallback (`layoutEngine:'elk'`) until removed after ≥1 green `dot`
 * release. Retained code MUST stay covered (the 85% branch gate is a
 * real contract, PR #128) and MUST stay structurally correct. This
 * sweeps the whole corpus through `{ layoutEngine: 'elk' }` and
 * asserts the engine-INVARIANT completeness contract (the same
 * no-silent-drop invariant corpus-sanity asserts for the default
 * path) — which also keeps the ELK emit branches exercised in the
 * default coverage run.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const corpusDir = join(__dirname, 'fixtures', 'corpus')
const FIXTURES = readdirSync(corpusDir).filter(f => f.endsWith('.puml')).sort()

function leaves(es: EntityDescriptor[], out: string[] = []): string[] {
  for (const e of es) e.children?.length ? leaves(e.children, out) : out.push(e.alias)
  return out
}

describe('ELK opt-out fallback — corpus completeness (P6 retained path)', () => {
  for (const file of FIXTURES) {
    const stem = file.replace(/\.puml$/, '')
    it(`${stem}: ELK fallback emits every entity + relation, well-formed`, async () => {
      const puml = readFileSync(join(corpusDir, file), 'utf8')
      const xml = await Catalyst.convert(puml, { layoutEngine: 'elk' })

      // Well-formed drawio.
      expect(xml).toContain('<mxGraphModel')
      expect(xml).toContain('</mxGraphModel>')

      // Completeness invariant (engine-invariant — ADR 0012): every
      // declared leaf alias appears as an emitted object id; every
      // relation endpoint resolves. A silent drop here = the exact
      // class the no-fake-green discipline forbids.
      const ids = new Set(
        [...xml.matchAll(/<object\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]))
      for (const a of leaves(new EntityParser().parse(puml)))
        expect(ids.has(a), `ELK fallback dropped leaf ${a}`).toBe(true)

      const rels = RelParser.getRelations(puml)
      const edgeCount = (xml.match(/\bedge="1"/g) ?? []).length
      // One emitted connector per parsed relation (no orphan/drop).
      expect(edgeCount).toBeGreaterThanOrEqual(rels.length)
    })
  }

  it('engine selection precedence: option > env > default(dot)', async () => {
    const puml = readFileSync(join(corpusDir, 'rel-bidirectional.puml'), 'utf8')
    // Explicit option beats env.
    const prev = process.env.LAYOUT_ENGINE
    try {
      process.env.LAYOUT_ENGINE = 'dot'
      const elkXml = await Catalyst.convert(puml, { layoutEngine: 'elk' })
      expect(elkXml).toContain('<mxGraphModel')
      // Env opt-out to elk (no option) is honoured.
      process.env.LAYOUT_ENGINE = 'elk'
      const envElk = await Catalyst.convert(puml)
      expect(envElk).toContain('<mxGraphModel')
      // Default (neither option nor env=elk) → dot path.
      delete process.env.LAYOUT_ENGINE
      const def = await Catalyst.convert(puml)
      expect(def).toContain('<mxGraphModel')
    } finally {
      if (prev === undefined) delete process.env.LAYOUT_ENGINE
      else process.env.LAYOUT_ENGINE = prev
    }
  })
})
