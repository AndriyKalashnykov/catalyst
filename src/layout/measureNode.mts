import { EntityDescriptor } from '../puml/EntityDescriptor.interface.mjs'
import { textWidth, renderedLineHeight, spaceAdvance, wrap } from '../text/TextMetrics.mjs'
import { splitLabelLines, wrapEdgeLabelLines } from '../text/labelLines.mjs'
import { ELEMENT_TITLE_PX, ELEMENT_BODY_PX, RELATIONSHIP_LABEL_PX, CYLINDER3_CAP_PX, C4_MIN } from '../mx/c4/theme.mjs'

/**
 * The `*Db` C4 types whose template emits drawio `shape=cylinder3`
 * (see `src/mx/Mx.mts` dispatch + `src/mx/c4/{Container,System,Component}Db.mts`).
 * `_Ext` DB variants render as the grey rectangle (`*Ext` templates),
 * NOT a cylinder, so they are deliberately excluded. The cylinder
 * draws an elliptical cap at top AND bottom that text must not occupy.
 */
const CYLINDER3_TYPES = new Set(['SystemDb', 'ContainerDb', 'ComponentDb'])

/**
 * Text-measured leaf-node size (L3). Sizes a shape to its rendered label
 * using REAL font metrics (fontkit + bundled Liberation Sans, via
 * TextMetrics) — no estimated ratios. Models the exact label HTML the c4
 * shape classes emit, in C4-PlantUML canonical order (stereotype on top):
 *   stereo — `«Type»`, 11px italic   (the stereotype line, always present)
 *   title  — c4Name, 16px bold       (`font-size:16px;font-weight:bold`)
 *   tech   — `[Technology]`, 11px     (ONLY when the entity has technology)
 *   descr  — c4Description, 11px      (`font-size:11px`), word-wrapped
 * Padding is the font's own space advance (a real metric, not an invented
 * constant); height is the sum of real per-line heights at the renderer's
 * line box (TextMetrics.renderedLineHeight = mxGraph 1.2).
 */
export function measureNode(entity: EntityDescriptor): { width: number; height: number } {
  const TITLE_PX = ELEMENT_TITLE_PX, BODY_PX = ELEMENT_BODY_PX
  const pad = spaceAdvance(TITLE_PX, true)            // font-derived padding unit

  // Title may carry explicit PlantUML `\n` breaks — measure each rendered
  // line, the box must fit the WIDEST and stack ALL of them vertically.
  const titleLines = splitLabelLines(entity.label ?? entity.alias)
  const titleW = titleLines.reduce(
    (m, l) => Math.max(m, textWidth(l, TITLE_PX, true)), 0)
  // Stereotype line «Type» (always emitted, 11px). Technology, when present,
  // is its OWN bracketed line (11px) — matches the restructured templates.
  const stereoW = textWidth(`«${entity.type}»`, BODY_PX, false)
  const hasTech = !!entity.technology
  const techW = hasTech ? textWidth(`[${entity.technology}]`, BODY_PX, false) : 0

  const contentW = Math.max(titleW, stereoW, techW)
  // Honour explicit breaks first, then word-wrap each segment to the box
  // width. An intentionally-blank segment (`a\n\nb`) keeps a real empty
  // line so its vertical space is reserved.
  const descLines = splitLabelLines(entity.description).flatMap((seg) =>
    seg.trim() === '' ? [''] : wrap(seg, Math.max(contentW, 1), BODY_PX, false))
  const longestDescW = descLines.reduce(
    (m, l) => Math.max(m, textWidth(l, BODY_PX, false)), 0)

  const textW = Math.ceil(Math.max(titleW, stereoW, techW, longestDescW) + 2 * pad)
  // `cylinder3` (the `*Db` types) draws an elliptical cap of
  // CYLINDER3_CAP_PX at BOTH ends; that band is text-unsafe (top cap
  // crowds the stereotype line, bottom cap clips the last description
  // line — the #23 `edge-multiline-labels` K8s-Secret defect). The
  // rectangular text model is correct for the BODY; reserve the two
  // caps on top so the body alone holds the text. Cited renderer-shape
  // metric (theme.mjs), proven by render-compare — not a guess.
  const capReserve =
    CYLINDER3_TYPES.has(entity.type) ? 2 * CYLINDER3_CAP_PX : 0
  const textH = Math.ceil(
    renderedLineHeight(BODY_PX) +                      // «Type» stereotype
    titleLines.length * renderedLineHeight(TITLE_PX) + // title (1+ lines)
    (hasTech ? renderedLineHeight(BODY_PX) : 0) +      // [Technology] (if any)
    descLines.length * renderedLineHeight(BODY_PX) +   // wrapped description
    2 * pad +                                          // top/bottom breathing
    capReserve)                                        // cylinder3 caps (0 for non-Db)

  // Floor at the established C4 element box convention. fontkit measures the
  // raw glyph box, but the drawio C4 shape RENDERS larger (CSS line-height,
  // the rounded-rect chrome, the always-present `[Type]` stereotype line) —
  // unmeasurable without a renderer. These per-type minimums are the
  // conventional C4 element dimensions used by C4-PlantUML / Structurizr
  // (and the project's own pre-existing sizes that rendered without
  // cramming); they are a documented floor, NOT the sole metric — long
  // labels still grow the box past them via the measured values above.
  const t = entity.type
  const [minW, minH] =
    t.startsWith('System') || t.startsWith('Person') ? C4_MIN.SYSTEM
    : t.startsWith('Container') ? C4_MIN.CONTAINER
    : t.startsWith('Component') ? C4_MIN.COMPONENT
    : C4_MIN.NODE                                      // Node / other leaves

  return { width: Math.max(textW, minW), height: Math.max(textH, minH) }
}

