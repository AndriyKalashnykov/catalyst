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

> ▶ **RESUME HERE — session handoff 2026-05-16 (context-limit
> cutoff).** Do these IN ORDER before new work:
> 1. **Merge PR #53** `refactor/constants-singlesource` once CI green
>    (`gh pr merge 53 --squash --delete-branch`). It single-sources
>    ALL magic constants (PALETTE/SHAPE/C4_MIN in `theme.mts`, `MX`
>    flags, `DECIMAL_RADIX` in `src/constants.mts`) — proven
>    byte-identical vs a fresh post-#52 baseline across all 20
>    fixtures (3 incremental byte-gates), 287/287, mdlint green.
>    This COMPLETES old backlog item 3 (Palette+MX) → see its
>    ✅-note below.
> 2. **Cleanup after #53 merges:** delete the now-superseded local
>    branch `refactor/palette-mxflag-singlesource` (its WIP
>    `dcd9657` was cherry-picked into #53) and drop the stale
>    `git stash@{0}` "decimal-radix-for-consolidated" (already
>    applied into #53). `git switch main && git reset --hard
>    origin/main`.
> 3. **Then the live backlog is:** item 1 = `edge-large-graph`
>    #24-hier IMPLEMENTATION (design/root-cause/disproved-spike/
>    next-hypothesis already recorded in item 1 + PR #51 — re-cut a
>    branch from fresh `main`, execute the "next hypothesis", full
>    #24/#25-class render-compare gating); item 2 = C4 surface
>    residual gaps (LOW/opportunistic — only when a downstream
>    diagram needs one); item 4 = Sequence-diagram support (large,
>    design-first).
> Other merged this session: v1.6.1 chain, #19 gate, #23 (3 fixes
> #43/#44/#45), #24 (#47), #25 (#49), C4-COVERAGE (#50),
> edge-large-graph design (#51), fontZize fix (#52). The
> `fontZize` audit closed (only typo'd style key, no propagation).

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

1. **`edge-large-graph` hierarchical edge-label cram — the #24
   analogue for `layered` (BIG; root-caused + first spike DISPROVED;
   design-first, ready for a focused session).** User-flagged
   2026-05-16. Pre-existing (the `.drawio` is byte-identical since
   #41; #24/#25 explicitly didn't touch hierarchical), NOT a session
   regression. **What's actually wrong (fact-checked, not eyeballed):**
   the 6 `integrates [REST]` edges fanning from services → External
   1–6 have their labels crammed (≈3 nearly stacked). The boundary
   title is FINE (exactly 33u clearance — an initial thumbnail glance
   that it "collided with Service 1" was a #19-style false read,
   disproven by measurement). The 6 `reads/writes [SQL]` are long but
   adequately separated. **Root cause (code-traced):** ELK computes a
   non-overlapping label rect per edge and `LayoutEngine` threads it
   on `LayoutEdge.label`, but `catalyst.mts`'s emit loop captures only
   `e.points` into `layoutEdgeByRelIdx` and **discards `e.label`**.
   For a non-laned edge whose ELK route is a 2-point straight section
   (`poly.length≤2` → the final `else`), `context===false` so #24's
   waypoint is skipped and drawio auto-anchors the label on its own
   orthogonal route → cram. Same fundamental as #24 (non-laned solo-
   edge label on drawio's unpredictable auto-route) but the
   hierarchical case #24's scope guard deliberately excluded.
   **DISPROVED hypothesis (spike, render-compare — do NOT retry):**
   thread `e.label` and emit a waypoint at ELK's label-rect centre
   for non-laned edges. Render-compare showed it REGRESSED the
   `calls` chain — ELK's label rect can sit on a long detour segment,
   so forcing the edge THROUGH it drags the route + stacks the
   `calls [gRPC]` labels into a left-margin column. Routing-through-
   label-centre is the wrong shape.
   **Next hypothesis (for the focused session — spike, don't commit
   on faith):** the cram is because drawio auto-routes (orthogonal
   L-shape) while ELK placed the label for ELK's straight 2-point
   route. Candidate: lower the `else if (poly && poly.length > 2)`
   threshold so even a 2-point ELK section is emitted as explicit
   drawio waypoints (drawio then draws ELK's exact segment, not its
   own auto-route) → ELK's label placement becomes valid; emit
   `e.label` as the offset. Scope-guard to hierarchical non-laned
   non-cluster edges; Context (#24) + laned + poly>2 paths
   byte-identical; gate = corpus route-signature + parity/golden +
   layout-quality + full gallery render-compare + the ibm-wm
   `c4-container`/deployment pair. The `fix/edge-large-graph-hier-
   labels` spike branch was dropped (analysis preserved here);
   re-cut from fresh `main`.

2. **C4 surface residual gaps (low — see `docs/C4-COVERAGE.md`
   Tier-2/3, validated 2026-05-16).** The genuinely-unimplemented `✗`
   surface, all low-value/no-parity-impact: `$sprite` (no drawio
   sprite registry), `$shadowing`/custom `$lineStyle`/`SET_SKETCH_STYLE`,
   legend (`SHOW_LEGEND`/`_FLOATING`/`_DYNAMIC`, `HIDE_STEREOTYPE`,
   `SHOW_PERSON_OUTLINE/_PORTRAIT/_SPRITE`), `AddProperty`/property
   tables, sequence display toggles (`SHOW_ELEMENT_DESCRIPTIONS`/
   `SHOW_FOOT_BOXES`/`SHOW_INDEX`), `Container_Boundary` type
   distinction (renders as generic `Boundary`), and per-type fill
   colour for the `~` DB/Queue/_Ext rows. **Plus one gap NOT in the
   matrix:** PlantUML `note` callouts are dropped entirely (found in
   #19 — `ibm-wm layered-architecture` has 2; add a `note` row to
   C4-COVERAGE when tackled). Pick up individually only when a
   downstream diagram actually needs one; none block parity/golden.

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

3. **Sequence-diagram support (deferred feature, large, design-first).**
   catalyst fail-louds on `C4_Sequence`/PlantUML sequence. New
   subsystem (parser + deterministic non-ELK layout + umlLifeline
   emit). Full design context in memory `open-followups` item 4.

Deferred research (not blocking): Graphviz edge-routing benchmark
(reference only, memory `open-followups` item 2).
