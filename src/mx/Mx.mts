import xml2js from 'xml2js'
import { MxGeometry } from './MxGeometry.mjs';
import type { MxFile } from './MxFile.interface.mjs';
import type { c4 } from './c4/c4.interface.mjs';
import { System } from './c4/System.mjs';
import { SystemExt } from './c4/SystemExt.mjs';
import { SystemDb } from './c4/SystemDb.mjs';
import { SystemQueue } from './c4/SystemQueue.mjs';
import { Component } from './c4/Component.mjs';
import { ComponentExt } from './c4/ComponentExt.mjs';
import { ComponentDb } from './c4/ComponentDb.mjs';
import { ComponentQueue } from './c4/ComponentQueue.mjs';
import { Container } from './c4/Container.mjs';
import { ContainerExt } from './c4/ContainerExt.mjs';
import { ContainerDb } from './c4/ContainerDb.mjs';
import { ContainerQueue } from './c4/ContainerQueue.mjs';
import { Person } from './c4/Person.mjs';
import { PersonExt } from './c4/PersonExt.mjs';
import { Boundary } from './c4/Boundary.mjs';
import { EnterpriseBoundary } from './c4/EnterpriseBoundary.mjs';
import { boundaryLegend } from './c4/boundaryLegend.mjs';
import { SystemDbExt } from './c4/SystemDbExt.mjs';
import { ContainerDbExt } from './c4/ContainerDbExt.mjs';
import { ComponentDbExt } from './c4/ComponentDbExt.mjs';
import { SystemQueueExt } from './c4/SystemQueueExt.mjs';
import { ContainerQueueExt } from './c4/ContainerQueueExt.mjs';
import { ComponentQueueExt } from './c4/ComponentQueueExt.mjs';
import { DeploymentNode } from './c4/DeploymentNode.mjs';
import { Relastionship } from './c4/Relationship.mjs';
import { StyleParser } from '../puml/StyleParser.mjs';
import type { StyleOverride } from '../puml/StyleParser.mjs';
import { htmlBreaks, wrapEdgeLabelLines } from '../text/labelLines.mjs';
import { RELATIONSHIP_LABEL_PX, DIAGRAM_TITLE_PX } from './c4/theme.mjs';

/**
 * xml2js escapes `&`, `<`, `"` in attribute values but leaves `>` raw
 * (legal per the XML spec, but strict/non-conformant consumers — e.g.
 * rlespinasse/drawio-export's Rust parser — and the project's own
 * round-trip contract want it escaped). Pre-encoding `>` -> `&gt;` here
 * rides the existing double-encode/un-double pipeline in Mx.generate()
 * (`&` -> `&amp;` by xml2js, then `&amp;gt;` -> `&gt;`), yielding a final
 * `&gt;`. Applied to catalyst-authored c4* text attributes only.
 */
const escGt = (s: string): string => s.replace(/>/g, '&gt;')

/**
 * A literal `<` in user text (e.g. `Café <Backend>`, `K8s Secret
 * <workload>-tls`) is substituted by draw.io into the `html=1` label
 * `<div>`; the browser then parses `<Backend>` as an (unknown, empty)
 * HTML tag and DROPS it — silent content loss vs PlantUML, which shows
 * it verbatim (#23 `edge-unicode-specialchars`). Unlike `>` (harmless
 * as literal text), `<` must reach the browser as the entity `&lt;`.
 * Target final XML attribute: `&amp;lt;` → draw.io XML-unescapes to
 * `&lt;` → substituted into the div → browser renders a literal `<`.
 * To land `&amp;lt;` AFTER xml2js (`&`→`&amp;`) and the Mx.generate()
 * un-double pass (`&amp;(lt|gt|…);`→`&$1;`), the pre-xml2js token must
 * be `&amp;lt;` (xml2js → `&amp;amp;lt;`; un-double → `&amp;lt;`). This
 * is the `<` analogue of escGt's `>`→`&gt;`; the extra `amp;` is why
 * they differ (`>` may stay a literal char, `<` may not).
 */
const escLt = (s: string): string => s.replace(/</g, '&amp;lt;')

