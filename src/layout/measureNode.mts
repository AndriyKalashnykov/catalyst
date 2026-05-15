import { EntityDescriptor } from '../puml/EntityDescriptor.interface.mjs'
import { textWidth, lineHeight, spaceAdvance, wrap } from '../text/TextMetrics.mjs'

/**
 * Text-measured leaf-node size (L3). Sizes a shape to its rendered label
 * using REAL font metrics (fontkit + bundled Liberation Sans, via
 * TextMetrics) — no estimated ratios. Models the exact label HTML the c4
 * shape classes emit:
 *   title  — c4Name, 16px bold     (`font-size:16px;font-weight:bold`)
 *   meta   — `[Type: Tech]`, 11px  (no font-size set → mxGraph default 11)
 *   descr  — c4Description, 11px    (`font-size:11px`), word-wrapped
 * Padding is the font's own space advance (a real metric, not an invented
 * constant); height is the sum of real per-line heights.
 */
export function measureNode(entity: EntityDescriptor): { width: number; height: number } {
  const TITLE_PX = 16, BODY_PX = 11
  const pad = spaceAdvance(TITLE_PX, true)            // font-derived padding unit

  const titleW = textWidth(entity.label ?? entity.alias, TITLE_PX, true)
  const meta = entity.technology
    ? `[${entity.type}: ${entity.technology}]`
    : `[${entity.type}]`
  const metaW = textWidth(meta, BODY_PX, false)

  const contentW = Math.max(titleW, metaW)
  const descLines = entity.description
    ? wrap(entity.description, Math.max(contentW, 1), BODY_PX, false)
    : []
  const longestDescW = descLines.reduce(
    (m, l) => Math.max(m, textWidth(l, BODY_PX, false)), 0)

  const width = Math.ceil(Math.max(titleW, metaW, longestDescW) + 2 * pad)
  const height = Math.ceil(
    lineHeight(TITLE_PX, true) +                       // title
    lineHeight(BODY_PX, false) +                       // meta
    descLines.length * lineHeight(BODY_PX, false) +    // wrapped description
    2 * pad)                                           // top/bottom breathing
  return { width, height }
}
