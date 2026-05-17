import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Catalyst } from '../src/catalyst.mjs';
import { EntityParser } from '../src/puml/EntityParser.mjs';
import { RelParser } from '../src/puml/RelParser.mjs';
import { parseStringPromise } from 'xml2js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
    readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

// Count `id="<alias>"` occurrences — one per emitted shape (the diagram id
// `id="catalyst-diagram"` and the structural root cells `id="0"` / `id="1"`
// are subtracted by listing aliases explicitly rather than counting).
const emittedAliases = (xml: string): Set<string> => {
    const set = new Set<string>();
    for (const m of xml.matchAll(/id="([^"]+)"/g)) {
        const id = m[1];
        if (id === '0' || id === '1' || id === 'catalyst-diagram') continue;
        set.add(id);
    }
    return set;
};

describe('C4-PlantUML spec coverage — deployment level', () => {
    it('emits Deployment_Node shapes with containment', async () => {
        const xml = await Catalyst.convert(fixture('c4-deployment.puml'));
        const aliases = emittedAliases(xml);
        for (const a of ['aws', 'cluster', 'rds', 'cdn', 'api', 'cache', 'db']) {
            expect(aliases.has(a), `alias "${a}" not emitted`).toBe(true);
        }
    });

    it('preserves all 3 relationships in deployment fixture', async () => {
        const xml = await Catalyst.convert(fixture('c4-deployment.puml'));
        const pairs = new Set(
            [...xml.matchAll(/source="([^"]+)"\s+target="([^"]+)"/g)].map(
                (m) => `${m[1]}->${m[2]}`,
            ),
        );
        for (const pair of ['cdn->api', 'api->cache', 'api->db']) {
            expect(pairs.has(pair), `relationship "${pair}" missing`).toBe(true);
        }
    });
});

describe('C4-PlantUML spec coverage — all entity variants', () => {
    it('emits every non-deployment C4 entity type catalyst claims to support', async () => {
        const xml = await Catalyst.convert(fixture('c4-all-entity-variants.puml'));
        const aliases = emittedAliases(xml);
        const expected = [
            'p', 'pe',
            's', 'sdb', 'sq', 'se', 'sdbe', 'sqe',
            'c', 'cdb', 'cq', 'ce', 'cdbe', 'cqe',
        ];
        for (const a of expected) {
            expect(aliases.has(a), `alias "${a}" not emitted`).toBe(true);
        }
    });
});

