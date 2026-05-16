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
> overflow, no box-on-box). These ARE backlog items 1 (#24 edge-label
> placement) + 2 (#25 nested-boundary-title spacing); byte-identical
> to the v1.5.0-era render so the release did not introduce them.
> **layered-architecture — PASS (revised; see the resolved-note
> below).** The original "text overflows the box bottom" verdict was a
> FALSE POSITIVE from reading the low-res committed PNG;
> `make render-compare` at proper scale proves the text is CONTAINED
> (sdk ends ~7u above box bottom, clm ~14u). Residual genuine gap:
> catalyst drops PlantUML `note` callouts entirely (2 missing here) —
> unimplemented-feature, tracked via item 3. **Net #19: no NEW v1.6.1
> regression in any of the 7;** deployment-profile concerns are
> pre-existing items 1/2.

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
> concerns are pre-existing items 1/2; the dropped-`note` feature gap
> is tracked via item 3 C4-COVERAGE).

---

> ✅ **#23 gallery visual review — COMPLETE 14/14 (2026-05-16).**
> Gallery regenerated from current `main` (committed copy WAS stale —
> predated v1.5→v1.6.1; fresh renders committed PR #41). Method:
> render-compare-scale crops (Pillow `/tmp/legible.py` + `/tmp/crop.py`;
> ImageMagick absent) — never the down-scaled committed PNG (the
> layered-rect lesson). **PASS (9):** edge-tags-styling (tag fill/dash
> correct; minor: `«critical»` tag stereotype text not shown, only
> `«System»`), level-component, rel-layout-constraints (`Lay_` → no
> visible edge ✓), rel-bidirectional (#33 antiparallel lanes work),
> rel-directional (up/down/left/right placement ✓), rel-tech-vs-notech
> (tech/no-tech labels ✓; same minor #24 antiparallel-junction
> tightness as rel-bidirectional), edge-empty-descriptions (empty
> desc handled cleanly), topology-disconnected (separate non-
> overlapping clusters ✓), topology-linear-chain (clean pipeline).
> **CONCERN = known pre-existing #24/#25, NOT new:** level-system-
> landscape (edge labels overlap nodes/boundary in the force layout,
> Enterprise_Boundary title tightness), topology-wide-rank
> (distributed hub fan, repeated `dispatch` labels near box edges) —
> both are items 1 (#24) / 2 (#25); plus the earlier pre-reviewed
> rel-long-labels (FIXED #32), topology-deep-nesting (FIXED-partial
> #34), topology-cyclic / -hub-spoke / rel-parallel-duplicate (#24
> limitation). **NEW real defects surfaced → backlog items 1
> (`edge-multiline-labels` cylinder-cap overflow), 2
> (`edge-unicode-specialchars` `<…>` strip), 3 (`level-dynamic`
> RelIndex-number drop).** #23 is CLOSED; no further review needed —
> the cylinder-cap fix LANDED (see next note); the remaining 2 fixes
> (now items 1–2: `<…>` strip, RelIndex-number drop) are
> render-compare-gated.

---

> ✅ **Cylinder elliptical-cap overflow — FIXED 2026-05-16 (was item
> 1).** Root cause confirmed and resolved: drawio `shape=cylinder3`
> (`SystemDb`/`ContainerDb`/`ComponentDb`) draws an elliptical cap of
> `CYLINDER3_CAP_PX` at both ends; `measureNode` used the rectangular
> text model with no cap reservation, so long content clipped at the
> bottom ellipse. Fix: `src/mx/c4/theme.mts` adds the cited constant
> `CYLINDER3_CAP_PX = 15` (drawio `CylinderShape3.prototype.size`,
> `Shapes.js`; drawn extent `max(0, min(h*0.5, size))` → 15 for the
> ≥90 floor — version-discipline-cited, not invented);
> `src/layout/measureNode.mts` reserves `2 × CYLINDER3_CAP_PX` for the
> exact 3 cylinder3 types (`_Ext` DB variants are grey rectangles,
> excluded). **Proven by `make render-compare` (BLOCKING gate, not
> tests-alone) + visual at 3× + controlled short/long pair:** K8s
> Secret (`edge-multiline-labels`) clipped → contained (H 120→144,
> "and private key" visibly inside); Order Cache control unchanged
> (H=100, no balloon, no regression); all 6 `edge-large-graph` DBs
> contained; `level-dynamic` Database (SystemDb) clean (a +48u
> heuristic reading was a measurement false-alarm — `cyan()` detector
> doesn't match SystemDb's darker fill; visual is the ground truth,
> the #19 lesson re-applied). 265/265 tests green; only
> `edge-multiline-labels` gallery output changed (the one box that
> genuinely needed to grow — minimal, regression-free by construction).

---

> ✅ **Literal `<…>` text STRIPPED from C4 names/descriptions —
> FIXED 2026-05-16 (was item 1).** Root cause traced (not the
> originally-guessed "PUML parse / sprite regex"): the value is
> correctly XML-escaped for the `c4*` attribute, but draw.io
> substitutes it into the `html=1` label `<div>`, so a raw `<x>`
> is parsed by the browser as an empty HTML tag and VANISHES.
> `c4Text` escaped `>` (`escGt`) but NOT `<`. Fix
> (`src/mx/Mx.mts`): added `escLt` (`<`→`&amp;lt;`, the `<`
> analogue of `escGt`'s `>`→`&gt;`; the extra `amp;` survives
> xml2js + the `Mx.generate()` un-double pass so the final XML
> attribute is `&amp;lt;` → draw.io XML-unescapes to `&lt;` →
> browser renders a literal `<`); `c4Text = htmlBreaks(escLt(escGt(s)))`.
> Proven: 265/265 (3 tests that had LOCKED the buggy raw-`<`
> output corrected to the fixed `&lt;` contract + a generic
> corpus-sanity lock on every fixture incl. `edge-unicode-specialchars`)
> plus a **`make render-compare` visual**: catalyst now renders "Café
> `<Backend>`" / "Handles `<angle>` & ampersand input" verbatim,
> matching PlantUML; unicode/`&`/layout unregressed. `<br/>` line
> breaks and literal `>` are unaffected (surgical).

---

> ✅ **C4 Dynamic `RelIndex` step numbers DROPPED — FIXED
> 2026-05-16 (was item 1; LAST of the 3 #23 defects).** Root cause:
> `RelParser`'s relation regex deliberately consumed+discarded the
> `RelIndex` leading ordinal via a NON-capturing group (to keep group
> numbering stable) — so `RelIndex(1, …, "opens")` emitted just
> "opens", losing the C4_Dynamic order (the entire point of the
> diagram). Fix (`src/puml/RelParser.mts`): re-extract the index from
> `match[0]` with a secondary regex (same safe pattern as the existing
> `$tags` extraction — zero group-renumbering, no risk to other
> primitives) and prefix the verb with `n:` (then a space) AT PARSE TIME, so
> `measureEdgeLabel` and the emit path both read the numbered `label`
> (single-source-correct). Proven: 265/265 (3 `RelParser` tests had
> LOCKED the buggy "discards the index" behavior — corrected to assert
> the fixed `n:`-prefix contract using `level-dynamic`'s exact `RelIndex`
> inputs, the authoritative lock) + **`make render-compare` visual**:
> catalyst now renders "1: opens / 2: GET /orders `[JSON/HTTPS]` /
> 3: SELECT `[SQL]`", matching PlantUML; layout/cylinder unregressed.
> **All 3 #23 defects (cylinder-cap #43, `<…>`-strip #44, RelIndex)
> now RESOLVED.** Remaining lossy-surface gap: PlantUML `note`
> callouts still unimplemented (tracked via item 3 C4-COVERAGE).

1. **#24 — deterministic Context-edge routing (BIG; DESIGN COMPLETE
   2026-05-16, ready to implement).**
   **Root cause (code-traced):** in `src/catalyst.mts` `layoutData2mx`
   the non-laned branch emits NO waypoint for a solo edge and computes
   the label offset from the *assumed* straight midpoint
   `((A.c+B.c)/2)` via `resolveLabelOverlap` (`src/layout/edgeLanes.mts`
   167-212). But with no catalyst waypoint, **drawio orthogonally
   auto-routes the edge itself** and anchors the label on *its* route —
   so catalyst's predicted anchor ≠ the rendered anchor. On Context
   (`LayoutEngine.mts` `org.eclipse.elk.stress`, ~L284) ELK returns
   only a 2-point start→end section (no bends) and **no label
   placement**, so there is nothing to read back — the prediction is
   unfalsifiable and usually wrong. (Hierarchical = `layered` +
   `ORTHOGONAL`: ELK *does* return bend points + label rects, read back
   in `LayoutEngine.mts` ~L376-393 into `LayoutEdge.points/label` — so
   hierarchical solo edges are already deterministic and MUST be left
   alone.) `resolveLabelOverlap` (#33) only nudges a label off a node
   it overlaps; it does not make the route deterministic.
   **Design (the proven laned mechanism, generalised to solo edges):**
   the laned branch already emits catalyst-computed interior waypoints
   (`poly.slice(1,-1)` perpendicular-shifted) + an absolute `offset`
   mxPoint and renders deterministically. Do the same for a solo
   Context edge: emit an explicit **border-to-border 2-point polyline**
   — intersect the A→B centre line with each endpoint's border rect
   (all of `nodeCenter` `{cx,cy,hw,hh}` is available at emit time,
   `catalyst.mts` ~L76-94) and emit those two points as Array points.
   drawio then draws exactly that segment (no auto-route), so the
   label anchor IS the geometric midpoint catalyst already assumes →
   `resolveLabelOverlap`'s precondition becomes *true* instead of
   approximate, and its existing perpendicular de-collision now lands
   correctly. If a straight segment crosses a third node (detect via
   the same `obstacles` boxes already built at `catalyst.mts` ~L167),
   insert ONE deterministic bend (offset perpendicular past the
   obstacle, mirrors the lane shift) — add this Phase-2 only if the
   gallery shows a real crossing; start straight-only.
   **Scope guard (BLOCKING — prevents the "changes routing broadly"
   risk):** apply the synthetic polyline ONLY when ALL hold: (a) edge
   is non-laned, (b) layout is Context/`stress` (NOT hierarchical),
   (c) ELK returned no usable bends for it. Hierarchical + laned edges
   keep their current path byte-identical. Add a guard test asserting
   no waypoint/route-signature delta on a hierarchical fixture.
   **Phases:** A (spike, no commit) — implement border-to-border on a
   1-edge + a label-on-node Context fixture, `make render-compare`
   prove the label now anchors where catalyst predicts; B — wire into
   the non-laned branch behind the scope guard; C — full gate.
   **Gating (all BLOCKING, per the proven discipline):**
   `corpus-sanity` route-signature stays distinct per same-node-pair
   group (`tests/corpus-sanity.test.mts` ~L119-131); `layout-quality`
   unchanged (routing moves no nodes — `tests/layout-quality.test.mts`);
   parity/golden topology byte-stable (no edge/node delta); the
   hierarchical no-delta guard; full 20-pair gallery re-review at
   render-compare scale; the #19 ibm-wm acceptance gate. Do NOT declare
   on tests — `make render-compare` the Context fixtures
   (`rel-*`, `topology-hub-spoke`, `level-system-landscape`) AND the
   ibm-wm `c4-context`/deployment pair.

2. **#25 — dense nested-boundary title collision (BIG, compound
   layout).** `titlePadding` reserves the band per compound node
   (children no longer overlap the title; title inset off the stroke —
   both shipped #34), but ELK packs sibling nested boundaries with
   minimal inter-boundary gap so their top title bands still collide in
   `topology-deep-nesting`. Needs title-band-aware spacing between
   sibling compound nodes (ELK compound spacing / extra padding).
   Design-first; same gates as #24.

3. **C4-COVERAGE.md validation + backlog the gaps (user-requested,
   medium).** Validate every `✗`/`~` row in `docs/C4-COVERAGE.md`
   against current code (it predates the v1.5–1.6 work — e.g. it still
   says Context uses `force`; it's `stress`+`sporeOverlap` now; the
   Surface-delta section IS current). Fix the doc, and add every
   genuinely-unimplemented `✗` (Deployment-node coverage rows, BiRel
   variants, RelIndex/dynamic, sprites, properties, legend, sequence
   diagrams) as concrete backlog items here.

4. **Palette + MX-flag single-sourcing (medium, same theme as #34).**
   Colours (`fillColor`/`strokeColor`/`fontColor` hexes — the C4/
   Structurizr palette) are still scattered literals across the 17
   shape files; and the `MX.*` flag enums in `theme.mjs` exist but the
   style objects still write bare `0`/`1` for `metaEdit`/`resizable`/
   `container`/`collapsible`/`html`/`dashed`/`fontStyle`. Single-source
   the palette into `theme.mjs` (documented provenance) and apply the
   `MX` enums at the call sites. Byte-identical output; verify via
   golden + a render diff.

5. **Sequence-diagram support (deferred feature, large, design-first).**
   catalyst fail-louds on `C4_Sequence`/PlantUML sequence. New
   subsystem (parser + deterministic non-ELK layout + umlLifeline
   emit). Full design context in memory `open-followups` item 4.

Deferred research (not blocking): Graphviz edge-routing benchmark
(reference only, memory `open-followups` item 2).