/**
 * Canonical encoder for every catalyst-authored c4* text attribute:
 * escape `>` (escGt) and `<` (escLt), THEN turn PlantUML `\n` breaks
 * into a pre-encoded `&lt;br/&gt;` (htmlBreaks). Order matters —
 * htmlBreaks must run LAST so its break token (which contains no raw
 * `<`/`>`) is not disturbed and the surrounding text's real `<`/`>`
 * are both encoded; escGt/escLt are order-independent w.r.t. each
 * other (`&gt;` has no `<`, `&amp;lt;` has no `>`).
 */
const c4Text = (s: string): string => htmlBreaks(escLt(escGt(s)))

class Mx {
    doc: MxFile

    private tags: Record<string, unknown>[] = [
        { MxGraphModel: 'mxGraphModel' },
        { MxCell: 'mxCell' },
        { MxGeometry: 'mxGeometry' },
        { MxFile: 'mxfile' },
    ]

    /** C4 `LAYOUT_AS_SKETCH`/`SET_SKETCH_STYLE` → `sketch=1` on every
     *  cell. Off by default ⇒ the static C4 corpus is byte-identical. */
    private readonly sketch: boolean;
    /** C4 `HIDE_STEREOTYPE` → drop the `«Type»` line from element
     *  labels (the `c4Type` structural attribute is KEPT, so
     *  golden/parity fingerprints are unchanged). */
    private readonly hideStereotype: boolean;

    constructor(height: number, width: number,
                opts?: { sketch?: boolean; hideStereotype?: boolean }) {
        this.sketch = opts?.sketch ?? false;
        this.hideStereotype = opts?.hideStereotype ?? false;
        const diagramHeight = Math.ceil(height);
        const diagramWidth = Math.ceil(width);

        this.doc = {
            MxFile: {
                $: {
                    version: '20.1.4',
                    type: 'atlas'
                },
                diagram: {
                    // Emit id + name so drawio-export / drawio-desktop headless
                    // tools accept the XML (they reject bare <diagram>).
                    $: {
                        id: 'catalyst-diagram',
                        name: 'Page-1'
                    },
                    MxGraphModel: {
                        $: {
                            pageHeight: diagramHeight,
                            pageWidth: diagramWidth
                        },
                        root: {
                            MxCell: [{ $: { id: "0" } }, { $: { id: "1", parent: "0" } }],
                            object: []
                        }
                    }
                }
            }
        }
    }

    private getRoot() {
        return this.doc.MxFile.diagram.MxGraphModel.root
    }

