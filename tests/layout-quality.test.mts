import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { EntityParser } from '../src/puml/EntityParser.mjs'
import { RelParser } from '../src/puml/RelParser.mjs'
import { LayoutEngine } from '../src/layout/LayoutEngine.mjs'
import { measureNode } from '../src/layout/measureNode.mjs'
import type { EntityDescriptor } from '../src/puml/EntityDescriptor.interface.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf-8')

// Visual-correctness gate. The parity/golden gates are structural and
// coordinate-independent (by design), so they cannot catch the class of bug
// where leaf shapes are sized too small and the RENDERED drawio shapes
// overlap/cram even though the layout itself is fine. This gate closes that:
//   1. no two leaf shapes overlap in the layout, AND
//   2. every leaf is at LEAST its content-fit box (the layout engine never
//      shrinks a node below `measureNode`'s measured size), so the
//      no-overlap guarantee survives drawio rendering.
//
// ADR 0010 (backlog P4b) replaced the old absolute "≥ fixed C4_MIN" floor
// with the content-fit contract: a leaf box is exactly its measured
// content (PlantUML-measured geometry, `PUML_LEAF_BOX`), never smaller —
// so the regression class this gate catches is now "layout under-sized a
// node below its content-fit box" / "boxes overlap", NOT "below a fixed
// per-type minimum" (that minimum was the quantified empty-box defect).

function flatten(es: EntityDescriptor[]): EntityDescriptor[] {
  const out: EntityDescriptor[] = []
  const w = (a: EntityDescriptor[]) => a.forEach(e => { out.push(e); if (e.children) w(e.children) })
  w(es)
  return out
}

const FIXTURES = [
  'c4-exhaustive.puml',
  'c4-context.puml',
  'c4-container.puml',
  'c4-deployment.puml',
  'c4-all-entity-variants.puml',
  'c4-all-rel-variants.puml',
]

describe('layout quality (rendered shapes do not overlap/cram)', () => {
  for (const name of FIXTURES) {
    it(`${name}: leaf shapes are ≥ content-fit box and never overlap`, async () => {
      const puml = fixture(name)
      const ents = new EntityParser().parse(puml)
      const r = await LayoutEngine.calculateLayout(
        ents,
        RelParser.getRelations(puml),
        { rankdir: 'TB', nodesep: 50, edgesep: 10, ranksep: 50, marginx: 20, marginy: 20 },
        RelParser.getLayoutConstraints(puml),
      )
      const flat = flatten(ents)
      const byAlias = new Map(flat.map(e => [e.alias, e]))
      const typeOf = new Map(flat.map(e => [e.alias, e.type]))

      // ADR 0010 content-fit contract: every laid-out leaf is at LEAST
      // its `measureNode` content-fit box — the layout engine must never
      // shrink a node below its measured size (that, plus no-overlap, is
      // what guarantees the rendered drawio shapes do not cram). A 1px
      // round/ceil tolerance: measureNode `Math.ceil`s; layout may carry
      // sub-pixel float.
      const undersized = r.nodes.filter(n => {
        const e = byAlias.get(n.id)
        if (!e) return false
        const m = measureNode(e)
        return n.width < m.width - 1 || n.height < m.height - 1
      })
      expect(
        undersized.map(n => {
          const m = measureNode(byAlias.get(n.id)!)
          return `${n.id}(${typeOf.get(n.id)}) ${n.width}x${n.height} < content-fit ${m.width}x${m.height}`
        }),
        'leaf shapes shrunk below their content-fit box (would cram on render)',
      ).toEqual([])

      const overlaps: string[] = []
      const L = r.nodes
      for (let i = 0; i < L.length; i++) {
        for (let j = i + 1; j < L.length; j++) {
          const a = L[i], b = L[j]
          if (a.x! < b.x! + b.width && a.x! + a.width > b.x! &&
              a.y! < b.y! + b.height && a.y! + a.height > b.y!) {
            overlaps.push(`${a.id}~${b.id}`)
          }
        }
      }
      expect(overlaps, 'overlapping leaf shapes in the layout').toEqual([])
    })
  }
})