describe('C4-PlantUML spec coverage — all relationship variants', () => {
    it('parses every Rel / BiRel / RelIndex variant', () => {
        const rels = RelParser.getRelations(fixture('c4-all-rel-variants.puml'));
        // 17 rel lines in the fixture; every one should parse.
        expect(rels.length).toBe(17);
    });

    it('flags BiRel variants as bidirectional', () => {
        const rels = RelParser.getRelations(fixture('c4-all-rel-variants.puml'));
        const biRels = rels.filter((r) => r.bidirectional);
        // 4 BiRel lines in the fixture.
        expect(biRels.length).toBe(4);
    });

    it('parses long-form Rel_Up/Down/Left/Right', () => {
        const rels = RelParser.getRelations(fixture('c4-all-rel-variants.puml'));
        const longFormLabels = rels
            .filter((r) => ['Rel_Up', 'Rel_Down', 'Rel_Left', 'Rel_Right'].includes(r.label))
            .map((r) => r.label);
        expect(longFormLabels.sort()).toEqual(['Rel_Down', 'Rel_Left', 'Rel_Right', 'Rel_Up']);
    });

    it('emits bidirectional arrow style (startArrow) for BiRel edges', async () => {
        const puml = `
System(a, "A")
System(b, "B")
BiRel(a, b, "Talks", "gRPC")
`;
        const xml = await Catalyst.convert(puml);
        // The edge should have startArrow set (bidirectional) in its style.
        const edgeStyle = xml.match(/source="a" target="b"[^/]*style="([^"]*)"/);
        // Actually style is on the mxCell, let's grep more broadly
        expect(xml).toContain('startArrow=blockThin');
    });

    // C4-PlantUML Rel_Back ("<<--") = arrowhead at $from only. catalyst must
    // reverse the ARROWHEAD, NOT swap the edge endpoints (source/target stay
    // exactly as written — the corpus-sanity "no reversed endpoints" gate
    // depends on this).
    async function edgeStyleOf(xml: string, src: string, tgt: string): Promise<string> {
        const doc = await parseStringPromise(xml);
        const root = doc?.mxfile?.diagram?.[0]?.mxGraphModel?.[0]?.root?.[0] ?? {};
        for (const obj of (root.object ?? [])) {
            const cell = obj.mxCell?.[0]?.$ ?? {};
            if (cell.edge === '1' && cell.source === src && cell.target === tgt) return cell.style ?? '';
        }
        throw new Error(`no edge ${src}->${tgt} in emitted xml`);
    }

    it('Rel_Back emits a $from-side arrowhead (startArrow + endArrow=none), endpoints NOT swapped', async () => {
        const xml = await Catalyst.convert('System(a, "A")\nSystem(b, "B")\nRel_Back(a, b, "acks")\n');
        // endpoints preserved exactly as written
        const style = await edgeStyleOf(xml, 'a', 'b');
        expect(style).toContain('startArrow=blockThin');
        expect(style).toContain('startFill=1');
        // mxGraph takes the LAST value of a duplicated key — endArrow must
        // resolve to none (no $to-side head), overriding the base blockThin.
        expect(style.split(';').filter((s) => s.startsWith('endArrow=')).at(-1)).toBe('endArrow=none');
    });

    it('plain Rel keeps the $to-side arrowhead and no startArrow', async () => {
        const xml = await Catalyst.convert('System(a, "A")\nSystem(b, "B")\nRel(a, b, "uses")\n');
        const style = await edgeStyleOf(xml, 'a', 'b');
        expect(style.split(';').filter((s) => s.startsWith('endArrow=')).at(-1)).toBe('endArrow=blockThin');
        expect(style).not.toContain('startArrow=blockThin');
    });

    it('BiRel keeps BOTH arrowheads (regression guard: back override must not leak)', async () => {
        const xml = await Catalyst.convert('System(a, "A")\nSystem(b, "B")\nBiRel(a, b, "syncs")\n');
        const style = await edgeStyleOf(xml, 'a', 'b');
        expect(style).toContain('startArrow=blockThin');
        // BiRel must NOT get endArrow=none — both ends keep an arrowhead.
        expect(style.split(';').filter((s) => s.startsWith('endArrow=')).at(-1)).toBe('endArrow=blockThin');
    });

    // Whole-path contract for the boundary subtitle (boundaryLegend wired
    // through Mx.addMxC4) — the boundaryLegend unit test proves the map,
    // this proves the WIRING: emitted label carries the PlantUML
    // lowercase tag, NOT the %c4Type% placeholder, while the structural
    // c4Type attribute stays the raw macro (golden/parity invariant).
    async function boundaryObj(xml: string, id: string): Promise<{ c4Type: string; label: string }> {
        const doc = await parseStringPromise(xml);
        const root = doc?.mxfile?.diagram?.[0]?.mxGraphModel?.[0]?.root?.[0] ?? {};
        for (const obj of (root.object ?? [])) {
            if ((obj.$ ?? {}).id === id) return { c4Type: obj.$.c4Type ?? '', label: obj.$.label ?? '' };
        }
        throw new Error(`no object id=${id}`);
    }
    const C4 = '@startuml\n!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/v2.13.0/C4_Container.puml\n';

    it('named boundaries render the PlantUML lowercase-tag subtitle, c4Type attribute unchanged', async () => {
        const xml = await Catalyst.convert(
            `${C4}System_Boundary(sb,"S"){System(s,"s")}\n`
            + `Container_Boundary(cb,"C"){Container(c,"c")}\n`
            + `Enterprise_Boundary(eb,"E"){System(e,"e")}\n@enduml`);
        for (const [id, kind, tag] of [
            ['sb', 'System_Boundary', 'system'],
            ['cb', 'Container_Boundary', 'container'],
            ['eb', 'Enterprise_Boundary', 'enterprise'],
        ] as const) {
            const o = await boundaryObj(xml, id);
            expect(o.c4Type, `${id}: structural c4Type stays raw macro`).toBe(kind);
            expect(o.label, `${id}: subtitle is the lowercase tag`).toContain(`[${tag}]`);
            expect(o.label, `${id}: no %c4Type% placeholder leaked`).not.toContain('%c4Type%');
        }
    });

    it('generic Boundary surfaces its explicit $type; bare Boundary stays [Boundary]', async () => {
        const xml = await Catalyst.convert(
            `${C4}Boundary(gb,"G","custom-zone"){System(g,"g")}\n`
            + `Boundary(pb,"P"){System(p,"p")}\n@enduml`);
        expect((await boundaryObj(xml, 'gb')).label).toContain('[custom-zone]');
        expect((await boundaryObj(xml, 'pb')).label).toContain('[Boundary]');
    });
});

describe('C4-PlantUML spec coverage — entity parser skip list', () => {
    // Directives and non-entity lines should not be parsed as entities,
    // even though they syntactically look like `Identifier(...)`.
    it.each([
        'AddElementTag("critical", $bgColor="#red")',
        'AddRelTag("async", $lineStyle=DashedLine())',
        'UpdateElementStyle("system1", $bgColor="#abc")',
        'UpdateRelStyle("#green", "#blue")',
        'SHOW_LEGEND()',
        'SHOW_FLOATING_LEGEND()',
        'HIDE_STEREOTYPE()',
        'LAYOUT_TOP_DOWN()',
        'LAYOUT_LEFT_RIGHT()',
        'Lay_U(a, b)',
        'Lay_Up(a, b)',
        'Lay_Distance(a, b, 2)',
        'AddProperty("key", "value")',
        'SetPropertyHeader("name", "value")',
        'WithoutPropertyHeader()',
    ])('skips directive: %s', (directive) => {
        const input = `System(keep, "Keep")\n${directive}\n`;
        const entities = new EntityParser().parse(input);
        expect(entities.map((e) => e.alias)).toEqual(['keep']);
    });
});