    async addMxC4(alias: string, geometry: MxGeometry, type: string, name: string, technology?: string, description?: string, parent?: string, styleOverride?: StyleOverride, link?: string, stereotypeTags: string[] = []): Promise<void> {

        let c4Type = type
        let label = ''
        let style = ''
        switch (type) {
            // --- Persons ---
            case 'Person':
                label = await Person.label()
                style = Person.style()
                break;
            case 'Person_Ext':
                label = await PersonExt.label()
                style = PersonExt.style()
                break;

            // --- Systems ---
            case 'System':
                label = await System.label()
                style = System.style()
                break;
            case 'SystemDb':
                label = await SystemDb.label()
                style = SystemDb.style()
                break;
            case 'SystemQueue':
                label = await SystemQueue.label()
                style = SystemQueue.style()
                break;
            case 'System_Ext':
                label = await SystemExt.label()
                style = SystemExt.style()
                break;
            case 'SystemDb_Ext':
                // C4-PlantUML keeps the DATABASE (cylinder) shape for the
                // external variant — only the colour goes grey. Was
                // flattened to the SystemExt rectangle (lost the cylinder).
                label = await SystemDbExt.label()
                style = SystemDbExt.style()
                break;
            case 'SystemQueue_Ext':
                label = await SystemQueueExt.label()
                style = SystemQueueExt.style()
                break;

            // --- Containers ---
            case 'Container':
                label = await Container.label()
                style = Container.style()
                break;
            case 'ContainerDb':
                label = await ContainerDb.label()
                style = ContainerDb.style()
                break;
            case 'ContainerQueue':
                label = await ContainerQueue.label()
                style = ContainerQueue.style()
                break;
            case 'Container_Ext':
                label = await ContainerExt.label()
                style = ContainerExt.style()
                break;
            case 'ContainerDb_Ext':
                label = await ContainerDbExt.label()
                style = ContainerDbExt.style()
                break;
            case 'ContainerQueue_Ext':
                label = await ContainerQueueExt.label()
                style = ContainerQueueExt.style()
                break;

            // --- Components ---
            case 'Component':
                label = await Component.label()
                style = Component.style()
                break;
            case 'ComponentDb':
                label = await ComponentDb.label()
                style = ComponentDb.style()
                break;
            case 'ComponentQueue':
                label = await ComponentQueue.label()
                style = ComponentQueue.style()
                break;
            case 'Component_Ext':
                label = await ComponentExt.label()
                style = ComponentExt.style()
                break;
            case 'ComponentDb_Ext':
                label = await ComponentDbExt.label()
                style = ComponentDbExt.style()
                break;
            case 'ComponentQueue_Ext':
                label = await ComponentQueueExt.label()
                style = ComponentQueueExt.style()
                break;

            // --- Deployment level ---
            case 'Node':
            case 'Node_L':
            case 'Node_R':
            case 'Deployment_Node':
            case 'Deployment_Node_L':
            case 'Deployment_Node_R':
                label = await DeploymentNode.label()
                style = DeploymentNode.style()
                break;

            // --- Boundaries ---
            case 'Enterprise_Boundary':
                label = await EnterpriseBoundary.label(boundaryLegend(type, technology))
                style = EnterpriseBoundary.style()
                break;
            case 'System_Boundary':
            case 'Container_Boundary':
            case 'Boundary':
                // `technology` carries a generic Boundary's explicit
                // $type (3rd positional arg); ignored for the named
                // macros, which map by name. See boundaryLegend().
                label = await Boundary.label(boundaryLegend(type, technology))
                style = Boundary.style()
                break;

            default:
                c4Type = ''
                break;
        }

        // Tag / UpdateElementStyle colour overrides push the shape toward what
        // PlantUML would render. Base style is untouched when no override.
        style = StyleParser.applyOverride(style, styleOverride)

        // P8: matched element-tag stereotypes render as extra `«tag»`
        // segments BEFORE the `«type»` line, exactly as C4-PlantUML shows
        // them (e.g. `$tags="critical"` + `AddElementTag("critical")` →
        // `«critical»«System»`). The element templates emit a literal
        // `«%c4Type%»`; splice a `%c4Stereotype%` placeholder in front so
        // one substituted value carries all matched tags. Done ONLY when
        // there are matched tags, and `c4Type` (the structural attribute
        // golden/parity fingerprint reads) is left untouched — so every
        // untagged element stays byte-for-byte identical.
        let c4Stereotype: string | undefined
        if (stereotypeTags.length > 0 && label.includes('«%c4Type%»')) {
            // `tag»«` per tag → `«%c4Stereotype%%c4Type%»` becomes
            // `«tag1»«tag2»«Type»`. Tag names are c4Text-escaped; the
            // `»«` separators are structural and intentionally literal.
            c4Stereotype = stereotypeTags.map((tg) => `${c4Text(tg)}»«`).join('')
            label = label.replace('«%c4Type%»', '«%c4Stereotype%%c4Type%»')
        }

        // HIDE_STEREOTYPE: drop the stereotype line from the rendered
        // label. The `*.label()` templates return html ALREADY
        // HTML-entity-ENCODED (`&lt;div style=&quot;…&quot;&gt;…`,
        // guillemets kept literal), so the match MUST be on the encoded
        // form — the only `font-style:italic` div the templates emit
        // (Name is `font-weight:bold`, Description is plain). `[^&]*`
        // is safe: neither the style string nor the `«…%c4Type%…»`
        // content contains `&`. The `c4Type` structural attribute above
        // is intentionally KEPT so golden/parity fingerprints stay
        // byte-identical; this removes only the VISUAL line. (v1: the
        // box keeps the reserved stereotype-line height — measureNode
        // is untouched, so the static-C4 layout path is provably
        // unchanged — leaving a small top gap. Honest documented
        // imperfection; zero corpus impact.)
        if (this.hideStereotype) {
            label = label.replace(
                /&lt;div style=&quot;[^&]*font-style:italic[^&]*&quot;&gt;«[^&]*»&lt;\/div&gt;/, '')
        }

        const t: c4 = {
            $: {
                placeholders: 1,
                c4Name: c4Text(name),
                c4Type,
                ...(c4Stereotype !== undefined ? { c4Stereotype } : {}),
                // Pre-bracket the VALUE (mirrors addMxC4Relationship) so the
                // element templates use a bare `%c4Technology%` — rendering
                // "[Tech]" when present and an empty <div> when absent,
                // never a "[]" tofu box. The C4-PlantUML element layout
                // shows technology on its OWN line, not fused into the
                // stereotype.
                c4Technology: technology ? c4Text(`[${technology}]`) : '',
                c4Description: c4Text(description || ''),
                label,
                id: alias,
                ...(link ? { link } : {})
            },
            MxCell: {
                $: {
                    style,
                    parent: parent || "1",
                    vertex: 1
                },
                MxGeometry: geometry
            }
        }

        const object = this.getRoot().object ?? []
        object.push(t);
    }

