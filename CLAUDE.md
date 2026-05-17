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
- `make ci` = build+lint+test+**gallery-verify**; `make ci-run` = the
  real `.github/workflows/ci.yml` via mise-managed `act` (Docker needed).
- **`make gallery-verify` — deterministic gallery drift gate** (also a
  `ci.yml` `test` step). Regenerates `docs/gallery/drawio/*.drawio`
  (`GALLERY_DRAWIO_ONLY=1`, pure node, no java/docker) and fails on any
  diff vs committed. ANY emit/template change ⇒ run **`make gallery`**
  (full java+docker re-render) and commit the refresh, or this gate
  (and CI) fails. Prevents the P4b-class defect: emit fixed but the
  committed gallery left advertising the old output. PNG freshness is
  NOT gated (needs docker) — the `.drawio` is the deterministic root.
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
- Decisions: `docs/adr/0001..0010` (0007 sequence design, 0008
  Context→layered, 0009 cycleBreaking=DEPTH_FIRST, 0010 content-fit
  box sizing); running log `docs/UPGRADE-NOTES.md`;
  coverage matrix `docs/C4-COVERAGE.md`. Agent memory:
  `~/.claude/projects/-home-andriy-projects-catalyst-fork/memory/`
  (`open-followups` IS the durable tracker — GH Issues are disabled).

## BACKLOG — continue here (priority order)

Everything below is researched, not speculative. Sizes are honest.
Completed-work root-cause prose lives in git history + ADRs +
`docs/UPGRADE-NOTES.md` + agent memories — not re-dumped here.

