# CLAUDE.md — catalyst (PlantUML C4 → draw.io converter)

Standalone, independently-maintained library (no upstream; never add an
`upstream` remote or interact with any parent repo — `gh` default repo is
`AndriyKalashnykov/catalyst`). Consumed downstream by **puml2drawio**
(wraps catalyst at a pinned `CATALYST_REF` tag) → **ibm-wm-cert-management**
(renders its `docs/architecture/*.puml`). All three live at
`/home/andriy/projects/{catalyst-fork,puml2drawio,ibm-wm-cert-management}`.

## Build / test / verify

- `npm run build` — tsc (TS6, `moduleResolution: bundler`) + copy-assets.
- `npm test` / `npx vitest run` — full suite (parity, golden, layout-quality,
  corpus-sanity, output-correctness, unit). Must stay green.
- `npm run lint` (oxlint) + `npm run mdlint` (markdownlint; **MD007 wants
  4-space nested-list indent — never 2**, it bit the CHANGELOG repeatedly).
- `npm run test:coverage` — CI gate, thresholds 85 % (currently ≈97 %).
- `make ci` = build+lint+test; `make ci-run` = the real `.github/workflows/
  ci.yml` via mise-managed `act` (Docker needed).
- Visual proof: `PLANTUML_VERSION=1.2026.2 RENDER_SRC=<puml> RENDER_OUT=<dir>
  make render-compare` (java+docker; renders PlantUML PNG + catalyst→drawio
  PNG side by side). `make gallery` renders the 20-fixture corpus into
  `docs/gallery/`. Large PNGs: render at `DRAWIO_EXPORT_SCALE=1` to view.

## Non-negotiable discipline (this codebase + portfolio rules)

- **No magic constants.** Every numeric must be a real metric (font/
  geometry) or a cited renderer constant. Cited constants live in
  `src/text/TextMetrics.mjs` (`MX_LINE_HEIGHT=1.2`,
  `MX_DEFAULT_FONTSIZE=11`, both verified in jgraph/mxgraph
  `util/mxConstants.js` + maxGraph) and `src/mx/c4/theme.mjs` (the C4
  type scale + `MX` flag enums, each annotated with WHERE the renderer
  gets it). Single-source any value the renderer reads so measurement
  cannot desync from templates.
- **Renderer-style cascade** (see memory `renderer-style-cascade`): to
  size/predict rendered text use the value the renderer ACTUALLY applies
  — cell `style()` `fontSize` > inline `<div style>` CSS > engine
  default. A "cited default" is wrong if a cell override exists (this is
  exactly the 10px edge-label bug).
- **golden/parity tests fingerprint topology, not coordinates** — they
  prove "no structural regression", NOT that sizing/visual is correct.
  `layout-quality` (no leaf overlap, ≥ C4 min size) is monotonic-safe
  for "boxes grew". Sizing/visual correctness must be proven by an
  empirical `render-compare`, not by "tests green".
- **Release = annotated git tag on `main`, no GitHub Release**
  (downstream Renovate uses `github-tags`). PR workflow, squash-merge,
  branch from fresh `origin/main` (`git reset --hard origin/main` only
  with a clean tree — it silently wipes uncommitted work; bit this
  session twice).
- Commit author: prefix env vars
  (`GIT_AUTHOR_NAME="$(git config user.name)" …`); single-quote `-m`
  messages containing `!` (zsh history-expansion ate `!include`).
- zsh does NOT word-split unquoted vars (no bash `for f in $LIST`).

## Where things are

- Layout: `src/layout/LayoutEngine.mts` (ELK; `layered`+`NETWORK_SIMPLEX`
  for hierarchical, `stress`+`sporeOverlap` declump for Context;
  `titlePadding`, `leafWidths`/`edgeCap`), `src/layout/measureNode.mts`
  (`measureNode`, `measureEdgeLabel`), `src/layout/edgeLanes.mts`
  (`assignEdgeLanes` multi-edge fan, `resolveLabelOverlap` single-edge
  de-collision).
- Emit: `src/catalyst.mts` (`layoutData2mx` — the edge/label emit loop,
  `edgeLabelCap`), `src/mx/Mx.mts`, `src/mx/c4/*.mts` (17 shape
  templates, all import `theme.mjs`).
- Text: `src/text/TextMetrics.mts`, `src/text/labelLines.mts`
  (`splitLabelLines`, `htmlBreaks`, `wrapEdgeLabelLines`).
- Decisions: `docs/adr/0001..0006`; running log `docs/UPGRADE-NOTES.md`;
  coverage matrix `docs/C4-COVERAGE.md`. Agent memory:
  `~/.claude/projects/-home-andriy-projects-catalyst-fork/memory/`
  (`open-followups` IS the durable tracker — GH Issues are disabled).

## BACKLOG — continue here (priority order)

Everything below is researched, not speculative. Sizes are honest.

