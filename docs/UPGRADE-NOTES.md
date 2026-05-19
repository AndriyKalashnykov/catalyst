# Upgrade Notes

Running log of upgrade decisions and the docs/diagrams each one touches.
Maintained during the 2026-05-16 layout-tuning + modernization run.

## 2026-05-16 — Toolchain modernization (PR-A, see ADR 0004)

Applied:

- TypeScript 5.8 → 6.0; `tsconfig` `moduleResolution: bundler` + `rootDir`.
- vitest/coverage 4.1.4 → 4.1.6; oxlint 1.59 → 1.65; @types/node bump.
- `PLANTUML_VERSION` 1.2024.7 → 1.2026.2 (Makefile + both scripts'
  defaults & doc comments).
- C4-PlantUML stdlib v2.10.0 → v2.13.0 (all fixtures + corpus +
  `output-correctness` helper + EntityParser comment).
- mise `.mise.toml` (node 26); `make deps` → `mise install` + `npm ci`.

Docs/diagrams updated in lock-step:

- `README.md` Tech Stack — TypeScript 6.0; Runtime "Node.js 26,
  mise-managed (.mise.toml)".
- `docs/C4-COVERAGE.md` — spec surface ref + link → v2.13.0.
- `docs/gallery/README.md` — embedded `!include` pins → v2.13.0
  (regenerate via `make gallery` so the rendered PNGs match the bumped
  PlantUML + stdlib).
- Architecture Decision Records added under `docs/adr/` (0001, 0003–0006;
  0002 was withdrawn — the repo is treated as standalone, so the ADR
  documenting upstream isolation is intentionally not retained).

Open follow-ups (not blocking the layout phases):

- [ ] CI: add `jdx/mise-action` so CI uses the same Node as `.mise.toml`
      (today CI uses `node-version: 'latest'`; parity holds but is not
      pinned). A `/ci-workflow` concern.
- [ ] `# renovate:` inline hint on the `PLANTUML_VERSION` Makefile
      default + a Renovate rule for the C4-PlantUML stdlib pin.
- [ ] Deep-review C4-PlantUML v2.11–2.13 procedure surface vs
      `EntityParser` skip-list if a real diagram uses a v2.11+ macro.
- [ ] `make gallery` regen of `docs/gallery/*` PNGs after the layout
      phases land (the visual artifacts are part of "relevant diagrams").

## Layout phases (see ADR 0001 + open-followups item 3)

Each phase's PR updates: `README.md` if behavior/algorithm visible to
users changes; `docs/C4-COVERAGE.md` if a spec cell flips; `CHANGELOG.md`;
`docs/gallery/*` regenerated; the ibm-wm `_drawio` PNGs at the grouped
release-chain step (the BLOCKING visual acceptance gate).

