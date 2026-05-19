# Edge-Crossing Minimization — research, weighted decision, spike protocol

> Decision base for backlog item 1 (P1 edge crossings). Research →
> weighted matrix → committed decision (this doc) → spike → gate.
> Companion to `elk-vs-graphviz-dot.md` (the full engine-swap bet,
> item 1a — only if this in-pipeline approach cannot reach 0).

## Problem (measured, not eyeballed)

`make edgecross` (rendered drawio-export render-truth): **catalyst 30
non-incident edge crossings across 5 multi-edge fixtures**
(edge-large-graph 18, rel-fan-stress 6, rel-tech-vs-notech 3,
rel-parallel-duplicate 2, rel-bidirectional 1) vs **Graphviz/PlantUML
0**; the other 17 fixtures are 0=0. Surfaced by a user eyeballing the
`rel-bidirectional` gallery render after P1 was wrongly reported
"CLOSED on attachMerge=0".

### The load-bearing classification (decides the whole approach)

For every crossing, do the two edges share an endpoint node?
Measured by mapping each rendered polyline to its node boxes
(`scripts/edgecross-svg.mjs` geometry + box-proximity):

| | shared-node (incident-fan) | edge-disjoint (topologically forced) |
|---|---|---|
| 4 relationship fixtures | 12 | 0 |
| edge-large-graph | 18 | 0 |
| **TOTAL** | **30** | **0** |

**100% of the crossings are the incident-fan class; 0 are
topologically forced by fixed node positions.** This is decisive:
the entire defect is in the class a fixed-position port-ordering pass
can eliminate *by construction* (§rotation-system below). None of it
requires the deferred layout-engine swap.

### Root cause in code

`src/layout/edgeLanes.mts::assignEdgeLanes` assigns `exit`/`entry`
border-attach fractions ONLY for same-(unordered)-pair groups of ≥2
edges. A node's incident edges that belong to *different* pairs (e.g.
rel-bidirectional: `a→b` is a lone `BiRel` ⇒ no lane ⇒ centre attach
on `a`; `c→a` is in pair {a,c} ⇒ laned) are assigned independently or
not at all. There is **no per-node ordering of all incident edges**,
so two edges incident to the same node attach in an order that
crosses. (The reverted 30→40 in-place tweak rigid-translated ELK's
route — the wrong lever; confirmed empirically.)

## Research findings (3 parallel primary-sourced sweeps + probes)

Full agent reports in git history of this session. Version-exact
ground truth confirmed locally: `elkjs 0.11.1`
`new ELK().knownLayoutOptions()` — every cited ELK option present.

- **ELK option surface (sweep A).** `considerModelOrder.strategy=
  PREFER_EDGES` + `considerModelOrder.portModelOrder=true` derives
  in-node port order from edge emission order (rating 5, low-effort);
  `portConstraints=FIXED_ORDER`+`port.index` makes the caller own a
  computed order. **Caveat:** `edgeRouting`/`nodePlacement` do NOT
  change crossing count; and catalyst overrides ELK's port placement
  with its own `exitX/entryX` then draw.io re-routes — so ELK port
  options affect only *node ordering*, a weak/indirect lever for the
  rendered attach geometry.
- **dot + literature (sweep B).** `dot`'s near-0 crossings come from
  Sugiyama ordering (weighted-median + transpose on virtual-node
  chains) + **fanning incident edge endpoints across the node
  boundary by bearing to the far endpoint**, then spline routing
  *confined to the de-crossed channel*. The bearing-sorted ordered-
  port idea is rated **5/5 portable as a pure post-process** (node
  positions fixed). Barth–Jünger–Mutzel O(E log V) is the crossing-
  count *metric* (we already have the equivalent in
  `edgecross-svg.mjs`).
