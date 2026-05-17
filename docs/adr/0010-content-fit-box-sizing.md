# ADR 0010 — Content-fit box sizing, not a fixed per-type C4_MIN floor

- Status: accepted (decision); implementation is a separate
  factcheck+byte+render-compare-gated PR
- Date: 2026-05-17
- Decision record for backlog item **P4b**. Builds on the measured
  decision base `docs/research/p4b-box-metrics.md` (#83) and the
  `scripts/p4b-box-metrics.mjs` measurement (extended here with the
  text-inset metric).

## Context

`measureNode` floors every leaf at a fixed per-type minimum
(`theme.C4_MIN`: SYSTEM 220×140, CONTAINER 200×120, COMPONENT
180×100, NODE 160×90) and grows past it only when measured text is
larger. Empirically (`make factcheck` SVG ground truth, all 26
fixtures, 143 leaf boxes):

- PlantUML is **content-fit with tight padding** — per-family box
  size spans ~20× (SYSTEM h 58→2537); there is no PlantUML
  220×140-class minimum.
- catalyst's minimum **equals the floor exactly** in every family,
  so for the majority of real (short-label) elements the floor — not
  the text — is the binding dimension. PlantUML's *median* SYSTEM is
  114×58; catalyst forces 220×140.
- The floor over-sizes the smallest same-type box by **2.7–7.8×**
  (SYSTEM 7.8×, CONTAINER 5.0×, NODE 3.5×, COMPONENT 2.7×). This is
  the "empty box" defect, quantified.
- The floor's provenance comment ("conventional C4-PlantUML /
  Structurizr element dimensions") is **half-wrong**: Structurizr
  defaults element sizes at its own renderer/scale; C4-PlantUML /
  PlantUML does **not**, and catalyst's fidelity gate judges against
  *PlantUML*. The floor is anchored to the wrong renderer — a
  mis-attributed category-(2) "citation" (the cited source does not
  define the value).
- **Measured the real metric** (the category-1 value the decision
  base flagged as required before implementation): across 124
  entities in all fixtures, PlantUML's element **text-inset is 10 px**
  each side (median; dominant value, a few 14 px sprite/icon
  outliers). Extracted directly from the `-tsvg` rect-vs-text bbox —
  not a guess.

## Decision

Replace the fixed per-type `C4_MIN` floor with a **content-fit
minimum**: a leaf box is `measured-text + 2×INSET` where
`INSET = 10 px` is the **measured PlantUML element text-inset**
(category-1 metric, single-sourced in `theme.mjs`, annotated with its
provenance: "measured from PlantUML `-tsvg` rect-vs-text bbox across
the corpus; `scripts/p4b-box-metrics.mjs`"). `measureNode`'s existing
text measurement continues to drive size; only the *floor* changes
from a fixed rectangle to `text + inset`.

The per-type 220×140-class constants are deleted; their provenance is
corrected. **No separate empty-description safety floor** — see the
measured resolution below (PlantUML itself omits the blank line; pure
content-fit reproduces it).

### Measured facts — all four open gaps CLOSED 2026-05-17 (no guesses)

`scripts/p4b-box-metrics.mjs` extended to extract these from the
`-tsvg` ground truth (124 leaves; the 19 clusters/boundaries excluded
— their rect spans children with the title in a corner, so their
"inset" is not a leaf metric: a measurement-bug in the script's own
regex was caught and fixed before trusting the numbers).

1. **Horizontal inset = 10 px, exact.** 123/124 leaves are exactly
   10 px left+right. The single exception is `c4-exhaustive/dev` — a
   Person rendered with a 9-text-line sprite label (fonts
   `16+14×8`), a distinct Person-with-sprite glyph class, NOT a
   normal rectangle. So `INSET = 10` is a clean category-1 metric
   with the tail fully audited (one classified glyph, not noise).
2. **Vertical model (baseline-relative, NO font-metric guessing — all
   values are directly in the SVG):** `topGap` (rect.y → first
   baseline) = **22.83**; `botGap` (last baseline → rect.bottom) =
   **14.69**; inter-baseline pitch «stereotype»(12)→Name(16) =
   **20.62**, Name(16)→desc(12) = **17.52**, desc(12)→desc(12) =
   **16.34** (this doc originally rounded it to "16"; the
   implementation uses the full-precision live `-tsvg` value 16.34,
   asserted equal to the oracle by `tests/p4b-svg-geom.test.mts`).
   Closed form: `leafMinHeight = topGap + Σ(pitch over the
   element's ACTUAL line set) + botGap`. Verify: a 2-line
   «stereotype»+Name element = 22.83 + 20.62 + 14.69 = **58.14**,
   which is *exactly* PlantUML's measured smallest box height
   (entity `d`, empty-desc `c`). The model is correct by
   construction, not fitted.
3. **`layout-quality` replacement contract (specified, not deleted):**
   for every leaf — `height ≥ topGap + Σ(measuredPitch for its line
   set) + botGap` AND `width ≥ maxRenderedTextLen + 2×INSET` AND no
   text glyph extends beyond the box. This is the deliberate
   anti-regression contract (the box is exactly its content-fit box,
   never smaller, text never overflows) that replaces the absolute
   "≥ C4 min" assertion.
4. **Empty-description: pure content-fit, NO special floor.** Measured
   `edge-empty-descriptions/c` = 82.20×58.14 with `nText=2` (just
   «stereotype»+Name). PlantUML **omits** the empty description line
   entirely and renders the normal 2-line minimum. Pure content-fit
   (size to the lines that exist) reproduces this exactly — a
   separate small-floor would be a guess contradicting the ground
   truth. Decision settled by measurement.

## Consequences

- **Cross-cutting, intentional geometry change** — nearly every
  fixture's boxes shrink toward PlantUML's. This is NOT a
  zero-output-change refactor; it is a deliberate fidelity
  correction. golden/parity fingerprint topology (stable);
  **`layout-quality`'s "≥ C4 min size" assertion MUST be
  re-specified** to the content-fit model (the old absolute floor is
  gone).
- **Gating plan for the implementation PR** (BLOCKING, in order):
  1. `make factcheck` CLEAN 26/26 — boxes shrinking must not
     introduce `nodeOverlap`/`labelHit`/`attachMerge` (tighter boxes
     change spacing; this is the real risk).
  2. `make render-compare` on a representative set (a dense compound
     `c4-container`, a sparse `topology-*`, a Db/cylinder3 fixture) —
     visually at PlantUML parity, not merely "smaller".
  3. Byte baseline (`git worktree` of `origin/main`) recorded as
     evidence of the *scope* of change (expected: broad; assert no
     fixture is unchanged-by-accident where it should shrink).
  4. Both horizontal AND vertical insets are now SVG-measured (above)
     — implement from those constants; the `p4b-box-metrics.mjs`
     measurement is unit-tested + safeguarded so the numbers can't
     silently rot.
- **Interactions to verify**: the P6 boundary title band
  (`titlePadding`, ADR-era) and the cylinder3 cap reserve
  (`CYLINDER3_CAP_PX`) are independent measured reserves — confirm
  the smaller leaf floor does not regress boundary-band clearance or
  cylinder cap containment.
- **Resolved (was an open question)**: pure content-fit vs a small
  empty-description floor — settled by measurement (fact 4 above):
  PlantUML omits the blank line, so pure content-fit is correct and
  a floor would be a guess. No deferral.

## Why ADR (not just a fix)

It removes a long-standing documented constant, corrects its
provenance, and changes nearly every diagram's geometry — exactly the
class of decision (per the portfolio "research/decision base first,
implementation after" rule) that must be recorded and gated, not
slipped into a refactor. The measured evidence (#83 +
`p4b-box-metrics.mjs`) makes the decision fact-based, not aesthetic.
