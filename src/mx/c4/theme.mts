/**
 * Single source of truth for catalyst's C4 shape **typography** and the
 * mxGraph **style-flag enums** the shape classes use.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * These values were previously bare literals duplicated across ~17
 * `src/mx/c4/*.mts` templates AND the measurement code (`measureNode`,
 * `measureEdgeLabel`, `LayoutEngine.titlePadding`). Duplicated literals
 * silently drift: e.g. the edge-label font was *measured* at 11px while
 * `Relationship.style()` actually renders it at the cell's `fontSize:10`
 * — a real ~10 % over-measurement that this consolidation fixes. The
 * measurement MUST use the exact size the renderer uses, so both sides
 * now import these.
 *
 * Each font size is annotated with (a) the value and (b) WHERE the
 * renderer gets it — an explicit `font-size:` in the label `<div>` CSS,
 * or the mxGraph cell-level `fontSize` style (which applies only when no
 * inline div font-size is set). They are deliberate C4 typographic
 * choices (an element title is larger than its body; a boundary title
 * is smaller than an element title; a relationship label is the
 * smallest) — justifiable design constants, now stated once.
 */

/** Element (System/Person/Container/Component+variants) bold Name line.
 *  Source: `font-size:16px` in the element label `<div>` CSS. */
export const ELEMENT_TITLE_PX = 16

/** Element body lines — `«stereotype»`, `[Technology]`, description.
 *  Source: `font-size:11px` in the element label `<div>` CSS. Equal to
 *  mxGraph's DEFAULT_FONTSIZE (see TextMetrics.MX_DEFAULT_FONTSIZE) but
 *  set explicitly by the templates, so it is its own named constant. */
export const ELEMENT_BODY_PX = 11

/** Deployment_Node Name line. Source: `font-size:14px` in the
 *  DeploymentNode label `<div>` CSS (infra container — a step down
 *  from an element title). */
export const DEPLOYMENT_TITLE_PX = 14

/** Enterprise_Boundary Name line. Source: `font-size:13px` in the
 *  EnterpriseBoundary label `<div>` CSS. */
export const ENTERPRISE_BOUNDARY_TITLE_PX = 13

/** Generic Boundary (System_/Container_/Boundary) Name line. Source:
 *  the boundary `<div>` is bold with NO inline font-size, so it renders
 *  at the cell-level `fontSize` — `Boundary.style()` sets that to 12. */
export const BOUNDARY_TITLE_PX = 12

/** The `[Type]` second line of a boundary label. Source: explicit
 *  `font-size:11px` in the boundary label `<div>` CSS. */
export const BOUNDARY_BODY_PX = 11

/** Relationship label (verb + `[technology]`). Source: the Relationship
 *  `<div>`s set NO inline font-size, so the label renders at the
 *  cell-level `fontSize` — `Relationship.style()` sets that to **10**.
 *  measureEdgeLabel MUST measure at 10, not the mxGraph default 11. */
export const RELATIONSHIP_LABEL_PX = 10

/**
 * drawio `cylinder3` elliptical-cap vertical extent, in cell units.
 * The `*Db` templates (`ContainerDb`/`SystemDb`/`ComponentDb`) emit
 * `shape=cylinder3` and set NO `size=` style, so drawio applies its
 * default. Source: drawio `CylinderShape3.prototype.size = 15` in
 * jgraph/drawio `src/main/webapp/js/grapheditor/Shapes.js`; the drawn
 * cap height is `Math.max(0, Math.min(h*0.5, size))` → exactly **15**
 * for any cell taller than 30 (catalyst's cylinder floor is ≥ 90).
 * A cited renderer-shape constant — like {@link MX} / the type scale,
 * not an invented number; the value is empirically re-proven by the
 * BLOCKING `make render-compare` gate, not by tests alone. The shape
 * draws an ellipse cap at BOTH ends, so `measureNode` must reserve
 * `2 × CYLINDER3_CAP_PX` of text-unsafe height for these types
 * (top cap crowds the first line, bottom cap clips the last). */
export const CYLINDER3_CAP_PX = 15

/**
 * mxGraph style enums/flags used by the shape `style()` objects. These
 * are NOT measurements — they are fixed mxGraph API values. Naming them
 * documents intent at the call site (vs. a bare `0`/`1`).
 *
 *  - `fontStyle` is a bitmask: 0 normal, 1 bold, 2 italic, 4 underline.
 *    Boundary cells use NORMAL because the label `<div>` already applies
 *    bold via `font-weight:bold` (cell-level bold would double-apply).
 *  - `metaEdit`/`resizable`/`container`/`collapsible`/`html`/`dashed`
 *    are boolean style flags; mxGraph spells them `1`/`0`.
 */
export const MX = {
  FONT_NORMAL: 0,
  FONT_BOLD: 1,
  ON: 1,
  OFF: 0,
} as const

