import { describe, it, expect } from 'vitest';
import { parseProperties } from '../../src/puml/PropertyParser.mjs';
import { Catalyst } from '../../src/catalyst.mjs';
import xml2js from 'xml2js';

describe('PropertyParser — AddProperty / SetPropertyHeader (was dropped)', () => {
  it('a SetPropertyHeader + AddProperty block attaches to the NEXT element', () => {
    const m = parseProperties([
      'SetPropertyHeader("Property", "Value")',
      'AddProperty("SLA", "99.95%")',
      'AddProperty("Owner", "Platform")',
      'System(api, "API")',
      'System(other, "Other")',
    ].join('\n'));
    expect([...m.keys()]).toEqual(['api']);
    expect(m.get('api')).toEqual({
      header: ['Property', 'Value'],
      rows: [['SLA', '99.95%'], ['Owner', 'Platform']],
    });
  });

  it('WithoutPropertyHeader() clears the header (headerless table)', () => {
    const m = parseProperties(
      'SetPropertyHeader("H")\nWithoutPropertyHeader()\nAddProperty("k","v")\nContainer(c,"C")');
    expect(m.get('c')).toEqual({ header: [], rows: [['k', 'v']] });
  });

  it('no AddProperty ⇒ no entry (element unaffected)', () => {
    expect(parseProperties('System(a,"A")\nSystem(b,"B")').size).toBe(0);
  });
});

describe('catalyst — SHOW_LEGEND + property table whole-path (no silent drop)', () => {
  const SRC = `@startuml t
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/v2.13.0/C4_Container.puml
AddElementTag("critical", $bgColor="#c0392b")
AddElementTag("ext", $bgColor="#8a8a8a")
SetPropertyHeader("Property","Value")
AddProperty("SLA","99.95%")
AddProperty("Owner","Platform")
System(a,"A",$tags="critical")
System(b,"B",$tags="ext")
Rel(a,b,"calls")
SHOW_LEGEND()`;

  it('emits a legend box with a row per tag, and a property table grid', async () => {
    const xml = await Catalyst.convert(SRC);
    expect(xml).toContain('id="legend"');
    expect(xml).toContain('Legend');
    expect(xml).toContain('critical');
    expect(xml).toContain('ext');
    expect(xml).toContain('id="proptable-0"');
    expect(xml).toContain('SLA');
    expect(xml).toContain('99.95%');
    expect(xml).toContain('Owner');
    await expect(xml2js.parseStringPromise(xml)).resolves.toBeDefined();
  });

  it('overlay cells use `label=` (object-wrapped) and SINGLE-encoded html — the #139 regression guard', async () => {
    const xml = await Catalyst.convert(SRC + '\nnote right of a : hi');
    // object-wrapped overlay cells render `label`, NOT `value`
    expect(xml).toMatch(/<object label="[^"]*Legend/);
    expect(xml).toMatch(/<object label="[^"]*hi"/);          // note text present
    // markup must be SINGLE-encoded (&lt;) so drawio renders HTML —
    // a double-encoded &amp;lt; would show raw `<div>` source text
    const legend = /<object label="([^"]*Legend[^"]*)"/.exec(xml)![1];
    expect(legend).toContain('&lt;div');
    expect(legend).not.toContain('&amp;lt;div');
  });

  it('NO legend / NO property table when the directives are absent (regression guard)', async () => {
    const xml = await Catalyst.convert('System(a,"A")\nSystem(b,"B")\nRel(a,b,"x")');
    expect(xml).not.toContain('id="legend"');
    expect(xml).not.toContain('id="proptable-');
  });
});
