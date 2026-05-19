# Item 1a — ELK → Graphviz-`dot` engine swap: detailed in-repo plan

> **Decision override (2026-05-18, user):** do this **IN THIS repo**,
> not a new repo. This SUPERSEDES the "Why a new repo, not an in-place
> swap" prior in `elk-vs-graphviz-dot.md` §"Why a new repo". Rationale
> for the override: three in-place *lane-tweak* attempts were
> disproved (`edge-crossing-minimization.md`), proving the fix needs
> to own routing end-to-end — but a **deliberate, flag-gated,
> long-lived feature-branch** engine swap guarded by the existing
> instrument suite is categorically different from the ad-hoc in-place
> tweaks the old prior warned against. The guardrails below replace
> "separate repo" as the risk control.

## Goal & success criterion

Replace the elkjs `layered` layout+routing with Graphviz `dot` (the
engine PlantUML itself uses) so catalyst's geometry matches the
PlantUML reference. **Acceptance = the existing gates, under `dot`:**

- `make edgecross` **30 → 0** (the ratchet's target; the whole reason
  for 1a).
- `make routefidelity` catalyst↔PlantUML distance → ≈parity (ADR 0013
  metric; `dot` vs `dot` should be near-identical).
- `make factcheck` contract-clean for ≥ the current 26/28 (no
  entity/rel/label/arrow regressions; ratchet re-baselined for the
  legitimately-changed node extents).
- `corpus-sanity` / `parity` / `spec-coverage` / `output-correctness`
  all green (no drops, no orphan/reversed edges, completeness
  invariant holds).
- `gallery-verify` / `seq-gallery-verify` / `c4feat-gallery-verify`
  regenerated + committed.
- ADR 0014 written, **superseding ADR 0008** (Context→layered) and
  **ADR 0011** (layout-aspect ratchet — `dot` owns aspect now).

Non-negotiable: ELK stays the DEFAULT and the swap stays behind a
flag until EVERY gate above is green under `dot`. No fake-green, no
fixture exclusion, no contract→advisory downgrade.

## Engine choice (Phase 0 spike decides — do not pre-commit)

| Candidate | Pro | Con / risk |
|---|---|---|
| **`@hpcc-js/wasm` (Graphviz wasm)** | No system dep at runtime; version-pinnable in `package.json` (deterministic across CI/host — the byte-gate requirement); maintained | wasm bundle size; verify `xdot`/`json` output determinism across the pinned version |
| System `dot` (graphviz 2.43, already a `setup.sh` dep) | Already present for the render path | Host-version variance breaks the byte-exact `gallery-verify` (the exact reason `factcheck` is host-manual) — **likely disqualifying for a CI drift gate** |
| `viz.js` (legacy) | — | Unmaintained; older Graphviz; rejected |

Phase-0 spike output = a committed addendum here: chosen engine +
**proven output determinism** (same input → byte-identical `dot`
output, pinned) + CI portability evidence. The byte-gate concern is
the dominant selection trait (same weighting as
`edge-crossing-minimization.md`).

## Phased plan (each phase: gate-green before the next; long-lived branch `feat/dot-engine`)

- **P0 — engine spike & determinism proof.** Pick the engine; prove
  deterministic, pinned, CI-portable `dot` invocation; smallest
  end-to-end (one fixture puml → dot graph → positions → drawio).
- **P1 — C4→dot graph emitter.** catalyst already parses C4 →
  entities/relations (untouched). New `src/layout/DotLayout.mts`:
  emit a `dot` graph preserving semantics — ranks (TB), `cluster_*`
  subgraphs for `*_Boundary`/`Deployment_Node` nesting, node `width`/
  `height` fed from the existing ADR-0010 `measureNode` content-fit
  boxes (dot must not resize — `fixedsize=true`, sizes in inches via
  the measured px), edge order preserved, `dir`/arrowheads per C4
  rel kind. Determinism: stable node/edge declaration order.