/**
 * The catalyst C4 element palette — single source for every
 * `fillColor`/`strokeColor`/`fontColor` the 17 shape templates emit
 * (previously duplicated as scattered hex literals; the same
 * cross-template value-drift class as the 10px edge-label bug —
 * cf. memory `renderer-style-cascade`).
 *
 * PROVENANCE (fact-checked 2026-05-16, NOT guessed): these are
 * catalyst's OWN established palette, present since the project's
 * first functional commit (`c615e0d`). They are C4-MODEL-aligned —
 * a darkening-then-lightening blue ramp Person→System→Container→
 * Component, greys for `_Ext`, dark grey for boundaries, matching
 * the C4 visual convention — but they are **NOT byte-identical to
 * C4-PlantUML v2.13.0's `$*_BG/BORDER_COLOR`** (verified against
 * `C4.puml`/`C4_Context.puml@v2.13.0`): e.g. catalyst System
 * `#1061B0`/`#0D5091` vs C4-PlantUML `#1168BD`/`#3C7FC0`; catalyst
 * `System_Ext` `#8C8496` vs C4 `#999999`. SOME do coincide (Person
 * `#08427B`/`#073B6F` == C4 `PERSON_*`; `Person_Ext` fill `#686868`
 * == C4 `EXTERNAL_PERSON_BG_COLOR`; the white element font
 * `#ffffff` == C4 `ELEMENT_FONT_COLOR`; boundary stroke `#666666`/
 * `#444444` == C4 `ARROW_COLOR`/`BOUNDARY_COLOR`). Re-paletting to
 * exactly match C4-PlantUML is a deliberate VISUAL change and is
 * explicitly OUT OF SCOPE here — this is a byte-identical
 * single-sourcing refactor only.
 *
 * Case is significant and preserved verbatim: the element font is
 * lowercase `#ffffff` (14 templates) while the Deployment_Node FILL
 * is uppercase `#FFFFFF` — distinct roles, distinct constants, so
 * the emitted style string stays byte-for-byte unchanged.
 */
export const PALETTE = {
  // Filled element fonts (white on the coloured shapes).
  ELEMENT_FONT: '#ffffff',          // == C4-PlantUML ELEMENT_FONT_COLOR
  // Person (C4-PlantUML PERSON_* — coincides).
  PERSON_FILL: '#08427B',
  PERSON_STROKE: '#073B6F',
  // External Person (fill == C4 EXTERNAL_PERSON_BG; stroke is catalyst's).
  PERSON_EXT_FILL: '#686868',
  PERSON_EXT_STROKE: '#4D4D4D',
  // System / SystemDb / SystemQueue (catalyst-specific blue).
  SYSTEM_FILL: '#1061B0',
  SYSTEM_STROKE: '#0D5091',
  // External System (catalyst-specific muted purple-grey).
  SYSTEM_EXT_FILL: '#8C8496',
  SYSTEM_EXT_STROKE: '#736782',
  // Container / ContainerDb / ContainerQueue.
  CONTAINER_FILL: '#23A2D9',
  CONTAINER_STROKE: '#0E7DAD',
  // External Container.
  CONTAINER_EXT_FILL: '#9B9B9B',
  CONTAINER_EXT_STROKE: '#7F7F7F',
  // Component / ComponentDb / ComponentQueue.
  COMPONENT_FILL: '#63BEF2',
  COMPONENT_STROKE: '#2086C9',
  // External Component.
  COMPONENT_EXT_FILL: '#B3B3B3',
  COMPONENT_EXT_STROKE: '#8A8A8A',
  // Deployment_Node — white fill (UPPERCASE, distinct from ELEMENT_FONT).
  DEPLOYMENT_NODE_FILL: '#FFFFFF',
  DEPLOYMENT_NODE_STROKE: '#444444',
  DEPLOYMENT_NODE_FONT: '#444444',
  // Generic Boundary (stroke == C4 ARROW_COLOR).
  BOUNDARY_STROKE: '#666666',
  BOUNDARY_FONT: '#333333',
  // Enterprise_Boundary (stroke == C4 BOUNDARY_COLOR).
  ENTERPRISE_BOUNDARY_STROKE: '#444444',
  ENTERPRISE_BOUNDARY_FONT: '#222222',
  // Relationship edge.
  REL_FONT: '#404040',
  REL_STROKE: '#828282',
} as const

/**
 * mxGraph shape/edge geometry numerics the templates set verbatim
 * (rounded-rect corner radius, stroke widths, edge arrow/jump
 * decorator sizes). NOT measurements — fixed mxGraph style values,
 * named so the bare literal does not recur unexplained at call sites
 * (same rationale as {@link MX}). Values are the existing literals
 * verbatim — byte-identical.
 *  - `ARC_SIZE` 10: element rounded-rect corner; `ARC_SIZE_COMPONENT`
 *    6: Component's tighter corner (a deliberate C4 visual cue).
 *  - `STROKE_WIDTH_REL` 1: relationship edge; `STROKE_WIDTH_EMPHASIS`
 *    2: Enterprise_Boundary's heavier frame.
 *  - `REL_ARROW_SIZE` 14: edge end/startArrow size; `REL_JUMP_SIZE`
 *    16: line-jump arc size.
 */
export const SHAPE = {
  ARC_SIZE: 10,
  ARC_SIZE_COMPONENT: 6,
  STROKE_WIDTH_REL: 1,
  STROKE_WIDTH_EMPHASIS: 2,
  REL_ARROW_SIZE: 14,
  REL_JUMP_SIZE: 16,
} as const

/**
 * Per-C4-type minimum leaf box `[width, height]` — the conventional
 * C4-PlantUML / Structurizr element dimensions `measureNode` floors
 * at so a short-label shape does not render cramped; it grows past
 * these when the measured text is larger (see `measureNode` for the
 * floor-vs-measure contract). Documented domain constants; values
 * verbatim from the prior inline literals — byte-identical.
 */
export const C4_MIN = {
  SYSTEM: [220, 140],
  CONTAINER: [200, 120],
  COMPONENT: [180, 100],
  NODE: [160, 90],
} as const
