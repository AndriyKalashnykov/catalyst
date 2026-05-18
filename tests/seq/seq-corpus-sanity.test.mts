import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import xml2js from 'xml2js'
import { Catalyst } from '../../src/catalyst.mjs'
import { SeqParser } from '../../src/seq/SeqParser.mjs'

/**
 * Per-fixture STRUCTURAL SANITY GATE for the sequence corpus — the seq
 * analogue of tests/corpus-sanity.test.mts (which guards the C4 corpus).
 * Mirrors C4's "systematic permutation matrix" coverage: every
 * tests/fixtures/seq/*.puml (phase fixtures + the seq-perm-* permutation
 * set: arrows / self-message / activation / notes / fragments [+nested]
 * / dividers / ref / create-destroy / box / C4-kinds / combined-stress)
 * MUST convert with the engine invariants intact:
 *
 *   - convert() does NOT throw (no fail-loud on supported constructs)
 *   - output is strict-XML well-formed (downstream renderer contract)
 *   - ≥1 umlLifeline emitted; lifeline X-order = declaration order
 *   - message Y is monotone non-decreasing in source order
 *   - no "[]"/"«»"/"undefined" tofu artifacts in emitted values
 *
 * Complements the deep per-construct contracts in SeqParser/
 * SeqConverter/seqLayout tests and the committed-SVG render evidence
 * (docs/gallery-seq, `make seq-gallery-verify`).
 */
const __dirname = dirname(fileURLToPath(import.meta.url))
const seqDir = join(__dirname, '..', 'fixtures', 'seq')
const FIXTURES = readdirSync(seqDir).filter((f) => f.endsWith('.puml')).sort()

describe('sequence corpus structural sanity gate', () => {
  // The permutation matrix is expected to be present (regression guard
  // against an accidental fixture deletion shrinking coverage).
  it('covers the phase fixtures AND the seq-perm-* permutation matrix', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(18)
    for (const stem of [
      'seq-perm-arrows', 'seq-perm-self-message', 'seq-perm-activation',
      'seq-perm-notes', 'seq-perm-fragments', 'seq-perm-fragments-nested',
      'seq-perm-dividers', 'seq-perm-ref', 'seq-perm-create-destroy',
      'seq-perm-box', 'seq-perm-c4-kinds', 'seq-perm-combined',
    ]) expect(FIXTURES).toContain(`${stem}.puml`)
  })

  for (const name of FIXTURES) {
    it(name, async () => {
      const puml = readFileSync(join(seqDir, name), 'utf-8')

      // parser model invariants
      const model = SeqParser.parse(puml)
      expect(model.lifelines.length).toBeGreaterThan(0)
      expect(model.lifelines.map((l) => l.index)).toEqual(
        model.lifelines.map((_, i) => i))                  // decl order = X index
      expect(model.events.map((e) => e.order)).toEqual(
        model.events.map((_, i) => i))                     // dense source order

      // whole-path convert — must not throw on a supported construct
      const xml = await Catalyst.convert(puml)

      // strict-XML well-formed (the downstream renderer contract)
      await expect(xml2js.parseStringPromise(xml)).resolves.toBeDefined()

      // ≥1 lifeline cell; X-order follows declaration order
      const llXs = [...xml.matchAll(/id="ll-([^"]+)"[\s\S]*?<mxGeometry x="(-?\d+)"/g)]
      expect(llXs.length).toBe(model.lifelines.length)
      const orderedXs = model.lifelines.map(
        (l) => +llXs.find((m) => m[1] === l.alias)![2])
      for (let i = 1; i < orderedXs.length; i++)
        expect(orderedXs[i]).toBeGreaterThan(orderedXs[i - 1])

      // message Y monotone non-decreasing in source order
      const msgYs = [...xml.matchAll(
        /id="seq-msg-\d+"[\s\S]*?y="(\d+)"[^>]*as="sourcePoint"/g)].map((m) => +m[1])
      for (let i = 1; i < msgYs.length; i++)
        expect(msgYs[i]).toBeGreaterThanOrEqual(msgYs[i - 1])

      // no tofu / unresolved-template artifacts in emitted values
      for (const v of [...xml.matchAll(/value="([^"]*)"/g)].map((m) => m[1])) {
        expect(v).not.toContain('undefined')
        expect(v).not.toMatch(/«»|\[\]/)
        expect(v).not.toMatch(/%c4[A-Za-z]+%/)
      }
    })
  }
})
