# ADR 0006 — Phase 4: NETWORK_SIMPLEX node placement, NOT per-boundary subgraphs

- Status: accepted
- Date: 2026-05-16

## Context

Backlog Phase 4 hypothesised the big-`c4-container` tangle came from
catalyst's "flat + absolute" emit model and that the fix was to "lay each
boundary as a SEPARATE ELK subgraph". That hypothesis was treated as an
untested note and **verified empirically before implementing** (per the
"a written-down answer is an untested hypothesis" rule).

Spike (elkjs 0.11.1, real ibm-wm `c4-container`, crossings):

| Config | crossings |
|--------|-----------|
| current (`INCLUDE_CHILDREN`, BRANDES_KOEPF) | 44 |
| `+thoroughness=40` | 44 |
| `+highDegreeNodes` | 42 |
| **`nodePlacement=NETWORK_SIMPLEX`** | **30** |
| `hierarchyHandling=SEPARATE_CHILDREN` | **115** |

The backlog's structural hypothesis was **disproven**: separating each
boundary into its own subgraph made it *far worse* (115 vs 44) — it
cuts the cross-boundary edges that ELK needs to see globally. The real
lever is **node placement**, not hierarchy mode. No emit-model change is
needed; "flat + absolute" stays.

Full-corpus regression check (catalyst fixtures + all 10 ibm-wm
diagrams), BRANDES_KOEPF → NETWORK_SIMPLEX:

- IMPROVED: ibm-wm c4-container 44→30, deployment-profile-b 19→16,
  -c 17→13
- UNCHANGED: every other diagram
- REGRESSED: none. Node overlaps: 0 in both, everywhere.

## Decision

Add `elk.layered.nodePlacement.strategy = NETWORK_SIMPLEX` to the
hierarchical (layered) branch only. One option, zero source-model
change, zero regression, strictly better on the diagrams that motivated
Phase 4. The risky emit-model rewrite the backlog feared is **not**
done — it was the wrong fix.

## Consequences

- `c4-container` ~32% fewer edge crossings; two deployment profiles also
  improve; no diagram regresses; full vitest suite (golden/parity/
  layout-quality/corpus-sanity) stays green.
- Crossing counts on *small synthetic* graphs are placement-sensitive by
  ±1 (BK and NS trade ±1 on contrived 13-node cases) — so the Phase 4
  test asserts the **deterministic** invariants (child-in-boundary
  containment + zero leaf overlap on a dense multi-boundary graph), not a
  flaky crossing threshold. The crossing win is documented evidence here,
  enforced by the no-regression full suite.
- The backlog's Phase 4 note is corrected: the flat+absolute emit model
  is fine; do not pursue per-boundary subgraphs (proven worse).
