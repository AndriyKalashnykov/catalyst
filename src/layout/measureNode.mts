import { EntityDescriptor } from '../puml/EntityDescriptor.interface.mjs'
import { textWidth, renderedLineHeight, spaceAdvance, wrap, MX_DEFAULT_FONTSIZE } from '../text/TextMetrics.mjs'
import { splitLabelLines, wrapEdgeLabelLines } from '../text/labelLines.mjs'

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
  const TITLE_PX = 16, BODY_PX = 11
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
  const textH = Math.ceil(
    renderedLineHeight(BODY_PX) +                      // «Type» stereotype
    titleLines.length * renderedLineHeight(TITLE_PX) + // title (1+ lines)
    (hasTech ? renderedLineHeight(BODY_PX) : 0) +      // [Technology] (if any)
    descLines.length * renderedLineHeight(BODY_PX) +   // wrapped description
    2 * pad)                                           // top/bottom breathing

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
    t.startsWith('System') || t.startsWith('Person') ? [220, 140]
    : t.startsWith('Container') ? [200, 120]
    : t.startsWith('Component') ? [180, 100]
    : [160, 90]                                        // Node / other leaves

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
  // The Relationship template sets NO font-size → mxGraph renders the
  // verb/technology at its DEFAULT_FONTSIZE. Cited renderer constant,
  // not a literal (see TextMetrics.MX_DEFAULT_FONTSIZE).
  const PX = MX_DEFAULT_FONTSIZE
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
