import { describe, it, expect } from 'vitest';
import { StyleParser } from '../../src/puml/StyleParser.mjs';
import { Catalyst } from '../../src/catalyst.mjs';
import { SHAPE } from '../../src/mx/c4/theme.mjs';

describe('StyleParser', () => {
    it('parses AddElementTag / AddRelTag / AddBoundaryTag', () => {
        const s = StyleParser.parse(`
AddElementTag("critical", $bgColor="#aa0000", $fontColor="#ffffff", $borderColor="#660000")
AddRelTag("async", $textColor="#0066cc", $lineColor="#0066cc", $lineStyle=DashedLine())
AddBoundaryTag("zone", $bgColor="#eef7ee", $borderColor="#338833")
`);
        expect(s.elementTags.get('critical')).toEqual({
            fillColor: '#aa0000', fontColor: '#ffffff', strokeColor: '#660000',
        });
        expect(s.relTags.get('async')).toEqual({
            fontColor: '#0066cc', strokeColor: '#0066cc', dashed: 1,
        });
        expect(s.boundaryTags.get('zone')).toEqual({
            fillColor: '#eef7ee', strokeColor: '#338833',
        });
    });

    it('parses UpdateElementStyle / UpdateRelStyle / UpdateBoundaryStyle', () => {
        const s = StyleParser.parse(`
UpdateElementStyle("external_system", $bgColor="#777777", $fontColor="#ffffff")
UpdateRelStyle("default", $textColor="#404040", $lineColor="#828282")
UpdateBoundaryStyle("default", $borderColor="#666666")
`);
        expect(s.elementStyles.get('external_system')).toEqual({
            fillColor: '#777777', fontColor: '#ffffff',
        });
        expect(s.relDefault).toEqual({ fontColor: '#404040', strokeColor: '#828282' });
        expect(s.boundaryDefault).toEqual({ strokeColor: '#666666' });
    });

    it('ignores unrelated lines and never throws', () => {
        expect(() => StyleParser.parse('System(a,"A")\nRel(a,a,"x")\n!include foo\n')).not.toThrow();
        const s = StyleParser.parse('System(a,"A")');
        expect(s.elementTags.size).toBe(0);
    });

    it('applyOverride replaces only the targeted style keys', () => {
        const base = 'rounded=1;fillColor=#1061B0;fontColor=#ffffff;strokeColor=#0D5091';
        const out = StyleParser.applyOverride(base, { fillColor: '#aa0000', dashed: 1 });
        expect(out).toContain('fillColor=#aa0000');
        expect(out).toContain('fontColor=#ffffff'); // untouched
        expect(out).toContain('rounded=1');         // untouched
        expect(out).toContain('dashed=1');          // added
    });

    it('applyOverride is a no-op when override is empty/undefined', () => {
        const base = 'rounded=1;fillColor=#1061B0';
        expect(StyleParser.applyOverride(base, undefined)).toBe(base);
        expect(StyleParser.applyOverride(base, {})).toBe(base);
    });
});

// C4-PlantUML v2.13.0: DashedLine()/DottedLine()/BoldLine()/SolidLine()
// resolve to "dashed"/"dotted"/"bold"/"solid"; carried as $lineStyle
// (relations) / $borderStyle (elements/boundaries), with numeric
// $lineThickness / $borderThickness siblings and $shadowing="true|false".
// catalyst sees the helper CALL form in source (resolves only at PlantUML
// runtime) AND must also accept the resolved literal.
describe('StyleParser — faithful line-style / thickness / shadowing', () => {
    const rel = (kwargs: string) =>
        StyleParser.parse(`AddRelTag("t", ${kwargs})`).relTags.get('t');
    const el = (kwargs: string) =>
        StyleParser.parse(`AddElementTag("t", ${kwargs})`).elementTags.get('t');

    it('maps all four line styles (helper-call form) on a relation', () => {
        expect(rel('$lineStyle=DashedLine()')).toEqual({ dashed: 1 });
        expect(rel('$lineStyle=DottedLine()')).toEqual({ dashed: 1, dashPattern: SHAPE.DASH_PATTERN_DOTTED });
        expect(rel('$lineStyle=BoldLine()')).toEqual({ strokeWidth: SHAPE.STROKE_WIDTH_EMPHASIS });
        expect(rel('$lineStyle=SolidLine()')).toEqual({ dashed: 0 });
    });

    it('accepts the resolved literal form too', () => {
        expect(rel('$lineStyle="dashed"')).toEqual({ dashed: 1 });
        expect(rel('$lineStyle="dotted"')).toEqual({ dashed: 1, dashPattern: SHAPE.DASH_PATTERN_DOTTED });
        expect(rel('$lineStyle="bold"')).toEqual({ strokeWidth: SHAPE.STROKE_WIDTH_EMPHASIS });
        expect(rel('$lineStyle="solid"')).toEqual({ dashed: 0 });
    });

    it('$borderStyle on an element maps the same way', () => {
        expect(el('$borderStyle=DottedLine()')).toEqual({ dashed: 1, dashPattern: SHAPE.DASH_PATTERN_DOTTED });
    });

    it('explicit $lineThickness / $borderThickness wins over the bold default', () => {
        expect(rel('$lineStyle=BoldLine(), $lineThickness="5"')).toEqual({ strokeWidth: 5 });
        expect(el('$borderThickness="3"')).toEqual({ strokeWidth: 3 });
        expect(rel('$lineThickness="0"')).toEqual({});      // non-positive ignored
        expect(rel('$lineThickness="x"')).toEqual({});      // non-numeric ignored
    });

    it('$shadowing="true|false" → shadow 1|0; absent → unset', () => {
        expect(el('$bgColor="#fff", $shadowing="true"')).toEqual({ fillColor: '#fff', shadow: 1 });
        expect(el('$bgColor="#fff", $shadowing="false"')).toEqual({ fillColor: '#fff', shadow: 0 });
        expect(el('$bgColor="#fff"')).toEqual({ fillColor: '#fff' });
    });

    it('applyOverride emits the new keys', () => {
        const out = StyleParser.applyOverride('rounded=1;dashed=0', {
            dashed: 1, dashPattern: '1 4', strokeWidth: 2, shadow: 1,
        });
        expect(out).toContain('dashed=1');
        expect(out).toContain('dashPattern=1 4');
        expect(out).toContain('strokeWidth=2');
        expect(out).toContain('shadow=1');
        expect(out).toContain('rounded=1'); // untouched
    });

    it('whole-path: a dotted+shadowed tag reaches the emitted draw.io style', async () => {
        const xml = await Catalyst.convert(
            'AddElementTag("hot", $bgColor="#aa0000", $borderStyle=DottedLine(), $shadowing="true")\n'
            + 'System(s, "S", $tags="hot")\nSystem(o,"O")\nRel(s,o,"x")\n');
        const m = /vertex="1"[^>]*\bstyle="([^"]*)"/.exec(xml)
            ?? /<mxCell[^>]*style="([^"]*)"[^>]*vertex="1"/.exec(xml);
        // pull the system cell's style explicitly
        const style = /id="s"[\s\S]*?<mxCell[^>]*style="([^"]*)"/.exec(xml)?.[1] ?? (m?.[1] ?? '');
        expect(style).toContain('dashed=1');
        expect(style).toContain(`dashPattern=${SHAPE.DASH_PATTERN_DOTTED}`);
        expect(style).toContain('shadow=1');
        expect(style).toContain('fillColor=#aa0000');
    });
});