> ▶ **RESUME HERE — session handoff 2026-05-17 (refreshed #7, P4b shipped).**
> `make factcheck` is THE gate (numeric PlantUML→drawio comparator,
> ALL 26 conversions vs `-tsvg`; NO eyeballing — every visual claim
> cites a metric). **NO auto-merge is configured** (verified
> 2026-05-17: only `ci.yml`, no `gh pr merge --auto` /
> `enablePullRequestAutoMerge` anywhere, repo `autoMergeRequest`
> null — the earlier "repo auto-merges" claim was false and
> propagated unverified). Per-PR flow: branch from fresh
> `origin/main` → push → `gh pr create` → wait for CI green →
> **explicit `gh pr merge <n> --squash --delete-branch`** → `git
> fetch --prune && git reset --hard origin/main` for the next.
> **Operating discipline (user, emphatic):
> real fact-based fixes ONLY, no guesses/workarounds; fact-check
> before AND after via version-exact docs + the tool's own registry;
> a gate's pass is read ONLY from its own `rc=$?` on its own line —
> never via a `grep`/`tail`/`||`/`&&` between the gate and the commit
> (this bit 3× incl. last session).**
>
> Last session shipped (all MERGED to `origin/main`): #80 P12
> (factcheck 23→26/26), #81 #15 (magic-constant audit), #82 #17
> (`docs/FACTCHECK-COVERAGE.md` matrix), #83 P4b decision base, #84
> P2 research+matrix, #85 P2 spike, #86 P4b ADR 0010. `claude-config
> 9dc42d3` updated 4 global rules. Memories new/updated:
> `lane-label-decollision`, `factcheck-harness-gate` (6 FP classes),
> `no-guesses-fact-check-discipline`, `open-followups`.
>
> ### ▶▶ P4b ✅ DONE 2026-05-17 (this session) — content-fit box sizing shipped
>
> `theme.C4_MIN` (220×140-class fixed floor) **deleted**; replaced by
> `PUML_LEAF_BOX` (MEASURED PlantUML `-tsvg` geometry: `INSET=10`,
> `TOP_GAP=22.83`, `BOT_GAP=14.69`, pitch `12>16=20.62 / 16>12=17.52
> / 12>12=16.34`). `measureNode` is now pure content-fit: `width =
> ceil(widestLine + 2×INSET)`, `height = ceil(TOP_GAP + Σpitch +
> BOT_GAP + cyl3 cap)`. Two latent bugs content-variable sizing
> exposed, both fixed at root (NOT masked): (a) `LayoutEngine.
> fanReserve` — a same-pair K-edge endpoint now floors its border at
> `(K−1)·2·REL_ARROW_SIZE` (the old fixed floor incidentally hosted
> the fan; derived from the gate's cited arrowhead metric); (b) the
> L1 L/R post-pass was a raw `a.x↔b.x` swap correct ONLY at uniform
> box width — now span-preserving + aborts if it would overlap (its
> own documented "cannot degrade the layout" contract, now enforced).
> `layout-quality` re-specified to the content-fit contract (≥
> measureNode, no overlap). ADR 0010 fact-2 prose corrected (16 →
> measured 16.34). New tests: `tests/p4b-svg-geom.test` gained a
> `PUML_LEAF_BOX === measured-oracle` equivalence gate (verbatim
> CI-safe + live-scan; this caught the 16/16.34 rounding);
> `tests/layout/p4b-layout-engine.test` (fanReserve + L/R reorder);
> `tests/layout/measureNode.test` rewritten to the closed form.
> **Gate met:** factcheck CLEAN 26/26 · render-compare c4-container/
> topology-linear-chain/c4-deployment at PlantUML parity (caps
> preserved) · byte-scope 26/26 changed (broad+intentional as ADR
> predicted; golden/parity green) · P6/cyl3 non-regression. 362 tests
> green, lint+mdlint clean.
>
> ### ▶▶ NEXT SESSION (priority order)
>
> 1. **Sequence diagrams** (#12, ADR 0007) — phased. **Phase (a)
>    `SeqParser` ✅ DONE 2026-05-17** (`src/seq/`, 29-test matrix,
>    net-new). **NEXT = phase (b):** deterministic linear
>    `src/seq/seqLayout.mts` (lifelines evenly spaced on X by measured
>    header width — reuse `measureNode`/font metrics; events monotone
>    Y in source order; activations stacked rects) + `src/mx/seq/
>    Lifeline.mts` (`shape=umlLifeline;` + message edges reusing the
>    Rel/Rel_Back/BiRel arrowhead map + note shapes) + `src/seq/
>    SeqConverter.mts` orchestration. Phase (b) ALSO flips the
>    `src/catalyst.mts` detector `throw` → `SeqConverter.convert`
>    (first existing-path change in the chain — gate: all 26 static
>    fixtures still byte-identical + factcheck CLEAN; new render-compare
>    on a v1-scoped sequence fixture). Then (c) corpus fixture +
>    render-compare gate, (d) v2 fragments/dividers. v1 fails loud on
>    deferred constructs (the ibm-wm fixture uses `==dividers==` ⇒ it
>    is a phase-(d)/(c) fixture, NOT a v1 success fixture — phase (c)
>    needs a divider-free v1 sequence fixture).
> 2. C4 surface TRUE residuals (`$sprite`, sketch, legend, dropped
>    `note`) — low/opportunistic.
> (P13 ✅ DONE 2026-05-17 — gallery emits uniform `<img width="420">`;
> `docs/research/p13-gallery-uniformity.md`. P4b ✅ DONE this session.)
> Re-confirm P1/P3/P5/P7 status against the post-P4b gallery before
> spiking them — content-fit re-sized every box, so the
> defect-catalog below may have shifted (re-render + re-judge via
> factcheck numbers, never PNG eyeball).
>
> **REMAINING after P4b:** Sequence diagrams (#12, ADR 0007) —
> largest, new non-ELK subsystem; C4 surface true residuals
> (`$sprite`, sketch, legend, dropped `note`) — low/opportunistic;
> **P13** gallery column-width uniformity (user-requested, `[ ]`
> below) — presentation-only, must not perturb the emit path.
>
> **REMAINING (priority order) — durable per-item record:**
>
> - **P12** (#80) — ✅ DONE 2026-05-17. factcheck CLEAN 26/26.
> - **P2** (#5/#84/#85) — ✅ DONE 2026-05-17. Weighted matrix →
>   "invisible co-rank edges" spiked + shipped: all 4 compass
>   directions correct, factcheck CLEAN 26/26, byte-scoped. Residual
>   "East one rank low" stays advisory (not a contract — PlantUML
>   itself doesn't deterministically co-rank). Effectively closed.
> - **P4b** (#11/#83/#86 + impl PR this session) — ✅ DONE
>   2026-05-17. `C4_MIN`→`PUML_LEAF_BOX` content-fit; fanReserve +
>   span-preserving/abort L/R fixes; equivalence gate; factcheck
>   CLEAN 26/26, byte-scope 26/26 (intentional), 362 tests green.
>   See the "P4b ✅ DONE" handoff block above.
> - **#15** (#81) — ✅ DONE 2026-05-17. Numeric-literal audit vs the
>   no-magic taxonomy; proven zero-output-change (26 fixtures
>   byte-identical vs `origin/main`).
> - **#17** (#82) — ✅ DONE 2026-05-17. `docs/FACTCHECK-COVERAGE.md`
>   geometry-path↔harness-check coverage matrix.
> - [x] **P13 — gallery column-width uniformity ✅ DONE 2026-05-17.**
>   Fact-checked the dominant constraint (GitHub strips `style=`/CSS
>   ⇒ no object-fit/max-height/aspect-box; only the width|height attr
>   bounds an image, one axis). Researched + weighted-compared 4
>   approaches (`docs/research/p13-gallery-uniformity.md`); winner =
>   uniform `<img width="420">` (every column + pair widths exactly
>   420 px; ~½ scale-2 median ⇒ crisp; tall renders tall = the
>   explicit accepted trade). Letterbox-to-tiles rejected on scope
>   (image dep + 40-PNG churn for height-uniformity the user did not
>   ask for). Diff confined to `scripts/gallery.mjs` (embed line +
>   new `GALLERY_MD_ONLY=1` zero-churn regen path) + regenerated
>   `docs/gallery/README.md`; NO `src/`, NO `docs/gallery/img/`
>   change. Gate: factcheck CLEAN 26/26 (emit path untouched),
>   lint+mdlint clean, 362 tests. Memory `md-image-embedding` updated
>   to record the gallery-specific override (bound *width* here vs
>   *height* for single-pair READMEs — axis is goal-specific).
> - **Sequence diagrams** (#12, ADR 0007) — largest; MUST ship with
>   factcheck coverage (lifelines/messages/order) per user directive.

### ▶▶ GALLERY VISUAL AUDIT 2026-05-16 — defect catalog + plan

Comprehensive puml-vs-drawio audit of all **20 corpus fixtures**,
compared at normalized common-height scale (NOT the downscaled
committed PNG — the #19 lesson). Every item links the EXACT images to
re-check a fix/spike against: `docs/gallery/img/<stem>.puml.png`
(ground truth) vs `docs/gallery/img/<stem>.drawio.png` (catalyst);
regenerate with `make gallery` then diff those pairs. **Aesthetic
fidelity to PlantUML is a first-class requirement — "looks different
but content correct" is NOT a pass.**

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
on their own edge, none orphaned. (Re-check post-P12: factcheck is now
CLEAN 26/26 — confirm whether P1 still reproduces before spiking.)

**P2 — ✅ DONE (#85).** Invisible co-rank edges; all 4 compass
directions correct, factcheck CLEAN 26/26. Advisory residual (East one
rank low) accepted — see the per-item record above.

**P3 — Long edge label → layout blow-up (SIGNIFICANT).**
Image: `rel-long-labels.{puml,drawio}.png`. catalyst spreads the two
nodes ~4.7× wider than PlantUML (label barely wrapped; ELK reserves a
huge label rect). PlantUML wraps the long label into a tight ~4-line
narrow column, nodes close. Root-cause hypo: the edge-label wrap cap
fed to `measureEdgeLabel`/ELK is far too wide for a long label (or
not applied), so ELK pads enormous horizontal space. Approach: cap
the edge-label wrap width to a PlantUML-like narrow column
(font-derived, not magic); re-feed ELK. Interacts with P4b. Gate:
re-rendered width within ~1.3× of `rel-long-labels.puml.png`.

**P4 — ✅ DONE (ADR 0008).** Context `stress` branch removed; always
`layered`. The box-size residual **P4b is ✅ DONE 2026-05-17**
(content-fit `PUML_LEAF_BOX`; see the "P4b ✅ DONE" handoff block).

**P5 — hub label proximity (MEDIUM; RE-AUDIT post-P4 — likely
largely resolved).** The "Context/stress radial hub" framing is
OBSOLETE (P4/ADR 0008 removed stress; hub-spoke now ranks cleanly
3-rank like PlantUML, labels sit on vertical edges). Re-render
`topology-hub-spoke.{puml,drawio}.png` + `topology-wide-rank.*` and
re-judge: P4 appears to have resolved most of this. Any residual is
now a `layered` edge-label spacing question (not radial-hub), gate vs
PlantUML.

**P6 — ✅ DONE.** `titlePadding()` gained one real-metric clearance
line (`renderedLineHeight(EB_TITLE_PX)`); `scripts/factcheck-geometry.mjs`
is now the rigorous numeric gate (no eyeballing).

**P7 — Short-hierarchical-edge label cram (LOW-MED).**
Images: `edge-tags-styling.{puml,drawio}.png` (`sync call [REST]`
tight on the Gateway→Core arrowhead), `level-dynamic.*` (`1: opens`
tight at the first junction). 2-point hierarchical edges where the
label sits on the arrowhead near the source. Approach: small along-edge
label offset for short 2-point hierarchical edges (the non-laned
2-point branch — distinct from #24/#56). Gate: those two images show
the label clear of the arrowhead/box. (Re-check post-P12 — the
`slideLabelAlongLane` work may already cover this.)

**P8 — `«tag»` stereotype text not rendered (LOW).**
Image: `edge-tags-styling.{puml,drawio}.png` — Core shows `«System»`;
PlantUML shows `«critical»«system»` (tag stereotype text). Tag COLOUR
is correctly applied (the important part); only the extra stereotype
line is missing. Approach: prepend matched tag stereotypes to the
element `«type»` line. Gate: re-rendered Core shows `«critical»`.

---

1. **Sequence-diagram support — IMPLEMENTATION (design DONE).**
   catalyst fail-louds on `C4_Sequence`/PlantUML sequence. The
   design is settled and fact-checked in
   `docs/adr/0007-sequence-diagram-support.md` (#66): a parallel
   non-ELK pipeline (`SeqParser` → deterministic linear `seqLayout`
   → `umlLifeline` emit) behind the existing fail-loud detector as
   the dispatch seam; v1 scope vs deferred-v2 fragments; BLOCKING
   test strategy. Execute it **phased**, each phase its own
   byte-scope + render-compare gated PR: **(a) `SeqParser` + ordering
   invariants — ✅ DONE 2026-05-17** (`src/seq/SeqParser.mts` +
   `SeqModel.interface.mts`; 29-test ordering+fail-loud matrix;
   purely additive, factcheck CLEAN 26/26 by construction);
   (b) linear `seqLayout` + `umlLifeline` emit + detector dispatch
   (NEXT); (c) corpus fixture + render-compare gate; (d) v2
   fragments/dividers. Largest open item.

2. **C4 surface TRUE residuals (low/opportunistic).** Only the
   genuinely-unimplemented `✗` surface remains, none blocking
   parity/golden: `$sprite` (no drawio sprite registry),
   `$shadowing`/custom `$lineStyle`/`SET_SKETCH_STYLE`, legend
   (`SHOW_LEGEND`/`_FLOATING`/`_DYNAMIC`, `HIDE_STEREOTYPE`,
   `SHOW_PERSON_OUTLINE/_PORTRAIT/_SPRITE`), `AddProperty`/property
   tables, sequence display toggles, and dropped PlantUML `note`
   callouts (add a `note` row to `docs/C4-COVERAGE.md` when
   tackled). Pick up individually only when a downstream diagram
   needs one.

Deferred research (not blocking): Graphviz edge-routing benchmark
(reference only, memory `open-followups` item 2).