    async addMxC4Relationship(geometry: MxGeometry, source: string, target: string, type: string, name: string, technology?: string, description?: string, bidirectional: boolean = false, styleOverride?: StyleOverride, maxLabelWidthPx: number = Infinity, back: boolean = false, attach?: { exit: { x: number; y: number }; entry: { x: number; y: number } }): Promise<void> {

        // Arrowhead placement mirrors C4-PlantUML v2.13.0 C4.puml exactly:
        //   Rel       → "-->>"   arrowhead at $to     (the base style:
        //                        endArrow=blockThin, endFill=1)
        //   BiRel     → "<<-->>" arrowheads at BOTH ends
        //   Rel_Back  → "<<--"   arrowhead at $from ONLY (NOT a swap of
        //                        source/target — only the arrowhead end moves)
        // The base Relastionship.style() emits the Rel case; we layer the
        // BiRel / Rel_Back override here so the base class stays focused on
        // the common case. mxGraph style strings take the LAST value for a
        // duplicated key, so appending `endArrow=none` cleanly overrides the
        // base `endArrow=blockThin` for the back case. The two flags are
        // mutually exclusive (BiRel has no _Back variant — RelParser).
        let style = Relastionship.style()
        if (bidirectional) {
            style = style + ';startArrow=blockThin;startFill=1'
        } else if (back) {
            style = style + ';startArrow=blockThin;startFill=1;endArrow=none'
        }
        // P10: per-lane box-border attach points for laned (parallel /
        // antiparallel) edges. Without these draw.io attaches every
        // same-pair edge at the box CENTRE, so two one-way edges
        // visually collapse into one (looking bidirectional + arrowless
        // — the reported defect). exitX/exitY pin the SOURCE border
        // point, entryX/entryY the TARGET; both are the lane's
        // geometry-derived fractions. `exitDx/Dy=0;` keeps draw.io from
        // adding its perpendicular fixed offset on top of the fraction.
        if (attach) {
            style = style +
                `;exitX=${attach.exit.x};exitY=${attach.exit.y};exitDx=0;exitDy=0` +
                `;entryX=${attach.entry.x};entryY=${attach.entry.y};entryDx=0;entryDy=0`
        }
        // AddRelTag / UpdateRelStyle colour + dashed overrides.
        style = StyleParser.applyOverride(style, styleOverride)

        const t: c4 = {
            $: {
                placeholders: 1,
                // Word-wrap the verb to the edge-label width cap and join
                // with the `\n` marker (c4Text → htmlBreaks turns it into
                // `&lt;br/&gt;`) so drawio renders the SAME bounded
                // multi-line block measureEdgeLabel reserved in ELK — a
                // long verb no longer overruns onto the endpoint nodes.
                c4Name: c4Text(wrapEdgeLabelLines(name, RELATIONSHIP_LABEL_PX, true, maxLabelWidthPx).join('\n')),
                c4Type: type,
                // Pre-bracket the technology in the VALUE so the label template
                // (which is just `%c4Technology%`, no literal brackets) renders
                // "[HTTPS]" when present and an empty <div> when absent — never
                // a bare "[]" tofu box. Wrapped the same way as the verb (same
                // mxGraph default font size + endpoint-derived width cap).
                c4Technology: technology
                    ? c4Text(wrapEdgeLabelLines(`[${technology}]`, RELATIONSHIP_LABEL_PX, false, maxLabelWidthPx).join('\n'))
                    : '',
                c4Description: c4Text(description || ''),
                label: await Relastionship.label()
            },
            MxCell: {
                $: {
                    style,
                    parent: "1",
                    edge: 1,
                    source,
                    target
                },
                MxGeometry: geometry
            }
        }

        const object = this.getRoot().object ?? []
        object.push(t);
    }

