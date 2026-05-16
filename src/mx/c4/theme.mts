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
