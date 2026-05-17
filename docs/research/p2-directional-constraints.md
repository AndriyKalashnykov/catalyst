# P2 — directional placement constraints (`Rel_U/D/L/R`): research & decision base

**Status:** research synthesis + weighted decision matrix. Built from
4 parallel deep-research sweeps (Graphviz/PlantUML ground truth, ELK
0.11.1 version-exact option surface, the wider constraint-layout
ecosystem, and elkjs-internal pre/post-process strategies). Primary
sources cited inline. **No implementation** — this is the
decision/spike base the directive asked for.

## The problem

C4-PlantUML `Rel_U/D/L/R` (+ `Rel_Up/Down/Left/Right`) mean "place the
target North/South/West/East of the source and route the edge that
compass way". catalyst (elkjs 0.11.1, `org.eclipse.elk.layered`
ALWAYS, ADR 0008) currently honors this only weakly: `Rel_U/D` via
edge handling, `Rel_L/R` via `considerModelOrder` sibling sort + a
same-rank x-swap post-pass. `rel-directional` renders with the
compass partly wrong (North below the hub, West above). Tracked as
**advisory** (`rankOrder`), not a factcheck contract.

## The single most important finding (reframes the whole goal)

Both the Graphviz/PlantUML sweep and the ELK sweep independently
converged on a **fundamental geometric truth**:

> A `Rel_L/R(a,b)` relation is simultaneously (a) a **directed edge**
> the layer engine ranks *across* layers and (b) a request for
> **same-rank adjacency**. These are contradictory. **No option in
> ELK, dagre, or Graphviz/`dot` resolves it** — it is intrinsic to
> Sugiyama-family layout, not a missing feature.

And critically, from reading PlantUML's own source
(`CommandLinkClass.java`, `SvekEdge.java`, C4-PlantUML `C4.puml`):

> **PlantUML itself does NOT deterministically honor mixed U/D/L/R.**
> It is *only*: edge-endpoint inversion (`getInv()`) for U/L, `minlen`,
> plus a `{rank=same}` for length-1 (L/R) links, then `dot`'s heuristic
> crossing-minimization decides left-vs-right. No `constraint=false`,
> no `weight` tuning, no invisible edges, no `pos`/`pin`. PlantUML's
> docs explicitly disclaim it ("not what PlantUML is for", use
> "sparingly").

**Consequence for the fidelity bar:** catalyst is judged *against
PlantUML*. PlantUML has **no exact answer** for mixed compass, so
"match PlantUML pixel-for-pixel" is an ill-posed target. The
*achievable, correct* bar is: **honor each hint as a soft constraint;
be a STRICT no-op when no hint is present** (the one property
PlantUML's mechanism does have, because it is gated on the direction
keyword). This is why P2 is correctly classified *advisory*, and any
"fix" must protect the no-op property above all.

## Weighted trait matrix — methodology

Traits and weights below are the project-specific importance judgement
(catalyst is an MIT lib; elkjs-only per ADR 0008; fidelity gated by
`make factcheck` over 26 conversions; 24+ clean fixtures + golden /
parity / byte gates are sacred; output must be deterministic for those
gates). Weights sum to 1.00.

