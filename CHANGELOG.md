# Changelog

All notable changes to this project will be documented in this file.

This project adheres to [Semantic Versioning](http://semver.org/).

This project adheres to [Keep a CHANGELOG](http://keepachangelog.com/).

## [2.0.0] - 2026-05-19

**BREAKING — the layout engine is now Graphviz `dot`; ELK is removed.**

### Changed

- **Layout engine: elkjs → Graphviz `dot`** via the pinned,
  byte-deterministic `@hpcc-js/wasm-graphviz` WASM build (ADR 0014,
  superseding the ELK-era ADRs 0008/0009/0011). `dot` IS the engine
  PlantUML uses for C4, so catalyst's topology now matches the
  reference **by construction**: `make edgecross` **30 → 0**
  non-incident edge crossings across the whole corpus (catalyst ==
  PlantUML == 0), measured on the real drawio-export render-truth.
  Determinism proven cross-process (P0). factcheck **CLEAN 28/28**
  (was 26/28 under ELK); arrowskew 22/22.
- Rendered output changes substantially for most diagrams (different,
  PlantUML-faithful coordinates + curved `dot` splines). Downstream
  consumers (puml2drawio → ibm-wm) regenerate their committed
  `.drawio`/renders on bump.

### Removed (BREAKING)

- The `elkjs` dependency, `src/layout/LayoutEngine.mts`, and the
  ELK-era `assignEdgeLanes` perpendicular-shove + dead multi-bend
  emit machinery in `layoutData2mx` (the lane machinery was a primary
  crossing source; `dot`'s own port ordering fans same-pair edges).
  Removal of the lane/multibend branches proven byte-identical
  (`gallery-verify`).
- The `LAYOUT_ENGINE` env var and the `CatalystOptions.layoutEngine`
  option — `dot` is the sole engine, so the selector is gone. Code
  passing `{ layoutEngine: 'elk' }` must drop the option (the public
  `Catalyst.convert(puml, options)` signature is otherwise unchanged;
  `LayoutResult`/`LayoutNode`/`LayoutEdge` relocated verbatim to
  `src/layout/types.mts`, no shape change).

### Added

- `src/layout/DotLayout.mts` — C4→dot emitter + dot-JSON→LayoutResult
  adapter; `routesAuthoritative` emits `dot` splines verbatim as
  `curved=1` draw.io edges (ADR 0013). Whole-path contract gate
  `tests/dot-layout.test.mts` (C1–C6, mutation-verified RED) +
  `tests/dot-whole-path.test.mts` corpus/feature sweep.
- ADR 0014 (Graphviz dot engine) + the full P0–P6 decision/plan
  record (`docs/research/dot-engine-swap-plan.md`); committed
  PlantUML | ELK | dot eyeball gallery (`docs/gallery-compare/`).
- factcheck comparator base-point FP fix (`edgeEndAttach`) +
  dot-residual ratchet (`scripts/factcheck-dot-ratchet.mjs`,
  RED-tested) for the 2 synthetic exhaustiveness fixtures.

## [1.8.0] - 2026-05-18

### Added

- **Sequence-diagram support is now COMPLETE (ADR 0007, phases
  a–d2b; nothing deferred).** `ref over A[,B…]` reference frames
  (inline + block), `create`/`destroy` lifeline lifespan (head drops
  to first-use Y; foot truncates with an ✕ glyph), and
  `box "T"`/`*_Boundary(...)` lifeline grouping (head-shifting title
  band over a contiguous declaration range, non-nesting). Empty
  `====` divider now renders as PlantUML's thin rule, not a filled
  band. The fail-loud seam is retained for malformed/unknown input
  only (contract-lock).
- **C4 display/style directive coverage** (each overlay/style-only ⇒
  the static C4 corpus is byte-identical):
    - `HIDE_STEREOTYPE()` — drops the `«Type»` line (the `c4Type`
      structural attribute is kept; golden/parity unchanged).
    - `LAYOUT_AS_SKETCH()` / `SET_SKETCH_STYLE()` — draw.io `sketch=1`
      hand-drawn render on every cell.
    - PlantUML `note left|right|top|bottom of X` callouts — were
      silently dropped; now rendered as `shape=note` placed
      post-layout from the target's box.
    - `SHOW_LEGEND()` / `_FLOATING` / `_DYNAMIC` — a synthesized
      tag-entry legend box (one row per AddElementTag/AddRelTag/
      AddBoundaryTag stereotype + fill swatch).
    - `AddProperty()` / `SetPropertyHeader()` /
      `WithoutPropertyHeader()` — up-to-4-column property table
      consumed by the next element, rendered post-layout as an html
      grid.
- **Committed reproducible-SVG galleries + deterministic CI drift
  gates** for the sequence pipeline (`make seq-gallery` /
  `seq-gallery-verify`, 18 fixtures incl. a 12-fixture permutation
  matrix) and the C4 feature set (`make c4feat-gallery` /
  `c4feat-gallery-verify`); the C4 use-case gallery also gained
  committed SVG (parity). `make bendcount` target.

### Fixed

- **The 85 % coverage gate was a silent no-op** (`thresholds.global`
  is Jest/nyc syntax that Vitest ignores) — corrected to the real
  Vitest schema, scoped to `src/**/*.mts`; `src/catalyst.mts` is now
  under the gate (≈97 %).
- **`C4_Sequence` dispatch defect:** a sequence diagram written with
  C4 `Rel()`/`Person()`/`*_Boundary()` macros was mis-routed to the
  static-C4/ELK path and crashed; the `C4_Sequence` include /
  `participant` line is now authoritative.
- `bendcount` instrument silently measured nothing after ADR 0013
  (curved edges have no `L` path command) — now parses bezier
  on-curve waypoints.
- Self-message loop width is now driven by the message's own measured
  label (compact PlantUML-style hook for short labels) instead of the
  unrelated neighbour-column gap.

### Not implementable (closed, not deferred)

- `$sprite` / `SHOW_PERSON_SPRITE` — draw.io has no PlantUML sprite
  registry; the attribute is parsed and ignored (parsing never
  breaks). Documented in `docs/C4-COVERAGE.md`.

## [1.7.0] - 2026-05-18

### Added

- **Sequence-diagram support (C4-PlantUML `C4_Sequence.puml`, ADR
  0007).** A parallel, deterministic non-ELK pipeline (`src/seq/`,
  `src/mx/seq/`) dispatched via the `catalyst.mts` detector seam — the
  static C4 ELK/box path is untouched and byte-identical by
  construction. v1: `participant`/`actor` + every C4 lifeline macro
  (declaration order → lifeline X), ordered messages
  (`->`/`-->`/`->>` + `Rel`/`Rel_Back`/`BiRel`, source order → monotone
  Y, sync/async/return/bi arrowheads), `activate`/`deactivate`
  activation bars, `note left|right|over`, `title`, self-messages.
  Phase **d1**: `== divider ==` full-width bands. Phase **d2**:
  combined/grouped fragments `alt/else/opt/loop/par/critical/group/
  break` with arbitrary nesting (`umlFrame`-style box behind messages,
  kind tab + one-line `[guard]`, `else` compartment separators; nested
  boxes strictly contain children by construction). Still fail-loud
  (precise token+line, never a silent drop) on the remaining deferred
  constructs: `box`/`Boundary` lifeline grouping, `ref`,
  `create`/`destroy`.
- **PlantUML `title` is now rendered on every diagram (ADR 0012).**
  Previously dropped on 100 % of diagrams (nothing counted it). The
  title is emitted as a top band on the static C4 path and the
  sequence path, enforced by a completeness-invariant gate (every
  source construct must trace to ≥1 target element).
- **Element-tag stereotypes are now rendered.** An element whose
  `$tags` match an `AddElementTag` declaration shows those tags as
  `«tag»` stereotype segments before the `«type»` line, exactly as
  C4-PlantUML does (e.g. `$tags="critical"` →
  `«critical»«System»`; multiple tags chain in authored order). A new
  `c4Stereotype` placeholder is spliced before `«c4Type»`; the
  structural `c4Type` attribute (read by the golden/parity
  fingerprint) is left untouched, and elements without a matching tag
  emit no `c4Stereotype` — so all untagged output is byte-identical
  (only `edge-tags-styling` changes in the corpus). Tag colour styling
  was already applied; this adds the missing stereotype text.
- **Faithful `$lineStyle`/`$borderStyle`/`$shadowing`/`$thickness`
  relationship & element style mapping**, and external `_Ext` Db/Queue
  elements now keep their cylinder/queue shape (C4-COVERAGE Tier-2).
- **PlantUML boundary subtitle** (the lowercase tag, e.g.
  `[Software System]`) is rendered instead of the raw macro name.

- **`cleanup-runs.yml` workflow** — portfolio-standard weekly
  (`cron` + `workflow_dispatch`) housekeeping that prunes old workflow
  runs (7 days / keep ≥ 5) and caches from deleted branches via the
  native `gh` CLI (no third-party actions). catalyst previously had
  only `ci.yml`.
- **CI render-truth gate (`render-gate` job).** `.github/workflows/ci.yml`
  has a path-filtered Docker job (new `render` `dorny/paths-filter`
  group over `src/** scripts/** tests/fixtures/** docs/gallery/**
  Makefile ci.yml`) that runs `make arrowskew` as a hard `ci-pass`
  contract — the deterministic safety net for the #107 false-green
  class, which pure-node CI could not catch (it renders every gallery
  `.drawio` via the pinned `rlespinasse/drawio-export` image,
  byte-portable). Doc-only PRs skip it.

- **Element-tag stereotypes are now rendered.** An element whose
  `$tags` match an `AddElementTag` declaration shows those tags as
  `«tag»` stereotype segments before the `«type»` line, exactly as
  C4-PlantUML does (e.g. `$tags="critical"` →
  `«critical»«System»`; multiple tags chain in authored order). A new
  `c4Stereotype` placeholder is spliced before `«c4Type»`; the
  structural `c4Type` attribute (read by the golden/parity
  fingerprint) is left untouched, and elements without a matching tag
  emit no `c4Stereotype` — so all untagged output is byte-identical
  (only `edge-tags-styling` changes in the corpus). Tag colour styling
  was already applied; this adds the missing stereotype text.

### Changed

- **Element boxes are content-fit and aspect-faithful to PlantUML on
  BOTH axes (ADR 0011 + P4b).** The arbitrary `C4_MIN` minimum-size
  floor is gone; box width/height are derived from measured PlantUML
  font/leaf-box constants (`PUML_LEAF_BOX`), and `wRatio`/`hRatio`
  were promoted from advisory to a contract ratchet
  (`tests/factcheck-ratio-baseline.json`) so aspect can only improve
  or hold toward PlantUML parity.
- **`Rel_U/D/L/R` directional compass hints are honored (P2)** via
  invisible co-rank constraint edges, so layout direction follows the
  authored intent (factcheck CLEAN, byte-scoped to the directional
  fixtures).
- **Connectors are now curved (Graphviz-`dot`-spline-faithful), not
  Manhattan (ADR 0013).** Relationships emit `curved: 1` instead of
  `edgeStyle: 'orthogonalEdgeStyle'`, so draw.io splines through the
  ELK waypoints instead of re-routing every edge as right-angles —
  fixing the `rel-bidirectional` / `rel-parallel-duplicate` connector
  tangle. Proven by a new committed self-verifying decision harness
  (`make routefidelity`, `scripts/route-fidelity*.mjs`): route-shape
  L1 distance to the PlantUML target dropped from **1.017
  (orthogonal) → 0.294 (curved)**, ~3.5× closer, robust on both the
  detour and turning-angle metrics independently. `make arrowskew`
  stays CLEAN 20/20; `factcheck` is edge-style-invariant; `golden` is
  style-agnostic; the full `docs/gallery/` was re-rendered. Node
  placement / ELK layout / the lane machinery are unchanged.

- **`scripts/factcheck-geometry.mjs` now exits non-zero on any
  non-clean fixture.** It previously only printed `CLEAN N/26` and
  exited 0 — a latent fake-gate (enforcement was a human reading the
  number). `make factcheck` now fails properly on a contract
  regression. `make factcheck` remains a host-JVM **manual** gate:
  PlantUML text geometry is host-font-dependent so `ratioBad` is not
  CI-portable. Docker-pinning it was attempted and empirically closed
  — the only portable PlantUML image renders a noisier oracle than
  the calibration host (see `CLAUDE.md`). The interim
  `make deps-plantuml` / `GALLERY_FETCH_JAR_ONLY` were removed as
  orphaned; the gallery PNG path keeps its own `ensureJar()`.

- **Context diagrams now use the same `layered` (Graphviz-`dot`-style)
  hierarchical ranking as every other C4 diagram type** — the
  people/systems-only `org.eclipse.elk.stress` + `sporeOverlap` branch
  is removed (ADR 0008, supersedes ADR 0005). PlantUML renders Context
  with `dot` (hierarchical ranking) too; the prior premise that
  "Context ribbons under `layered` like PlantUML/dot" was empirically
  false. `stress` diverged from PlantUML in every Context shape: it
  staircased linear chains, scattered hub-and-spoke, and radial-ised
  the wide rank PlantUML embraces. `layered` reproduces PlantUML's
  column / 3-rank / ribbon / ranked-cycle exactly. Hierarchical
  diagrams are byte-identical (zero regression); only the 15
  former-Context corpus fixtures change, all toward PlantUML fidelity.
  Removed the now-dead `declump()`, `isHierarchical()`,
  `LayoutResult.context` flag, and the unreachable `#24`
  centre-waypoint emit block.
- **`scripts/factcheck-geometry.mjs` is now a comprehensive,
  fact-checked PlantUML→draw.io fidelity comparator** (no eyeballing).
  Adds semantic checks — `entityMiss`, `relMiss`, `arrowBad`
  (arrowhead count ≠ C4 semantic: bidirectional⇒2, one-way⇒1),
  `labelDrop`, `attachMerge` (same-pair edges collapsing to one line) —
  alongside the geometry checks, all vs the PlantUML `-tsvg` ground
  truth. Every false-positive was itself fact-checked and fixed: edge
  labels read from `c4Name` (not the `%c4Name%` placeholder), text
  normalised for wrap-`<br/>`/`\n`/XML-escaping before comparison,
  duplicate style keys read last-wins (mxGraph semantics, so `Rel_Back`
  is correctly 1-headed), and strict rank-order demoted to advisory
  (ELK `layered` and PlantUML `dot` legitimately differ in same-rank
  ordering). Repeated literals (attribute names, style keys, the
  2×arrow-head separation threshold, arrow-count contract) are named,
  documented constants.

### Fixed

- **`Rel_Back` arrowhead now points to the `$from` end** (C4-PlantUML
  `<<--` semantics), not the `$to` end.
- **Literal `<…>` in C4 names/descriptions is preserved** (correct
  `escLt` escaping) instead of being mangled by XML encoding.
- **C4 Dynamic `RelIndex` step numbers** (the `n:` prefix) are
  preserved.
- **`*Db` cylinder shapes reserve their elliptical-cap (cylinder3)
  height**, so the label no longer overflows the curved top.
- **Nested-compound / nested-boundary diagrams use `layered`**,
  fixing the `#25` title-band collision.
- **Multi-bend hierarchical edge labels are re-seated at the ELK
  rect** (`#24-hier` base point) instead of drifting off the route.
- **Bidirectional / 2-cycle relations no longer over-rank into a tall
  chain.** ELK's default `GREEDY` cycle-breaking reverses an arbitrary
  edge of an `a↔c` 2-cycle (`Rel(a,c)`+`Rel(c,a)`, or a `BiRel`),
  spreading the pair across THREE ranks where PlantUML's `dot` keeps it
  compact (source rank; both targets one rank below). Switched the
  layered layout to `cycleBreaking.strategy=DEPTH_FIRST`, which
  reproduces `dot`'s compaction: `rel-bidirectional` /
  `rel-tech-vs-notech` height drops ≈484→324u (hRatio 2.3→1.45) and
  their node rank-order now matches the PlantUML SVG ground truth.
  Validated on the real catalyst graphs — every other cyclic fixture
  (`topology-cyclic`, `rel-parallel-duplicate`) and all DAGs are
  byte-identical; only the 2 over-ranked fixtures change.
- **Antiparallel / parallel (laned) edges no longer visually merge into
  one line.** Laned edges emitted `orthogonalEdgeStyle` with no
  exit/entry constraints, so draw.io attached every same-pair edge at
  the box CENTRE — two one-way edges (e.g. `Rel(a,c)` + `Rel(c,a)`)
  collapsed into what looked like one bidirectional edge plus one
  arrowless edge. Each lane now carries geometry-derived
  `exitX/exitY/entryX/entryY` border-attach fractions (centre ± the
  lane's own perpendicular shift, clamped to the border), so every
  one-way edge is a distinct line attaching at a separated point with
  its single correct arrowhead — matching PlantUML. Verified in the
  rendered SVG (rel-bidirectional A↔C now attaches at x≈82.5 / x≈137.5,
  55px apart; arrowhead counts exactly 4/3/… per C4 semantics). Only
  the 3 corpus fixtures with multi-edge groups change; 17
  byte-identical.
- **Multi-edge (parallel/antiparallel) labels now ride their own lane
  line instead of being flung off it.** The lane separator placed each
  label using a separate inflated constant (±120 px perpendicular /
  ±150 px along) rather than the lane's own shift, so every non-centre
  label detached from its edge — parallel duplicates orphaned 2 of 3
  labels. Now `labelOffset = (px,py)·shift` (the lane's exact
  displacement from drawio's A↔B-midpoint label anchor), and the
  per-group lane gap widens to the group's widest measured label so
  adjacent on-line labels clear each other — the way PlantUML fans
  parallel duplicates. Only the 3 corpus fixtures with multi-edge
  groups change; the other 17 are byte-identical.
- **Nested boundary title bands no longer collide with the first child
  box.** `LayoutEngine.titlePadding()` reserved only the 2-line title
  height (≈33u); a drawio-export probe render (pixel-measured) showed
  the rendered `[type]` line bottom lands exactly there, so a nested
  compound's first child was placed with ~1u clearance —
  `topology-deep-nesting`'s `[system]` overran `API Gateway`/`Auth`.
  Added one real-metric clearance line (`renderedLineHeight` of the
  title font) so the reserved band is ≈49u with ~15–17u clearance,
  matching PlantUML's SVG-measured ≈16–20u breathing. Only the 4
  compound-bearing corpus fixtures change; 16 byte-identical. The #25
  clearance test gained a non-tautological gate asserting the band
  exceeds the empirically pixel-measured rendered-title bottom (the old
  self-consistent formula passed while the diagram visibly collided).
  New `scripts/factcheck-geometry.mjs` numeric harness (catalyst
  emitted geometry vs PlantUML SVG ground truth) backs the gate.

## [1.6.1] - 2026-05-16

### Fixed

- **Edge labels were measured at the wrong font size (real bug).**
  `Relationship.style()` sets a cell-level `fontSize: 10` and the
  Relationship label `<div>`s set no inline size, so edge labels render
  at **10px**; `measureEdgeLabel` had been anchored to mxGraph's default
  11 (an earlier "cited `MX_DEFAULT_FONTSIZE`" that missed the cell
  override), over-measuring every edge label ~10 % (ELK over-reserved,
  wrong wrap cap). Now measured at the true 10.
- **C4 typography single-sourced** (`src/mx/c4/theme.mjs`). The element
  16/11, Deployment 14, Enterprise-Boundary 13, Boundary 12, body 11
  and Relationship 10 sizes were bare literals duplicated across ~17
  shape templates *and* `measureNode`/`measureEdgeLabel`/`titlePadding`
  (the silent-drift that caused the bug above). Now one cited/annotated
  module consumed by both the templates and the measurement; mxGraph
  flag enums named (`MX.FONT_NORMAL`/`ON`/…). Output byte-identical for
  unchanged sizes.
- **Long relationship labels no longer overrun the endpoint nodes.**
  A drawio edge label has no box, so a long single-line verb/technology
  was laid out as one un-wrappable line smeared across both endpoint
  boxes (`rel-long-labels` gallery defect). Edge labels are now
  word-wrapped to a cap **derived from the real measured width of the
  narrower endpoint node** (pure geometry — "never wider than the
  smallest box it sits between"; no magic constant; cluster/unknown
  endpoint ⇒ no wrap). `measureEdgeLabel` (ELK reservation) and the Mx
  emit share one wrap routine (`labelLines.wrapEdgeLabelLines`), so the
  rendered block equals the space ELK reserved.
- **Single-edge label de-collision** (`resolveLabelOverlap`,
  renderer-side, geometry-exact). When a non-laned edge's label rect at
  the A↔B centre-line midpoint lands *inside* an unrelated node box, the
  label is pushed the **minimal** perpendicular distance (an axis-contact
  boundary — no spacing constant, no sampling) until it clears every
  obstacle; emitted via the same offset-mxPoint the lane fan uses.
  No-ops when the midpoint is already clear (cannot regress a fine
  diagram). Tracked limitation: on `stress`/`force` Context layouts
  drawio *orthogonally auto-routes* non-laned edges and anchors the
  label on that route — "label on a box *edge*" needs deterministic
  Context routing (a larger separate change).
- **Boundary title** no longer renders on the dashed top stroke
  (`spacingTop` = the font's own space-advance at the title size, a real
  metric) and `titlePadding` now reserves the full **2-line** boundary
  label at the renderer line box (was one fontkit line ≈ 23px vs the
  real ≈ 33px) so children no longer overlap the title. Tracked
  limitation: in *dense deeply-nested* diagrams, horizontally-adjacent
  nested-boundary titles can still visually collide — a deeper
  compound-layout spacing concern.

## [1.6.0] - 2026-05-16

### Fixed

- **Box sizing uses the renderer's line box.** `measureNode` /
  `measureEdgeLabel` now size text at mxGraph's `LINE_HEIGHT = 1.2`
  (`ABSOLUTE_LINE_HEIGHT: false`, verified in mxGraph source) instead of
  fontkit's font-intrinsic 1.1499 — the ~4.4 %/line under-estimate that
  clipped the last line of tall multi-line descriptions.
- **C4 element grammar fidelity.** Element shapes now render in
  C4-PlantUML canonical order — `«stereotype»` (italic, top) → **Name**
  (bold) → `[Technology]` (own line, only if present) → Description —
  vertically centered, matching the PlantUML reference render
  (previously Name → `[Type]` → Description, top-packed).
- **Connector length.** Inter-layer gap default `ranksep` 50 → **36**
  (Graphviz `dot`'s default — PlantUML's own C4 engine), removing the
  "connectors too long vs the PlantUML render" gap. Zero overlap
  regression; caller-overridable.

### Changed

- CI: Node pinned via `jdx/mise-action` (`.mise.toml` node 26) instead
  of `setup-node` `latest`; all actions SHA-pinned; `make ci-run` (act).
- Dependabot → **Renovate** with customManagers (PLANTUML_VERSION via
  Maven datasource, C4-PlantUML stdlib pin); `drawio-export` `:latest`
  → `:v4.51.0`.
- Verified (enumerated diff) that the C4-PlantUML v2.10→v2.13 stdlib
  bump added no entity-shaped macros — no parser change needed.
- `.vscode/` untracked.

## [1.5.0] - 2026-05-16

### Added

- **Layout Phase 2** — measured edge-label dimensions are fed to ELK so
  the layout reserves real space for each relationship label. Eliminates
  the dominant c4-context symptom where a label rectangle was laid on top
  of a node box. New `measureEdgeLabel()` (font-metric, honours Phase 1
  `\n` breaks); `LayoutEdge.label` surfaces ELK's placed label rect.
- `docs/adr/` (Architecture Decision Records) and `docs/UPGRADE-NOTES.md`.

### Changed

- **Layout Phase 4** — hierarchical (layered) C4 now uses
  `nodePlacement.strategy = NETWORK_SIMPLEX`: ~32% fewer edge crossings
  on the large `c4-container` (44→30), two deployment profiles also
  improve, no diagram regresses, zero node overlap. The backlog's
  per-boundary-subgraph hypothesis was empirically disproven
  (`SEPARATE_CHILDREN` = 115 crossings, far worse) — no emit-model
  change. See `docs/adr/0006`.
- **Layout Phase 3** — C4 Context layout switched from the seed-based
  `org.eclipse.elk.force` to deterministic `org.eclipse.elk.stress`
  followed by an `org.eclipse.elk.sporeOverlap` declump pass:
  crossing-minimal (0 vs 3 on the real c4-context) with zero node
  overlap. See `docs/adr/0005`.
- **Layout Phase 1** — PlantUML `\n` in names/descriptions/relationships
  is translated to a real `<br/>` line break (was emitted literally and
  mis-measured as one giant line, overflowing the box into neighbours).
- Toolchain modernized to latest: TypeScript 6.0 (`tsconfig`
  `moduleResolution: bundler` + `rootDir`), vitest 4.1.6, oxlint 1.65,
  `PLANTUML_VERSION` 1.2024.7 → 1.2026.2, C4-PlantUML stdlib pin
  v2.10.0 → v2.13.0, mise (`.mise.toml`, node 26).

## [1.4.1] - 2026-05-16

### Removed

- `release-drafter` workflow + config
  (`.github/workflows/release-drafter.yml`, `.github/release-drafter.yml`).
  Releases are git tags only (no formal GitHub Releases); the perpetual
  auto-generated untagged Draft contradicted that documented convention.

### Fixed

- README Quick Start install pin (`#v1.3.0` → `#v1.4.0`) — it was stale
  the moment v1.4.0 shipped and would have installed previous code.
- Attribute values now also escape `>` → `&gt;` (in addition to the
  `&`/`<`/`"` already escaped since v1.4.0) for `c4Name`/`c4Technology`/
  `c4Description`. Raw `>` is legal XML but strict/non-conformant
  consumers (e.g. rlespinasse/drawio-export's Rust parser) and the
  round-trip contract want it escaped; an element named `A & B <C> "D"`
  now round-trips through `xmllint --noout` and a strict parser.
- C4-PlantUML **sequence/dynamic** input (`C4_Sequence.puml`,
  `participant`/sequence message syntax) no longer silently produces a
  valid-but-content-less `<mxGraphModel>` stub that renders as a blank
  image downstream. `Catalyst.convert()` now throws a clear, specific
  error; any input parsing to zero entities and zero relations is
  likewise rejected rather than emitting a stub.

## [1.4.0] - 2026-05-16

### Changed

- Replaced the dagre layout engine with elkjs (Eclipse Layout Kernel).
  Spec-driven algorithm selection: `layered` for hierarchical C4
  (Container/Component/Deployment), `force` for hub-and-spoke Context
  diagrams. Fixes the wide-ribbon layout for Context diagrams.
- Node sizing now uses real font metrics (fontkit + bundled Liberation
  Sans) instead of fixed per-type constants.
- Connectors carry the layout engine’s routed polyline as draw.io waypoints.
- Directional hints: `Rel_U/D` honored on the layered path; `Rel_L/R`
  honored when nodes share a rank; `Lay_*` fed as layout-only constraints.
- **BREAKING**: Converted from CLI application to library for npm distribution
- Refactored layout system architecture
- Improved slide content with updated examples
- Enhanced catalyst.mts with better layout integration
- package.json configured for ES modules with proper exports and type definitions
- TypeScript configuration optimized for library builds
- Relationship connectors no longer hardcode `entryX/entryY`/`elbow`; the
  orthogonal router picks the attach side from geometry, so routing is
  direction-agnostic (TB/BT/LR/RL) instead of forcing a left-side dog-leg.
- System-family label template renders `[%c4Type%]` (C4 `System` has no
  technology parameter — no stray `[System:]`).
- `make lint` and the `make ci` lint step now also run `markdownlint`,
  matching the CI `lint` job (previously the local pipeline never checked
  markdown, so a CI-only markdownlint failure could ship).

### Added

- Structural parity test + deterministic draw.io golden snapshot gate;
  exhaustive C4-PlantUML fixture. Independently maintained.
- LayoutEngine class to handle graph positioning
- Enhanced CI workflow with additional testing steps
- Library API with `Catalyst.convert()`, `Catalyst.parseEntities()`, and `Catalyst.parseRelations()` methods
- `CatalystOptions` interface for configuration
- Sample usage scripts in `./sample/` folder
- TypeScript declaration files for better IDE support
- Centered logo display in README
- Use-case corpus (`tests/fixtures/corpus/`, 19 fixtures): topology
  shapes, relationship variants, C4 levels, edge cases.
- Per-fixture structural sanity gate (`tests/corpus-sanity.test.mts`):
  well-formed XML, no dropped entity, every relation an edge with
  resolved endpoints in the PUML direction, non-empty verb, no `[]`
  artifact, descriptions preserved, distinct routes for same-pair edges.
- `src/layout/edgeLanes.mts`: pure, unit-tested multi-edge lane
  separator (`tests/edge-lanes.test.mts`).
- Dual-render gallery: `make gallery` / `scripts/gallery.mjs` →
  `docs/gallery/` (source `.puml` vs catalyst `.drawio`, indexed README).
- RelParser unit tests for `RelIndex` / numeric-alias safety.
- `markdownlint-cli` pinned as an exact devDependency.

### Removed

- **BREAKING**: CLI functionality and commander dependency
- PlantUML executable dependencies (now uses server-only approach)
- Legacy LayoutConverter class
- Unused SVG utilities
- `slides/` Slidev presentation deck (standalone; not part of the
  library build, tests, or CI) and its `/slides` Dependabot entry,
  `tsconfig.json` exclude, and `mdlint --ignore slides`.
- Gitpod configuration (`.gitpod.yml` and `.gitpod/automations.yaml`) —
  it was largely slides-driven and the project does not use Gitpod.
- `.devcontainer/` (Dev Container / "Ona" Gitpod-Flex image) — same
  ecosystem as the removed Gitpod config; the project does not use
  containerized/Codespaces dev. `.vscode/` is kept (project-relevant
  editor settings, decoupled).

### Fixed

- Linting errors across the codebase
- Test suite compatibility with new layout system
- Logo rendering issue in GitHub README
- Test suite updated to work with new library API
- Relationship label lost the verb and rendered an empty `[]` when there
  was no technology; the verb is now shown bold with the technology
  bracketed below it (and omitted entirely when absent).
- `Person`/`System` (and `_Ext`/`Db`/`Queue` variants) descriptions were
  dropped: their 3rd positional argument is the *description*, not a
  technology — now preserved.
- `RelIndex($index, $from, $to, …)` produced zero edges (the leading
  index was mis-parsed); now parsed, with the leading index consumed
  only for `RelIndex*` so a numeric source alias on a plain
  `Rel`/`BiRel` is not mistaken for an index.
- Emitted XML could be invalid: a literal `&` in a label/description was
  un-escaped to a bare `&`; only genuinely double-encoded entity refs
  are now reversed.
- Antiparallel (`Rel`+`Rel_Back`) and parallel-duplicate relations
  between the same node pair rendered collinear with stacked, unreadable
  labels; each is now fanned onto its own lane (perpendicular waypoint +
  offset label). ELK's obstacle-aware polyline is preserved when it has
  real bends.
