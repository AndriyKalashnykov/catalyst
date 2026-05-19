# ADR 0011 — Layout-aspect fidelity (ELK `layered` vs Graphviz `dot`)

- Status: **closed** — step 0 + C3 + cause D shipped; the wRatio
  premise was found to be a comparator artefact (fixed like-for-like),
  C2/C1 declined on evidence. See "Status — premise CORRECTED" below.
  **SUPERSEDED by ADR 0014** (2026-05-19): the `dot` engine owns
  layout aspect (it IS PlantUML's engine); the ELK-calibrated
  `factcheck-ratio` ratchet is re-baselined under `dot` at 1a/P6.
  (Was: accepted decision base — per-candidate factcheck+byte+render PRs.)
- Date: 2026-05-17
- Decision record for backlog **item-0** (the "narrow diagram /
  humongous fonts" complaint). Research base: 4 parallel
  primary-sourced research sweeps + concrete per-fixture measurement,
  this session. Supersedes the P13 "uniform-width embed" non-fix
  (reverted #94 — an embed policy cannot mask a layout-aspect gap).

## Context — the measured problem

catalyst's ELK-laid-out diagrams are **0.19–0.67× the WIDTH** of the
equivalent PlantUML (Graphviz `dot`) render on **14 of 20** gallery
fixtures (`wRatio` per `scripts/factcheck-geometry.mjs`). Heights track
PlantUML (`hRatio` ≈ 0.7–1.0). P4b box sizing is **correct per-leaf**
(`p4b-box-metrics`: `rel-parallel-duplicate` cat box 93×59 vs PlantUML
92.4×58.1; 143-leaf table tracks PlantUML). The defect is **diagram
aspect**, not box size. P13 uniform `width=420` then magnified the
intrinsically-narrow diagrams 3–5× → the user-visible "humongous
fonts" (P13 reverted to `height=360` as interim relief, #94).

`wRatio`/`hRatio` are **advisory** in the factcheck gate — which is why
14 fixtures shipped "CLEAN 26/26". That gate gap is part of this ADR.

## Root cause — converged, primary-sourced (4 independent sweeps)

The narrowness has **two independent structural causes plus one
node-width cause**, not one:

### Cause A — ELK x-compaction; catalyst FORCES the compacting strategy

`LayoutEngine.mts:409` sets `elk.layered.nodePlacement.strategy =
NETWORK_SIMPLEX` (a deliberate **Phase-4** choice — it cut edge
**crossings**: c4-container 44→30, etc., zero regressions then).
NETWORK_SIMPLEX x-placement minimises total weighted edge length →
**pulls nodes together on the cross-axis** → tall/narrow. ELK's
*default* `BRANDES_KOEPF` (and dot's median x-assignment) spread
wider. So catalyst chose the narrow placement for a *crossing* win;
width was the unmeasured cost. (Agent A, version-exact from ELK
v0.10.0 `Layered.melk:490` — elkjs 0.11.1 bundles ELK core 0.10.0.)

### Cause B — `dot` reserves rank width for every edge label; ELK does not

Graphviz FAQ (verbatim): *"edge labels in dot are modeled as dummy
nodes … can dramatically distort the layout"*; TSE93 — labels are
*virtual nodes on dummy ranks*. Each C4 relation label (and **each**
parallel edge) becomes a full-width, `nodesep`-separated **ranked
node** in dot's x-auxiliary graph. ELK `layered` (`EDGE_LABELS`
supported, `inline:false`, dims already fed at `LayoutEngine.mts:301`)
reserves only a **thin band beside the spline**, not a rank slot.
C4 is label-dense + C4-PlantUML v2.13.0 sets **no** layout skinparam
(stock dot defaults — primary-sourced negative finding) → this is the
**dominant** general cause and the **sole** cause of the ~3×
`rel-parallel-duplicate` blow-up (N parallel labels = N side-by-side
dot label-nodes; catalyst fans them **post-ELK** in `edgeLanes.mts`,
so ELK reserves nothing). (Agents B + D.)

### Cause C — node width: description wrapped to title-width

`measureNode.mts:83-84` wraps the description to
`contentW = max(titleW, stereoW, techW)` (the short title), not
PlantUML's `skinparam wrapWidth` (C4-PlantUML `$DEFAULT_WRAP_WIDTH =
200`, fact-checked from pinned `C4.puml` — a cited category-2
constant). Description-heavy short-title boxes are 2–5× narrower than
PlantUML. (Agent C.) Per-fixture isolation: `topology-linear-chain`
is single-column (no fan), cat max box **99** vs PlantUML **181** —
that whole gap is Cause C; `rel-parallel-duplicate` per-leaf
93≈92 — that gap is Cause B. So **C dominates the description-heavy
majority; B dominates the parallel/antiparallel rel-\*; A is the
cross-cutting compaction residual.**

## Candidates (from the sweeps; ratings are the agents', not opinion)

- **C1 — node placement NETWORK_SIMPLEX → BRANDES_KOEPF (+`bk.fixedAlignment=BALANCED`).**
  Cheapest config lever; ELK default; markedly wider/dot-like;
  deterministic (`randomSeed=1`). **Trade-off:** reverts the Phase-4
  *crossing* win — must spike width **and** crossings **and**
  factcheck together. (Agent A rating 5 for width; the crossing cost
  is the catch.)
- **C2 — synthetic structure to reserve edge-label / parallel-fan rank
  width** (inject sized invisible label/fan dummies mirroring dot's
  label-node; / inflate fan-bearing node boxes by the computed fan
  span). Attacks the dominant structural cause B. **Architecturally
  native** — the P2 `cmp*`/phantom-sink synthetic-edge + emit-filter
  (`/^(rel|lay)\d+$/`) pattern is proven byte-scoped. (Agents D rank 1,
  B implies it.) Hardest; must be `factcheck`-gated (over-inflation →
  `nodeOverlap`/`attachMerge`).
- **C3 — wrap element text at `WRAP_WIDTH = 200`, not title-width**
  (the previously-discarded change; correct-direction, factcheck-clean;
  moved `topology-linear-chain` 0.32→0.45 alone). Separable
  node-width correctness fix for Cause C. Low risk.
- **C4 — keep `nodesep`/`ranksep` at dot-parity** (already plumbed,
  `LayoutEngine.mts:128-130`). Necessary **floor**, provably
  insufficient (ELK compacts back; Agents A+D).
- **Rejected:** `elk.aspectRatio` — version-exact registry-confirmed
  generic/not bound to `layered`; inert for single-connected C4 (the
  "config accepted, feature not engaged" version-discipline trap).
  Post-layout X-scaling — distorts text/box/orthogonality; **never**
  the emit path (admissible only for gallery-presentation, which P13's
  revert already settled). `compaction.postCompaction` — already the
  non-compacting `NONE`; changing it worsens width.

## Weighted decision matrix

Trait weights (defined here from catalyst's context; Σ = 1.0):

| Trait | W | Rationale |
|---|--:|---|
| No-regression: factcheck **contract** metrics + Phase-4 crossing count | 0.35 | catalyst's prime invariant; a width win that breaks `nodeOverlap`/`attachMerge`/`labelHit` or re-tangles edges is unacceptable |
| Fidelity gain (closes `wRatio` 0.19–0.67 → ~1.0 on the 14) | 0.25 | the objective |
| Determinism / byte-stability | 0.20 | every change ships byte-scoped; golden/byte gates |
| Architecture-fit (reuse P2 synthetic-structure, measureNode, factcheck) | 0.12 | lower risk, no new subsystem |
| Maintenance / reversibility / scope | 0.08 | small, revertible, one coherent PR each |

Scores (1–5, from the sweeps) → weighted:

| Candidate | NoReg .35 | Fid .25 | Det .20 | Arch .12 | Maint .08 | **Σ** |
|---|--:|--:|--:|--:|--:|--:|
| **C3** wrap=200 | 5 | 3 | 5 | 5 | 5 | **4.40** |
| **C2** synthetic fan/label width | 3 | 5 | 4 | 5 | 3 | **3.94** |
| **C1** BK placement | 2 | 5 | 5 | 4 | 4 | **3.65** |
| **C4** dot-parity spacing (floor) | 5 | 2 | 5 | 5 | 5 | **4.05** |

(C4 scores high but is a *floor*, not a *fix* — it cannot close the
gap; kept as a precondition, not ranked as a solution.)

## Decision

Pursue, as **separate per-candidate gated PRs in this order**, NOT a
single change:

1. **C3 first** (highest weighted, lowest risk, separable): wrap
   element text at the cited `WRAP_WIDTH = 200`. Re-measure all 20
   `wRatio`. Closes Cause C (the description-heavy majority).
2. **C2 next** (the dominant structural cause B): reserve
   parallel-fan / edge-label rank width via the P2-style synthetic
   sized-invisible structure. Per-fixture `factcheck`-gated.
3. **C1 last and ONLY if still short**, as a *spike with a hard
   crossing-budget*: try `BRANDES_KOEPF`+`BALANCED`; accept ONLY if
   `wRatio` improves **and** factcheck stays CLEAN 26/26 **and** the
   edge-crossing count does not regress beyond the Phase-4 baseline
   (measure crossings explicitly — the Phase-4 numbers in
   `LayoutEngine.mts:399-408` are the budget). If it regresses
   crossings, **do not take C1**; document NETWORK_SIMPLEX as a
   deliberate width↔crossing trade and stop at C3+C2.
4. **C4 throughout:** keep `nodesep`/`ranksep` at dot parity (already
   so) as the floor.

### BLOCKING gate — and promote the gate itself (per `derived-artifact-enforcement-gate`)

A measured fidelity axis guarded only by an **advisory** metric rotted
silently (14 fixtures shipped "CLEAN"). **Before C3**, promote a
width/height-ratio bound from advisory → a **contract** factcheck
metric, threshold **data-driven from the post-C3/C2 distribution**
(not guessed): once C3+C2 land, set the contract bound at a value the
corpus then satisfies (target: `wRatio ≥ ~0.7` and `≤ ~1.5`), with the
measured distribution committed as the justification. Thereafter every
layout PR is gated against it; this regression cannot ship "CLEAN"
again. Each candidate PR also carries the standard `make factcheck`
CLEAN 26/26 + `git worktree` byte-baseline + `make render-compare`
on a dense + sparse + parallel-fan fixture.

## Consequences

- Cross-cutting intentional geometry change (like P4b) — golden/parity
  fingerprint topology and stay green; coordinates change broadly by
  design; byte-baseline records scope.
- C1 explicitly may be **declined**: width is not worth re-tangling
  edges. The ADR sanctions stopping at C3+C2 if C1's crossing budget
  fails — that is a valid outcome, not a gap.
- The advisory→contract gate promotion is itself a deliverable, not a
  follow-up (the gate-asymmetry that let this ship is the defect class
  in memory `derived-artifact-enforcement-gate`).

## Status — premise CORRECTED; C2/C1 DECLINED (2026-05-17, fact-check)

> **The central premise of this ADR was substantially a comparator
> artefact, found by fact-checking the gate during C2 implementation.**
> Per the `factcheck-harness-gate` discipline ("distrust the gate
> before the product; fact-check every flag against an independent
> signal; measure the property in its FULL, like-for-like
> dimensionality") and the rule that a written-down ADR remediation is
> an *untested hypothesis* to re-derive and empirically verify — the
> verification disproved the hypothesis and the root-cause claim was
> corrected at the root, not laundered.

**What was wrong:** `scripts/factcheck-geometry.mjs` computed
`wRatio = C.W / P.W` with **C.W = catalyst node-box extent**
(`maxX−minX` over entity rects) but **P.W = PlantUML full SVG
`viewBox`** (title banner + page margins + fanned-label spread). Not
like-for-like. `rel-parallel-duplicate`'s PlantUML node column is 92px
(a,b @ x=195, w=92) — catalyst's is 93px — yet the 464px **title
string** inflated the viewBox to 492, giving a false `wRatio 0.19`.
The "14/20 fixtures at wRatio 0.19–0.67" that motivated this ADR was
that asymmetry, not a layout-aspect defect.

**The fix (this PR):** `parsePlantumlSvg` now derives P.W/P.H as the
PlantUML **node-box extent** — the identical quantity `factcheck()`
derives for catalyst (node-vs-node, the correct measure of "does
catalyst spread its nodes the way `dot` does" — the actual ADR
concern). The ratio ratchet baseline was regenerated against the
honest metric (legitimate — the prior baseline was built on the
proven-artefact viewBox metric; same "re-baseline justified, not
laundered" pattern as C3+D below). `make factcheck` **CLEAN 26/26**;
catalyst emit **byte-identical** to `origin/main` (0/26 fixtures
changed — `src/` untouched); new unit test
`tests/factcheck-geometry.test.mts` contract-locks the like-for-like
parse so this false-positive class cannot silently return.

**Honest corpus distribution (node-vs-node):** 0.73–1.05 — catalyst's
node layout is already faithful to `dot`. Only **one** genuine
residual: `rel-tech-vs-notech` `wRatio 0.732` (catalyst nodes 227 vs
PlantUML 310 — `dot` spreads the antiparallel `{a,c}` pair wider via
its label virtual nodes).

**C2 empirically DECLINED.** The C2 synthetic fan-width dummy node was
implemented and measured under the corrected metric: it does **not**
move `rel-tech-vs-notech` (0.732 → 0.732 — it pads canvas, not
node-extent, which the like-for-like metric correctly ignores) **and
it regresses** `c4-all-rel-variants` (0.916 → 1.121 overshoot,
`|1−w|` 0.084 → 0.121). It is the wrong lever for the only real
residual. Reverted. **C1 declined by extension** — the width premise
it addressed is the corrected artefact. The ADR explicitly sanctions
declining C2/C1 as a valid outcome; that outcome is now taken on
evidence.

**Accepted residual:** `rel-tech-vs-notech` `wRatio ≈ 0.73` — one
fixture, a modest ~27% node-spread gap from `dot`'s antiparallel
label-vnode spreading; not worth re-tangling edges (the same
cost/benefit the ADR gives for the C1 decline). Held by the ratchet
at its current value; any future narrowing fails the gate.

**Net deliverable of the C2 work:** the comparator correctness fix
(a `factcheck-harness-gate` false-positive class closed + locked),
re-baseline, and this evidence-based decline — NOT a layout change.
ADR 0011 is **effectively closed** (C3+D + step 0 shipped; C2/C1
declined on evidence).

### Status — step 0 + C3 + cause D shipped (2026-05-17)

- **Step 0** (ratio ratchet, PR #96) — merged.
- **C3** (`WRAP_WIDTH = 200`, cited C4-PlantUML `$DEFAULT_WRAP_WIDTH`)
  fixed the description-wrap-to-title-width narrowing.
- **Cause D (newly found during C3 verification, fact-observed in
  `-tsvg`):** PlantUML renders the C4 `$descr`/Name fallback at its
  DEFAULT font **14** (C4 defines no `$ELEMENT_FONT_SIZE`;
  `$STEREOTYPE_/$TECHN_FONT_SIZE = 12`) AND emits ONE blank font-14
  **spacer line between Name and description** (`&#160;` run). The P4b
  model used font 12 and no spacer ⇒ every description box ~1 line
  (~20 px) short. Fix: `PUML_FONT = {STEREO12, NAME16, TECH12,
  DESC14}` + a modelled blank spacer + the measured `16>14 / 14>14 /
  12>14` pitches (verbatim-locked, `tests/p4b-svg-geom.test`).
  Per-leaf proof: `topology-linear-chain` box 76→97 ≈ PlantUML 96.
- **Re-baseline justified, not laundered:** the pre-C3 ratchet
  baseline was a proven cramming-bug ARTIFACT (pre-C3 boxes were
  narrow+tall by the bug; `hRatio≈1` coincidental). C3+D boxes are
  proven correct per-leaf vs PlantUML, so the baseline was regenerated
  (ADR's "re-baseline after C3" plan); zero `ratioBad`, all box
  geometry CLEAN. C2/C1 ratchet it further toward true parity.
- **One real residual fixed at root, not laundered:** C3+D's correctly
  bigger `cache` box made the `c4-deployment` `api→db` "SQL" label
  clip it (`labelHit=1`). Root: the routed non-laned edge branch in
  `catalyst.mts` was the ONLY label-emit path WITHOUT an obstacle
  de-collision (laned uses `slideLabelAlongLane`, straight uses
  `resolveLabelOverlap`). Added the same `slideLabelAlongLane` safety
  net there ⇒ `make factcheck` **CLEAN 26/26**. (`make factcheck` is
  the authoritative whole-path `labelHit` contract, in the PR gate;
  the primitive is unit-tested in `edge-lanes.test`.)
- **Remaining:** C2 (synthetic fan/label rank-width — the dominant
  cause B; diagram-level ratios still need it), then C1 spike.

## Why ADR

It changes nearly every diagram's geometry, reverses/qualifies a prior
Phase-4 decision (NETWORK_SIMPLEX), and promotes a gate metric — the
"research/decision base first, implementation after" class. The
decision is fact-based (4 primary-sourced sweeps + measurement), not
aesthetic.
