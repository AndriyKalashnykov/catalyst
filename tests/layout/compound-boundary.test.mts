import { describe, it, expect } from 'vitest'
import { LayoutEngine } from '../../src/layout/LayoutEngine.mjs'
import type { EntityDescriptor } from '../../src/puml/EntityDescriptor.interface.mjs'

// Phase 4 contract. NETWORK_SIMPLEX node placement was adopted because a
// full-corpus spike showed it strictly reduces crossings on the large
// tangled hierarchical diagrams (real c4-container 44→30,
// deployment-profile-b 19→16, -c 17→13) with ZERO regression and zero
// node overlap anywhere. Crossing counts on small synthetic graphs are
// placement-strategy-sensitive by ±1 (not a stable contract — see
// ADR-0006), so this gate asserts the invariants that DO hold
// deterministically for the compound-boundary case:
//   1. every child stays geometrically inside its boundary's box, and
//   2. no two leaf shapes overlap
// on a deliberately dense multi-boundary + shared-hub graph (the
// c4-container shape that motivated Phase 4).

const boundaries: EntityDescriptor[] = [0, 1, 2].map((b) => ({
  type: 'Container_Boundary', alias: `B${b}`, label: `Boundary ${b}`,
  children: [0, 1, 2, 3].map((i) => ({
    type: 'Container', alias: `C${b}_${i}`, label: `Svc ${b}.${i}`,
    technology: 'Go', description: `does ${i}`,
  })),
}))
const entities: EntityDescriptor[] = [
  { type: 'Container', alias: 'HUB', label: 'Gateway', technology: 'Go', description: 'fans out' },
  ...boundaries,
]
const relations = boundaries.flatMap((bnd, b) =>
  (bnd.children ?? []).flatMap((c, i) => [
    { source: 'HUB', target: c.alias, label: 'calls', description: 'gRPC' },
    { source: c.alias, target: `C${(b + 1) % 3}_${i}`, label: 'sync', description: '' },
  ]),
)

describe('Phase 4 — compound boundary layout (NETWORK_SIMPLEX)', () => {
  it('every child stays inside its boundary box and no leaf overlaps', async () => {
    const r = await LayoutEngine.calculateLayout(
      entities, relations,
      { rankdir: 'TB', nodesep: 50, edgesep: 10, ranksep: 50 },
    )

    const byId = new Map(r.clusters.map((c) => [c.id, c]))
    // 1. Containment: each leaf's rect ⊆ its parent boundary's rect.
    for (const n of r.nodes) {
      if (!n.parent) continue
      const p = byId.get(n.parent)
      if (!p) continue
      expect(
        n.x! >= p.x! - 1 && n.y! >= p.y! - 1 &&
        n.x! + n.width <= p.x! + p.width + 1 &&
        n.y! + n.height <= p.y! + p.height + 1,
        `${n.id} escapes its boundary ${p.id}`,
      ).toBe(true)
    }

    // 2. No leaf overlaps (Phase 3/4 declump/placement invariant).
    const L = r.nodes
    const overlaps: string[] = []
    for (let i = 0; i < L.length; i++)
      for (let j = i + 1; j < L.length; j++) {
        const a = L[i], b = L[j]
        if (a.x! < b.x! + b.width && a.x! + a.width > b.x! &&
            a.y! < b.y! + b.height && a.y! + a.height > b.y!)
          overlaps.push(`${a.id}~${b.id}`)
      }
    expect(overlaps, 'overlapping leaf shapes').toEqual([])
  })
})
