import { describe, it, expect } from 'vitest';
import { Catalyst } from '../src/catalyst.mjs';
import xml2js from 'xml2js';

/**
 * PUBLIC-API CONTRACT for the `Catalyst` facade — the stable surface
 * downstream (puml2drawio) pins. NO mocks: the previous version of this
 * file `vi.mock`'d EntityParser/RelParser/Mx/LayoutEngine, so
 * `Mx.generate` returned a hard-coded `'<xml>test</xml>'` and every
 * assertion tested the MOCK, not catalyst — a green-only test
 * indistinguishable from no test (portfolio rule
 * gate-RED-proves-enforcement). Each case below is RED-capable: it
 * asserts a real property of real output that a genuine regression in
 * the public entrypoint would fail. Whole-path emit/geometry contracts
 * live in output-correctness / parity / corpus-sanity; this file's
 * distinct contract is *the three public methods behave as documented
 * on real input*.
 */

const C4 = (body: string) =>
  `@startuml t\n!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/v2.13.0/C4_Container.puml\n${body}\n@enduml\n`;

describe('Catalyst public API — surface', () => {
  it('exports the three documented static entrypoints', () => {
    expect(typeof Catalyst.convert).toBe('function');
    expect(typeof Catalyst.parseEntities).toBe('function');
    expect(typeof Catalyst.parseRelations).toBe('function');
  });
});

describe('Catalyst.parseEntities — real parse, RED on a dropped entity', () => {
  it('returns the declared entities with exact alias + structural type', () => {
    const ents = Catalyst.parseEntities(C4('System(sys1, "System 1", "desc")'));
    const sys1 = ents.find((e) => e.alias === 'sys1');
    expect(sys1, 'declared System "sys1" must be parsed').toBeDefined();
    expect(sys1!.type).toBe('System');           // RED if the kind is lost
    expect(sys1!.label).toBe('System 1');         // RED if the name is dropped
  });

  it('does NOT fabricate entities from a directive line (RED on over-parse)', () => {
    const ents = Catalyst.parseEntities(C4('System(keep, "Keep")\nLAYOUT_TOP_DOWN()'));
    expect(ents.map((e) => e.alias)).toEqual(['keep']);
  });
});

describe('Catalyst.parseRelations — real parse, RED on a lost relation', () => {
  it('returns the relation with exact endpoints + verb', () => {
    const rels = Catalyst.parseRelations(
      C4('System(a, "A")\nSystem(b, "B")\nRel(a, b, "uses")'));
    expect(rels).toHaveLength(1);
    expect(rels[0].source).toBe('a');
    expect(rels[0].target).toBe('b');
    expect(rels[0].label).toBe('uses');           // RED if the verb is dropped
  });
});

describe('Catalyst.convert — real whole-path, RED on a broken conversion', () => {
  it('emits a strict-XML-well-formed drawio carrying the declared node', async () => {
    const xml = await Catalyst.convert(C4('System(sys1, "System 1", "desc")'));
    // RED: a real `Mx.generate` regression that dropped the node, or
    // emitted malformed XML, fails one of these (the OLD mock made all
    // three pass unconditionally on `'<xml>test</xml>'`).
    expect(xml).toContain('id="sys1"');
    await expect(xml2js.parseStringPromise(xml)).resolves.toBeDefined();
    expect(/<diagram\s+id="[^"]+"\s+name="[^"]+"/.test(xml)).toBe(true);
  });

  it('fails loudly on input with zero convertible C4 elements (RED: no silent stub)', async () => {
    await expect(Catalyst.convert('@startuml x\ntitle nothing\n@enduml'))
      .rejects.toThrow(/no convertible C4 elements found/);
  });
});
