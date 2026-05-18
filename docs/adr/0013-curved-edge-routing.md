# ADR 0013 — Curved edge routing (drop `orthogonalEdgeStyle`)

- Status: **PROPOSED — instrument landed; corpus-wide verdict PENDING
  the committed route-fidelity harness run. Do NOT implement the
  edge-style change until the gate proves it.**
- Date: 2026-05-18
- Decision record for the user-reported `rel-bidirectional` connector
  defect ("connectors are clusterfucked"). Companion to
  `docs/research/elk-vs-graphviz-dot.md` (the larger engine question;
  this ADR is the cheap, independent 80/20 and does not depend on it).

## Context — the measured problem

catalyst emits every relationship with a hardcoded
`edgeStyle: 'orthogonalEdgeStyle'` (`src/mx/c4/Relationship.mts`).
draw.io's orthogonal router then **re-routes** every edge as Manhattan
right-angles, largely discarding ELK's emitted waypoints (the #107/B1
finding: the redundant bends are draw.io-router-owned). PlantUML's C4
renders via Graphviz `dot`, which routes edges as **splines**. On any
multi-edge node the two diverge sharply (`rel-bidirectional`: orthogonal
feeders stack at one border, arrowheads bunch, the label collides with
the elbow junction; `rel-parallel-duplicate`: parallel fan as
overlapping dog-legs). This is a routing-look defect, not a layout
defect — node placement is unchanged; ELK is not at fault, the forced
`orthogonalEdgeStyle` render is.

## Proposed direction

Drop `edgeStyle: 'orthogonalEdgeStyle'` and emit `curved: 1` (draw.io
then splines through the ELK waypoints — the `dot`-spline analogue).
One-line style change; node placement, ELK layout, the lane machinery
and all emitted geometry are unchanged — only draw.io's render of the
same points changes from right-angle to spline.

## Why this is not yet "accepted" — the decision must be PROVEN

A 2026-05-18 spike (3 fixtures, eyeballed) made `curved=1` the
**favourite**, and arrowskew (render-truth, all 20) showed
`orthogonal`/`straight`/`curved` all CLEAN 20/20 (eliminating only
`elbowEdgeStyle`, 16/20) and factcheck is edge-style-invariant (proven
byte-identical). But neither of those measures the *central* claim —
"curved is closer to PlantUML's routing." factcheck reconstructs
*emitted* points (edge-style-blind, the #107 lesson); arrowskew proves
render-*safety*, not fidelity. Per the project's NO-EYEBALL discipline
the spike is a hypothesis, not a decision.

The decision will be made by **`scripts/route-fidelity.mjs`** (landed
with this ADR, exhaustively unit-tested in
`tests/route-fidelity.test.mts`, 44/44, incl. a validation that it
separates `dot`-splines from orthogonal dog-legs on the real
`rel-bidirectional` SVG, and two of its own false-positive classes
already found-and-fixed under the distrust-the-new-gate rule). It
measures, on the REAL rendered SVG of BOTH sides, two scale- and
layout-invariant metrics — `detour` (arclength ÷ endpoint distance)
and `turn` (Σ|exterior angle| over the RDP-simplified route) —
compared as **distributions** (no cross-engine node/coordinate
matching, structurally immune to the factcheck FP class). The decision
metric is L1 distance of each catalyst edge-style's corpus-wide
(detour, turn) distribution to PlantUML's.

**This ADR is accepted ONLY when the committed route-fidelity harness
(a `make`-target gate, NOT a throwaway script — the per-style driver
attempted 2026-05-18 was an unreliable `/tmp` script and produced
garbage; its numbers are explicitly NOT recorded here) reports, over
the corpus (extended with the `rel-self-loop` + `rel-fan-stress`
connector-stress fixtures), that `curved=1` is closest to the PlantUML
target AND does not regress the common/straight case AND holds
arrowskew CLEAN 20/20.** Until then `edgeStyle: 'orthogonalEdgeStyle'`
stays.

## Candidates (decided by the harness, not asserted here)

`orthogonalEdgeStyle` (baseline / the defect) · straight (no
`edgeStyle`) · **`curved=1`** (the favourite) · `elbowEdgeStyle`
(already eliminated: arrowskew 16/20). `segmentEdgeStyle`
(orthogonal-but-honours-waypoints) noted for completeness — not
PlantUML-faithful (still Manhattan), out of scope.

## Blast radius & gates (for the implementing PR, once proven)

| Artifact | Effect | Action |
|---|---|---|
| `docs/gallery/*` | every edge's style + render changes | `make gallery` + commit the refresh in the SAME PR (#93 drift gate; a derived artifact). |
| `arrowskew` | render changes | must stay CLEAN 20/20 (spike: it does for curved). |
| `factcheck` | edge-style-invariant | un-regressed (proven byte-identical). |
| `golden` | fingerprints topology + `fillColor/strokeColor/fontColor/dashed` only — NOT `edgeStyle`/`curved` | style-agnostic ⇒ no drift (verified). |
| corpus-stress fixtures | `rel-self-loop`, `rel-fan-stress` added | regenerate gallery + factcheck ratio baseline entries for them in the implementing PR. |

Lane machinery is intentionally **kept** (curved-through-lane-points
read well in the spike); simplifying the orthogonal-era lane code is a
possible later refactor, explicitly out of scope.

## Consequences (if/when proven & implemented)

catalyst connectors become `dot`-spline-faithful; the
`rel-bidirectional`/`rel-parallel-duplicate` tangled-connector class
is closed at the routing-style level; the `Relationship.mts`
"orthogonal … matches PlantUML routing" comment is corrected;
arrowskew remains the deterministic CI render-truth contract,
unaffected. The larger "should catalyst use `dot` for *layout*"
question is NOT answered here — see
`docs/research/elk-vs-graphviz-dot.md`.
