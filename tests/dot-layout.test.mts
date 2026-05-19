import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { EntityParser } from '../src/puml/EntityParser.mjs'
import { RelParser } from '../src/puml/RelParser.mjs'
import { DotLayout } from '../src/layout/DotLayout.mjs'
import type { EntityDescriptor } from '../src/puml/EntityParser.mjs'
import { countCrossings, NODE_R } from '../scripts/edgecross-svg.mjs'

/**
 * Item 1a · P1+P2 whole-path contract gate for the `dot` engine.
 *
 * WHOLE PATH, NOT MOCKED (the every-gate-proven-red discipline): real
 * EntityParser/RelParser → real DotLayout.calculateLayout (real pinned
 * WASM Graphviz) → assert the invariants `layoutData2mx` relies on.
 * A green here means dot produces a faithful LayoutResult for the
 * actual corpus — not that a stub returned a canned value.
 *
 * Contracts (each the analogue of an existing ELK-side gate):
 *  C1 completeness — every leaf entity ⇒ a node, every compound ⇒ a
 *     cluster (ADR-0012 invariant; no silent drops)
 *  C2 no edge dropped — every relation index ⇒ a rel<i> edge
 *  C3 cluster containment — a boundary box encloses its children
 *  C4 no leaf overlap — layout-quality invariant
 *  C5 determinism — byte-stable dot source AND LayoutResult (the P0
 *     premise, now a standing gate)
 *  C6 in-pipeline crossings — the 5 ELK-crossing fixtures route to 0
 *     non-incident crossings THROUGH THE REAL ADAPTER (proves P0's
 *     30→0 survives P1/P2, measured with the project's own instrument)
 *
 * The mutation-verified RED case (C1-RED) proves the gate actually
 * enforces: drop one entity from the model and completeness MUST fail.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const corpusDir = join(__dirname, 'fixtures', 'corpus')
const FIXTURES = readdirSync(corpusDir).filter(f => f.endsWith('.puml')).sort()

const ELK_CROSSING_BASELINE = JSON.parse(
  readFileSync(join(__dirname, 'edgecross-baseline.json'), 'utf8')) as Record<string, number>
const CROSSING_FIXTURES = Object.entries(ELK_CROSSING_BASELINE)
  .filter(([, n]) => n > 0).map(([s]) => s)               // the 5 with ELK crossings

function leaves(es: EntityDescriptor[], out: string[] = []): string[] {
  for (const e of es) e.children?.length ? leaves(e.children, out) : out.push(e.alias)
  return out
}
function compounds(es: EntityDescriptor[], out: string[] = []): string[] {
  for (const e of es) if (e.children?.length) { out.push(e.alias); compounds(e.children, out) }
  return out
}
const parse = (puml: string) => ({
  entities: new EntityParser().parse(puml),
  relations: RelParser.getRelations(puml),
  constraints: RelParser.getLayoutConstraints(puml),
})

/** Completeness predicate (the C1 contract, extracted so the SAME
 *  predicate can be asserted GREEN on the real output and RED on a
 *  mutated one — mutation-verified enforcement, not two ad-hoc checks).
 *  Returns the aliases the LayoutResult failed to account for. */
function missingEntities(
  entities: EntityDescriptor[],
  r: { nodes: { id: string }[]; clusters: { id: string }[] },
): string[] {
  const nodeIds = new Set(r.nodes.map(n => n.id))
  const clusterIds = new Set(r.clusters.map(c => c.id))
  const miss: string[] = []
  for (const a of leaves(entities)) if (!nodeIds.has(a)) miss.push(a)
  for (const a of compounds(entities)) if (!clusterIds.has(a)) miss.push(a)
  return miss
}