| Trait | Weight | Rationale |
|---|--:|---|
| **No-regression on no-hint graphs** | **0.30** | Highest. The clean-fixture corpus + golden/byte/factcheck gates must not move for diagrams with no directional hints. Strict-no-op-when-absent is the load-bearing property (it is the only one PlantUML's own mechanism guarantees). An approach that perturbs hint-free layout is effectively disqualified regardless of compass quality. |
| **Directional fidelity (4-way honored)** | **0.22** | The actual goal — but the bar is *soft-constraint* honoring, not pixel-match (PlantUML itself is heuristic here), so weighted high yet below no-regression. |
| **Determinism / byte-stability** | **0.18** | golden/parity/byte + factcheck gates assume deterministic output. Seed-sensitive or RNG layout breaks the gate model. |
| **Integration fit (elkjs-only, ADR 0008, keep NETWORK_SIMPLEX)** | **0.15** | ADR 0008 mandates always-`layered` single-engine. Swapping the engine, or replacing ELK's layering pipeline (losing the regression-validated `NETWORK_SIMPLEX` posture), is a major architectural cost penalised here. |
| **Implementation simplicity / maintenance** | **0.10** | Small MIT project. A dormant dep (WebCola, last release 2018) or "build your own layout objective" (kiwi) is a long-term liability. |
| **Conflict handling (mixed/contradictory `Rel_L`+`Rel_R`)** | **0.05** | C4 inputs can conflict; graceful defined behaviour matters but affects a minority of diagrams. |

Scoring: each candidate 1–5 per trait (5 best); weighted score =
Σ(weight × score). Scores from the four sweeps' version-exact,
primary-sourced ratings (not opinion).

## Candidates & scores

Scores fold in the 4th sweep, which ran **empirical probes against the
installed elkjs 0.11.1** (not docs alone) — version-exact ground truth.

| # | Candidate | NoRegr (.30) | DirFid (.22) | Determ (.18) | IntegFit (.15) | Simpl (.10) | Conflict (.05) | **Weighted** |
|---|---|--:|--:|--:|--:|--:|--:|--:|
| **A** | **Invisible co-rank edges** (synthesize hidden edges: U=reversed, D=forward, **L/R = invisible edge from target to a shared successor / 1×1 phantom sink** so ELK co-ranks them; child-array model order gives left→centre→right). *Empirically reproduced the full `rel-directional` compass exactly in elkjs 0.11.1; non-directional graphs byte-identical.* | 4 | 5 | 5 | 5 | 4 | 5 | **4.60** |
| — | U/D only via reversed ranking edge (the already-done half; A's superset) | 5 | 3¹ | 5 | 5 | 5 | 4 | **4.32** |
| St | **Status quo** (`considerModelOrder` + same-rank x-swap post-pass) | 5 | 2 | 5 | 5 | 4 | 3 | **4.04** |
| B′ | ELK `inLayerSuccOf`/`inLayerPredOf` (hard same-rank E/W, `greedySwitch=OFF`) — *probes show inert until nodes already co-ranked → a refinement on A, not standalone* | 4 | 3 | 4 | 4 | 3 | 3 | **3.63** |
| F | cytoscape-fcose `relativePlacementConstraint` | 3 | 5 | 4 | 2 | 3 | 2 | **3.43** |
| G | kiwi.js/Cassowary custom LP positioning | 2 | 5 | 5 | 2 | 1 | 5 | **3.35** |
| E | WebCola positioning pass → ELK fixed coords | 3 | 5 | 3 | 2 | 3 | 2 | **3.29** |
| C | ELK full interactive + computed seed coords (2-pass) — *probes: INTERACTIVE fixes in-layer order only, NOT layer assignment → does not solve E/W* | 2 | 4 | 4 | 2 | 2 | 3 | **2.79** |
| Po | Post-process subtree reflection/rotation — *breaks the just-fixed edge routing/cram work* | 1 | 2 | 3 | 3 | 2 | 2 | **1.96** |
| D | ELK partitioning / layerConstraint / non-layered | 2 | 1 | 4 | 2 | 3 | 2 | **2.13** |

¹ U/D-only solves N/S fully but is half the compass by construction.

### Reading the matrix (final)

- **A wins decisively (4.60)** and — uniquely — was *empirically
  proven to work in the exact elkjs version* by the 4th sweep's
  probes: full `rel-directional` N/S/E/W reproduced exactly; mixed and
  conflicting cases deterministic (first-seen); **non-directional
  graphs byte-identical** (so the 0.30 no-regression weight is
  *satisfied, not traded away* — A is naturally scoped: no directional
  rel ⇒ no synthetic edge ⇒ identical output). It reuses the existing
  `lay<i>` invisible-edge plumbing → low complexity, pure ADR-0008
  (one engine, deterministic, no solver, no post-process re-route).
- **Root-cause insight that makes A correct where the status quo
  fails:** E/W is fundamentally a **layer-assignment** problem (get
  the target onto the source's rank), NOT an in-layer-ordering problem.
  The status quo / `inLayerSuccOf` / INTERACTIVE all only reorder
  *within an already-assigned layer* — they cannot *put* the E/W
  target on the source's rank. A's co-rank edge does exactly that.
- External engines (E/F/G) and full-interactive (C) lose on the
  no-regression / integration / determinism weight (0.63 of total) —
  all need conflict pre-resolution + seeded determinism + produce a
  different aesthetic (whole-corpus golden/byte/factcheck churn). Ruled
  out. Post-process reflection (Po) is worst — it breaks the P1/P7
  edge-routing work just shipped.
- A's only honest residual risk: a `Rel_L/R` target that is *also* a
  load-bearing node in a deep hierarchy (the co-rank edge could fight
  an existing strong rank). Probes were synthetic; the real 26-fixture
  byte-scope is the gate that surfaces this.

## Decision

**Implement A** (invisible co-rank edges) with E's implicit scoping
(no synthetic edge unless a directional rel exists) and D as an
*optional* refinement only if a fixture needs intra-layer tidy-up.
This is *not* "don't chase the compass" (my pre-probe lean) — the 4th
sweep's empirical evidence shows the compass **can** be done
correctly, deterministically, in-engine, low-risk. Per the directive
("if it can be done we need to do it"), proceed to spike A.

P2's factcheck status stays **advisory** (`rankOrder`) — A improves
fidelity but the matrix must not become a contract that fails on
PlantUML's own heuristic mixed-compass output.

## Spike protocol (the next executable step)

1. Branch `spike/p2-compass-corank-edges` from fresh `origin/main`.
2. `LayoutEngine.buildGraph()`: for each rel with `direction∈{L,R}`,
   synthesize an invisible edge `cmp<i>` from `r.target` to a shared
   real successor of `r.source`; if none, lazily create ONE 1×1
   phantom `__cmp_sink_<source>` and route `source`+`target` to it.
   U/D path unchanged (reversal already works). Keep the existing
   `applyHorizontalOrder` child-array `[w,source,e]` order.
3. Exclude `cmp<i>` / `__cmp_sink_*` from emit (extend the
   `/^(rel|lay)\d+$/` filter) and recompute `LayoutResult.width/height`
   from REAL nodes only (probes proved the phantom inflates the bbox).
4. **Gate, in order:** (a) **byte-scope** — the ~20 non-directional
   fixtures MUST stay byte-identical vs `origin/main` (worktree
   baseline diff; the scoping guarantee); only directional fixtures
   may change. (b) `make factcheck` CLEAN 26/26 — focus
   `rel-directional`, `c4-all-rel-variants` (`Rel_U/D/L/R` +
   `Rel_Up/Down/...` rows); `arrowBad/labelDrop/attachMerge`=0.
   (c) `make render-compare RENDER_SRC=tests/fixtures/corpus/rel-directional.puml`
   — visually confirm N↑ S↓ W← E→ matches the PlantUML `.puml.png`
   (#19 fidelity target). (d) unit tests for the edge-synthesis +
   phantom-strip + bbox-recompute (pure functions).
5. If a hierarchical fixture's bytes move (the residual risk), tighten
   A's scope per E (only synthesize within the directional component)
   before proceeding. Do NOT pursue B/C/E/F/G/Po — primary sources +
   probes rule them out.

## Sources

Graphviz/PlantUML: C4-PlantUML `C4.puml`, PlantUML `CommandLinkClass.java`
/ `SvekEdge.java` / `CucaDiagramFileMakerSmetana.java` (github), Graphviz
attr docs (rankdir/rank/minlen/weight/constraint/pos/pin). ELK: elkjs
0.11.1 `knownLayoutOptions()` + empirical probes + ELK reference + the
v0.11.0 source tag (`SemiInteractiveCrossMinProcessor.java`,
`InteractiveLayerer.java`). Ecosystem: WebCola, cytoscape-fcose,
@lume/kiwi, IPSep-CoLa (Dwyer/Koren/Marriott 2006), "Scalable Versatile
Simple Constrained Graph Layout" (Dwyer 2009). Full URLs in the
research agents' transcripts.