/**
 * Text-measured edge-label size (Phase 2). Models the exact label HTML
 * `Relastionship.label()` emits:
 *   verb  — c4Name, 11px bold        (`text-align:center;font-weight:bold`)
 *   tech  — c4Technology, 11px       (`[Tech]`, only when present)
 * Both honour explicit PlantUML `\n` breaks (Phase 1) AND word-wrap to
 * `maxWidthPx` — the caller passes the narrower endpoint node's MEASURED
 * width (pure geometry, not a constant; `Infinity` = don't wrap). The
 * returned dimensions are attached to the ELK edge so the layout
 * reserves the exact wrapped block that Mx emits, instead of letting an
 * over-long single line collide with a node. Padding is the font's own
 * space advance.
 */
export function measureEdgeLabel(
  verb: string,
  technology?: string,
  maxWidthPx: number = Infinity,
): { width: number; height: number } {
  // The Relationship label `<div>`s set NO inline font-size, so the
  // verb/technology renders at the Relationship CELL `fontSize` —
  // Relationship.style() sets that to 10 (NOT mxGraph's default 11).
  // Measuring at the true rendered size; single-sourced in c4/theme.
  const PX = RELATIONSHIP_LABEL_PX
  const pad = spaceAdvance(PX, false)
  // Wrap to the caller-supplied endpoint-derived cap so a long
  // verb/technology becomes a bounded multi-line block instead of one
  // over-long line that overlaps the endpoint nodes (rel-long-labels
  // gallery defect). Shared with the Mx emit via labelLines so ELK
  // reserves exactly the block that renders.
  const verbLines = wrapEdgeLabelLines(verb, PX, true, maxWidthPx)
  const techLines = technology ? wrapEdgeLabelLines(`[${technology}]`, PX, false, maxWidthPx) : []
  const widthOf = (lines: string[], bold: boolean) =>
    lines.reduce((m, l) => Math.max(m, textWidth(l, PX, bold)), 0)

  const width = Math.ceil(
    Math.max(widthOf(verbLines, true), widthOf(techLines, false)) + 2 * pad)
  const height = Math.ceil(
    verbLines.length * renderedLineHeight(PX) +
    techLines.length * renderedLineHeight(PX) +
    2 * pad)
  return { width, height }
}