describe('DotLayout — whole-path contract over the corpus', () => {
  for (const file of FIXTURES) {
    const stem = file.replace(/\.puml$/, '')
    it(`${stem}: faithful LayoutResult (C1–C4)`, async () => {
      const puml = readFileSync(join(corpusDir, file), 'utf8')
      const { entities, relations, constraints } = parse(puml)
      const r = await DotLayout.calculateLayout(entities, relations, {}, constraints)

      const nodeIds = new Set(r.nodes.map(n => n.id))
      const clusterIds = new Set(r.clusters.map(c => c.id))

      // C1 — completeness: no leaf or compound silently dropped.
      expect(missingEntities(entities, r), 'missing entities').toEqual([])

      // C2 — every relation routed (rel<i> present for each index).
      for (let i = 0; i < relations.length; i++)
        expect(r.edges.some(e => e.name === `rel${i}`), `rel${i}`).toBe(true)

      // C3 — cluster box encloses every child leaf box (the visual
      // nesting layoutData2mx depends on in the flat absolute model).
      const byId = new Map(r.nodes.map(n => [n.id, n]))
      for (const c of r.clusters) {
        for (const childId of c.children ?? []) {
          const ch = byId.get(childId)
          if (!ch) continue                                // nested cluster — checked via its own row
          expect(ch.x! >= c.x! - 0.5 && ch.y! >= c.y! - 0.5 &&
            ch.x! + ch.width <= c.x! + c.width + 0.5 &&
            ch.y! + ch.height <= c.y! + c.height + 0.5,
            `${childId} inside ${c.id}`).toBe(true)
        }
      }

      // C4 — no two leaf boxes overlap (proper-area intersection).
      for (let i = 0; i < r.nodes.length; i++)
        for (let j = i + 1; j < r.nodes.length; j++) {
          const a = r.nodes[i], b = r.nodes[j]
          const ov = a.x! < b.x! + b.width && b.x! < a.x! + a.width &&
                     a.y! < b.y! + b.height && b.y! < a.y! + a.height
          expect(ov, `${a.id} overlaps ${b.id}`).toBe(false)
        }
    })
  }

  // C5 — determinism (the P0 premise as a standing gate). Source is
  // pure; LayoutResult is the engine output — both byte-stable.
  it('C5: dot source AND LayoutResult are byte-deterministic', async () => {
    for (const file of FIXTURES) {
      const puml = readFileSync(join(corpusDir, file), 'utf8')
      const { entities, relations, constraints } = parse(puml)
      const s1 = DotLayout.dotSource(entities, relations, {}, constraints)
      const s2 = DotLayout.dotSource(entities, relations, {}, constraints)
      expect(s2, `${file} source`).toBe(s1)
      const r1 = JSON.stringify(await DotLayout.calculateLayout(entities, relations, {}, constraints))
      const r2 = JSON.stringify(await DotLayout.calculateLayout(entities, relations, {}, constraints))
      expect(r2, `${file} layout`).toBe(r1)
    }
  })

  // C6 — in-pipeline crossings: the 30 ELK crossings → 0 under dot,
  // measured THROUGH the real adapter with the project's instrument.
  for (const stem of CROSSING_FIXTURES) {
    it(`C6: ${stem} routes to 0 non-incident crossings (ELK had ${ELK_CROSSING_BASELINE[stem]})`, async () => {
      const puml = readFileSync(join(corpusDir, `${stem}.puml`), 'utf8')
      const { entities, relations, constraints } = parse(puml)
      const r = await DotLayout.calculateLayout(entities, relations, {}, constraints)
      const polys = r.edges
        .filter(e => /^rel\d+$/.test(e.name ?? '') && (e.points?.length ?? 0) >= 2)
        .map(e => ({ pts: e.points!.map(p => [p.x, p.y] as [number, number]) }))
      expect(countCrossings(polys, { nodeR: NODE_R }).total).toBe(0)
    })
  }

  // Branch coverage for the directional/constraint/option/escaping
  // paths the corpus sweep does not exercise (P6 — DotLayout is now
  // the default engine, so these retained branches must be covered).
  it('directional hints (L/R/U) + Lay_* constraints + rankdir + quote-escape', async () => {
    const ent: EntityDescriptor[] = [
      // Boundary with a quoted label → exercises q() quote-escape
      // (leaf nodes emit no label under fixedsize, so the escape
      // path is only reachable via a cluster label).
      { type: 'System_Boundary', alias: 'bnd', label: 'B "quoted"',
        children: [{ type: 'System', alias: 'a', label: 'A' }] } as EntityDescriptor,
      { type: 'System', alias: 'b', label: 'B' } as EntityDescriptor,
      { type: 'System', alias: 'c', label: 'C' } as EntityDescriptor,
    ]
    const rels = [
      { source: 'a', target: 'b', label: 'left', description: '', direction: 'L' as const },
      { source: 'a', target: 'c', label: 'right', description: '', direction: 'R' as const },
      { source: 'b', target: 'c', label: 'up', description: '', direction: 'U' as const },
    ]
    const cons = [{ source: 'a', target: 'c', direction: 'U' as const }]

    // Non-default rankdir options (LR) + the L/R same-rank +
    // constraint(lay<i>) emit branches + the `"`-escape in q().
    const src = DotLayout.dotSource(ent, rels, { rankdir: 'LR' }, cons)
    expect(src).toContain('rankdir=LR')
    expect(src).toContain('rank=same')               // L/R same-rank group
    expect(src).toContain('id="lay0"')               // constraint edge
    expect(src).toContain('B \\"quoted\\"')           // quote-escaped cluster label

    const r = await DotLayout.calculateLayout(ent, rels, { rankdir: 'LR' }, cons)
    expect(r.nodes.map(n => n.id).sort()).toEqual(['a', 'b', 'c'])
    // rel<i> present for every visible relation; lay<i> surfaced too
    // (the gvidName fallback for a constraint edge — DotLayout L310-311).
    for (let i = 0; i < rels.length; i++)
      expect(r.edges.some(e => e.name === `rel${i}`)).toBe(true)
    expect(r.edges.some(e => e.name === 'lay0')).toBe(true)
    expect(r.routesAuthoritative).toBe(true)
  })

  it('BT rankdir + a short (<4-control-point) spline degrades cleanly', async () => {
    const ent: EntityDescriptor[] = [
      { type: 'System', alias: 'x', label: 'X' } as EntityDescriptor,
      { type: 'System', alias: 'y', label: 'Y' } as EntityDescriptor,
    ]
    const rels = [{ source: 'x', target: 'y', label: 'e', description: '' }]
    const r = await DotLayout.calculateLayout(ent, rels, { rankdir: 'BT' })
    expect(r.nodes).toHaveLength(2)
    expect(r.edges[0].points!.length).toBeGreaterThanOrEqual(2)
  })

  // C1-RED — mutation-verified proof the completeness gate ENFORCES.
  // The SAME predicate that returns [] above must return the dropped
  // alias when a node is removed from the contracted output. (This is
  // the only honest RED: dot auto-creates undeclared edge-endpoint
  // nodes, so dropping an entity from the *input* does NOT drop it
  // from the graph — the gate's job is to catch a drop in the
  // RESULT, which is exactly what is mutated here.)
  it('C1-RED: completeness predicate catches a dropped node (gate proven RED)', async () => {
    const puml = readFileSync(join(corpusDir, 'rel-bidirectional.puml'), 'utf8')
    const { entities, relations, constraints } = parse(puml)
    const r = await DotLayout.calculateLayout(entities, relations, {}, constraints)

    // GREEN on the real output (sanity — same predicate as C1).
    expect(missingEntities(entities, r)).toEqual([])

    // RED when the contracted output is mutated (one node dropped):
    // the predicate MUST now report that alias as missing.
    const dropped = r.nodes[0].id
    const mutated = { nodes: r.nodes.slice(1), clusters: r.clusters }
    expect(missingEntities(entities, mutated)).toContain(dropped)
  })
})
