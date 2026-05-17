# ADR 0009 — Layered cycle-breaking: DEPTH_FIRST, not GREEDY

- Status: accepted
- Date: 2026-05-17
- Peer of ADR 0006 (a second `org.eclipse.elk.layered` option default
  changed for PlantUML-`dot` fidelity); does not supersede it.

## Context

After ADR 0008 made every C4 diagram use `org.eclipse.elk.layered`,
the comprehensive numeric fidelity comparator (`make factcheck` /
`scripts/factcheck-geometry.mjs`, vs PlantUML `-tsvg` ground truth)
flagged `rel-bidirectional` and `rel-tech-vs-notech` with
`hRatio ≈ 2.3` and `rankOrder:false` — they rendered as a tall
THREE-rank chain where PlantUML's `dot` keeps the same graph compact
(source rank; both targets one rank below).

Root cause: ELK's default `cycleBreaking.strategy = GREEDY` breaks an
`a↔c` 2-cycle (`Rel(a,c)` + `Rel(c,a)`, or a `BiRel`) by reversing an
arbitrary edge; combined with `a→b` that spreads the three nodes over
three ranks. PlantUML/`dot` does not.

Spike on the **real catalyst ELK graphs** (measured bbox height),
`GREEDY` → `DEPTH_FIRST`:

| Fixture | GREEDY h | DEPTH_FIRST h |
|---|---|---|
| rel-bidirectional | 484 | **324** |
| rel-tech-vs-notech | 484 | **324** |
| topology-cyclic | 484 | 484 (unchanged) |
| rel-parallel-duplicate | 324 | 324 (unchanged) |
| topology-linear-chain (DAG) | 804 | 804 (unchanged) |
| edge-large-graph (DAG) | 484 | 484 (unchanged) |

DEPTH_FIRST reproduces `dot`'s 2-cycle compaction; every other cyclic
fixture and all DAGs are byte-identical — zero regression. (elkjs
0.11.1 caveat: the *layering* `BF_MODEL_ORDER` / `DF_MODEL_ORDER`
strategies crash the engine — ONLY `cycleBreaking` is touched.)

## Decision

Add `elk.layered.cycleBreaking.strategy = DEPTH_FIRST` to the layered
`layoutOptions` in `LayoutEngine.mts`. No emit-model change.

## Consequences

- `rel-bidirectional` / `rel-tech-vs-notech` height 484→324u,
  `hRatio` 2.37→1.45, and their node rank-order now matches the
  PlantUML SVG ground truth (`factcheck` `rankOrder` false→true).
- Byte-scope proven: exactly those 2 corpus fixtures change; the
  other 18 are byte-identical (gallery drawio diff).
- 334/334 tests incl. a new regression test (an `a↔c` 2-cycle must
  compact to ≤2 ranks). `make factcheck` corpus stays 20/20 clean.
- Shipped as PR #75.
