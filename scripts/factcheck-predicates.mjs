#!/usr/bin/env node
/**
 * Pure decision cores for the factcheck fidelity gate.
 *
 * WHY THIS MODULE EXISTS — a gate's value is its demonstrated RED, not
 * its observed green (portfolio rule `silent-fake-gate-classes` /
 * `gate-RED-proves-enforcement`). The eight factcheck contract metrics
 * (entityMiss/relMiss/arrowBad/labelDrop/attachMerge/labelHit/
 * nodeOverlap/titleMiss) used to be computed by inline closures inside
 * `factcheck()` with ZERO negative tests — every fixture was green and
 * nothing proved the predicates could ever go RED on the defect they
 * each claim to catch. Extracting the *decision* (not the parsing/IO)
 * here makes each predicate unit-testable with an explicit RED case;
 * `tests/factcheck-predicates.test.mts` is the proof.
 *
 * Behaviour-preserving: every function below is the SAME expression
 * that was inline in `factcheck-geometry.mjs` — proven by a
 * byte-identical 28-fixture factcheck baseline across the extraction
 * (the zero-output-change refactor gate, `coding-style.md`). Do not
 * "improve" a predicate here without re-proving that baseline.
 */

/* ── cited renderer / C4-semantic constants (decision, not parsing) ── */

/** Minimum endpoint-attach separation for two edges of the same
 *  unordered pair to read as distinct lines. = 2 × the relationship
 *  arrow-head size (theme `SHAPE.REL_ARROW_SIZE` = 14) so two heads
 *  cannot visually touch. A cited renderer metric, not a guess. */
export const ATTACH_SEP_MIN = 28
/** C4 arrowhead-count contract: a bidirectional relation (`BiRel`)
 *  renders an arrow at BOTH ends; every one-way relation renders
 *  EXACTLY one. An edge whose emitted count differs is the P10
 *  "looks bidirectional / looks arrowless" defect. */
export const ARROWS_BIDIRECTIONAL = 2
export const ARROWS_ONE_WAY = 1

/* ── text fidelity ── */

/**
 * Normalise text for a present/absent comparison. The emitted c4Name
 * legitimately differs from the parsed label by: word-wrap `<br/>`
 * insertions (long verbs / `\n`), and XML/HTML escaping (`&amp;`
 * `&lt;` `&gt;` — incl. P8's double-escaped `&amp;lt;`). Stripping
 * those + collapsing whitespace makes "is the text preserved?" a
 * true content check, not a formatting diff.
 *
 * KNOWN LIMITATION (documented, not a bug): because this collapses
 * BOTH `\n` and `<br/>` to a space, `textPreserved` cannot by itself
 * distinguish "literal `\n` correctly translated to `<br/>`" from
 * "literal `\n` left as tofu" — both normalise identically. That
 * specific regression class (the `edge-multiline-labels` fixture's
 * raison d'être) is guarded by the hRatio ratchet (a literal-`\n`
 * box collapses to one giant single line → bbox-height drift), NOT
 * by labelDrop. See `tests/factcheck-predicates.test.mts`
 * "norm() blind spot" which asserts this limitation explicitly so it
 * cannot silently widen.
 */
export function norm(s) {
  return (s ?? '')
    .replace(/&lt;br\/?&gt;|<br\/?>/gi, ' ')      // wrap breaks (HTML)
    .replace(/\\n|\n/g, ' ')                      // PlantUML `\n` (literal or real)
    .replace(/&amp;lt;/g, '<').replace(/&amp;gt;/g, '>') // P8 double-escape
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim()
}

/** The `labelDrop` / `entityMiss`-name decision: an expected piece of
 *  text is "preserved" iff it is empty after norm, or some emitted
 *  candidate norm-contains it. Mirrors the two inline sites verbatim
 *  (edge verb vs c4Name; entity name vs c4Name OR value). */
export function textPreserved(expected, ...actuals) {
  const e = norm(expected)
  return !e || actuals.some((a) => norm(a).includes(e))
}

/* ── arrowhead count ── */

/** The `arrowBad` decision: emitted arrowhead count must equal the C4
 *  semantic (bidirectional ⇒ 2, one-way ⇒ exactly 1). */
export function arrowCountOk(arrowN, bidirectional) {
  return arrowN === (bidirectional ? ARROWS_BIDIRECTIONAL : ARROWS_ONE_WAY)
}

/* ── geometry: overlap / containment ── */

export const intersects = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/** a fully contains b (b ⊆ a, with a tiny epsilon for the inset). */
export const contains = (a, b, eps = 2) =>
  a.x - eps <= b.x && a.y - eps <= b.y &&
  a.x + a.w + eps >= b.x + b.w && a.y + a.h + eps >= b.y + b.h

/** TRUE (defect) overlap: intersect but neither contains the other.
 *  catalyst emits flat+absolute (no XML nesting) so a boundary visually
 *  CONTAINS its children — legitimate compound nesting, not an overlap.
 *  This is BOTH the `nodeOverlap` predicate AND the `labelHit` core
 *  (label-rect vs non-endpoint leaf). */
export const partialOverlap = (a, b) =>
  intersects(a, b) && !contains(a, b) && !contains(b, a)

/* ── geometry: edge endpoint attach points ── */

/** One axis of an edge endpoint's attach point. `frac` undefined ⇒ the
 *  box centre on that axis (the mxGraph default when exit/entry is
 *  unconstrained); otherwise the fractional border position. `lo`/`hi`
 *  are (x,w) for the X axis or (y,h) for the Y axis. Null node ⇒ 0
 *  (matches the inline `n ? … : 0`). */
const axis = (n, lo, sz, frac) =>
  n ? (frac === undefined ? n[lo] + n[sz] / 2 : n[lo] + frac * n[sz]) : 0

/** An edge endpoint attach point in the plane: (exit/entry X·w on the
 *  source/target box, exit/entry Y·h). */
export const attachPoint = (n, fracX, fracY) => ({
  x: axis(n, 'x', 'w', fracX),
  y: axis(n, 'y', 'h', fracY),
})

/** The `attachMerge` decision: two same-(unordered)-pair edges collapse
 *  into one visual line iff BOTH their source-attach and target-attach
 *  points are within `sepMin` Euclidean distance. (X-only would
 *  false-flag a horizontal fan that `assignEdgeLanes` correctly
 *  separates in Y — fact-found 2026-05-17; the contract is the plane
 *  distance on BOTH ends.) */
export function attachMerged(src1, tgt1, src2, tgt2, sepMin = ATTACH_SEP_MIN) {
  const dSrc = Math.hypot(src1.x - src2.x, src1.y - src2.y)
  const dTgt = Math.hypot(tgt1.x - tgt2.x, tgt1.y - tgt2.y)
  return dSrc < sepMin && dTgt < sepMin
}
