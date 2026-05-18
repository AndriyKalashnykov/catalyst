# Research / decision base — layout readability ("not crammed, professional")

- Status: **decision base** — research-grounded backlog; implement
  per-item via spike → `make factcheck` gate → byte-scope → PR.
  No layout code changed by this doc (methodology: ship the decision
  base as a committed doc BEFORE implementing).
- Date: 2026-05-17
- Trigger: user request — "regenerate gallery, review each pair, make
  it not crammed / easy to read / visually appealing / professional;
  research how the community improves automated layouts."
- ⚠️ Correction (2026-05-18): this doc was authored alongside PR #107
  (perpendicular port-stub), which was subsequently **REVERTED as a
  false-green** (it changed emitted waypoints that draw.io's universal
  `orthogonalEdgeStyle` router discards — a render no-op; the
  arrowhead is still skewed). The #107-specific claims below are
  struck/annotated. The **research findings (ELK / community / the
  fact-checks) are independent of #107 and remain valid.**
- Method: two parallel primary-sourced research sweeps (ELK option
  tuning; community craft + graph-drawing literature) + a gallery
  visual review, **each agent claim fact-checked against the code and
  the PlantUML ground truth** before acceptance (per
  `agents.md` "a research agent's recipe is scoped to its probe" and
  `factcheck-harness-gate` "distrust the gate, cite a number").

## Gallery visual review

⚠️ The earlier claim here ("PR #107 produced visible improvement:
arrowheads now enter boxes head-on") was **FALSE** — it eyeballed a
PNG that was a render no-op vs the pre-#107 output (pre/post/committed
`topology-cyclic.drawio.png` byte-identical, `md5 1e061af…`). The
arrowhead skew is **still open** (redo per CLAUDE.md ▶▶ item 0). The
non-arrowhead readability residuals below stand on their own.

Residuals (aesthetic, NOT contract failures — factcheck is CLEAN):

| # | Fixture(s) | Observation | Faithful to PlantUML? |
|---|---|---|---|
| R1 | `edge-large-graph`, `topology-deep-nesting` | Tall, narrow single-column ribbon; left-side whitespace | **YES** — the `.puml.png` is equally tall (30-node mostly-linear chain). Per ADR 0008/0011 fidelity to `dot` is the target and is met. NOT a defect. |
| R2 | ~~`rel-parallel-duplicate` laned-fan "shepherd's-crook" hook~~ | **VOID** — was a #107 artefact; #107 reverted (render no-op, never shipped) | n/a |
| R3 | `topology-deep-nesting` | Edge labels (`operates`/`delegates`) sit on boundary-container borders | partial — crowding, not overlap of a leaf |

## Fact-checks that changed the conclusion (load-bearing)

1. **ELK sweep's central premise was FALSE.** It claimed catalyst runs
   ELK's bare default spacing (`nodeNode=20`, `nodeNodeBetweenLayers=20`)
   "entirely unmanaged" → crammed. **Verified against the call site
   (`src/catalyst.mts:501,515,505`): catalyst already sets
   `nodesep:50` → `elk.spacing.nodeNode=50`, `ranksep:36` →
   `elk.layered.spacing.nodeNodeBetweenLayers=36`,
   `edgesep:10`.** The agent inspected `LayoutEngine.mts` (which only
   *maps* caller options) and missed the caller's defaults. The
   community sweep independently establishes 50/50 is the
   dagre/Mermaid polished-tool band and Graphviz `dot`'s floor is
   ~18/36 — so catalyst spacing is **already at/above the generic
   polished band**, not bare defaults. "Raise spacing because it's
   unmanaged" is therefore void.
2. **The "tall/crammed" complaint is largely PlantUML-faithful.**
   `edge-large-graph.puml.png` is itself a tall ribbon (R1). ADR 0011
   already closed the layout-aspect question: catalyst node-extent
   ratios are 0.73–1.05 vs `dot` (faithful); the earlier "0.19–0.67"
   was a comparator artefact. Making catalyst *less* tall than
   PlantUML would *reduce* fidelity — a tension to surface, not force.
3. **Structurizr's 300px separation is an outlier, not a target.**
   The community sweep cites it; but catalyst's fidelity target is
   Graphviz `dot` (ADR 0008), not Structurizr. 300px would massively
   bloat the canvas and break the `ratioBad` ratchet against `dot`.
   Declined.

## Decision matrix (survivors, weighted for THIS project)

Weights (rationale): **fidelity-safe** 0.35 (ADR 0008/0011 — must not
regress `dot` parity / `ratioBad`), **deterministic** 0.25 (byte-gates,
no runtime optimisation), **value/impact** 0.25 (the user's
readability ask), **effort** 0.15 (low = better). Score 1–5; weighted
Σ; ranked.

