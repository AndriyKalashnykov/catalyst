# P4b — PlantUML box-metric fact-check (decision base, pre-implementation)

**Status:** evidence gathered, ADR pending. NO implementation yet — this
is the solid measured base the P4b decision needs (per the
"research/decision first, implementation after" directive). The
question P4b asks: *catalyst boxes look empty/oversized vs PlantUML —
is the per-type `theme.C4_MIN` floor wrong, and to what?*

## Method (measured, not eyeballed)

`scripts/p4b-box-metrics.mjs` joins, per leaf alias across **all 26
gate fixtures**: PlantUML's rendered box from the `-tsvg` ground truth
(`build/factcheck-svg/*.svg`, the same parse the factcheck comparator
uses) vs catalyst's emitted draw.io box, bucketed into the `C4_MIN`
family `measureNode` floors at. Coordinate comparability (PlantUML SVG
units ≈ catalyst px at 1:1) is the SAME assumption the standing
factcheck gate already relies on (`wRatio`/`hRatio`); stated explicitly
so the ADR is honest about it.

Reproduce: `make factcheck` once, then
`SVG_DIR=build/factcheck-svg node scripts/p4b-box-metrics.mjs`.

## Measured result (143 leaf boxes)

| family | n | PlantUML w (min/med/max) | PlantUML h (min/med/max) | catalyst w (min/med/max) | catalyst h | C4_MIN |
|---|--:|---|---|---|---|---|
| COMPONENT | 5 | 113/156/165 | 58/113/132 | 180/180/180 | 100/100/100 | 180×100 |
| CONTAINER | 30 | 82/123/659 | 58/113/632 | 200/200/444 | 120/120/639 | 200×120 |
| NODE | 5 | 70/70/207 | 58/58/172 | 160/160/348 | 90/90/143 | 160×90 |
| SYSTEM | 95 | 68/114/1458 | 58/58/2537 | 220/220/1316 | 140/140/2263 | 220×140 |

**Floor-vs-PlantUML gap** (catalyst floor area ÷ PlantUML's *smallest*
same-type box):

| family | floor | smallest PlantUML | floor is |
|---|---|---|---|
| COMPONENT | 180×100 (18 000 px²) | 113×58 (6 575, c4-exhaustive/cache) | **2.7× larger** |
| CONTAINER | 200×120 (24 000 px²) | 82×58 (4 779, edge-empty-descriptions/c) | **5.0× larger** |
| NODE | 160×90 (14 400 px²) | 70×58 (4 090, c4-exhaustive/n3) | **3.5× larger** |
| SYSTEM | 220×140 (30 800 px²) | 68×58 (3 947, rel-layout-constraints/d) | **7.8× larger** |

## Findings (the decision base)

1. **PlantUML is content-fit with tight padding, NOT a fixed minimum.**
   Per-family width/height span ~20× (SYSTEM h 58→2537); the box grows
   to the label. There is no PlantUML 220×140-class floor.
2. **catalyst's minimum == the floor, exactly, in every family**
   (SYSTEM 220×140, CONTAINER 200×120, …). So for the *majority* of
   real elements (short label) the floor — not the measured text — is
   the binding dimension. PlantUML's *median* SYSTEM is 114×58; catalyst
   forces 220×140. This IS the "empty box" defect, quantified.
3. **PlantUML's minimum element height ≈ 58 px** across all families
   (one bold name line + small pad). catalyst floors height at 90–140.
4. **The floor's provenance comment is half-wrong.** It cites
   "conventional C4-PlantUML / Structurizr element dimensions".
   Structurizr does default element sizes (at its own renderer/scale);
   **C4-PlantUML/PlantUML does not** — and catalyst's fidelity gate
   judges it against *PlantUML*. So the floor is anchored to the wrong
   renderer. Per the no-magic taxonomy this is a mis-attributed
   category-(2) "citation": the cited source (PlantUML) does not define
   the value; only Structurizr does, and Structurizr is not the target.

**Conclusion:** P4b is REAL and the fact-check *disproves* the floor
(it is not "chasing a documented constant" — the ground-truth
measurement shows the constant contradicts the fidelity target). The
`no-guesses` caution ("shrinking every box churns golden") is
outweighed: the constant is measurably wrong vs the oracle.

## Recommended model (for the ADR — not yet implemented)

Replace the fixed per-type `C4_MIN` floor with a **content-fit minimum
derived from PlantUML's actual minimal box**: floor each leaf at
roughly *one rendered title line + the PlantUML-measured element
padding* (≈ the observed 58 px min height; width = measured text +
pad), letting `measureNode`'s existing text measurement drive size as
it already does above the floor. Keep a SMALL safety minimum so a
1-char label is not a sliver. Net effect: short-label boxes shrink
toward PlantUML's; multi-line boxes are unchanged (already
measure-driven).

### Why ADR-worthy / open questions to settle in the ADR

- Cross-cutting: changes nearly every fixture's geometry → re-baseline
  golden/parity (topology fingerprints — should be stable),
  **`layout-quality` test's "≥ C4 min size" assertion must be
  re-specified** to the new model, and re-gate factcheck CLEAN 26/26 +
  a render-compare visual + a byte baseline.
- Exact padding constant: **MEASURED — resolved.** `p4b-box-metrics.mjs`
  now extracts the SVG rect-vs-text bbox inset across 124 entities:
  PlantUML's element text-inset is **10 px each side** (median;
  dominant, a few 14 px sprite/icon outliers). This is the category-1
  metric for the content-fit minimum — single-sourced in `theme.mjs`
  per ADR 0010, no guessed literal.
- Interaction with the P6 boundary title band and cylinder3 cap
  reserves (already measured constants) — verify no regression.
- Decision: pure content-fit vs content-fit-with-small-floor (avoid
  degenerate tiny boxes for empty descriptions).

## Next step

This document + `scripts/p4b-box-metrics.mjs` are the decision base.
**ADR 0010 (`docs/adr/0010-content-fit-box-sizing.md`) — accepted** —
records the decision, the measured 10 px inset, and the BLOCKING
gating plan. Implementation is the next step: a separate
factcheck+byte+render-compare-gated PR per ADR 0010's plan.