- **Post-hoc port assignment (sweep C).** The **rotation-system
  result** (metro-line crossing-min literature, JGAA paper199;
  rotation-system formalization): with node positions fixed,
  incident-edge crossings are minimized iff attach points are placed
  around each node in the **cyclic order of the bearings to the other
  endpoints**; same-pair K-edge bundles are crossing-free iff their
  attach ranks are **monotone-consistent at both endpoints** (nested
  fan). **mxGraph fact (load-bearing):** only `exitX/exitY/entryX/
  entryY` (+`exitDx/Dy`) is a *reliably honored* lever — the waypoint
  `Array` under `orthogonalEdgeStyle`+`curved=1` is an overridable
  hint (this is exactly the reverted 30→40 / `arrowSkew` no-op
  class). So the fix MUST be attach-fraction assignment, never
  waypoint shaping.

## Weighted decision matrix

Trait weights (from THIS project's context; sum = 1.00):

| Trait | Wt | Rationale |
|---|---|---|
| No-regression on corpus | 0.30 | The cardinal rule: golden/parity/factcheck/route-fidelity/gallery byte-drift must not regress. |
| Measured crossing reduction | 0.25 | Must actually drive `edgecross` 30→↓ on the rendered SVG. |
| Determinism (byte gates) | 0.20 | `gallery-verify`/`seq-gallery-verify`/golden are byte-exact. |
| Architecture-fit | 0.15 | Fits the post-layout emit model; NOT the deferred engine rewrite. |
| Maintenance/complexity | 0.10 | One bounded deterministic pass beats engine surgery. |

Scores 1–5 (from the sweeps' ratings), weighted:

| Candidate | NoRegr .30 | Reduce .25 | Determ .20 | Arch .15 | Maint .10 | **Σ** |
|---|---|---|---|---|---|---|
| **1. Bearing-sorted port-attach post-pass (§1+§2, exitX/Y)** | 5 | 4 | 5 | 5 | 4 | **4.55** |
| 2. ELK `portModelOrder`+`PREFER_EDGES` | 4 | 2 | 5 | 3 | 5 | 3.65 |
| 3. ELK `portConstraints=FIXED_ORDER`+`port.index` | 3 | 3 | 4 | 3 | 2 | 3.10 |
| 4. Waypoint-array shaping (§3) | 2 | 2 | 3 | 3 | 4 | 2.55 |
| 5. Full ELK→dot engine swap | 2 | 5 | 3 | 1 | 1 | 2.70 |

**Ranked winner: Candidate 1 — the deterministic bearing-sorted
port-attach post-pass.** It is the only one that is (a) the *honored*
mxGraph lever, (b) provably node-position-neutral (golden/parity/
layout-quality byte-safe by construction), (c) targets exactly the
100%-incident class measured, (d) deterministic for the byte gates.
Candidate 2 is a cheap complementary probe (test, low expectation).
Candidate 5 stays deferred (item 1a) — only if 1 cannot reach 0.

## Spike protocol (gate-first, no eyeballing)

1. **Byte-baseline** the corpus from a clean worktree of `origin/main`
   (golden, parity, gallery `.drawio`) BEFORE any change.
2. Implement Candidate 1: a deterministic per-node pass that, for
   every node, sorts ALL incident edges by bearing(center→far
   endpoint), groups by box side, assigns evenly-spaced
   `(i+1)/(K+1)` attach fractions in that cyclic order, with
   same-pair monotone-consistency enforced at both endpoints.
   Total sort key `(bearing, pairId, parserIndex)` — no float ties,
   no Map-order/time/random. Fixed decimal precision on emitted
   fractions (byte-stable).
3. **Measure on the RENDERED drawio-export SVG** (docker), never
   emitted points: `make edgecross` 30 → ?.
4. **Zero-regression gate** (ALL must hold or revert):
   - golden + parity byte-identical (node positions unchanged — the
     pass only moves attach fractions, not boxes).
   - `make factcheck` 26/28 unchanged (no new attachMerge/labelHit).
   - `make routefidelity` not worse.
   - `gallery-verify`/`seq-gallery-verify` regenerated + committed.
   - `edge-lanes` unit contracts updated to the new attach contract
     **with a RED case** (every-gate-proven-red discipline).
5. **Accept iff** `edgecross` strictly decreases AND every gate in
   (4) holds. Partial reduction with zero regression is acceptable
   progress (ratchet the baseline down). A regression or a render
   no-op is a negative result — revert, document, do NOT ship
   (the standing rule; the 30→40 precedent).
6. Whatever residue remains after a clean reduction re-scopes to
   item 1a with the new (lower) ratchet number as its target.

## EMPIRICAL RESULT — Candidate 1 spiked, measured, DISPROVED in-pipeline (2026-05-18)

Executed the full spike protocol. Outcome: **negative result —
reverted, not shipped.**

- **Algorithm proven correct by construction.** `assignPortOrder`
  (ray∩box-border attach, deterministic equal-bearing spread) is
  exhaustively unit-tested (`tests/portorder.test.mts`, 11 cases,
  expectations *derived from geometry, not hardcoded*): invariant I1
  (rotation-system: attach order == bearing cyclic order, zero
  inversions) and I2 (nested-fan monotone-consistent) hold for every
  adversarial scenario (hub-fan, k5-parallel, antiparallel,
  multi-pair-at-one-node, all-four-sides, degenerate-collinear,
  excluded/self-loop); pure-model crossings = 0 for the incident-fan
  scenarios. SVG models in `build/portorder-models/` for repeatable
  eyeballing. The FIRST implementation (per-side bucketing) was caught
  WRONG by these same tests before any corpus cycle — the tests did
  their job.
- **Rendered corpus: net regression.** drawio re-render measured
  (`make edgecross`, real SVG): the P1 multi-edge class improved
  sharply — rel-fan-stress 6→2, rel-parallel-duplicate 2→1,
  rel-tech-vs-notech 3→1, rel-bidirectional held 1 (those 4: 12→5) —
  but **edge-large-graph 18→30 and the previously-CLEAN c4-context
  0→2 regressed**, net sample 30→37, even with the conflicting lane
  waypoints suppressed (attach as the single mechanism, per sweep C).
- **Root cause of the regression (the documented honest scope
  limit, now empirically confirmed):** draw.io's
  `orthogonalEdgeStyle` re-router OVERRIDES the proven-correct attach
  geometry on dense (edge-large-graph) and boundary/cluster
  (c4-context) graphs — it re-flows the mid-route and re-introduces
  crossings the pure model does not have. The attach lever is
  necessary but NOT sufficient against draw.io's own router. Cherry-
  picking the fixtures it helps is the forbidden fake-green
  (contract-wide metric), so the in-pipeline approach as a whole is
  disproved.
- **Disposition:** `assignPortOrder` + its exhaustive tests + SVG
  models are RETAINED (proven-correct, deterministic, reusable) but
  **NOT wired into emit** — they are the building block item 1a (the
  engine swap, which owns routing end-to-end) will consume. The
  catalyst.mts wiring was reverted; corpus byte-identical to
  baseline; `make edgecross` stays 30 (no regression shipped). The
  residual now escalates to **item 1a** with this section as the
  disproved-in-pipeline evidence and the edgeCross ratchet (30) as
  the engine-swap's numeric target.

## Honest scope limits (stated up front)

- The pass removes **incident-fan** avoidable crossings. Our measured
  data says that is 100% of the current 30 — so 0 is *achievable in
  principle*; but draw.io's `orthogonalEdgeStyle` re-router can still
  swing a mid-route segment across a sibling after a correct attach
  choice (sweep C failure-mode 2). Only the **rendered** `edgecross`
  number decides success; the emitted attach choice being correct is
  necessary, not sufficient.
- If the rendered number does not drop materially, that is the
  empirical signal the router override dominates ⇒ escalate to
  item 1a (engine swap), with this doc as the disproven-in-pipeline
  evidence. Negative result is a valid, documented outcome.
