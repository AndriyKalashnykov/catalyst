/**
 * Extracts C4-PlantUML styling directives so the renderer can push drawio
 * output closer to what PlantUML would draw:
 *
 *   AddElementTag($tag, $bgColor=, $fontColor=, $borderColor=, $shadowing=)
 *   AddRelTag($tag, $textColor=, $lineColor=, $lineStyle=)
 *   AddBoundaryTag($tag, $bgColor=, $borderColor=, $fontColor=)
 *   UpdateElementStyle($elementName, $bgColor=, $fontColor=, $borderColor=)
 *   UpdateRelStyle($textColor, $lineColor)            (positional)
 *   UpdateBoundaryStyle($borderColor=, $fontColor=, $bgColor=)
 *
 * These lines are skipped by EntityParser (they are not entities) and by
 * RelParser (not relations), so a dedicated pass owns them. Anything it can't
 * map is ignored — never fatal — keeping the "nothing silently breaks parsing"
 * guarantee.
 */

import { SHAPE } from '../mx/c4/theme.mjs';

export interface StyleOverride {
    fillColor?: string;
    fontColor?: string;
    strokeColor?: string;
    dashed?: 0 | 1;
    /** draw.io `dashPattern` — set for the C4 "dotted" line/border style. */
    dashPattern?: string;
    /** draw.io `strokeWidth` — C4 "bold" line style or an explicit
     *  `$lineThickness` / `$borderThickness`. */
    strokeWidth?: number;
    /** draw.io `shadow` — C4 `$shadowing="true"|"false"`. */
    shadow?: 0 | 1;
}

export interface ParsedStyles {
    /** tag name -> element style override (AddElementTag). */
    elementTags: Map<string, StyleOverride>;
    /** tag name -> relationship style override (AddRelTag). */
    relTags: Map<string, StyleOverride>;
    /** tag name -> boundary style override (AddBoundaryTag). */
    boundaryTags: Map<string, StyleOverride>;
    /** C4 element-kind name (e.g. "external_system") -> override. */
    elementStyles: Map<string, StyleOverride>;
    /** Global relationship override (UpdateRelStyle). */
    relDefault?: StyleOverride;
    /** Global boundary override (UpdateBoundaryStyle). */
    boundaryDefault?: StyleOverride;
    /** C4 `HIDE_STEREOTYPE()` → suppress the `«Type»` line on every
     *  element (PlantUML `hide stereotype`). */
    hideStereotype?: boolean;
    /** C4 `LAYOUT_AS_SKETCH()` / `SET_SKETCH_STYLE()` → hand-drawn
     *  render (PlantUML `skinparam handwritten true`) → draw.io
     *  `sketch=1` on every cell. */
    sketch?: boolean;
}

const kw = (args: string, name: string): string | undefined => {
    // $bgColor="#fff" | $bgColor='#fff' | $bgColor=#fff
    const m = new RegExp(`\\$${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^,)\\s]+))`).exec(args);
    if (!m) return undefined;
    return m[1] ?? m[2] ?? m[3];
};

/** Map the C4-PlantUML colour kwargs onto drawio style keys. */
function toOverride(args: string): StyleOverride {
    const o: StyleOverride = {};
    const bg = kw(args, 'bgColor');
    const fc = kw(args, 'fontColor');
    const bc = kw(args, 'borderColor');
    const lc = kw(args, 'lineColor');
    const tc = kw(args, 'textColor');
    if (bg) o.fillColor = bg;
    if (fc) o.fontColor = fc;
    if (tc) o.fontColor = tc; // rel text colour
    if (bc) o.strokeColor = bc;
    if (lc) o.strokeColor = lc; // rel line colour
    // C4-PlantUML v2.13.0: DashedLine()/DottedLine()/BoldLine()/SolidLine()
    // resolve to the literal strings "dashed"/"dotted"/"bold"/"solid".
    // Elements/boundaries carry it as $borderStyle, relations as
    // $lineStyle (verified against C4.puml + the tag/Update* signatures).
    // Faithful draw.io mapping:
    //   dashed → dashed=1
    //   dotted → dashed=1 + dashPattern (fine dots)
    //   bold   → thicker strokeWidth (the cited emphasis width)
    //   solid  → explicitly NOT dashed (clears any base dashed)
    // The value appears in SOURCE as the C4-PlantUML helper CALL
    // `DashedLine()` (it only resolves to the literal "dashed" at
    // PlantUML runtime — catalyst parses text, so it sees the call);
    // the resolved literal form ("dashed") is also valid C4-PlantUML.
    // Canonicalise both → dashed|dotted|bold|solid by stripping a
    // trailing `Line()` / `()`.
    const lineStyle = (kw(args, 'lineStyle') ?? kw(args, 'borderStyle') ?? '')
        .toLowerCase().replace(/[^a-z]/g, '').replace(/line$/, '');
    switch (lineStyle) {
        case 'dashed': o.dashed = 1; break;
        case 'dotted': o.dashed = 1; o.dashPattern = SHAPE.DASH_PATTERN_DOTTED; break;
        case 'bold': o.strokeWidth = SHAPE.STROKE_WIDTH_EMPHASIS; break;
        case 'solid': o.dashed = 0; break;
        default: break; // unknown/empty — leave base style untouched
    }
    // $lineThickness ($lineStyle's numeric sibling for relations) /
    // $borderThickness (elements) → an explicit strokeWidth; an explicit
    // numeric thickness wins over the "bold" keyword's emphasis default.
    const thick = kw(args, 'lineThickness') ?? kw(args, 'borderThickness');
    if (thick !== undefined && thick.trim() !== '') {
        const n = Number(thick);
        if (Number.isFinite(n) && n > 0) o.strokeWidth = n;
    }
    // $shadowing="true"|"false" → draw.io shadow=1|0.
    const sh = kw(args, 'shadowing');
    if (sh !== undefined) {
        const v = sh.trim().toLowerCase();
        if (v === 'true') o.shadow = 1;
        else if (v === 'false') o.shadow = 0;
    }
    return o;
}

