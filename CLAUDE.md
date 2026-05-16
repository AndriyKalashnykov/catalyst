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

1. **Final release chain v1.6.1 (mechanical, do first — ships everything
   already merged).** Since v1.6.0, main gained: line-height fix (already
   in 1.6.0), edge-label wrap (#32), single-edge de-collision (#33),
   C4 typography single-source + the **10px edge-label bug fix** +
   boundary title band (#34). Steps: bump `package.json`/lock 1.6.0→
   1.6.1, README install pin `#v1.6.1`, CHANGELOG `[Unreleased]`→
   `[1.6.1] - <date>`; PR; merge; **annotated tag `v1.6.1`** + push.
   Then puml2drawio: branch, `printf 'v1.6.1\n' > CATALYST_REF`,
   `rm -rf vendor/`, `make examples-png`, `make examples-check`, PR,
   merge, `git tag -a v1.5.4`, push, `make release-floating-tags
   VERSION=v1.5.4`. **Gating rule:** verify ghcr published before
   ibm-wm — the docker metadata action publishes the **v-LESS** tag
   (`ghcr.io/andriykalashnykov/puml2drawio:1.5.4`, NOT `:v1.5.4`);
   confirm `:1`==`:1.5.4` by digest. Then ibm-wm: branch, bump the
   `.github/workflows/diagrams.yml` SHA pin to v1.5.4's `^{}` commit
   (`git ls-remote … 'refs/tags/v1.5.4^{}'`) + the "bundles catalyst
   vX" comment + `CLAUDE.md` pin note (DON'T blanket-sed the historical
   "vX.Y.1 fixed …" note — it bit twice), `make diagrams-clean
   diagrams-embed` + `diagrams-drawio-png`, commit the 10 regenerated
   `_drawio/*.drawio.png`, PR (the `diagrams-pass` gate re-renders and
   stale-checks). See memory `release-chain-topology`.

2. **#19 — BLOCKING final visual acceptance gate.** After (1), visually
   compare all **10** ibm-wm `_drawio/*.drawio.png` against the baseline
   at pinned sha `a6cd3cc` AND their `_images/*.puml.png` PlantUML
   renders. Per-phase gates already PASSed for c4-admin-sidecar /
   c4-context / c4-container; the other 7 were asserted via the test
   suite + zero-regression spike, NOT eyeballed — eyeball them now.
   Pass = visibly ≥ the PlantUML render, no overflow/collision.

3. **#23 — finish the 20-pair gallery visual review.** 6 reviewed
   (rel-long-labels FIXED #32; topology-deep-nesting boundary FIXED-
   partial #34; wide-rank/cyclic/parallel = the #24 limitation; cyclic
   ok). 14 unviewed: edge-empty-descriptions, edge-multiline-labels,
   edge-tags-styling, edge-unicode-specialchars, level-component,
   level-dynamic, level-system-landscape, rel-bidirectional,
   rel-directional, rel-layout-constraints, rel-tech-vs-notech,
   topology-disconnected, topology-linear-chain (+ re-check wide-rank).
   Read `docs/gallery/img/<f>.drawio.png` vs `<f>.puml.png`; fix real
   defects (real fixes, no magic constants), regenerate `make gallery`.

4. **#24 — deterministic Context-edge routing (BIG, design-first).**
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

5. **#25 — dense nested-boundary title collision (BIG, compound
   layout).** `titlePadding` reserves the band per compound node
   (children no longer overlap the title; title inset off the stroke —
   both shipped #34), but ELK packs sibling nested boundaries with
   minimal inter-boundary gap so their top title bands still collide in
   `topology-deep-nesting`. Needs title-band-aware spacing between
   sibling compound nodes (ELK compound spacing / extra padding).
   Design-first; same gates as #24.

6. **C4-COVERAGE.md validation + backlog the gaps (user-requested,
   medium).** Validate every `✗`/`~` row in `docs/C4-COVERAGE.md`
   against current code (it predates the v1.5–1.6 work — e.g. it still
   says Context uses `force`; it's `stress`+`sporeOverlap` now; the
   Surface-delta section IS current). Fix the doc, and add every
   genuinely-unimplemented `✗` (Deployment-node coverage rows, BiRel
   variants, RelIndex/dynamic, sprites, properties, legend, sequence
   diagrams) as concrete backlog items here.

7. **Palette + MX-flag single-sourcing (medium, same theme as #34).**
   Colours (`fillColor`/`strokeColor`/`fontColor` hexes — the C4/
   Structurizr palette) are still scattered literals across the 17
   shape files; and the `MX.*` flag enums in `theme.mjs` exist but the
   style objects still write bare `0`/`1` for `metaEdit`/`resizable`/
   `container`/`collapsible`/`html`/`dashed`/`fontStyle`. Single-source
   the palette into `theme.mjs` (documented provenance) and apply the
   `MX` enums at the call sites. Byte-identical output; verify via
   golden + a render diff.

8. **Sequence-diagram support (deferred feature, large, design-first).**
   catalyst fail-louds on `C4_Sequence`/PlantUML sequence. New
   subsystem (parser + deterministic non-ELK layout + umlLifeline
   emit). Full design context in memory `open-followups` item 4.

Deferred research (not blocking): Graphviz edge-routing benchmark
(reference only, memory `open-followups` item 2).