| Candidate | fid | det | val | eff | Σ | Verdict |
|---|----|----|----|----|----|---|
| **B1 Edge-straightening / bend-reduction post-pass** (collapse interior bends within ε of the chord; never move endpoints) | 5 | 5 | 5 | 3 | **4.70** | **Top — pursue first.** Ware 2002: continuity is the most-neglected high-impact comprehension factor; Purchase 1997: bends rank #2 after crossings. Caveat: catalyst edges are `orthogonalEdgeStyle` (draw.io re-routes) — a post-pass on emitted waypoints may be a render no-op (the #107 lesson); validate against the drawio-export SVG, not emitted points. |
| B2 Whitespace-trim (crop to content bbox + uniform ~50px margin) | 5 | 5 | 3 | 4 | 4.50 | Pursue. Deterministic, no C4 conflict; addresses R1 left-whitespace without touching layout topology. Verify it does not fight the title band. |
| B3 New factcheck metrics: path-continuity (ratcheted contract, like `ratioBad`) + edge-length-uniformity (**advisory** — two valid layouts legitimately differ) | 5 | 5 | 3 | 3 | 4.30 | Pursue alongside B1 (it is B1's gate — instrument before/with the fix, per the build-the-instrument rule). |
| B4 `contentAlignment=[H_CENTER,V_TOP]` on boundary compounds | 4 | 5 | 2 | 5 | 4.15 | Low-risk nesting polish for R3; spike-gated. |
| B5 Confirm `measureNode` internal text padding ≥ ~15px (not 0) | 5 | 5 | 2 | 4 | 4.30 | Quick correctness check; likely already satisfied by ADR 0010 content-fit — verify, don't assume. |
| B6 Make `elk.aspectRatio` explicit (currently silent ELK default 1.6) | 3 | 4 | 2 | 4 | 3.25 | **Low priority.** Soft target (ELK honest caveat); NOT in the graph-drawing comprehension literature (community sweep) — aesthetic only; ADR 0011 says layout already faithful. Only as a tunable-knob cleanup, not a quality fix. |

**Declined / closed (record so they are not re-litigated):**
`compaction.*` (tightens — wrong direction); `layered.mergeEdges`
(collapses `assignEdgeLanes` fans / P12); `layered.wrapping.*` (ADR
0008 — flattens normal graphs); raise spacing to Structurizr 300px
(bloat; fidelity target is `dot`); **global uniform node sizing**
(P13 already reverted #94 — the community/graph-drawing literature
confirms uniform sizing trades whitespace for rhythm, net loss for
variable-label C4; if ever revisited, per-element-type only, never
global); switching `nodePlacement`/`cycleBreaking` (evidence-backed in
code — ADR 0009).

## Spike protocol (per candidate, before any PR)

1. Implement behind the existing emit path; **`make factcheck` must
   stay CLEAN 26/26** (no contract regression — `arrowSkew`,
   `labelHit`, `nodeOverlap`, `ratioBad`, … all 0).
2. **Byte-scope worktree diff vs fresh `origin/main`** — only the
   intended fixtures change; node geometry invariant unless the
   candidate is explicitly a node-layout change.
3. Re-baseline `tests/factcheck-ratio-baseline.json` only if the
   candidate intentionally moves node-extent ratios (B1/B2 should NOT;
   B4/B6 might — ratchet only tightens toward `dot`).
4. Unit-test the pure post-pass (B1: "interior bend within ε of chord
   collapses; endpoint never moves"; the construction proof).
5. `make gallery` + commit the refreshed gallery in the SAME PR
   (#93 drift gate). Visual review corroborative only — cite factcheck
   numbers, never a PNG eyeball.
6. One coherent change = one PR; no auto-merge (explicit squash).

## Primary sources (for the implementer)

- Purchase 1997, *Which aesthetic has the greatest effect on human
  understanding?* — crossings ≫ bends > symmetry; orthogonal-grid
  alignment not significant.
- Ware, Purchase, Colpoys & McGill 2002, *Cognitive Measurements of
  Graph Aesthetics* — **path continuity is the most-neglected
  high-impact factor** after path length; basis for B1.
- Purchase 2002, *Metrics for Graph Drawing Aesthetics* — formal
  computable metrics; basis for B3 (edge-length uniformity, continuity).
- ELK reference `https://eclipse.dev/elk/reference/` — `aspectRatio`
  (layered default 1.6, soft target — B6), `contentAlignment` (B4),
  `spacing.*` semantics (confirms catalyst's 50/36 is managed).
- Structurizr auto-layout docs (300px separation — context for why it
  is an outlier, not a target); dagre/Mermaid/D2 defaults (50/50,
  ~50px frame padding — basis for B2 margin).

See `docs/adr/0008`, `docs/adr/0011` (fidelity target = `dot`),
`docs/adr/0012` (M2M completeness-first methodology), memory
`factcheck-harness-gate`.
