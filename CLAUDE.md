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
- **`make factcheck` — the NO-EYEBALLING fidelity gate (run it for any
  geometry/emit change).** Audits ALL puml→drawio conversions — the
  20-fixture gallery corpus AND the 6 canonical C4-PlantUML-spec
  fixtures in `tests/fixtures/` (c4-exhaustive, c4-all-rel-variants,
  …) — 26 total. Renders each to PlantUML SVG
  (the `-tsvg` vector ground truth) and runs
  `scripts/factcheck-geometry.mjs`, a numeric PlantUML→drawio
  comparator: `entityMiss / relMiss / arrowBad` (arrowhead count ≠ C4
  semantic) `/ labelDrop / attachMerge` (same-pair edges collapsing)
  `/ labelHit` (label over a non-endpoint leaf) `/ nodeOverlap /
  boundaryBands`, plus advisory `rankOrder / wRatio / hRatio`. No args
  → whole-corpus `CLEAN N/20` summary; `node scripts/factcheck-geometry.mjs
  <stem>…` → per-fixture JSON. A fixture is "clean" ONLY when every
  contract metric is 0. **Visual claims about a fixture MUST cite a
  factcheck number, never a PNG eyeball** (the harness itself was built
  by fact-checking and fixing each of its own false-positives — offset-
  aware label anchor, mxGraph last-key style, `<br/>`/`\n`/XML-escape
  normalisation, advisory rank-order). Needs java + a one-time
  `make gallery` to fetch `plantuml.jar`.
- Visual proof (corroborative only): `PLANTUML_VERSION=1.2026.2
  RENDER_SRC=<puml> RENDER_OUT=<dir> make render-compare` (java+docker;
  PlantUML PNG + catalyst→drawio PNG side by side). `make gallery`
  renders the 20-fixture corpus into `docs/gallery/`. Large PNGs:
  render at `DRAWIO_EXPORT_SCALE=1`.

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

- Layout: `src/layout/LayoutEngine.mts` (ELK; **always**
  `layered`+`NETWORK_SIMPLEX` — Context too, matching PlantUML/`dot`;
  ADR 0008 superseded the old Context→`stress` branch;
  `titlePadding`, `leafWidths`/`edgeCap`), `src/layout/measureNode.mts`
  (`measureNode`, `measureEdgeLabel`), `src/layout/edgeLanes.mts`
  (`assignEdgeLanes` multi-edge fan, `resolveLabelOverlap` single-edge
  de-collision).
- Emit: `src/catalyst.mts` (`layoutData2mx` — the edge/label emit loop,
  `edgeLabelCap`), `src/mx/Mx.mts`, `src/mx/c4/*.mts` (17 shape
  templates, all import `theme.mjs`).
- Text: `src/text/TextMetrics.mts`, `src/text/labelLines.mts`
  (`splitLabelLines`, `htmlBreaks`, `wrapEdgeLabelLines`).
- Decisions: `docs/adr/0001..0009` (0007 sequence design, 0008
  Context→layered, 0009 cycleBreaking=DEPTH_FIRST); running log
  `docs/UPGRADE-NOTES.md`;
  coverage matrix `docs/C4-COVERAGE.md`. Agent memory:
  `~/.claude/projects/-home-andriy-projects-catalyst-fork/memory/`
  (`open-followups` IS the durable tracker — GH Issues are disabled).

## BACKLOG — continue here (priority order)

Everything below is researched, not speculative. Sizes are honest.

