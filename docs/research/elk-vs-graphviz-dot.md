# Research / decision base — ELK (`elkjs`) vs Graphviz `dot` as catalyst's layout engine

- Status: **RESEARCH ONLY — not scheduled, not an ADR.** A deliberate
  bet to be taken (or declined) on evidence later. Strong prior: if
  pursued it is almost certainly a **new, independent repository**, not
  an in-place engine swap (rationale below).
- Date: 2026-05-18
- Companion to the connector-fidelity ADR (curved edge routing), which
  is the cheap 80/20 and is independent of this decision.
- Method: the portfolio "how is this class of problem solved in
  general" craft — candidate enumeration → weighted trait matrix →
  spike the ranked winner. This document is the decision base; it does
  **not** implement anything.

## Problem statement

catalyst's north star is **fidelity to PlantUML's C4 rendering**. The
factcheck gate judges every conversion against PlantUML `-tsvg`.
**PlantUML renders C4 via Graphviz `dot`** (layout + spline edge
routing in one engine). catalyst instead uses `elkjs` (`layered`) for
node placement, then hands geometry hints to draw.io, whose
`orthogonalEdgeStyle` router does the actual edge routing.

The accumulated ADR history is, in effect, **catalyst repeatedly tuning
ELK to imitate `dot`**:

| ADR / item | What it did | The tell |
|---|---|---|
| 0005 → 0008 | Context `force`/`stress` → `layered` | "to match PlantUML / `dot`" |
| 0009 | `cycleBreaking=DEPTH_FIRST` | "= `dot` 2-cycle compaction" |
| 0011 + P2 | aspect / directional-constraint fidelity | closing measured gaps vs the `dot` oracle |
| connector ADR | drop `orthogonalEdgeStyle` → curved | approximate `dot` splines |

Each is a local correction of the same global impedance mismatch:
**the oracle is `dot`; the engine is not.** The natural question:
should catalyst just *use* `dot`?

## The two architectures

- **PlantUML / `dot`:** one engine does ranked layout **and** spline
  edge routing; edge labels placed along the spline. Diagonal/curved
  connectors, no right-angle constraint.
- **catalyst:** `elkjs` (`layered`) places nodes + emits waypoints →
  catalyst maps to draw.io geometry → draw.io's `orthogonalEdgeStyle`
  router *re-routes* (largely discarding ELK's waypoints — the #107/B1
  finding). Two stages; the render stage forces Manhattan.

## Candidates

| # | Candidate | Essence |
|---|---|---|
| A | **Status quo `elkjs` + connector ADR** | Keep ELK; fix the *routing look* with `curved=1` (the cheap, independent win). No engine change. |
| B | `elkjs` + dot-imitating post-process | Continue the ADR-0008/0011/P2 trajectory: more ELK options + post-passes to approximate `dot`. |
| C | **`@hpcc-js/wasm-graphviz`** | Replace ELK with WASM Graphviz. Same `dot` engine PlantUML uses, in-process, browser+node, npm-installable. |
| D | Shell to native `dot` binary | Rejected up front: breaks the pure-JS, git/npm-consumed, deterministic distribution contract (downstream puml2drawio → ibm-wm). Not evaluated further. |

## Weighted trait matrix

Weights reflect catalyst's *actual* constraints (downstream is a
pinned git/npm dependency; the product's whole value is oracle
fidelity). Σw = 1.00. Score 1–5 (5 = best). Scores are arguments to
be confirmed by spike, not measurements yet.