- **P2 — dot output → `LayoutResult` adapter.** Run dot with
  `-Tjson`/`xdot`; parse node positions + **spline control points**
  (the routes that yield 0 crossings) + cluster boxes; map to
  catalyst's existing `LayoutResult` shape (so `layoutData2mx`
  downstream is reused, not rewritten). Coordinate-space transform
  (dot's bottom-left origin → catalyst top-left absolute).
- **P3 — routing.** Emit dot's spline routes as draw.io edges
  (`curved=1`, control points → waypoint Array) **measured on the
  rendered SVG, not emitted points** (the standing rule). The proven
  `assignPortOrder` (`edgeLanes.mts`, unit-tested,
  `build/portorder-models/`) is the reusable port-attach building
  block where dot port positions need mapping to mxGraph
  `exitX/entryX`.
- **P4 — flag + dual-engine.** `LAYOUT_ENGINE=elk|dot` (env, default
  `elk`). Both paths build & test. CI runs the suite under BOTH until
  parity; `make edgecross`/`routefidelity` reported per-engine.
- **P5 — parity & re-baseline.** Under `dot`: drive `edgecross`→0;
  re-capture golden/parity/factcheck-ratio/gallery baselines (node
  positions legitimately change — this is a sanctioned baseline
  reset, NOT a fake-green: every CONTRACT metric — completeness,
  no-drop, arrow-count, no-overlap — must still hold; only the
  position/extent fingerprints rebase). ADR 0014.
- **P6 — flip default → `dot`; deprecate ELK path.** Remove the ELK
  branch only after ≥1 release green on `dot`. Update every gate/doc/
  memory; close item 1/1a.

## Guardrails (replace "separate repo" as the risk control)

1. Long-lived `feat/dot-engine` branch; small gated PRs into it; only
   merged to `main` when P5 acceptance is fully green.
2. ELK remains DEFAULT + the fallback until P6.
3. The full existing instrument suite is the acceptance gate —
   especially `edgecross` (the target), `route-fidelity`,
   `factcheck` completeness, `corpus-sanity` no-drop. A red CONTRACT
   blocks the merge; ratchets only rebase for *position* changes with
   every contract still green.
4. Byte-baseline discipline: snapshot every affected committed
   artifact from fresh `origin/main` before each phase; per-phase
   `git diff --exit-code` of the regenerated artifacts.
5. Determinism is a P0 exit criterion, not an afterthought (the
   byte-exact drift gates depend on it).
6. ADR 0014 records the supersession of 0008/0011 with the measured
   before/after numbers; the disproved-in-pipeline evidence
   (`edge-crossing-minimization.md`) is the "why".

## Risks & rollback

- **Risk:** dot output non-determinism across versions → byte-gate
  flakiness. *Mitigation:* pin the wasm engine; P0 determinism proof
  is a hard gate.
- **Risk:** boundary/cluster nesting fidelity (Container_Boundary,
  Deployment_Node) differs from ELK. *Mitigation:* `cluster_*`
  subgraphs + the existing containment assertions in
  `layout-engine`/`corpus-sanity`.
- **Risk:** ADR-0010 content-fit sizing must drive dot node size
  (dot must not relayout text). *Mitigation:* `fixedsize=true` +
  measured inches; assert via `layout-quality`.
- **Rollback:** flag-gated end-to-end — `LAYOUT_ENGINE=elk` is always
  the escape hatch until P6; nothing on `main` changes default until
  full acceptance.

## P0 DECISION ADDENDUM (2026-05-19) — GO

**Engine chosen: `@hpcc-js/wasm-graphviz@1.21.6`** (pinned `--save-exact`;
bundles **graphviz 14.1.5**). The graphviz-only split package, smaller
than the monolithic `@hpcc-js/wasm`. System `dot` (graphviz 2.43.0,
2019, host-variant) was rejected for the byte-gate exactly as the
table predicted — the wasm binary ships inside the pinned npm tarball
so it is identical across CI/host by construction.

**Premise (A) determinism — PROVEN.** `scripts/p0-dot-spike.mjs`
renders 8 fixtures' dot graphs through the pinned engine 6× in-process
**and once in a fresh OS process** (the genuine CI-vs-host test, not a
warm-instance test); SHA-256 of the `json` output is **byte-identical
across all renders and across processes, all 8 fixtures**. The
byte-exact `gallery-verify`-class drift gates can therefore move to
`dot`. (Determinism is the P0 hard exit criterion — met.)

**Premise (B) crossings — PROVEN.** Measured with the project's OWN
`countCrossings` core (same non-incident-crossing definition as `make
edgecross`, Purchase 1997), on the SAME parsed entities/relations and
content-fit `measureNode` sizes, with `cluster_*` subgraphs for
boundaries (real nested graph, not flattened):

| fixture | ELK baseline | dot | verdict |
|---|---|---|---|
| edge-large-graph | 18 | **0** | FIXED |
| rel-fan-stress | 6 | **0** | FIXED |
| rel-tech-vs-notech | 3 | **0** | FIXED |
| rel-parallel-duplicate | 2 | **0** | FIXED |
| rel-bidirectional | 1 | **0** | FIXED |
| **TOTAL (5 fixtures)** | **30** | **0** | **edgecross 30→0** |
| topology-linear-chain / hub-spoke / level-component | 0 | 0 | no regression |

Corroborated against the independent signal (the rendered dot SVGs in
`build/p0-spike/svg/`, deterministic) — clean hierarchical ranking,
structurally faithful to each puml (e.g. edge-large-graph = 25 nodes /
24 edges / 1 cluster). The 30→0 is real, not a gate artifact.

**Verdict: GO.** Both premises hold; proceed P1→P4 per the autonomy
contract (hard-stop only if a later phase's CONTRACT gate genuinely
cannot go green — then negative result + escalate, never fake-green).
`scripts/p0-dot-spike.mjs` is retained as the re-runnable proof.

## Status / entry point

Branch: `feat/dot-engine`. **P0 COMPLETE (GO, 2026-05-19).** Continue
at **P1** (C4→dot graph emitter).
Reusable assets already banked: `assignPortOrder` + tests +
`build/portorder-models/`; `make edgecross` + ratchet (the numeric
target); `route-fidelity` (the shape metric); the full research base
(`elk-vs-graphviz-dot.md`, `edge-crossing-minimization.md`).