> ✅ **Release chain v1.6.1 — DONE 2026-05-16.** catalyst v1.6.1
> (tag `v1.6.1`, `^{}`=`113a661`; PRs #36+#37) → puml2drawio v1.5.4
> (tag `v1.5.4`, `^{}`=`80967616`; PR #93; ghcr `:1.5.4`==`:1.5`==`:1`
> digest `sha256:a01904b0…`; floating tags retargeted) → ibm-wm SHA-pin
> `80967616…` (PR #12, `diagrams-pass` green; diagrams byte-identical
> across catalyst v1.5.0→v1.6.1 for that corpus — fresh regen verified
> via mtimes, not stale). Memory `release-chain-topology` updated.

1. **#19 — BLOCKING final visual acceptance gate.** After the release, visually
   compare all **10** ibm-wm `_drawio/*.drawio.png` against the baseline
   at pinned sha `a6cd3cc` AND their `_images/*.puml.png` PlantUML
   renders. Per-phase gates already PASSed for c4-admin-sidecar /
   c4-context / c4-container; the other 7 were asserted via the test
   suite + zero-regression spike, NOT eyeballed — eyeball them now.
   Pass = visibly ≥ the PlantUML render, no overflow/collision.

2. **#23 — finish the 20-pair gallery visual review.** 6 reviewed
   (rel-long-labels FIXED #32; topology-deep-nesting boundary FIXED-
   partial #34; wide-rank/cyclic/parallel = the #24 limitation; cyclic
   ok). 14 unviewed: edge-empty-descriptions, edge-multiline-labels,
   edge-tags-styling, edge-unicode-specialchars, level-component,
   level-dynamic, level-system-landscape, rel-bidirectional,
   rel-directional, rel-layout-constraints, rel-tech-vs-notech,
   topology-disconnected, topology-linear-chain (+ re-check wide-rank).
   Read `docs/gallery/img/<f>.drawio.png` vs `<f>.puml.png`; fix real
   defects (real fixes, no magic constants), regenerate `make gallery`.

3. **#24 — deterministic Context-edge routing (BIG, design-first).**
   Root cause (researched): non-laned edges get NO catalyst waypoint →
   drawio orthogonally auto-routes them and anchors the label on that
   route; on `stress`/`force` ELK neither routes nor places labels, so
   catalyst can't predict the anchor. `resolveLabelOverlap` (#33) only
   fixes the "midpoint INSIDE a node" subset. Plan: for non-laned
   Context edges emit an explicit deterministic polyline (straight
   border-to-border or an obstacle-aware single bend) so the label
   anchor is catalyst-known, then `resolveLabelOverlap` against THAT.
   Generalises the proven lane waypoint+offset to solo edges. Risk:
   changes routing broadly — gate via corpus-sanity route signatures +
   layout-quality + full 20-pair gallery + the #19 ibm-wm gate.

4. **#25 — dense nested-boundary title collision (BIG, compound
   layout).** `titlePadding` reserves the band per compound node
   (children no longer overlap the title; title inset off the stroke —
   both shipped #34), but ELK packs sibling nested boundaries with
   minimal inter-boundary gap so their top title bands still collide in
   `topology-deep-nesting`. Needs title-band-aware spacing between
   sibling compound nodes (ELK compound spacing / extra padding).
   Design-first; same gates as #24.

5. **C4-COVERAGE.md validation + backlog the gaps (user-requested,
   medium).** Validate every `✗`/`~` row in `docs/C4-COVERAGE.md`
   against current code (it predates the v1.5–1.6 work — e.g. it still
   says Context uses `force`; it's `stress`+`sporeOverlap` now; the
   Surface-delta section IS current). Fix the doc, and add every
   genuinely-unimplemented `✗` (Deployment-node coverage rows, BiRel
   variants, RelIndex/dynamic, sprites, properties, legend, sequence
   diagrams) as concrete backlog items here.

6. **Palette + MX-flag single-sourcing (medium, same theme as #34).**
   Colours (`fillColor`/`strokeColor`/`fontColor` hexes — the C4/
   Structurizr palette) are still scattered literals across the 17
   shape files; and the `MX.*` flag enums in `theme.mjs` exist but the
   style objects still write bare `0`/`1` for `metaEdit`/`resizable`/
   `container`/`collapsible`/`html`/`dashed`/`fontStyle`. Single-source
   the palette into `theme.mjs` (documented provenance) and apply the
   `MX` enums at the call sites. Byte-identical output; verify via
   golden + a render diff.

7. **Sequence-diagram support (deferred feature, large, design-first).**
   catalyst fail-louds on `C4_Sequence`/PlantUML sequence. New
   subsystem (parser + deterministic non-ELK layout + umlLifeline
   emit). Full design context in memory `open-followups` item 4.

Deferred research (not blocking): Graphviz edge-routing benchmark
(reference only, memory `open-followups` item 2).
