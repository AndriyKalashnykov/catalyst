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

---

> 🔎 **#19 visual acceptance gate — EYEBALLED 2026-05-16 (7 of 7).**
> Verdicts (catalyst `_drawio/*.drawio.png` vs `_images/*.puml.png`):
> **PASS** — c4-cli (minor: K8s-Secret cylinder tight to the Kubernetes
> Cluster boundary subtitle = soft #25; `<workload>` placeholder
> stripped from a label = catalyst handling angle-brackets, benign),
> c4-component-sdk (clearly *better* than the cramped PUML render),
> c4-poc-stack (minor: one "Workload API (future)" label on the
> poc-node box + a namespace subtitle edge-clipped = #4/#24-class).
> **CONCERN, root-caused, NOT a v1.6.1 regression** —
> c4-deployment-profile-a/b/c (one shared template): triple-nested
> boundary title bands collide (a child box top overlaps the outer
> boundary's `[…]` subtitle: Customer Site ▸ Kubernetes Cluster ▸
> namespace:policy/cert-manager/…); "Mounts read-only"×N edge labels
> cluster/overlap near the top. Body content is clean (no in-box
> overflow, no box-on-box). These ARE backlog items 4 (#24 edge-label
> placement) + 5 (#25 nested-boundary-title spacing); byte-identical
> to the v1.5.0-era render so the release did not introduce them.
> **layered-architecture — PASS (revised; see the resolved-note
> below).** The original "text overflows the box bottom" verdict was a
> FALSE POSITIVE from reading the low-res committed PNG;
> `make render-compare` at proper scale proves the text is CONTAINED
> (sdk ends ~7u above box bottom, clm ~14u). Residual genuine gap:
> catalyst drops PlantUML `note` callouts entirely (2 missing here) —
> unimplemented-feature, tracked via item 6. **Net #19: no NEW v1.6.1
> regression in any of the 7;** deployment-profile concerns are
> pre-existing items 4/5.

---

> ✅ **"measureNode under-sizes → text overflows" — RESOLVED AS
> NOT-A-BUG 2026-05-16 (was the prior item 1).** Empirical
> `make render-compare` for `ibm-wm layered-architecture.puml` + pixel
> measurement of the Language SDK / CLM orchestrator Container boxes:
> description line-count is EXACTLY what `measureNode` predicts (6 desc
> lines, title 2, render==measure) and the lowest rendered glyph sits
> **7.2u (sdk) / 13.8u (clm) ABOVE the box bottom** — contained, no
> overflow. The #19 "spills below the rounded-rect" call was a FALSE
> POSITIVE from the down-scaled committed `_drawio/*.drawio.png`
> (436 px; light-grey `#cccccc` text near the `arcSize=10` corner
> blurs to look external). The written root cause ("mxGraph re-wraps
> the description narrower → more lines") was DISPROVEN: the box is
> `W=200` (Container `minW` floor) — WIDER than the `contentW≈157`
> measureNode wrapped at, so the renderer gets *more* width and
> produces the same 6 lines. **No code change** — a "fix" would inflate
> every box and churn golden/265 tests to chase a non-bug. Lesson →
> memory `no-guesses-fact-check-discipline`: a #19 eyeball MUST use
> render-compare-scale images (never the down-scaled committed PNG),
> and a confidently-written backlog root-cause is an untested
> hypothesis until render-compare confirms it. The moot "re-run #19
> after the fix lands" item is dropped (no fix lands; #19 conclusion:
> **no NEW v1.6.1 regression in any of the 7**; the deployment-profile
> concerns are pre-existing items 4/5; the dropped-`note` feature gap
> is tracked via item 6 C4-COVERAGE).

1. **`measureNode` does NOT reserve the cylinder elliptical-cap
   height → long content overflows/clips at the bottom ellipse of
   `*Db` shapes (NEW, from #23; render-compare/measurement-CONFIRMED,
   real-fix design-gated).** `shape=cylinder3` (ContainerDb / SystemDb
   / ComponentDb) draws top+bottom ellipses that consume ~15–20u each;
   `measureNode` sizes every type with the rectangular text model +
   the generic `[minW,minH]` floor, reserving NO cap height.
   **Controlled proof (identical 3× zoom, same `shape=cylinder3`):**
   `level-component`/Order Cache (~4 content lines, H=100) — last line
   "Hot order lookups" comfortably inside ✓; `edge-multiline-labels`/
   K8s Secret (~7 lines: 2-line name + tech + 3-line desc, H=120) —
   last line "and private key" clipped at/below the bottom ellipse ✗.
   Content-dependent, not a heuristic artifact (the short control fits;
   the long one clips). Also explains the c4-cli #19 "K8s Secret
   cylinder tight to boundary" note (same cause, milder). Fix shape:
   in `measureNode`, when the entity maps to a cylinder shape
   (the `*Db` types — confirm the exact set via `src/mx/c4/*Db.mts`
   `shape=`), add a cap reservation to the height = 2 × the drawio
   `cylinder3` ellipse-axis (a CITED drawio shape metric — read it
   from the cylinder3 stencil/`mxShapeCylinder` `size`/`maxSize`, NOT
   an invented constant; drawio's default cylinder `size` is a real
   documented value). **BLOCKING discipline (the layered-rect lesson
   applies):** prove with `make render-compare` for
   `edge-multiline-labels` AND a controlled short/long cylinder pair;
   golden/265 stay green (cylinders growing taller is monotonic-safe
   per the layout-quality rule); do NOT declare on tests. Verify the
   short control (Order Cache) does not regress (must still fit, not
   become huge).

2. **Literal `<…>` text is silently STRIPPED from C4 names /
   descriptions (NEW, from #23; data loss, real-fix).** PlantUML
   renders angle-bracketed literals verbatim; catalyst drops them
   entirely. **Evidence:** `edge-unicode-specialchars` — PUML "Café
   **`<Backend>`**" / "Handles **`<angle>`** & ampersand input" →
   catalyst "Café" / "Handles & ampersand input" (`<Backend>`/`<angle>`
   gone); `edge-multiline-labels` & c4-cli #19 — "K8s Secret
   `<workload>`-tls" → "K8s Secret -tls". The `Container.mts`
   `encodeHtmlEntities` correctly does `<`→`&lt;`, so the loss is
   UPSTREAM of the template — in the PUML parse / label pipeline
   (`splitLabelLines`/`htmlBreaks`/`labelLines`, or a sprite/tag regex
   eating `<…>`). Fix: trace where `<…>` is consumed pre-template;
   preserve it as escaped-literal so it renders like PlantUML. Add a
   corpus assertion (the `edge-unicode-specialchars` fixture exists
   precisely to lock this). Not overflow/collision but it is content
   loss — HIGH.

3. **#23 — gallery review IN PROGRESS (8 / 14 done 2026-05-16).**
   Gallery regenerated from current `main` (committed copy WAS stale —
   predated v1.5→v1.6.1; fresh renders committed this pass). Reviewed
   via render-compare-scale crops (Pillow `/tmp/legible.py`,
   `/tmp/crop.py`; ImageMagick absent). **PASS:** edge-tags-styling
   (tag fill/dash styling correct; minor: `«critical»` tag stereotype
   text not shown, only `«System»`), level-component, rel-layout-
   constraints (Lay_ → no visible edge ✓), rel-bidirectional (#33
   antiparallel lanes work; minor busy A–C junction). **DEFECTS (now
   items 1 & 2):** edge-unicode-specialchars (`<…>` strip — item 2),
   edge-multiline-labels (cylinder cap overflow — item 1; #32 multi-
   line edge-label wrap itself works fine). **STILL UNVIEWED (6):**
   edge-empty-descriptions, level-dynamic, level-system-landscape,
   rel-directional, rel-tech-vs-notech, topology-disconnected,
   topology-linear-chain (+ re-check wide-rank vs the #24 limitation).
   Procedure & verdicts above; finish the 6, fold any new real defect
   into the backlog, then `make gallery` (already regenerated) and the
   gallery review item is closeable. Pre-reviewed earlier (still
   valid): rel-long-labels FIXED #32; topology-deep-nesting FIXED-
   partial #34; wide-rank/cyclic/parallel = #24 limitation.

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
