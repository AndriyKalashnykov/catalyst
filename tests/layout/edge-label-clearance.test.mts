import { describe, it, expect } from 'vitest'
import { LayoutEngine } from '../../src/layout/LayoutEngine.mjs'
import { measureEdgeLabel } from '../../src/layout/measureNode.mjs'

// Phase 2 contract: edge labels are measured and their dimensions fed to
// ELK, so ELK reserves space and a label rectangle never lands on top of a
// node rectangle (the dominant c4-context "label collides with a box"
// symptom). These assert the public LayoutResult, not ELK internals.

const rectsOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x < b.x + b.width && b.x < a.x + a.width &&
     a.y < b.y + b.height && b.y < a.y + a.height

describe('measureEdgeLabel', () => {
  it('grows with verb length and with an added technology line', () => {
    const short = measureEdgeLabel('Uses')
    const long = measureEdgeLabel('submits a payment authorization request synchronously')
    expect(long.width).toBeGreaterThan(short.width)

    const withTech = measureEdgeLabel('Uses', 'HTTPS / JSON over mTLS 1.3')
    expect(withTech.height).toBeGreaterThan(short.height)   // extra tech line
    expect(withTech.width).toBeGreaterThan(short.width)
  })

  it('honours explicit PlantUML \\n breaks in the verb (Phase 1 interplay)', () => {
    const oneLine = measureEdgeLabel('writes cert and key to')
    const broken = measureEdgeLabel('writes\\ncert and key to')
    expect(broken.height).toBeGreaterThan(oneLine.height)
  })
})

describe('Phase 2 — ELK reserves space for edge labels', () => {
  // Hierarchical (has Containers) so the LAYERED pipeline runs — that is
  // the pipeline whose contract is "ELK reserves measured label space and
  // places the label clear of nodes". The Context pipeline (Phase 3:
  // stress + sporeOverlap) owns its own placement and is covered by the
  // crossing/overlap gate instead.
  it('a long-labelled edge gets a label rect that clears every node (layered)', async () => {
    const entities = [
      { type: 'Container', alias: 'A', label: 'Order Service', technology: 'Go', description: 'places orders' },
      { type: 'Container', alias: 'B', label: 'Payment Service', technology: 'Go', description: 'settles payments' },
      { type: 'Container', alias: 'C', label: 'Ledger', technology: 'Go', description: 'records entries' },
    ]
    const relations = [
      { source: 'A', target: 'B', label: 'submits a payment authorization request and waits synchronously for settlement confirmation', description: 'HTTPS / JSON over mutually-authenticated TLS 1.3' },
      { source: 'B', target: 'C', label: 'appends a double-entry settlement record', description: 'gRPC' },
    ]
    const r = await LayoutEngine.calculateLayout(entities, relations)

    const nodeRects = r.nodes.map((n) => ({ x: n.x ?? 0, y: n.y ?? 0, width: n.width, height: n.height }))
    const labelled = r.edges.filter((e) => e.label)
    // The long-labelled rel edges must surface a measured label rect...
    expect(labelled.length).toBeGreaterThan(0)
    for (const e of labelled) {
      expect(e.label!.width).toBeGreaterThan(0)
      expect(e.label!.height).toBeGreaterThan(0)
      // ...and ELK must have placed it clear of every node box.
      for (const nr of nodeRects) {
        expect(
          rectsOverlap(e.label!, nr),
          `label of ${e.source}->${e.target} overlaps a node`,
        ).toBe(false)
      }
    }
  })
})
