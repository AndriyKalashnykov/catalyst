import { wrap } from './TextMetrics.mjs'

/**
 * C4-PlantUML uses `\n` inside quoted label / description / relationship
 * strings as an explicit line break (the escaped `\\n` form also occurs in
 * the wild, e.g. macro-generated diagrams). catalyst's parser captures the
 * quoted body verbatim, so the two literal characters backslash + 'n' (or
 * the double-escaped variant) survive into EntityDescriptor / relation text.
 *
 * Left untranslated they cause TWO defects:
 *   1. draw.io renders a literal "\n" in the label.
 *   2. measureNode() sizes the box to one giant single line, so the text
 *      overflows the node and collides with its neighbours (the root cause
 *      of the "super crammed" c4-admin-sidecar render).
 *
 * This module is the single source of truth for "where are the breaks":
 * measureNode sizes from {@link splitLabelLines}; the Mx emit path turns
 * each break into a `<br/>` via {@link htmlBreaks}. One regex, used by
 * both, keeps measurement and emission in lock-step.
 */

/**
 * One or two backslashes followed by `n` (the PlantUML escape as it appears
 * in source), OR a real newline (defensive — folded continuations can leave
 * one behind). Global so `split`/`replace` see every occurrence.
 */
const LABEL_BREAK = /\\{1,2}n|\r?\n/g

/**
 * Split a raw (pre-escape) label/description into its visual lines. Empty
 * segments are preserved so `"a\n\nb"` keeps its blank middle line — it
 * occupies vertical space in the rendered box and measureNode must count it.
 */
export function splitLabelLines(s: string | undefined): string[] {
  if (!s) return []
  return s.split(LABEL_BREAK)
}

/**
 * Replace PlantUML line breaks with a pre-encoded `&lt;br/&gt;`.
 *
 * MUST be applied AFTER the value's `>` has been escaped (escGt) — the break
 * token contains no `>` so escGt cannot disturb it, while the pre-encoded
 * `&lt;…&gt;` form rides the exact same xml2js double-encode → un-double
 * pipeline that the c4 label *template* tags (`&lt;div&gt;`) already use in
 * Mx.generate(). Net XML attribute value: `&lt;br/&gt;`, which draw.io
 * decodes to a real `<br/>` and renders as a line break — and which a
 * strict (`>`-intolerant) XML consumer also accepts, unlike a raw `<br/>`.
 */
export function htmlBreaks(escaped: string): string {
  return escaped.replace(LABEL_BREAK, '&lt;br/&gt;')
}

/**
 * Visual lines of a relationship label: honour explicit PlantUML `\n`
 * first (splitLabelLines), then greedy word-wrap each segment to
 * `maxWidthPx`.
 *
 * A drawio edge label has no box, so a long single-line verb/technology
 * is laid out as ONE un-wrappable line that overruns and overlaps the
 * endpoint nodes (`rel-long-labels` gallery defect). `maxWidthPx` is NOT
 * a constant — the caller derives it from the REAL measured widths of
 * the edge's two endpoint nodes (the narrower of the two), i.e. "a
 * label is never wider than the smallest box it sits between" — pure
 * geometry, no magic number. `Infinity` (an endpoint width is unknown,
 * e.g. a boundary/cluster) means "do not wrap", preserving prior
 * behaviour for that edge.
 *
 * Single source of truth shared by measureEdgeLabel (ELK reserves the
 * wrapped block) and the Mx emit (joins with the `\n` marker so
 * c4Text → `<br/>` makes drawio render the same block) — they must
 * agree, exactly like Phase 1's splitLabelLines.
 */
export function wrapEdgeLabelLines(
  s: string | undefined,
  fontSizePx: number,
  isBold: boolean,
  maxWidthPx: number,
): string[] {
  if (!Number.isFinite(maxWidthPx)) return splitLabelLines(s)
  return splitLabelLines(s).flatMap((seg) =>
    seg.trim() === '' ? [''] : wrap(seg, maxWidthPx, fontSizePx, isBold))
}