> ▶ **RESUME HERE — session handoff 2026-05-17 (refreshed #5).**
> **`make factcheck` is now THE gate** (CLAUDE.md "Build/test/verify"):
> numeric PlantUML→drawio comparator over ALL 26 conversions (20
> gallery corpus + 6 C4-spec fixtures) vs PlantUML `-tsvg`. NO
> eyeballing — every visual claim cites a factcheck metric. The repo
> AUTO-MERGES PRs on green CI (no manual merge/Monitor needed; just
> push + `gh pr create`, then `git reset --hard origin/main`).
>
> - **✅ P12 DONE 2026-05-17 — `make factcheck` CLEAN 26/26** (was
>   23/26; 341/341 tests). THREE fact-verified root causes, NOT the
>   handoff's disproved hypothesis (which it warned against):
>   1. **`c4-container` labelHit=2 — #24-hier base-point bug.** The
>      multi-bend branch (catalyst.mts, the `else if poly>2`) computed
>      `offset = ELK-label-centre − polylineMidpoint(ELK_poly)` but
>      catalyst emits only the INTERIOR waypoints and lets drawio
>      re-anchor endpoints to CELL CENTRES — so the offset was
>      calibrated against ELK's attach-point poly yet applied against
>      drawio's centre-endpoint route (~186 px base-point mismatch →
>      label onto `docker`). Fix: anchor on the rendered route
>      `[A-centre,…interior,B-centre]` (provable vs the oracle).
>   2. **`c4-all-rel-variants`/`c4-exhaustive` labelHit — laned label
>      on an unrelated leaf.** New pure helper `slideLabelAlongLane`
>      (edge-lanes.mts) slides the label ALONG its lane line (axis =
>      src→tgt unit), minimal gate-predicate-identical distance,
>      ±0.5 px rounding-envelope; 0 when clear ⇒ byte-identical for
>      the 24 already-clean. Wired at the lane emit site.
>   3. **`c4-all-rel-variants` attachMerge — clamp-merge + 1 gate
>      false-positive.** Real: `clamp01(0.5+px·shift/2hw)` saturated
>      ≥4-lane outer attach fractions at the SAME corner → replaced
>      with even border distribution `0.5+dir·lane/(K−1)` (provably
>      ≥extent/(K−1) apart, never clamps). Gate FP (6th class, fixed):
>      `attachMerge` compared only attach-X, flagging a Y-separated
>      HORIZONTAL fan (b→c, 66 px apart) → now EUCLIDEAN 2-D attach
>      distance using exitY/entryY. New `FACTCHECK_DEBUG` env on the
>      comparator (durable labelHit+attachMerge diagnostics).
>   Visual corroboration (render-compare): c4-container labels off
>   `docker`; c4-all-rel-variants — all 17 labels clear, attaches
>   fanned. New memories: see `factcheck-harness-gate` (6th FP class),
>   `lane-label-decollision`.
>
> - **MERGED:** #70 P4 (Context→`layered`, ADR 0008; cascaded P3/P5/P7
>   resolved), #71 P1 (lane labels), #72 P6 (boundary title band),
>   #73 P8 (tag stereotypes), #74 P10 (per-lane attach pts), #75 P9
>   (cycleBreaking=DEPTH_FIRST), #76 (harness offset-aware + complete
>   26-conversion gate). 334/334 tests.
> - **ALL original gallery-audit defects P1–P11 DONE** (P11 was a
>   harness artifact; 5 harness false-positives each fact-checked &
>   fixed). Corpus **20/20 clean**.
>
> **REMAINING (priority order), each its own factcheck-gated PR:**
>
> - **P12 — ✅ DONE** (see the ✅ block above; `make factcheck`
>   CLEAN 26/26, 341/341). No longer the entry point.
> - **P2** (#5) — Rel_L/R: ELK partitioning spiked, insufficient;
>   needs deeper layout spike. Advisory (rankOrder), not a contract.
> - **P4b** (#11) — box-emptiness: measured PlantUML targets
>   recorded; cross-cutting all-fixture visual change, ADR-worthy.
> - **#15** codebase magic-constant audit; **#17** geometry-path↔
>   harness-check coverage matrix.
> - [ ] **P13 — gallery page column-width uniformity (user-requested
>   2026-05-17).** On `docs/gallery/` the per-fixture "Source PlantUML"
>   vs "catalyst → draw.io" image pair currently renders at wildly
>   different widths across use cases (e.g. topology-wide-rank is very
>   wide, topology-linear-chain very narrow), so the page reads ragged.
>   GOAL: every fixture's two embedded images occupy the SAME width
>   column-to-column down the page (and ideally the two within a pair
>   match each other). Needs smart scaling — of the rendered nodes
>   and/or of the embedded `<img>` sizing (note `md-image-embedding`:
>   ~26× corpus aspect spread, scale-2 PNGs, gallery is
>   `scripts/gallery.mjs`-generated). RESEARCH how the field solves
>   non-uniform diagram-grid layouts (fixed-width thumbnails +
>   object-fit, per-image normalized scale, max-width container,
>   aspect-ratio boxes), spike ≥2 approaches, compare results
>   side-by-side, implement the best. Gate: regenerated gallery is
>   visually uniform-width; no factcheck/geometry change (presentation
>   only — must not perturb the emit path).
> - **Sequence diagrams** (#12, ADR 0007) — largest; MUST ship with
>   factcheck coverage (lifelines/messages/order) per user directive.
> Older handoff history below for context.
>
> ▶ (prior) **session handoff 2026-05-16 (refreshed #2).**
> All this-session PRs MERGED; `main` synced (`ce30c50`), 317/317.
> Big backlog sweep done — #24-hier impl (#56), label-offset
> scope-lock (#57), `Rel_Back` arrowhead reversal (#58), Boundary
> subtitle→PlantUML lowercase tag (#60), `_Ext` DB/Queue keep
> cylinder/queue shape (#63), 3 stale C4-COVERAGE entries
> fact-corrected (#59 + the boundary/`_Ext` doc fixes), README +
> gallery image-embed right-sized (#64/#65), **ADR 0007
> sequence-diagram DESIGN (#66)**. All fact-checked vs pinned
> C4-PlantUML, byte-scope + render-compare gated.
 > Then `$lineStyle`/`$borderStyle`/`$shadowing`/`$thickness`
> faithful mapping shipped (#68, Item-2). A full **gallery visual
> audit** of all 20 fixtures was then run from latest sources.
> **(1)** Working tree clean; just `git fetch origin --prune && git
> reset --hard origin/main` to start fresh.
> **(2) Live backlog — TOP PRIORITY is the new
> "▶▶ GALLERY VISUAL AUDIT" section below (P1–P8, image-linked).**
> Suggested order: **P4 systemic oversized-box/sparse-layout FIRST**
> (cascades into P3 long-label blow-up + P6 nested-title collision +
> the diagonal-chain aesthetic), then **P1 multi-edge lane
> separation (SEVERE — rel-parallel-duplicate orphans 2 of 3
> edges)**, then P2 directional hints, P5 hub label cram, P7 short-
> edge label cram, P8 tag stereotype. Each pattern lists the exact
> `docs/gallery/img/<stem>.{puml,drawio}.png` pair to re-diff after
> a fix. Then: Sequence-diagram IMPLEMENTATION (design settled in
> `docs/adr/0007-sequence-diagram-support.md`, #66; phased), and the
> remaining genuinely-low C4 residuals (`$sprite`,
> `SET_SKETCH_STYLE`/`LAYOUT_AS_SKETCH`, `SHOW_LEGEND*`,
> `AddProperty`, dropped `note`; `$lineStyle`/`$shadowing` DONE #68).
> – Optional: 3 no-PR stale remote branches
> (`add-typescript-and-dagre-types`, `copilot/fix-linting-and-
> testing-issues`, `tsconfig-forward-compat`) — user-decision to
> prune (left intact: no MERGED confirmation, not this session's).
> **Merged this session (2):** #56 #24-hier, #57 scope-lock, #58
> Rel_Back, #59 boundary doc, #60 boundary subtitle, #63 `_Ext`
> shape, #64 README img, #65 gallery img, #66 ADR-0007 (+ Renovate
> #61/#62 dep pins). New memories: `self-audit-introduced-literals`,
> `c4-plantuml-renovate-tracked`, `md-image-embedding`.

---

> ✅ **Palette + MX-flag single-sourcing — DONE (PR #53, pending
> merge) 2026-05-16.** Was item 3. `theme.mts` now holds `PALETTE`
> (every fill/stroke/font hex, **fact-checked provenance**:
> catalyst-own, NOT byte-equal to C4-PlantUML v2.13.0 — verified
> against the pinned source; some coincide, most don't, documented
> inline), `SHAPE` (arcSize/strokeWidth/arrow+jump sizes), `C4_MIN`
> (per-type leaf floors); `MX` enum applied for all bare `0/1`
> flags; `DECIMAL_RADIX` (`src/constants.mts`) for the 3
> `parseInt(…,10)`; `LayoutEngine` `spaceAdvance(11)`→
> `MX_DEFAULT_FONTSIZE` ×2. Gate: corpus byte-diff vs a FRESH
> post-#52 baseline — ALL 20 fixtures byte-identical (palette / MX /
> numerics, 3 incremental gates); 287/287; mdlint. Provenance was
> the only research risk and it was fact-checked, not guessed. Merge
> #53 per the RESUME-HERE block.

---

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
> overflow, no box-on-box). These ARE the #24 routing fix (now landed) + backlog item 1 (#25
> nested-boundary-title spacing); byte-identical
> to the v1.5.0-era render so the release did not introduce them.
> **layered-architecture — PASS (revised; see the resolved-note
> below).** The original "text overflows the box bottom" verdict was a
> FALSE POSITIVE from reading the low-res committed PNG;
> `make render-compare` at proper scale proves the text is CONTAINED
> (sdk ends ~7u above box bottom, clm ~14u). Residual genuine gap:
> catalyst drops PlantUML `note` callouts entirely (2 missing here) —
> unimplemented-feature, tracked via item 3. **Net #19: no NEW v1.6.1
> regression in any of the 7;** deployment-profile concerns are
> pre-existing: #24 (now fixed) + item 1 (#25).

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
> concerns: #24 routing now fixed; #25 is item 1; the dropped-`note`
> gap is tracked via item 1 C4-COVERAGE).

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
> are the #24 fix (landed) + item 1 (#25); plus the earlier pre-reviewed
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
> callouts still unimplemented (tracked via item 1 C4-COVERAGE).

---

> ✅ **#24 deterministic Context-edge routing — FIXED 2026-05-16.**
> Implemented per the design (Phases A/B/C all done). **Mechanism:**
> the non-laned branch (`src/catalyst.mts`) now emits ONE waypoint at
> the A↔B centre-midpoint **only when `LayoutResult.context === true`**
> (new flag on `src/layout/LayoutEngine.mts`, `= !isHierarchical()`)
> and neither endpoint is a cluster — drawio then routes straight
> THROUGH it (no orthogonal auto-route), so the edge's path-midpoint
> equals exactly what `resolveLabelOverlap` assumes and its
> de-collision lands correctly. Simpler than the designed
> border-to-border polyline (a single centre waypoint = the proven
> laned solo-waypoint path with `lane.shift==0`) and sufficient — the
> render-compare proof below confirms it. **Scope guard PROVEN
> (entity-verified):** every fixture with real hierarchical entities
> (edge-large-graph 18, level-component 4, edge-multiline-labels 2,
> edge-empty-descriptions 1) is byte-identical; `rel-parallel-duplicate`
> (Context but all-laned) byte-identical too — only non-laned Context
> solo edges changed, exactly as designed. New BLOCKING discriminator
> test in `tests/layout/context-stress.test.mts` (Context→true,
> any-Container→false). **Gate (all green, not tests-alone):**
> 265/265 incl. corpus-sanity route-signature + parity + golden +
> layout-quality; hierarchical no-delta empirically proven; Phase-C
> `make render-compare` visual sample — level-system-landscape
> flagship "charges [HTTPS]"-on-Customer-box defect **FIXED** (label
> now in clear space), rel-directional no-regression, topology-hub-spoke
> **improved**, topology-wide-rank deterministic/no-regression; all
> sampled labels clear of node interiors. The #19 ibm-wm `c4-context`
> acceptance gate runs at the next release-chain consumption (per the
> standard catalyst→puml2drawio→ibm-wm flow), as with every prior fix.

---

> ✅ **#25 dense nested-boundary title collision — FIXED 2026-05-16.**
> **Root cause (spike-corrected — the design's "hierarchical sibling
> packing" was imprecise):** `topology-deep-nesting` has only
> System/Person leaves, so `isHierarchical()` was false →
> `org.eclipse.elk.stress`. Instrumenting the real ELK graph proved
> `stress` does NOT honor `elk.padding` for compound nesting (bumping
> `elk.padding[top]` 33→100 moved the nested child **0u**; a clean
> `layered` repro honored it exactly). So nested boundaries sat 12u
> apart vs the 33u title band → bands collided. **Fix
> (`src/layout/LayoutEngine.mts`):** a second structural, spec-grounded
> `isHierarchical()` trigger — a **nested compound** (boundary-in-
> boundary) is hierarchical regardless of leaf types and MUST use
> `layered` (which reserves the per-compound title band). Single-level
> boundaries stay Context. **Proven (not tests-alone):** Step-0
> BLOCKING gate added FIRST (`tests/layout/compound-title-clearance.mts`
> — recomputes the required clearance from the same primitives
> `titlePadding()` uses; FAILED on `topology-deep-nesting` 12u<33u
> pre-fix, now 236u≫33u); 287/287 incl. that gate + corpus-sanity +
> parity + golden + layout-quality + compound-boundary; `make ci`
> clean; **scope proven** — only `topology-deep-nesting` changed in
> the 20-fixture gallery (all Context/single-level/hierarchical
> fixtures byte-identical); `make render-compare` visual — "Acme
> Corp"/"Platform"/"Core Services" title bands now distinct and
> clearly separated. #19 ibm-wm gate at next release-chain consumption.

---

> ✅ **C4-COVERAGE.md validation — DONE 2026-05-16.** Re-validated
> every `✗`/`~` row against current code. Many predated v1.5 and were
> stale → corrected in-doc: algorithm (`force`→`stress`+`sporeOverlap`
> declump, +the #25 nested-compound→`layered` trigger, +#24 Context
> waypoints); `RelIndex*` ✗→✓ (#45); `Rel_Up/Down/Left/Right` ✗→✓
> and `BiRel`/`BiRel_*` ~/✗→✓ (regex already long-form-aware);
> `Deployment_Node`/`Node`/`_L`/`_R` ✗→✓ (#25-hardened);
> `Enterprise_Boundary` ~→✓ (dedicated template); the `*Queue`/`*Db`
> "reuses ContainerDb" rows corrected to "own template, dedicated
> shape; only per-type COLOUR is shared" (the residual `~`). The
> corrected Tier-2/Tier-3 in `docs/C4-COVERAGE.md` IS the concrete
> enumeration of genuine remaining gaps — not duplicated here. The
> Deployment-node / BiRel / RelIndex items the original task named are
> now ✓ (this session shipped them), so they are NOT backlogged.

---

> ✅ **`edge-large-graph` #24-hier edge-label cram — FIXED
> 2026-05-16 (was item 1; the CORRECTED hypothesis, executed).**
> Root cause was MEASUREMENT-CORRECT: the crammed edges
> (`integrates`/`reads-writes` → External 1–6) are non-laned
> **poly>2 (multi-bend)** ELK routes emitted by the
> `else if (poly && poly.length > 2 …)` branch (`src/catalyst.mts`),
> which emitted ELK's bend waypoints but **NO label offset** →
> drawio auto-anchored the label at the routed polyline's
> length-midpoint → cram. **Fix (surgical, that branch only):**
> thread ELK's reserved label rect (`layoutEdgeLabelByRelIdx`,
> previously `e.label` was discarded) and emit ONE
> `<mxPoint as="offset">` = `ELK-label-centre −
> polylineMidpoint(route)`. New exported helper
> `polylineMidpoint` (`src/layout/edgeLanes.mts`) computes drawio's
> ACTUAL anchor — the cumulative-arc-length midpoint of the routed
> polyline, NOT the endpoint mean (the documented wrinkle; derived
> from the emitted points, no residual fudge). **Proven (BLOCKING
> gate, not tests-alone):** Phase-1 plumbing byte-identical
> (inert); change is purely additive (one offset mxPoint per
> affected edge, zero waypoint/topology delta); byte-scope —
> exactly 3 of 20 fixtures changed (edge-large-graph +12 =
> 6 integrates + 6 reads-writes; level-component +1 `caches`
> L-route; level-system-landscape +1 `updates profile`), the
> other 17 byte-identical; the `calls` chain got **0** new offsets
> (2-point branch untouched) and the #24 `charges` edge
> (`shop→pay`) is **byte-identical** (#24 preserved, verified per
> edge). `make render-compare` (java+docker, the real gate):
> all 6 `integrates [REST]` + all `reads/writes [SQL]`
> de-crammed and each cleanly seated on its own edge, nothing
> flung off-canvas; level-component `caches` + level-system
> `updates profile` re-seated in clear space, no regression.
> 292/292 (incl. a new 5-case BLOCKING discriminator test for
> `polylineMidpoint` — length-midpoint ≠ endpoint mean ≠ middle
> vertex); lint/mdlint/`make ci` clean. The two spike branches
> (v1 #51, v2) stayed disproved — this is the third, correct
> approach. #19 ibm-wm `c4-container`/deployment acceptance runs
> at the next release-chain consumption (standard
> catalyst→puml2drawio→ibm-wm flow), as with every prior fix.

### ▶▶ GALLERY VISUAL AUDIT 2026-05-16 — defect catalog + plan (TOP PRIORITY)

Comprehensive puml-vs-drawio audit of all **20 corpus fixtures**,
regenerated from latest `main` (post-#68) via `make gallery`, compared
at normalized common-height scale (NOT the downscaled committed PNG —
the #19 lesson). Supersedes the older #19/#23 reviews (which predate
PRs #56/#58/#60/#63). Every item links the EXACT images to re-check a
fix/spike against: `docs/gallery/img/<stem>.puml.png` (ground truth)
vs `docs/gallery/img/<stem>.drawio.png` (catalyst); regenerate with
`make gallery` then diff those pairs.

**Verdict: 10 PASS, 8 defect patterns.** PASS = edge-empty-descriptions,
edge-unicode-specialchars (#44 holds), edge-multiline-labels,
level-dynamic (#45), level-system-landscape (post #24/#56/#60),
rel-layout-constraints, topology-cyclic, topology-disconnected,
topology-wide-rank (deliberate anti-ribbon radial), topology-linear-chain
(order fact-checked correct: Ingest→…→Report top-down in BOTH; edges
a→b→c→d→e not reversed).

Patterns, priority-ordered (each: affected fixtures + images, root-cause
hypothesis, approach, verification gate). **Aesthetic fidelity to
PlantUML is a first-class requirement here (the #19 gate's whole
point) — "looks different but content correct" is NOT a pass.**

**P1 — Multi-edge lane separation broken (SEVERE).**
Fixtures/images: `rel-parallel-duplicate.{puml,drawio}.png` (SEVEREST —
3 parallel A→B: only `async` drawn; `callback`/`sync` labels ORPHANED
at canvas top/bottom with NO visible edge), `rel-tech-vs-notech.*`
(antiparallel `verb with technology`+`back-rel no tech` cram at the
Producer↔Auditor junction), `rel-bidirectional.*` (A↔C `calls`/
`callbacks` label cram). Root-cause hypo: `assignEdgeLanes` +
`catalyst.mts` emit for ≥2 same-pair edges fails to emit every edge's
waypoints/label in the parallel case (labels fall back to drawio
auto-anchor → flung to extremes) and under-separates the antiparallel
case. Approach: spike `assignEdgeLanes` on the 3-parallel + 2-anti
inputs; verify every parsed relation emits a distinct visible edge
(corpus-sanity already has a route-distinctness gate — extend it to
assert *edge presence per relation* + label proximity bound). Gate:
the 3 images above re-rendered show N edges for N relations, labels
on their own edge, none orphaned.

**P2 — Directional hints not honored (SIGNIFICANT).**
Image: `rel-directional.{puml,drawio}.png`. PlantUML = perfect compass
(North↑/South↓/West←/East→); catalyst places North BELOW the hub,
West ABOVE, South LEFT (only `right`≈East ok). Root-cause hypo: ELK
layered/stress does not consume the parsed `Rel_U/D/L/R` direction as
a placement constraint (only edge-reversal for U/D, nothing for L/R,
and even U/D wrong here). Approach: feed direction as an ELK
`partitioning`/position constraint or a layout-only ranking/ordering
edge per direction; spike on this exact fixture. Gate: re-rendered
`rel-directional.drawio.png` matches the compass in
`rel-directional.puml.png`.

**P3 — Long edge label → layout blow-up (SIGNIFICANT).**
Image: `rel-long-labels.{puml,drawio}.png`. catalyst spreads the two
nodes ~4.7× wider than PlantUML (label barely wrapped; ELK reserves a
huge label rect). PlantUML wraps the long label into a tight ~4-line
narrow column, nodes close. Root-cause hypo: the edge-label wrap cap
fed to `measureEdgeLabel`/ELK is far too wide for a long label (or
not applied), so ELK pads enormous horizontal space. Approach: cap
the edge-label wrap width to a PlantUML-like narrow column
(font-derived, not magic); re-feed ELK. Interacts with P4. Gate:
re-rendered width within ~1.3× of `rel-long-labels.puml.png`.

**P4 — ✅ DIAGONAL/SPARSE DONE (PR pending, ADR 0008); P4b box-size
residual deferred.** Root cause of the diagonal staircase + sparse
scatter was NOT `C4_MIN`/spacing — it was the algorithm: a
people/systems-only diagram was classified "Context" and laid out with
`org.eclipse.elk.stress`+`sporeOverlap`, which force-directs a chain
into a staircase and a hub into a scatter. **Fact-checked against the
PlantUML ground truth: PlantUML renders Context with Graphviz `dot`
(hierarchical ranking) too — it does NOT force-direct and does NOT
avoid the ribbon.** The "Context ribbons under layered like
PlantUML/dot" premise was empirically false. Fix: removed the Context
`stress` branch, `declump`, `isHierarchical()`,
`LayoutResult.context`, and the now-unreachable #24 centre-waypoint
emit block; **always `layered`**. Spike: `topology-linear-chain`
x-spread 132→0
(column); render-compare: hub-spoke 3-rank, wide-rank ribbon, cyclic
ranked+back-edge — all now match PlantUML. Byte-scope: exactly the 15
former-Context fixtures changed, the 5 hierarchical byte-identical
(zero hier regression). 324/324; `context-stress.test`→
`context-layered.test` (locks: chain=column, hub ranks below targets,
zero overlap, deterministic). **P4b (deferred, separate PR):** boxes
still look empty — `C4_MIN` per-type floor (a documented C4-PlantUML/
Structurizr convention, see `theme.mts` provenance) + `verticalAlign=
top` leave whitespace below short content. This is a cross-cutting
visual change touching ALL 20 fixtures + a documented constant; needs
its own byte+render-compare gate and a fact-check of PlantUML's actual
box metrics before shrinking the floor (memory `no-guesses` warns
shrinking every box churns golden to chase a documented constant).

**P5 — hub label proximity (MEDIUM; RE-AUDIT post-P4 — likely
largely resolved).** The "Context/stress radial hub" framing is
OBSOLETE (P4/ADR 0008 removed stress; hub-spoke now ranks cleanly
3-rank like PlantUML, labels sit on vertical edges). Re-render
`topology-hub-spoke.{puml,drawio}.png` + `topology-wide-rank.*` and
re-judge: P4 appears to have resolved most of this. Any residual is
now a `layered` edge-label spacing question (not radial-hub), gate vs
PlantUML.

**P6 — ✅ DONE (PR pending).** NOT a P4 symptom: `titlePadding()`
reserved only the 2-line title (≈33u) and a drawio-export probe
render (pixel-measured, scale 1, centre column) proved the rendered
`[type]` bottom lands exactly there → ~1u clearance, the collision.
PlantUML SVG ground truth reserves ≈16–20u below its title. Fix:
added one real-metric clearance line (`renderedLineHeight(EB_TITLE_PX)`)
→ band ≈49u, pixel-re-measured ~15–17u clearance (Platform/Core
Services `[system]` now clear API Gateway/Auth). Byte-scope: only the
4 compound fixtures changed (deep-nesting, level-system-landscape,
level-component, edge-large-graph), 16 byte-identical. 327/327; the
`#25` test gained a NON-tautological empirical-floor gate. New
`scripts/factcheck-geometry.mjs` (catalyst geom vs PlantUML SVG) is
the rigorous numeric gate going forward — no eyeballing.

**P7 — Short-hierarchical-edge label cram (LOW-MED).**
Images: `edge-tags-styling.{puml,drawio}.png` (`sync call [REST]`
tight on the Gateway→Core arrowhead), `level-dynamic.*` (`1: opens`
tight at the first junction). 2-point hierarchical edges where the
label sits on the arrowhead near the source. Approach: small along-edge
label offset for short 2-point hierarchical edges (the non-laned
2-point branch — distinct from #24/#56). Gate: those two images show
the label clear of the arrowhead/box.

**P8 — `«tag»` stereotype text not rendered (LOW).**
Image: `edge-tags-styling.{puml,drawio}.png` — Core shows `«System»`;
PlantUML shows `«critical»«system»` (tag stereotype text). Tag COLOUR
is correctly applied (the important part); only the extra stereotype
line is missing. Approach: prepend matched tag stereotypes to the
element `«type»` line. Gate: re-rendered Core shows `«critical»`.

Suggested order: **P4 first** (cascades into P3/P6 + chain aesthetic),
then P1 (severe correctness), P2, P5, P7, P8. Re-run the full
`make gallery` + the per-pattern image diffs after each.

---

1. **Sequence-diagram support — IMPLEMENTATION (design DONE).**
   catalyst fail-louds on `C4_Sequence`/PlantUML sequence. The
   design is settled and fact-checked in
   `docs/adr/0007-sequence-diagram-support.md` (#66): a parallel
   non-ELK pipeline (`SeqParser` → deterministic linear `seqLayout`
   → `umlLifeline` emit) behind the existing fail-loud detector as
   the dispatch seam; v1 scope vs deferred-v2 fragments; BLOCKING
   test strategy. Execute it **phased**, each phase its own
   byte-scope + render-compare gated PR: (a) `SeqParser` + ordering
   invariants; (b) linear layout + emit; (c) corpus fixture +
   render-compare gate; (d) v2 fragments. Largest open item.

2. **C4 surface TRUE residuals (low/opportunistic).** Only the
   genuinely-unimplemented `✗` surface remains, none blocking
   parity/golden: `$sprite` (no drawio sprite registry),
   `$shadowing`/custom `$lineStyle`/`SET_SKETCH_STYLE`, legend
   (`SHOW_LEGEND`/`_FLOATING`/`_DYNAMIC`, `HIDE_STEREOTYPE`,
   `SHOW_PERSON_OUTLINE/_PORTRAIT/_SPRITE`), `AddProperty`/property
   tables, sequence display toggles, and dropped PlantUML `note`
   callouts (add a `note` row to `docs/C4-COVERAGE.md` when
   tackled). **NOT here any more** (this-session fact-check +
   fixes): `Rel_Back` arrow (#58 ✓), Boundary subtitle (#60 ✓),
   `_Ext` DB/Queue shape (#63 ✓), per-type DB/Queue COLOUR (was
   already correct — stale doc corrected). Pick up individually
   only when a downstream diagram needs one.

Deferred research (not blocking): Graphviz edge-routing benchmark
(reference only, memory `open-followups` item 2).
