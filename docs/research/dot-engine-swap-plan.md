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

## P1+P2 STATUS (2026-05-19) — COMPLETE

`src/layout/DotLayout.mts` — C4→dot emitter (P1) + dot-JSON→
`LayoutResult` adapter (P2) as one unit, mirroring `LayoutEngine`'s
static signature (zero call-site change for the P4 flag). Ranks TB,
`cluster_*` subgraphs for boundary/Deployment_Node nesting, node sizes
pinned from ADR-0010 `measureNode` (`fixedsize=true`, px→inch so
1 dot-pt == 1 px ⇒ adapter is a pure y-flip), edges stamped
`id="rel<i>"`/`lay<i>` for EXPLICIT relation-index recovery (dot
reorders/parallels), Rel_U/D/L/R + Lay_* mapped to dot ranking.
Hardening found via the C1-RED: dot auto-creates undeclared
edge-endpoint nodes — the adapter surfaces ONLY declared leaves so a
parser gap is caught by completeness, not leaked as a phantom box.

Gate `tests/dot-layout.test.mts` — WHOLE-PATH (real parser → real
pinned engine, no mocks), 29 tests green: C1 completeness · C2 no edge
dropped · C3 cluster containment · C4 no leaf overlap · C5 byte-
determinism (source AND LayoutResult) · C6 the 5 ELK-crossing fixtures
route to **0** non-incident crossings THROUGH the real adapter
(P0's 30→0 survives P1/P2, project's own instrument) · C1-RED
mutation-verified. Full suite 628/628 (ELK path untouched — additive).
Corroborative eyeball: `scripts/dot-layout-gallery.mjs` →
`build/dot-layout/` (deterministic).

## P3+P4 STATUS (2026-05-19) — CORE COMPLETE; decisive result

**P4 flag:** `options.layoutEngine` › `process.env.LAYOUT_ENGINE` ›
`'elk'`. No silent fallback (a dot failure surfaces — never masked
into ELK = the cardinal fake-green). ELK path byte-identical
(`routesAuthoritative` absent ⇒ legacy branch; full suite 628/628).

**P3 routing (the #107-correct measurement):** dot's emitted splines
are 0-crossing (P0), but the FIRST rendered drawio-export pass showed
catalyst-dot=11 (rel-fan-stress 6→10 REGRESSION) — root-caused by
MEASUREMENT to the ELK-era `assignEdgeLanes` perpendicular-shove
applied on top of dot's already-fanned splines (rel-fan-stress raw
spline 0 → post-lane 10; the CLAUDE.md item-2 defect). Fix:
`LayoutResult.routesAuthoritative` (set by DotLayout) → a new leading
branch in `layoutData2mx` emits dot's spline VERBATIM (`curved=1`,
ADR 0013) and bypasses the lane machinery + lane exit/entry attach.

**DECISIVE — `make edgecross` 30 → 0** on the real committed
drawio-export render-truth: ALL 22 corpus fixtures
catalyst==PlantUML==0, 0 regressions. The crossing CONTRACT (Purchase
1997), honestly RED for the project's whole life under ELK, is GREEN
under dot. This is the entire reason for 1a.

**Fidelity under dot (measured, not assumed):**

- corpus-sanity + output-correctness + spec-coverage: **65/65**.
- factcheck CONTRACT metrics across all 28:
  `entityMiss=relMiss=labelDrop=arrowBad=nodeOverlap=titleMiss=0`
  (the completeness invariant — ADR 0012, the FIRST gate — HOLDS).
