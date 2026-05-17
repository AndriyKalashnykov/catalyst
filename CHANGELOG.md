# Changelog

All notable changes to this project will be documented in this file.

This project adheres to [Semantic Versioning](http://semver.org/).

This project adheres to [Keep a CHANGELOG](http://keepachangelog.com/).

## [Unreleased]

### Fixed

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

### Changed

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