    /**
     * Emit the PlantUML `title` directive as a drawio text cell.
     *
     * Completeness invariant (MDE model-transformation principle): every
     * source construct must trace to ≥1 target element — a `title` in
     * the .puml MUST produce an element in the .drawio. catalyst
     * previously skip-listed `title` in EntityParser, dropping it on
     * 100% of diagrams (a silent-drop the entity/rel-only oracle never
     * caught). PlantUML renders it bold-black `font-size:14` at the top
     * of the canvas (`DIAGRAM_TITLE_PX`, cited from `-tsvg`).
     *
     * Fixed id `__title` + `c4Type="Title"` so the factcheck oracle
     * counts it as the title-trace element while EXCLUDING it from the
     * node-extent / overlap geometry metrics (it is chrome, like
     * PlantUML's own title which the SVG node-extent regex also
     * excludes — keeps wRatio/ratchet like-for-like and byte-stable).
     * Not a placeholder template: the value is the literal title text.
     */
    addTitle(text: string, geometry: MxGeometry): void {
        const t: c4 = {
            $: {
                c4Name: c4Text(text),
                c4Type: 'Title',
                label: c4Text(text),
                id: '__title',
            },
            MxCell: {
                $: {
                    style:
                        `text;html=1;align=left;verticalAlign=middle;` +
                        `whiteSpace=nowrap;fontSize=${DIAGRAM_TITLE_PX};` +
                        `fontStyle=1;fontColor=#000000;`,
                    parent: '1',
                    vertex: 1,
                },
                MxGeometry: geometry,
            },
        }
        const object = this.getRoot().object ?? []
        object.push(t);
    }

    replaceKeysWithValue(records: Record<string, unknown>[], inputString: string): string {
        let outputString = inputString;

        for (const record of records) {
            Object.keys(record).forEach((key: string) => {
                const regex = new RegExp(`\\b${key}\\b`, 'g');
                outputString = outputString.replace(regex, record[key] as string);
            });
        }
        return outputString;
    }

    async generate(): Promise<string> {
        // The c4 label templates are PRE-encoded to HTML entities
        // (encodeHtmlEntities: < -> &lt;, & -> &amp;, ...) so draw.io renders
        // them as HTML. xml2js then encodes the leading `&` of each entity ref
        // again, double-encoding `&lt;` -> `&amp;lt;` etc. The old code undid
        // this with a blanket `.replaceAll('&amp;','&')` — which ALSO turned a
        // genuine `&` in a label/description (xml2js: `&` -> `&amp;`) back into
        // a raw `&`, emitting INVALID XML (draw.io's strict loader rejects a
        // bare `&` in an attribute). Reverse ONLY the double-encoded entity
        // refs the pre-encoder produced; leave a real `&amp;` intact.
        const xml = new xml2js.Builder({ headless: true }).buildObject(this.doc)
            .replace(/&amp;(lt|gt|quot|amp|#39);/g, '&$1;')
        const renamed = this.replaceKeysWithValue(this.tags, xml)
        // LAYOUT_AS_SKETCH / SET_SKETCH_STYLE → draw.io hand-drawn
        // render: append `;sketch=1` to every cell style (only mxCell
        // carries a `style=` attribute in drawio XML). Off by default
        // ⇒ the static C4 corpus is byte-identical (no fixture sets it).
        return this.sketch
            ? renamed.replace(/(<mxCell\b[^>]*\sstyle=")([^"]*)"/g, '$1$2;sketch=1"')
            : renamed
    }
}

export {
    Mx,
    MxGeometry,
    Relastionship,
    System, SystemExt, SystemDb, SystemQueue,
    Component, ComponentExt, ComponentDb, ComponentQueue,
    Container, ContainerExt, ContainerDb, ContainerQueue,
    Person, PersonExt,
    Boundary, EnterpriseBoundary,
    DeploymentNode,
}