/** Pull the argument list of `Name(...)` with paren-depth awareness. */
function argsOf(line: string): string | null {
    const open = line.indexOf('(');
    if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < line.length; i++) {
        if (line[i] === '(') depth++;
        else if (line[i] === ')') {
            depth--;
            if (depth === 0) return line.slice(open + 1, i);
        }
    }
    return null;
}

/** First positional arg, unquoted. */
function firstArg(args: string): string | undefined {
    const m = /^\s*(?:"([^"]*)"|'([^']*)'|([^,]+))/.exec(args);
    if (!m) return undefined;
    return (m[1] ?? m[2] ?? m[3] ?? '').trim();
}

export class StyleParser {
    static parse(puml: string): ParsedStyles {
        const styles: ParsedStyles = {
            elementTags: new Map(),
            relTags: new Map(),
            boundaryTags: new Map(),
            elementStyles: new Map(),
        };

        for (const raw of puml.split('\n')) {
            const line = raw.trim();
            if (line.startsWith("'") || line.startsWith('!')) continue;

            // Global display toggles (bare C4 macro calls, no args we
            // need). Fact-checked vs pinned C4-PlantUML v2.13.0 C4.puml:
            // HIDE_STEREOTYPE → `hide stereotype`; LAYOUT_AS_SKETCH /
            // SET_SKETCH_STYLE → `skinparam handwritten true`.
            if (/^HIDE_STEREOTYPE\s*\(/.test(line)) { styles.hideStereotype = true; continue; }
            if (/^(LAYOUT_AS_SKETCH|SET_SKETCH_STYLE)\s*\(/.test(line)) { styles.sketch = true; continue; }

            const directive = /^(AddElementTag|AddRelTag|AddBoundaryTag|UpdateElementStyle|UpdateRelStyle|UpdateBoundaryStyle)\b/.exec(line);
            if (!directive) continue;

            const args = argsOf(line);
            if (args === null) continue;
            const name = firstArg(args);
            const override = toOverride(args);

            switch (directive[1]) {
                case 'AddElementTag':
                    if (name) styles.elementTags.set(name, override);
                    break;
                case 'AddRelTag':
                    if (name) styles.relTags.set(name, override);
                    break;
                case 'AddBoundaryTag':
                    if (name) styles.boundaryTags.set(name, override);
                    break;
                case 'UpdateElementStyle':
                    if (name) styles.elementStyles.set(name, override);
                    break;
                case 'UpdateRelStyle':
                    styles.relDefault = override;
                    break;
                case 'UpdateBoundaryStyle':
                    styles.boundaryDefault = override;
                    break;
            }
        }

        return styles;
    }

    /** Apply an override on top of a `key=value;key=value` drawio style string. */
    static applyOverride(baseStyle: string, override?: StyleOverride): string {
        if (!override || Object.keys(override).length === 0) return baseStyle;
        const map = new Map<string, string>();
        for (const part of baseStyle.split(';')) {
            if (!part) continue;
            const eq = part.indexOf('=');
            if (eq < 0) { map.set(part, ''); continue; }
            map.set(part.slice(0, eq), part.slice(eq + 1));
        }
        if (override.fillColor) map.set('fillColor', override.fillColor);
        if (override.fontColor) map.set('fontColor', override.fontColor);
        if (override.strokeColor) map.set('strokeColor', override.strokeColor);
        if (override.dashed !== undefined) map.set('dashed', String(override.dashed));
        if (override.dashPattern !== undefined) map.set('dashPattern', override.dashPattern);
        if (override.strokeWidth !== undefined) map.set('strokeWidth', String(override.strokeWidth));
        if (override.shadow !== undefined) map.set('shadow', String(override.shadow));
        return [...map.entries()].map(([k, v]) => (v === '' ? k : `${k}=${v}`)).join(';');
    }
}
