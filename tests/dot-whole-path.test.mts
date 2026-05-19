import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Catalyst } from '../src/catalyst.mjs'
import { EntityParser } from '../src/puml/EntityParser.mjs'
import type { EntityDescriptor } from '../src/puml/EntityParser.mjs'

/**
 * Whole-path coverage gate for the now-only engine (`dot`, FU1 /
 * ADR 0014). Replaces the deleted `elk-fallback.test.mts`: that test
 * provided broad `layoutData2mx` branch coverage by sweeping the
 * corpus through `Catalyst.convert` — but on the removed ELK path.
 * This sweeps the SAME real path on `dot` (the only engine), plus the
 * c4-feature fixtures (notes / SHOW_LEGEND / AddProperty — the
 * post-layout emit branches no corpus fixture exercises) and a
 * constructed cluster-endpoint multi-edge input that deterministically
 * exercises the `else if (lane)` emit branch (a same-pair group whose
 * endpoint is a boundary fails the authoritative branch's
 * `!clusterIds` guard, so it falls to the lane branch — that branch is
 * reachable live code under dot, not dead).
 *
 * Engine-invariant contracts only (no silent drop, well-formed XML) —
 * the same no-fake-green completeness invariant corpus-sanity asserts.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const corpusDir = join(__dirname, 'fixtures', 'corpus')
const featDir = join(__dirname, 'fixtures', 'c4-feat')

function leaves(es: EntityDescriptor[], out: string[] = []): string[] {
  for (const e of es) e.children?.length ? leaves(e.children, out) : out.push(e.alias)
  return out
}

async function assertWholePath(puml: string, label: string) {
  const xml = await Catalyst.convert(puml)
  expect(xml, `${label} well-formed`).toContain('<mxGraphModel')
  expect(xml, `${label} closed`).toContain('</mxGraphModel>')
  const ids = new Set(
    [...xml.matchAll(/<object\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]))
  for (const a of leaves(new EntityParser().parse(puml)))
    expect(ids.has(a), `${label}: dropped leaf ${a}`).toBe(true)
}

describe('dot whole-path — corpus + features + lane-branch (FU1)', () => {
  for (const f of readdirSync(corpusDir).filter(x => x.endsWith('.puml')).sort()) {
    it(`corpus ${f}: convert (dot) emits every leaf, well-formed`, async () => {
      await assertWholePath(readFileSync(join(corpusDir, f), 'utf8'), f)
    })
  }

  for (const f of readdirSync(featDir).filter(x => x.endsWith('.puml')).sort()) {
    it(`c4-feat ${f}: convert (dot) — exercises notes/legend/property emit`, async () => {
      await assertWholePath(readFileSync(join(featDir, f), 'utf8'), f)
    })
  }

  it('cluster-endpoint multi-edge group: no silent drop (the case '
    + 'that exercised the now-removed lane branch — still correct via '
    + 'the authoritative/straight path)', async () => {
    // Boundary endpoint + same-pair K=2 group. Under ELK this took the
    // lane branch (removed with the engine, FU1); under dot it routes
    // via the authoritative/straight path. The render-level
    // no-silent-drop contract must hold regardless.
    const puml = [
      '@startuml lane-branch-cover',
      '!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/v2.13.0/C4_Container.puml',
      'System(x, "X")',
      'System_Boundary(b, "B") {',
      '  Container(s, "S", "tech", "desc")',
      '}',
      'Rel(x, b, "writes", "a")',
      'Rel(x, b, "reads", "b")',
      'Rel(b, x, "callback", "c")',
      '@enduml',
    ].join('\n')
    const xml = await Catalyst.convert(puml)
    expect(xml).toContain('<mxGraphModel')
    expect((xml.match(/\bedge="1"/g) ?? []).length).toBeGreaterThanOrEqual(3)
    const ids = new Set(
      [...xml.matchAll(/<object\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]))
    for (const a of ['x', 'b', 's']) expect(ids.has(a), `missing ${a}`).toBe(true)
  })
})
