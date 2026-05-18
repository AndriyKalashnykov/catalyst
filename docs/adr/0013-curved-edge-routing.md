# ADR 0013 — Curved edge routing (drop `orthogonalEdgeStyle`)

- Status: **ACCEPTED — `curved=1` proven by the committed
  self-verifying route-fidelity harness (`make routefidelity`).
  Implementation (edge-style change + gallery/arrowskew/factcheck
  re-derive) is the next scoped PR.**
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

## The decision — MEASURED (not eyeballed)

`scripts/route-fidelity.mjs` (exhaustively unit-tested,
`tests/route-fidelity.test.mts`, 44/44, incl. a validation that it
separates `dot`-splines from orthogonal dog-legs on the real
`rel-bidirectional` SVG; two of its own FP/FN classes were
found-and-fixed under distrust-the-new-gate) measures, on the REAL
rendered SVG of BOTH sides, two scale- and layout-invariant metrics —
`detour` (arclength ÷ endpoint distance) and `turn` (Σ|exterior angle|
over the RDP-simplified route) — compared as **distributions** (no
cross-engine node/coordinate matching ⇒ structurally immune to the
factcheck node-position FP class).

The verdict was produced by the **committed, self-verifying**
`make routefidelity` harness (`scripts/route-fidelity-matrix.mjs`),
NOT the throwaway `/tmp` driver attempted earlier (which produced
byte-identical garbage across styles — a poisoned restore + cached
ESM module graph; its numbers were rejected, never recorded). The
harness builds catalyst 3× cleanly, converts each style in a fresh
child process, renders every corpus + `route-stress` fixture via
PlantUML `-tsvg` AND drawio-export, and **aborts** unless the
per-style builds genuinely differentiate (R3 compiled-token check +
R4 mutual-distinctness of the representative `.drawio`). It passed
self-verification; the numbers below are trustworthy.

Corpus + `rel-self-loop` + `rel-fan-stress`, 2026-05-18. PlantUML
(`dot`-spline) target: `meanDetourExcess=0.041`, `meanTurn=0.27`
(near-straight, smooth). L1 = detourΔ + turnΔ/π (turn normalised to a
right angle); lower = more `dot`-faithful:

| edge style | meanDetourExcess | meanTurn | **L1 → PlantUML** |
|---|---|---|---|
| `orthogonalEdgeStyle` (baseline / the defect) | 0.264 | 2.767 | **1.017** |
| straight (no `edgeStyle`) | 0.200 | 2.149 | **0.757** |
| **`curved=1`** | **0.105** | **0.992** | **0.294** |
| `elbowEdgeStyle` | — | — | eliminated earlier (arrowskew 16/20) |

**`curved=1` wins decisively** — ~3.5× closer to the `dot`-spline
target than `orthogonal`, ~2.6× closer than `straight`; the ordering
`orthogonal > straight > curved` holds **independently on both**
`detour` and `turn` (robust, not a single-metric artifact), and it
matches the 3-fixture visual spike and the instrument's own
unit-tested validation. (`curved`'s `turn` 0.99 is still > PlantUML's
0.27 because catalyst splines through ELK's waypoints whereas `dot`
routes its own — closing that residual is the separate ELK→`dot`
engine question, `docs/research/elk-vs-graphviz-dot.md`, NOT this
ADR.) `segmentEdgeStyle` (orthogonal-but-honours-waypoints) is still
Manhattan — out of scope.

Decision: **`edgeStyle: 'orthogonalEdgeStyle'` → `curved: 1`.**

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
