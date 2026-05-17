import { describe, it, expect } from 'vitest'
import { LayoutEngine } from '../../src/layout/LayoutEngine.mjs'
import { SHAPE } from '../../src/mx/c4/theme.mjs'
import type { EntityDescriptor } from '../../src/puml/EntityDescriptor.interface.mjs'

// P4b (ADR 0010) introduced two LayoutEngine changes that the content-fit
// box sizing made load-bearing (the old fixed 220-class C4_MIN floor
// incidentally satisfied both; content-fit boxes do not):
//   1. fanReserve  — a same-pair K-edge endpoint needs a border ≥
//                     (K−1)·2·REL_ARROW_SIZE so the P12 even attach
//                     spread clears the factcheck ATTACH_SEP_MIN.
//   2. L/R post-pass — span-preserving reorder + overlap-abort, so a
//                      width-asymmetric or non-adjacent L/R pair can no
//                      longer poke a child out of its parent or graze a
//                      sibling (the c4-exhaustive cb~pubExt / cacheExt
//                      ~pubExt overlaps).
// These assert the public layout contract, not internals.

const OPTS = { rankdir: 'TB' as const, nodesep: 50, edgesep: 10, ranksep: 50, marginx: 20, marginy: 20 }
const ATTACH_SEP_MIN = 2 * SHAPE.REL_ARROW_SIZE

const leaf = (alias: string, label = alias): EntityDescriptor =>
  ({ type: 'Container', alias, label } as EntityDescriptor)

const partialOverlap = (a: { x?: number; y?: number; width: number; height: number },
                        b: { x?: number; y?: number; width: number; height: number }): boolean => {
  const inter = a.x! < b.x! + b.width && a.x! + a.width > b.x! &&
                 a.y! < b.y! + b.height && a.y! + a.height > b.y!
  if (!inter) return false
  const contains = (o: typeof a, i: typeof b) =>
    o.x! <= i.x! && o.y! <= i.y! &&
    o.x! + o.width >= i.x! + i.width && o.y! + o.height >= i.y! + i.height
  return !contains(a, b) && !contains(b, a)
}

describe('LayoutEngine — P4b fanReserve (same-pair edge-fan border floor)', () => {
  it('a K=5 same-pair fan floors BOTH endpoints at (K−1)·2·REL_ARROW_SIZE', async () => {
    const ents = [leaf('A'), leaf('B')]
    const K = 5
    const rels = Array.from({ length: K }, (_, i) =>
      ({ source: 'A', target: 'B', label: `r${i}`, description: '' }))
    const r = await LayoutEngine.calculateLayout(ents, rels, OPTS)
    const need = (K - 1) * ATTACH_SEP_MIN                 // 4 × 28 = 112
    for (const id of ['A', 'B']) {
      const n = r.nodes.find(x => x.id === id)!
      expect(n.width, `${id} width hosts the fan`).toBeGreaterThanOrEqual(need)
      expect(n.height, `${id} height hosts the fan`).toBeGreaterThanOrEqual(need)
    }
  })

  it('a single edge (K=1) gets NO fan reserve — pure content-fit', async () => {
    const r = await LayoutEngine.calculateLayout([leaf('A'), leaf('B')],
      [{ source: 'A', target: 'B', label: 'x', description: '' }], OPTS)
    // short-label content-fit box is far below the K=5 reserve (112)
    // AND below the old fixed 200 floor — proves no spurious widening.
    const a = r.nodes.find(x => x.id === 'A')!
    expect(a.width).toBeLessThan(4 * ATTACH_SEP_MIN)        // < 112: not fan-widened
    expect(a.width).toBeLessThan(200)                       // < old C4_MIN floor
  })
})

describe('LayoutEngine — P4b L/R post-pass (span-preserving + overlap-abort)', () => {
  // Width-asymmetric same-rank siblings under one boundary with a Rel_L
  // between them: the pre-P4b raw `a.x↔b.x` swap poked the wider box out
  // of the ELK-sized parent. The fix must keep every child inside its
  // parent AND introduce no leaf overlap.
  const boundary: EntityDescriptor = {
    type: 'Container_Boundary', alias: 'bnd', label: 'B',
    children: [
      leaf('narrow', 'n'),
      leaf('wide', 'A considerably wider component label here'),
      leaf('mid', 'medium label'),
    ],
  } as EntityDescriptor

  it('keeps every child within its parent boundary and introduces no leaf overlap', async () => {
    const rels = [{ source: 'wide', target: 'narrow', label: 'L', description: '', direction: 'L' as const }]
    const r = await LayoutEngine.calculateLayout([boundary], rels, OPTS)
    const cl = r.clusters.find(c => c.id === 'bnd')!
    for (const n of r.nodes) {
      expect(n.x!, `${n.id} left ≥ parent`).toBeGreaterThanOrEqual(cl.x! - 0.01)
      expect(n.y!, `${n.id} top ≥ parent`).toBeGreaterThanOrEqual(cl.y! - 0.01)
      expect(n.x! + n.width, `${n.id} right ≤ parent`).toBeLessThanOrEqual(cl.x! + cl.width + 0.01)
      expect(n.y! + n.height, `${n.id} bottom ≤ parent`).toBeLessThanOrEqual(cl.y! + cl.height + 0.01)
    }
    for (let i = 0; i < r.nodes.length; i++)
      for (let j = i + 1; j < r.nodes.length; j++)
        expect(partialOverlap(r.nodes[i], r.nodes[j]),
          `${r.nodes[i].id}~${r.nodes[j].id} must not partial-overlap`).toBe(false)
  })

  it('satisfies the L/R order when it can be done without an overlap', async () => {
    // Two same-rank siblings, Rel_L(wide → narrow): narrow must end left
    // of wide. Plain TB with two leaves places them on one rank.
    const ents = [leaf('wide', 'A wide one'), leaf('narrow', 'n')]
    const rels = [{ source: 'wide', target: 'narrow', label: 'L', description: '', direction: 'L' as const }]
    const r = await LayoutEngine.calculateLayout(ents, rels, OPTS)
    const w = r.nodes.find(n => n.id === 'wide')!
    const n = r.nodes.find(x => x.id === 'narrow')!
    const sameRank = w.y! < n.y! + n.height && n.y! < w.y! + w.height
    if (sameRank) expect(n.x!, 'L: target left of source').toBeLessThan(w.x!)
    // and the reorder never produced an overlap
    expect(partialOverlap(w, n)).toBe(false)
  })
})
