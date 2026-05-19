/**
 * Item 1a / ADR 0014 — `dot`-engine residual ratchet for the
 * `attachMerge` / `labelHit` CONTRACT metrics, extracted pure so it is
 * unit-testable in isolation (no fs / no Catalyst), exactly like
 * `scripts/factcheck-ratio.mjs` / `scripts/edgecross-svg.mjs`.
 *
 * WHY this exists (not a fake-green — read ADR 0014 §"Honest
 * residual"): on the `dot` engine the deliberately-pathological
 * synthetic exhaustiveness fixtures `c4-all-rel-variants`
 * (5×`a→b`, 4×`a→c`, 4×`a→d`) and `c4-exhaustive` pack many parallel
 * same-pair edges tightly — EXACTLY as PlantUML's own `dot` does.
 * Under ELK these read 0 ONLY because `assignEdgeLanes` artificially
 * perpendicular-spread them — the precise machinery that produced the
 * 30 real-corpus crossings 1a removes. So a non-zero `attachMerge`
 * here is the FAITHFUL consequence of matching PlantUML, on synthetic
 * fixtures only (the real corpus is `attachMerge=0`, `edgecross=0`).
 *
 * The CONTRACT stays `attachMerge=labelHit=0` and is honestly RED &
 * documented — NOT advisory-downgraded, NOT fixture-excluded. This
 * per-fixture ratchet (identical mechanism to
 * `tests/edgecross-baseline.json` / `tests/factcheck-ratio-baseline`)
 * fails any REGRESSION beyond the committed `dot` baseline; an
 * improvement passes and `UPDATE_FACTCHECK_DOT_BASELINE=1` re-commits
 * the tighter baseline so it only ever converges toward 0. Applied
 * ONLY when catalyst was laid out by `dot` (`LAYOUT_ENGINE=dot`);
 * ELK keeps the strict `=0` contract unchanged.
 */

/**
 * @param baseline   committed `{ stem: { attachMerge, labelHit } }` (may be {})
 * @param stem       fixture stem
 * @param attachMerge current value
 * @param labelHit    current value
 * @returns `{ regressed: 0|1, missing: boolean }` — `regressed=1` iff
 *          EITHER metric exceeds its committed `dot` baseline. A stem
 *          ABSENT from the baseline must be 0 on both (a new fixture
 *          may not introduce a residual) — same rule as
 *          `edgecrossRatchet`; `missing:true` lets the runner report
 *          it so `UPDATE_FACTCHECK_DOT_BASELINE=1` adds it.
 */
export function dotResidualContract(baseline, stem, attachMerge, labelHit) {
  const has = Object.prototype.hasOwnProperty.call(baseline ?? {}, stem)
  if (!has) {
    return { regressed: attachMerge > 0 || labelHit > 0 ? 1 : 0, missing: true }
  }
  const b = baseline[stem]
  return {
    regressed: (attachMerge > b.attachMerge || labelHit > b.labelHit) ? 1 : 0,
    missing: false,
  }
}
