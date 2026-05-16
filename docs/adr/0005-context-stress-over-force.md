# ADR 0005 — Context layout: stress + sporeOverlap, not force

- Status: accepted
- Date: 2026-05-16
- Supersedes the `force` choice for the non-hierarchical (C4 Context)
  branch of `LayoutEngine`.

## Context

C4 Context diagrams (people/systems only) use the non-hierarchical
branch. It was `org.eclipse.elk.force`. Empirical spikes (elkjs 0.11.1,
`stress` confirmed in `knownLayoutAlgorithms()`):

| Graph | force crossings | pure stress | stress + sporeOverlap (shipped) |
|-------|-----------------|-------------|---------------------------------|
| real ibm-wm c4-context | 3 | 0 | 0 (0 node overlaps) |
| synthetic 10-spoke hub | 21 | 0 | ~5 (0 node overlaps) |

`force` is also **seed-based** (unstable golden/route signatures);
`stress` is deterministic.

## Decision

Non-hierarchical branch → `org.eclipse.elk.stress`. Because `stress` has
no node-repulsion (it can leave boxes overlapping — the layout-quality
gate's invariant), a **second deterministic pass** runs
`org.eclipse.elk.sporeOverlap` on the stress result, which removes node
overlaps while preserving the crossing-minimal arrangement. Spacing for
the declump is the existing font-derived title band
(`titlePadding().top`), not an invented constant.

Layered (hierarchical C4) is unchanged.

## Consequences

- c4-context: 3→0 crossings, 0 node overlap, deterministic, visibly more
  compact (Phase 3 visual gate PASS vs baseline a6cd3cc).
- The declump trades a few crossings for zero overlap on dense synthetic
  graphs (21→~5, still far under force) — the correct trade since the
  layout-quality gate forbids overlap and must not regress.
- Context edges carry no ELK label rectangle after `sporeOverlap` (it
  does not place labels) — Context label placement remains catalyst's
  renderer-side concern (edgeLanes / midpoint), exactly as before
  Phase 2. The Phase 2 "ELK reserves label space" contract is scoped to
  the **layered** pipeline, where it holds and is tested.
- New tests: `context-stress.test` (0 node overlap; crossing count ≤ 8,
  locking the win under the force=21 regime). layout-quality gate
  (includes c4-context) stays green.