- `ratioBad` moved on ~24 fixtures, mostly TOWARD 1.0/PlantUML (dot
  *is* PlantUML's engine) — the **sanctioned P5 re-baseline**, not a
  defect.
- `attachMerge` (c4-all-rel-variants=23, c4-exhaustive=3,
  rel-fan-stress=1, rel-parallel-duplicate=1): **proven 100%
  comparator FALSE-POSITIVE**, not a product defect. Mechanism
  (`FACTCHECK_DEBUG`): every flag is `d2=0 (exitY
  undefined/undefined)` — dot's authoritative `curved` edges
  intentionally carry no `exitX/entryX`, so `attachPoint` collapses
  every same-pair edge to the box centre. Independent signal (real
  drawio-export rendered path endpoints): **0** both-ends-coincident
  pairs on the corpus. This is the documented factcheck base-point FP
  class. **Fix (P5, principled — fix the gate's FP, never mask the
  correct product):** when an edge has no `exitX/entryX`, `attachMerge`
  must use the RENDERED path terminal points (the comparator already
  parses them), not the centre proxy; ship with a mutation-verified
  RED in `factcheck-predicates.test.mts`.
- `labelHit=3` (c4-exhaustive only): NOT yet fact-checked (real vs
  FP) — a P5 item.

## P5 PLAN (the user check-in point — re-baseline + ADR 0014)

Sanctioned position-baseline reset (every CONTRACT still green; only
position/extent fingerprints rebase — NOT a fake-green):

1. `attachMerge` comparator base-point FP fix + RED test.
2. Fact-check `labelHit=3` (c4-exhaustive) → fix product or comparator.
3. Re-baseline under dot: golden, parity, `factcheck-ratio-baseline`,
   gallery (`.drawio` + committed render SVG), `edgecross-baseline`
   (→ all 0), `arrowskew`.
4. Dual-engine CI shape (run the suite under both; per-engine
   `edgecross`/`routefidelity`).
5. **ADR 0014** — superseding ADR 0008 (Context→layered) and ADR 0011
   (layout-aspect ratchet — dot owns aspect now), with the measured
   before/after numbers; `edge-crossing-minimization.md` is the "why".
6. **P6 (separate, explicit sign-off — irreversible):** flip default
   to `dot`, deprecate the ELK path. NOT done without approval.

## P5 STATUS (2026-05-19) — COMPLETE (pending P6 sign-off)

1. **attachMerge base-point comparator FP** — FIXED (`edgeEndAttach`,
   models the rendered spline exit not the box centre);
   mutation-verified RED; ELK factcheck **26/28 byte-unchanged**;
   corpus attachMerge→0.
2. **attachMerge/labelHit residual** (synthetic `c4-all-rel-variants`
   =15 / `c4-exhaustive` labelHit=3) — resolved by the user-chosen
   **edgecross-pattern ratchet**: committed `tests/factcheck-dot-
   baseline.json` (2 fixtures), pure predicate
   `scripts/factcheck-dot-ratchet.mjs`, wired into factcheck-geometry
   ONLY under `LAYOUT_ENGINE=dot` (ELK strict-0 path byte-unchanged),
   mutation-verified RED `tests/factcheck-dot-ratchet.test.mts`.
   Contract stays honestly RED-documented (ADR 0014 §"Honest
   residual"); ratchet fails any regression past baseline (0 under
   dot now).
3. **golden/parity re-baseline — NOT NEEDED** (a finding): both are
   coordinate-free ⇒ engine-invariant; full suite **639/639 under
   `LAYOUT_ENGINE=dot`**, zero baseline edits. Avoids the large risky
   regenerated-baseline diff.
4. **ELK-default committed artifacts** (gallery, `edgecross-baseline`
   =30, `factcheck-ratio-baseline`) **UNCHANGED** — ELK IS still
   default until P6; re-baselined WITH the flip (P6), not before
   (else `gallery-verify` regen(ELK)≠committed). The `dot`
   crossing=0 contract is CI-gated NOW via `dot-layout` C6
   (in-pipeline, no docker).
5. **ADR 0014** written, supersedes 0008/0011 (status headers
   updated).
6. **Dual-engine CI** — `ci.yml` `test` job runs the full suite
   under `LAYOUT_ENGINE=dot` every commit.

`ratioBad` under dot (CLEAN 5/28 on the host-MANUAL factcheck) = the
ELK-calibrated ratio ratchet flagging dot's legitimately-different
(mostly toward-PlantUML) geometry — explicitly the **P6** re-baseline
(ADR 0014); factcheck is NOT CI. CI render-truth = `edgecross`
(=0 via `dot-layout` C6) + `arrowskew`.

## Status / entry point

Branch: `feat/dot-engine`. **P0–P5 COMPLETE (2026-05-19).** ELK
default + full suite 628/628; `dot` path 639/639 + edgecross 30→0
proven on the real render. **AWAITING P6 explicit sign-off** (flip
default → `dot`; re-baseline now-default artifacts WITH the flip;
deprecate ELK after ≥1 green release; update `puml2drawio` pin).
NOTHING flips the default without approval.
Reusable assets already banked: `assignPortOrder` + tests +
`build/portorder-models/`; `make edgecross` + ratchet (the numeric
target); `route-fidelity` (the shape metric); the full research base
(`elk-vs-graphviz-dot.md`, `edge-crossing-minimization.md`).
