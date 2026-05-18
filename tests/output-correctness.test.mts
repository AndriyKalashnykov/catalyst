import { describe, it, expect } from 'vitest';
import xml2js from 'xml2js';
import { Catalyst } from '../src/catalyst.mjs';

/**
 * Whole-path output-correctness contracts (real parsers + real Mx — NO
 * mocks), for two bugs found wiring a strict .drawio→PNG renderer
 * (rlespinasse/drawio-export) downstream:
 *
 *  Bug 1 — attribute values must be XML-escaped (& < > "). draw.io's own
 *          reader is lenient; a strict XML parser rejects a bare `&`.
 *  Bug 2 — the C4-PlantUML sequence/dynamic family (or any input that
 *          yields zero entities + zero relations) must FAIL LOUDLY, never
 *          emit a content-less but structurally-valid stub.
 *
 * These are whole-path (Catalyst.convert end-to-end), not unit tests of a
 * helper — a unit test on the escape fn or the detector could pass while
 * the wiring silently bypassed it.
 */

const C4 = (inc: string, body: string) =>
  `@startuml t\n!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/v2.13.0/${inc}\n${body}\n@enduml\n`;

describe('Bug 1 — XML escaping of catalyst-authored attribute values', () => {
  it('escapes & < > " in c4Name/c4Technology/c4Description and stays well-formed', async () => {
    const xml = await Catalyst.convert(C4('C4_Component.puml',
      'Component(n, "A & B <C> D", "t & <u> v", "d & <x> y")\n'
      + 'Component(m, "Plain")\n'
      + 'Rel(n, m, "calls & waits <sync>", "g & <rpc>")'));

    // Well-formed for a STRICT parser (the failure mode draw.io hid).
    const doc = await xml2js.parseStringPromise(xml);
    expect(doc).toBeDefined();

    // No raw &, <, or > inside any c4* attribute value.
    for (const m of xml.matchAll(/c4(?:Name|Technology|Description)="([^"]*)"/g)) {
      expect(m[1], `raw markup char in ${m[0]}`).not.toMatch(/[<>&](?!(amp|lt|gt|quot|#39);)/);
    }

    // The literal characters survive the round-trip (draw.io decodes the
    // attribute, then substitutes %c4Name% into the `html=1` label).
    // `<` MUST arrive as the entity `&lt;`, not a raw `<`: draw.io drops
    // `%c4Name%` straight into a `<div>`, so a raw `<C>` would be parsed
    // as an empty HTML tag and VANISH (the #23 `<…>`-strip data-loss
    // bug). `>` may stay literal (harmless in text); `&`→`&` (real
    // ampersand preserved). This asserts the FIXED contract.
    const root = doc.mxfile.diagram[0].mxGraphModel[0].root[0];
    // `<br/>` is catalyst's verified wrap-break encoding (identical form
    // across the whole factcheck-CLEAN / golden-GREEN corpus). Under
    // ADR-0010 content-fit sizing the relationship verb legitimately
    // wraps where the old fixed 200px box kept it one line — so strip
    // the wrap break before the content-equality check. The ESCAPING
    // contract this test guards (no raw `&`/`<`/`>`; `<`→`&lt;`,
    // `&`→`&`) is asserted unchanged by the raw-markup-char regex above
    // AND by the exact expected strings below — only the wrap-induced
    // line breaks are normalised away, not any escaping.
    const names = (root.object ?? [])
      .map((o: { $: { c4Name?: string } }) => (o.$.c4Name ?? '').replace(/<br\/>/g, ' '));
    expect(names).toContain('A & B &lt;C> D');               // entity verb-less name — `<`→`&lt;`
    expect(names).toContain('calls & waits &lt;sync>');      // relationship verb — `<`→`&lt;`
  });
});

describe('Bug 2 — fail loudly, never a content-less stub', () => {
  it('rejects a C4_Sequence diagram with a clear, specific message', async () => {
    const puml = C4('C4_Sequence.puml',
      'actor "Operator / app" as op\nparticipant "Certificate CR" as crt\nop -> crt : apply');
    await expect(Catalyst.convert(puml)).rejects.toThrow(
      /unsupported C4-PlantUML diagram type: C4_Sequence/,
    );
  });

  it('rejects sequence syntax even without the C4_Sequence include', async () => {
    await expect(
      Catalyst.convert('@startuml s\nparticipant "A" as a\nparticipant "B" as b\na -> b : x\n@enduml'),
    ).rejects.toThrow(/unsupported C4-PlantUML diagram type: C4_Sequence/);
  });

  it('rejects any non-empty input that yields zero entities and zero relations', async () => {
    await expect(Catalyst.convert('@startuml x\ntitle nothing here\n@enduml'))
      .rejects.toThrow(/no convertible C4 elements found/);
  });

  it('still converts a valid static C4 diagram (no false positive)', async () => {
    const xml = await Catalyst.convert(C4('C4_Container.puml',
      'System(a, "A")\nContainer(b, "B", "Go")\nRel(a, b, "uses")'));
    expect(xml).toContain('<mxfile');
    await expect(xml2js.parseStringPromise(xml)).resolves.toBeDefined();
  });
});

describe('Phase 1 — PlantUML \\n becomes a real line break, never a literal', () => {
  it('translates \\n in name/description/rel to <br/> and stays strict-XML well-formed', async () => {
    const xml = await Catalyst.convert(C4('C4_Container.puml',
      'ContainerDb(s, "K8s Secret\\n<workload>-tls", "Kubernetes", "Holds the issued\\nleaf cert\\nand key")\n'
      + 'Container(a, "Admin API", "Go", "OpenAPI 3.1 REST:\\n  POST /issue")\n'
      + 'Rel(a, s, "writes\\ncert + key to", "K8s API")'));

    // Strict-XML well-formed (the inserted break must be the pre-encoded
    // &lt;br/&gt;, not a raw <br/> that a strict consumer would reject).
    const doc = await xml2js.parseStringPromise(xml);
    expect(doc).toBeDefined();
    expect(xml).toContain('&lt;br/&gt;');

    // No literal backslash-n survives in any catalyst-authored attribute.
    for (const m of xml.matchAll(/c4(?:Name|Technology|Description)="([^"]*)"/g)) {
      expect(m[1], `literal \\n survived in ${m[0]}`).not.toMatch(/\\n/);
    }

    // After the XML round-trip the value carries a real <br/> at each
    // break (draw.io substitutes this into the html=1 label), AND a
    // literal `<` arrives as `&lt;` so `<workload>` renders verbatim
    // instead of being eaten as an empty HTML tag (#23 `<…>`-strip fix).
    const root = doc.mxfile.diagram[0].mxGraphModel[0].root[0];
    const objs = (root.object ?? []) as { $: Record<string, string> }[];
    const byId = (id: string) => objs.find((o) => o.$.id === id)!.$;
    expect(byId('s').c4Name).toBe('K8s Secret<br/>&lt;workload>-tls');
    expect(byId('s').c4Description).toBe('Holds the issued<br/>leaf cert<br/>and key');
    expect(byId('a').c4Description).toBe('OpenAPI 3.1 REST:<br/>  POST /issue');
    // Relationship verb keeps its break too.
    const rel = objs.find((o) => o.$.c4Name?.includes('writes'))!.$;
    expect(rel.c4Name).toBe('writes<br/>cert + key to');
  });
});

describe('Edge-label wrap — long verb is bounded, not smeared across nodes', () => {
  it('wraps a long relationship verb to the endpoint-derived cap (whole path)', async () => {
    // Two Components (narrow ~180px min). A very long verb between them
    // would, un-wrapped, render as one line far wider than either box and
    // overlap both. The endpoint-derived cap must wrap it → the emitted
    // c4Name carries the pre-encoded &lt;br/&gt; at the wrap points.
    const xml = await Catalyst.convert(C4('C4_Component.puml',
      'Component(a, "A")\nComponent(b, "B")\n'
      + 'Rel(a, b, "submits a payment authorization request and waits synchronously for settlement confirmation", "HTTPS / JSON over mutually-authenticated TLS 1.3")'));

    const doc = await xml2js.parseStringPromise(xml);
    expect(doc).toBeDefined();
    const root = doc.mxfile.diagram[0].mxGraphModel[0].root[0];
    const objs = (root.object ?? []) as { $: Record<string, string> }[];
    const rel = objs.find((o) => o.$.c4Name?.startsWith('submits'))!.$;

    // Wrapped: the long verb now contains real <br/> (decoded from the
    // strict-safe &lt;br/&gt;), and NO wrapped line is the whole verb.
    expect(rel.c4Name).toContain('<br/>');
    expect(rel.c4Name).not.toContain('submits a payment authorization request and waits synchronously for settlement confirmation');
    // The long technology line is wrapped the same way.
    expect(rel.c4Technology).toContain('<br/>');
    // Strict-XML: only the pre-encoded form in the raw attribute.
    for (const m of xml.matchAll(/c4(?:Name|Technology)="([^"]*)"/g)) {
      expect(m[1]).not.toMatch(/\\n/);
    }
  });

  it('a short verb is NOT broken (no spurious <br/>)', async () => {
    const xml = await Catalyst.convert(C4('C4_Component.puml',
      'Component(a, "A")\nComponent(b, "B")\nRel(a, b, "Uses", "HTTPS")'));
    const doc = await xml2js.parseStringPromise(xml);
    const root = doc.mxfile.diagram[0].mxGraphModel[0].root[0];
    const objs = (root.object ?? []) as { $: Record<string, string> }[];
    const rel = objs.find((o) => o.$.c4Name === 'Uses')!.$;
    expect(rel.c4Name).toBe('Uses');
    expect(rel.c4Technology).toBe('[HTTPS]');
  });
});

