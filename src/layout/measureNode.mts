import { EntityDescriptor } from '../puml/EntityDescriptor.interface.mjs'
import { textWidth, renderedLineHeight, spaceAdvance, wrap } from '../text/TextMetrics.mjs'
import { splitLabelLines, wrapEdgeLabelLines } from '../text/labelLines.mjs'
import { ELEMENT_TITLE_PX, ELEMENT_BODY_PX, RELATIONSHIP_LABEL_PX, CYLINDER3_CAP_PX, PUML_LEAF_BOX } from '../mx/c4/theme.mjs'

/**
 * The `*Db` C4 types whose template emits drawio `shape=cylinder3`
 * (see `src/mx/Mx.mts` dispatch + `src/mx/c4/{Container,System,Component}Db.mts`).
 * The `_Ext` DB variants now ALSO render as a cylinder (grey-coloured —
 * C4-PlantUML keeps the database shape for external DBs; see
 * `src/mx/c4/{Container,System,Component}DbExt.mts`), so they need the
 * SAME cap reservation or long content clips at the bottom ellipse —
 * the exact bug fixed for the non-`_Ext` DBs. The cylinder draws an
 * elliptical cap at top AND bottom that text must not occupy.
 */
const CYLINDER3_TYPES = new Set([
  'SystemDb', 'ContainerDb', 'ComponentDb',
  'SystemDb_Ext', 'ContainerDb_Ext', 'ComponentDb_Ext',
])

/**
 * PlantUML's measured inter-baseline pitch for a font-size transition
 * (ADR 0010 / `PUML_LEAF_BOX.PITCH`, the category-1 measured metric).
 * A C4 element's emitted line stack only ever uses the three measured
 * transitions. A same-font line break the 26-fixture gate never
 * exercises (an explicit-`\n` multi-line Name → 16→16) has no PlantUML
 * ground truth in the corpus; fall back to the value draw.io ACTUALLY
 * applies for it — mxGraph `renderedLineHeight` of the larger font,
 * per the renderer-style cascade. A renderer-true value, NOT a guessed
 * constant; never reached by the gate corpus.
 */
function leafPitch(fromPx: number, toPx: number): number {
  return PUML_LEAF_BOX.PITCH[`${fromPx}>${toPx}`]
    ?? renderedLineHeight(Math.max(fromPx, toPx))
}

/**
 * Content-fit leaf-node size (L3, ADR 0010 / backlog P4b). Sizes a
 * shape to its rendered label using REAL font metrics (fontkit +
 * bundled Liberation Sans, via TextMetrics) for width, and PlantUML's
 * MEASURED box geometry (`PUML_LEAF_BOX`) for height — no fixed
 * per-type floor, no estimated ratios. Models the exact label HTML the
 * c4 shape classes emit, in C4-PlantUML canonical order (stereotype on
 * top):
 *   stereo — `«Type»`, 11px italic   (the stereotype line, always present)
 *   title  — c4Name, 16px bold       (`font-size:16px;font-weight:bold`)
 *   tech   — `[Technology]`, 11px     (ONLY when the entity has technology)
 *   descr  — c4Description, 11px      (`font-size:11px`), word-wrapped
 *
 * Width  = ceil( widest rendered line + 2×INSET ).
 * Height = TOP_GAP + Σ(measured pitch over the emitted line stack) +
 *          BOT_GAP + cylinder3 cap reserve.
 * The height pitches are keyed by PlantUML's RENDERED font sizes
 * (stereotype 12 / Name 16 / tech & description 12) — the box matches
 * PlantUML's box for the line set, which is consistently roomier than
 * catalyst's own mxGraph-rendered text block for these sizes, so the
 * label cannot overflow (verified by the BLOCKING factcheck +
 * render-compare gate, ADR 0010).
 */
export function measureNode(entity: EntityDescriptor): { width: number; height: number } {
  const TITLE_PX = ELEMENT_TITLE_PX, BODY_PX = ELEMENT_BODY_PX
  const { INSET, TOP_GAP, BOT_GAP } = PUML_LEAF_BOX
  // PlantUML's rendered font sizes for the pitch lookup (NOT catalyst's
  // div-CSS sizes): stereotype/tech/description render at 12, the bold
  // Name at 16 in PlantUML's `-tsvg` — the geometry the box mirrors.
  const PUML_STEREO_PX = 12, PUML_TITLE_PX = 16, PUML_BODY_PX = 12

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

  // Content-fit width: widest rendered line + the MEASURED 10px PlantUML
  // text-inset each side (ADR 0010). fontkit `textWidth` is catalyst's
  // own rendered glyph width, so the emitted label fits by construction.
  const textW = Math.ceil(
    Math.max(titleW, stereoW, techW, longestDescW) + 2 * INSET)

  // The emitted line stack, in PlantUML font-size terms, for the
  // pitch-summed height (ADR 0010 fact 2 closed form):
  //   [stereo 12] [Name 16 × titleLines] [tech 12?] [desc 12 × descLines]
  const stack: number[] = [
    PUML_STEREO_PX,
    ...titleLines.map(() => PUML_TITLE_PX),
    ...(hasTech ? [PUML_BODY_PX] : []),
    ...descLines.map(() => PUML_BODY_PX),
  ]
  let pitchSum = 0
  for (let i = 1; i < stack.length; i++) pitchSum += leafPitch(stack[i - 1], stack[i])

  // `cylinder3` (the `*Db` types) draws an elliptical cap of
  // CYLINDER3_CAP_PX at BOTH ends; that band is text-unsafe (top cap
  // crowds the stereotype line, bottom cap clips the last description
  // line — the #23 `edge-multiline-labels` K8s-Secret defect). The
  // rectangular text model is correct for the BODY; reserve the two
  // caps on top so the body alone holds the text. Cited renderer-shape
  // metric (theme.mjs), proven by render-compare — not a guess.
  const capReserve =
    CYLINDER3_TYPES.has(entity.type) ? 2 * CYLINDER3_CAP_PX : 0

  // Content-fit height: PlantUML's measured box geometry for this line
  // set (ADR 0010 fact 2: TOP_GAP + Σ pitch + BOT_GAP), plus the
  // cylinder caps. No fixed per-type floor — the box IS its content.
  const textH = Math.ceil(TOP_GAP + pitchSum + BOT_GAP + capReserve)

  return { width: textW, height: textH }
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
