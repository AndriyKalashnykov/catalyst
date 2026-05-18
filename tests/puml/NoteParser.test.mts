import { describe, it, expect } from 'vitest';
import { parseNotes } from '../../src/puml/NoteParser.mjs';
import { Catalyst } from '../../src/catalyst.mjs';
import xml2js from 'xml2js';

describe('NoteParser — C4 `note` callouts (was silently dropped)', () => {
  it('parses single-line of-form (left/right/top/bottom)', () => {
    const n = parseNotes([
      'note left of a : L',
      'note right of b : R',
      'note top of c : T',
      'note bottom of d : B',
    ].join('\n'));
    expect(n).toEqual([
      { pos: 'left', targets: ['a'], text: 'L' },
      { pos: 'right', targets: ['b'], text: 'R' },
      { pos: 'top', targets: ['c'], text: 'T' },
      { pos: 'bottom', targets: ['d'], text: 'B' },
    ]);
  });

  it('does NOT parse `note over` (sequence-only — PlantUML errors on it in static C4)', () => {
    expect(parseNotes('note over a, b : shared')).toEqual([]);
  });

  it('parses the block form (… end note) accumulating lines', () => {
    const n = parseNotes('note right of x\n  line one\n  line two\nend note');
    expect(n).toEqual([{ pos: 'right', targets: ['x'], text: 'line one\nline two' }]);
  });

  it('ignores comments / preprocessor / non-note lines (no false positives)', () => {
    expect(parseNotes("' note left of a : x\n!include foo\nSystem(a,\"A\")")).toEqual([]);
  });
});

describe('catalyst — C4 note callouts whole-path (no silent drop)', () => {
  it('emits a shape=note cell per callout with the text, target resolved', async () => {
    const xml = await Catalyst.convert(`@startuml t
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/v2.13.0/C4_Container.puml
System(a,"A")
System(b,"B")
Rel(a,b,"calls")
note right of a : entry point
note left of b : the dependency`);
    expect((xml.match(/shape=note/g) ?? []).length).toBe(2);
    expect(xml).toContain('entry point');
    expect(xml).toContain('the dependency');
    await expect(xml2js.parseStringPromise(xml)).resolves.toBeDefined();
  });

  it('a diagram with NO notes emits zero note shapes (regression guard)', async () => {
    const xml = await Catalyst.convert(
      'System(a,"A")\nSystem(b,"B")\nRel(a,b,"x")');
    expect(xml).not.toContain('shape=note');
  });

  it('an unresolved note target is skipped, not crashed (best-effort v1)', async () => {
    const xml = await Catalyst.convert(
      'System(a,"A")\nSystem(b,"B")\nRel(a,b,"x")\nnote left of ghost : orphan');
    expect(xml).not.toContain('shape=note');         // ghost has no laid-out box
    await expect(xml2js.parseStringPromise(xml)).resolves.toBeDefined();
  });
});