| Trait (weight — rationale) | A: ELK+ADR | B: ELK+post | C: wasm-dot |
|---|---|---|---|
| **Oracle/layout fidelity** (0.34 — the product's reason to exist; the ADR trail is all this) | 3 | 3 | **5** |
| **Determinism / version-portability** (0.20 — we *just* abandoned PlantUML-font portability for this exact class) | **5** | **5** | 2 |
| **Distribution: pure-JS, browser+node, git/npm-consumed** (0.16) | **5** | **5** | 3 |
| **Rewrite cost / risk** (0.14 — inverse; 5 = cheap/safe) | **5** | 4 | 1 |
| **Maintenance surface** (0.08) | 4 | 3 | 3 |
| **Bundle size / startup** (0.05) | **5** | **5** | 2 |
| **Sequence-diagram coverage** (0.03 — ADR 0007 is non-ELK already; engine-agnostic) | 3 | 3 | 3 |
| **Weighted score** | **4.19** | 3.96 | **3.49** |

Interpretation — the matrix is **not** a verdict to "stay on ELK
forever"; it says:

- **A (status-quo + connector ADR) wins on the weighted total** purely
  because fidelity is only 0.34 and C is heavily penalised on the
  three constraints that nearly sank this very session
  (determinism/version-portability, distribution, rewrite risk).
- **C (wasm-`dot`) wins the single most important trait outright (5
  vs 3 on fidelity).** If catalyst were greenfield, C is the obvious
  architecture — it makes the factcheck oracle agree *by
  construction* (you are rendering with the oracle's own engine).
- The gap between A and C is "accumulated sunk cost + risk," not
  "ELK is better." That is precisely the signal that C belongs in a
  **new repo**, not an in-place swap (see below).

## Why a new repo, not an in-place swap (the strong prior)

> **SUPERSEDED (2026-05-18, user decision).** This "new repo" prior is
> overridden: item 1a is now executed **in this repo** on a long-lived
> flag-gated branch — authoritative plan:
> **`dot-engine-swap-plan.md`** + CLAUDE.md item 1a. Its guardrails
> (flag-gated dual-engine, full instrument-suite acceptance, per-phase
> byte-baseline, determinism as a P0 hard gate) replace "separate
> repo" as the risk control. Section retained as original
> rationale/context only, not the active decision.

Swapping ELK→`dot` in catalyst is not a module change; it is a
different product:

1. **The entire `src/layout/*` stack is ELK-shaped** — graph
   construction, `measureNode`, the lane machinery (`assignEdgeLanes`,
   `slideLabelAlongLane`, `enforceApproachClearance`). `dot` emits
   positioned nodes + spline control points (xdot/JSON); the
   consumption model is unrelated.
2. **Every gate re-baselines** — factcheck, arrowskew, gallery,
   golden, and ~6 ELK-predicated ADRs (0005/0006/0008/0009/0011/P2)
   are superseded *en masse*. That is not an ADR; it is an ADR
   graveyard.
3. **New version-coupling risk, same class we just declined.** This
   session abandoned Docker-pinning factcheck because PlantUML text
   geometry is renderer-version/font-dependent. Graphviz `dot` layout
   is **also** version/build-sensitive. Adopting `dot` re-introduces
   exactly the "engine version → output → re-baseline everything"
   coupling — manageable with a Renovate-pinned `@hpcc-js/wasm-graphviz`,
   but it is the same dragon, not a slain one.
4. **Conceptual cleanliness.** "Render the C4 PlantUML via its own
   `dot`, capture geometry, emit draw.io" is arguably the *most*
   faithful converter possible — but it is a from-scratch design
   (`catalyst-dot`?), free of the ELK-era gate/ADR weight, where the
   fidelity oracle and the engine are the same thing by construction.
   Building it beside catalyst (not inside it) keeps catalyst stable
   for its downstream consumers while the bet is proven.

## Recommendation

1. **Now (independent, high-ROI):** ship the connector-fidelity ADR
   (`curved=1`, drop `orthogonalEdgeStyle`). It captures ~90% of the
   *visible* routing ugliness with zero engine change — proven by the
   2026-05-18 spike (`rel-bidirectional`, `rel-parallel-duplicate`
   dramatically better; `topology-linear-chain` no common-case
   regression). This is candidate A and does not depend on this doc.
2. **Later (deliberate bet, likely a new repo):** if layout fidelity
   (node placement / crossings / aspect — the ADR-0008/0011/P2 prize,
   *not* connectors) remains the dominant residual after the connector
   ADR, open a greenfield `@hpcc-js/wasm-graphviz`→draw.io spike **as
   its own repository**. Gate the spike on: (a) determinism across
   pinned wasm-graphviz versions (the portability test we now know to
   run *first*), (b) bundle/startup acceptable for browser consumers,
   (c) a fidelity comparator showing it beats post-connector-ADR
   catalyst on the same factcheck-class metrics by a margin that
   justifies a second product.

## Spike protocol (if/when pursued)

Per the portfolio craft, before any code:

1. Pin `@hpcc-js/wasm-graphviz` (Renovate `npm`); render the 26-fixture
   corpus' C4 to `dot` JSON; **first** verify byte-determinism across
   two pinned wasm versions on two machines (the test this session
   taught us to front-load).
2. Build a `dot`-JSON→draw.io emitter for ONE fixture; compare to the
   PlantUML `-tsvg` oracle with the existing factcheck comparator
   (extended, not forked).
3. Only if (1) holds and (2) beats post-connector-ADR catalyst on the
   fidelity matrix: commit a decision ADR **in the new repo** and
   proceed there. catalyst itself is not modified by this track.

## Status sources

- ADR trail: `docs/adr/0005,0006,0008,0009,0011`; `docs/research/p2-directional-constraints.md`, `layout-readability.md`.
- Connector spike evidence: 2026-05-18 session (this doc's sibling ADR).
- Portability-class precedent (why determinism is weighted 0.20):
  the factcheck Docker-pin negative result, same session
  (`open-followups` item 4, memory `factcheck-harness-gate`).