- Phase 1 (`\n` → `<br/>`): merged (PR #16). Docs: CHANGELOG pending at
  release; gallery regen pending.
- Phase 2 (edge-label dims → ELK): done — PR pending. Local visual gate
  PASS on ibm-wm c4-context (baseline had labels on top of boxes; after,
  all labels clear). CHANGELOG Unreleased updated.
- Phase 3 (Context `force` → `stress` + `sporeOverlap` declump): done —
  PR pending. README "Layout engine" line + diagram + Tech Stack updated;
  ADR-0005; CHANGELOG. Local visual gate PASS on ibm-wm c4-context
  (compact, 0 overlaps, no tangle vs baseline). force=21 / stress=0 /
  pipeline≈5 on the synthetic spike.
- Phase 4 (NETWORK_SIMPLEX node placement — NOT per-boundary subgraphs):
  done — PR pending. Backlog hypothesis (SEPARATE_CHILDREN) empirically
  disproven (115 vs 44 crossings); real fix is a one-option node-placement
  change, zero emit-model change, zero regression (full-corpus spike).
  README layout-engine line + ADR-0006 + CHANGELOG. Local visual gate
  PASS on ibm-wm c4-container (44→30 crossings, containment correct).
- P4 (Context `stress` → **always `layered`**; supersedes Phase 3 /
  ADR-0005): done — PR pending. The gallery audit's "oversized/sparse/
  diagonal" P4 was root-caused NOT to `C4_MIN`/spacing but to the
  Context→`stress` algorithm. Fact-checked vs the PlantUML ground
  truth: PlantUML renders Context with Graphviz `dot` (hierarchical
  ranking) — it does NOT force-direct and does NOT avoid the ribbon,
  so the "Context ribbons under layered like PlantUML/dot" premise of
  ADR-0005 was empirically false. Removed the entire stress/declump/
  `isHierarchical`/`LayoutResult.context`/#24-centre-waypoint
  machinery; always `layered`. Spike: `topology-linear-chain`
  x-spread 132→0. Byte-scope: 15 former-Context fixtures changed, 5
  hierarchical byte-identical (zero hier regression). 324/324;
  `context-stress.test`→`context-layered.test`. ADR-0008; C4-COVERAGE
  L1–L5 + algorithm prose corrected; CLAUDE.md. Render-compare gate
  PASS — every Context fixture now matches PlantUML's column/3-rank/
  ribbon/ranked-cycle. P4b (box-emptiness from the documented
  `C4_MIN` floor) carved off as a separate deferred PR.
- P1 (multi-edge lane label-to-lane): MERGED #71. Lane labels rode a
  separate inflated ±120/±150 fan instead of the lane's own shift →
  detached/orphaned. Now `labelOffset=(px,py)·shift` (on the lane
  line) + per-group gap widened to the widest measured label. 3 laned
  fixtures change, 17 byte-identical. labelHit:0.
- P6 (nested-boundary title clearance): MERGED #72. `titlePadding()`
  reserved only the 2-line title; drawio-export pixel probe showed the
  rendered `[type]` bottom lands exactly there → ~1u clearance, the
  `topology-deep-nesting` collision. Added one `renderedLineHeight`
  clearance line → band 33→49u, ~15-17u clearance (≈ PlantUML's
  measured 16-20u). 4 compound fixtures change, 16 byte-identical. The
  #25 test gained a NON-tautological empirical-floor gate.
- P8 (element-tag stereotypes): MERGED #73. `$tags` matching an
  `AddElementTag` now render `«tag»` before `«type»` (e.g.
  `«critical»«System»`) via a spliced `%c4Stereotype%` placeholder;
  `c4Type` attr stays structural (golden-safe). Only
  `edge-tags-styling` changes, 19 byte-identical. 4 new tests.
- P9 (cycleBreaking GREEDY→DEPTH_FIRST): MERGED #75; ADR-0009 (peer
  of ADR-0006). 2-cycle/bidirectional over-ranked into a 3-rank chain
  vs PlantUML/dot's compact 2 ranks. `rel-bidirectional`/
  `rel-tech-vs-notech` h 484→324 (hRatio 2.3→1.45), rankOrder
  false→true vs PlantUML SVG; every other cyclic fixture + all DAGs
  byte-identical. Surfaced by the numeric harness, not eyeballing.
- P10 (antiparallel laned edges merged at box centres): MERGED #74.
  Laned edges had no exit/entry → drawio attached every same-pair
  edge at the box centre, so two one-way edges looked like one
  bidirectional + one arrowless. Each lane now carries geometry-
  derived `exitX/exitY/entryX/entryY`; rel-bidirectional A↔C attaches
  at x≈82.5/137.5 (55px apart). 3 laned fixtures change.
- P11 (was an edge-large-graph labelHit flag): MERGED #76. Harness
  FALSE POSITIVE — the #56 re-seat already clears the label; the
  comparator ignored the emitted offset. Fixed `labelHit` to use
  production `polylineMidpoint(route)+offset`. Same PR elevated the
  comparator to the supported `make factcheck` gate over all 26
  conversions (corpus + C4-spec); exposed P12 (real spec-fixture
  defects). 5 harness false-positive classes total, each fact-checked.

## 2026-05-19 — Layout engine elkjs → Graphviz `dot` (catalyst 2.0.0, ADR 0014)

Applied — PRs #150 (swap), #151 (ELK removal), #152 (pre-2.0
hardening), #154 (release; tag `v2.0.0`):

- **elkjs removed; Graphviz `dot` via pinned `@hpcc-js/wasm-graphviz`
  is the sole engine.** `dot` IS PlantUML's C4 engine, so topology
  matches by construction: `make edgecross` 30 → 0 (catalyst ==
  PlantUML == 0 on the real drawio-export render-truth); factcheck
  CLEAN 28/28 (was 26/28); arrowskew 22/22; byte-deterministic.
- Removed: `LayoutEngine.mts`, `elkjs` dep, the `layoutEngine`/
  `LAYOUT_ENGINE` selector, the ELK-era `assignEdgeLanes` /
  `assignPortOrder` / `enforceApproachClearance` lane apparatus, and
  the moot ADR-0013 `make routefidelity` decision driver
  (`route-fidelity-matrix.mjs`/`-convert.mjs`). The
  `route-fidelity.mjs` metric library lives on (consumed by the live
  `edgecross` gate). Lane/multibend removal proven byte-identical
  (`gallery-verify`); ADR 0014 supersedes 0008/0009/0011.
- Docs touched: README + GitHub About re-derived; `docs/C4-COVERAGE.md`
  L1–L5 + scattered ELK refs → dot; `docs/FACTCHECK-COVERAGE.md`
  path→metric matrix + advisory rationale → dot; ADR 0008/0009/0011
  headers marked superseded.
- Downstream: puml2drawio `CATALYST_REF` → v2.0.0 (PR #99, full CI
  incl. e2e green). ibm-wm-cert-management `_drawio` regen pending
  (its own release cadence).