/**
 * Completeness invariant (MDE model-transformation principle): every
 * source construct MUST trace to ≥1 target element — no silent drops.
 * The `title` directive was skip-listed by EntityParser and dropped on
 * 100% of diagrams; the entity/rel-only oracle never caught it (a
 * coverage gap, not a node defect). Whole-path contracts so the wiring
 * — parse → emit → escape — is exercised, not a helper in isolation.
 */
describe('completeness invariant — PlantUML `title` traces to a drawio element', () => {
  const titleOf = async (puml: string) => {
    const doc = await xml2js.parseStringPromise(await Catalyst.convert(puml));
    const objs = (doc.mxfile.diagram[0].mxGraphModel[0].root[0].object ?? []) as { $: Record<string, string> }[];
    return objs.find((o) => o.$.id === '__title')?.$;
  };

  it('emits a __title cell carrying the exact title text', async () => {
    const t = await titleOf(C4('C4_Context.puml',
      'title My Context Title\nSystem(a, "A")\nSystem(b, "B")\nRel(a, b, "uses")'));
    expect(t).toBeDefined();
    expect(t!.c4Type).toBe('Title');
    expect(t!.c4Name).toBe('My Context Title');
  });

  it('preserves Unicode (em-dash, arrows) in the title — escape wiring', async () => {
    const t = await titleOf(C4('C4_Context.puml',
      'title Topology — cyclic (A→B→C→A)\nSystem(a, "A")\nRel(a, a, "self")'));
    expect(t).toBeDefined();
    // c4Text escapes < > & only; the em-dash/arrows must round-trip
    // through xml2js verbatim (the topology-cyclic regression class).
    expect(t!.c4Name).toBe('Topology — cyclic (A→B→C→A)');
  });

  it('the title is NOT a C4 node (excluded from entity geometry)', async () => {
    const doc = await xml2js.parseStringPromise(await Catalyst.convert(
      C4('C4_Context.puml', 'title T\nSystem(a, "A")\nSystem(b, "B")\nRel(a,b,"r")')));
    const objs = (doc.mxfile.diagram[0].mxGraphModel[0].root[0].object ?? []) as { $: Record<string, string> }[];
    const title = objs.find((o) => o.$.id === '__title')!.$;
    expect(title.c4Type).toBe('Title');               // not System/Container/…
    // exactly two C4 element nodes (a, b) — the title does not inflate them
    const elems = objs.filter((o) => o.$.c4Type === 'System');
    expect(elems).toHaveLength(2);
  });

  it('iff: NO title directive ⇒ NO __title cell (does not fabricate)', async () => {
    const t = await titleOf(C4('C4_Context.puml', 'System(a, "A")\nSystem(b, "B")\nRel(a,b,"r")'));
    expect(t).toBeUndefined();
  });
});
