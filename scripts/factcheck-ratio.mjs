/**
 * ADR 0011 step-0 ratio CONTRACT ratchet — extracted pure so it is
 * unit-testable in isolation (no fs / no Catalyst), exactly like
 * `scripts/p4b-svg-geom.mjs`. A bug in this predicate = the
 * silent-rot class returns, so it is contract-locked by
 * `tests/factcheck-ratio.test.mts`.
 *
 * Fidelity-monotone ratchet: per fixture, the distance `|1 − ratio|`
 * (catalyst diagram bbox ÷ PlantUML, on each axis) may only DECREASE
 * or hold vs the committed baseline — never regress away from PlantUML
 * by more than one quantisation quantum. An improving fix passes
 * (distance drops); `UPDATE_FACTCHECK_BASELINE=1` then re-commits the
 * tighter baseline so the ratchet converges toward parity with NO
 * guessed absolute threshold (ADR-0010 no-magic discipline).
 */

/**
 * wRatio/hRatio quantisation quantum: factcheck emits `+(C.W/P.W)
 * .toFixed(2)`, so the only legitimate run-to-run delta is the 2-dp
 * rounding boundary. A measured float-rounding envelope (category-1,
 * like `edgeLanes.ROUND_ENVELOPE`), NOT a tuned slack — catalyst emit
 * and PlantUML `-tsvg` are both deterministic.
 */
export const RATIO_TOL = 0.01

/**
 * @param baseline  the committed `{ stem: {w,h} }` map (may be {})
 * @param stem      fixture stem
 * @param wRatio    current catalyst/PlantUML width ratio
 * @param hRatio    current height ratio
 * @returns `{ ratioBad: 0|1, missing: boolean }` — `ratioBad=1` iff
 *          EITHER axis regressed away from parity by > one quantum vs
 *          baseline. No baseline entry ⇒ `{ratioBad:0, missing:true}`
 *          (a new fixture is not a failure; the runner reports it so
 *          `UPDATE_FACTCHECK_BASELINE=1` adds it).
 */
export function ratioContract(baseline, stem, wRatio, hRatio) {
  const b = baseline[stem]
  if (!b) return { ratioBad: 0, missing: true }
  const grew = (cur, base) =>
    Math.abs(1 - cur) > Math.abs(1 - base) + RATIO_TOL
  return {
    ratioBad: (grew(wRatio, b.w) || grew(hRatio, b.h)) ? 1 : 0,
    missing: false,
  }
}
