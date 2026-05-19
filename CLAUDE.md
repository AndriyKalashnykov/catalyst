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
- `make ci` = **static-check** + build + **coverage-check** +
  **gallery-verify** + **seq-gallery-verify** + **c4feat-gallery-verify**
  (mirrors ci.yml's
  canonical graph: `changes` → `static-check` → `build`+`test` →
  `ci-pass`). `coverage-check` runs `test:coverage` — the real 85 %
  gate, now ACTUALLY enforced over `src/**/*.mts` incl.
  `src/catalyst.mts` (PR #128 fixed it: `thresholds.global` is
  Jest/nyc syntax vitest silently ignored — the gate was a no-op at
  ~72 % branch; correct vitest schema + `include:` scoping makes it
  the documented ≈97 %).
  `make ci-run` = the real `ci.yml` via mise-managed `act`. A second
  workflow `cleanup-runs.yml` (weekly cron + dispatch, native `gh`
  CLI, no third-party actions) prunes old runs + stale-branch caches
  — the portfolio-standard cleanup, added 2026-05-18.
- `make static-check` = `lint` (oxlint+markdownlint) + `vulncheck` +
  `secrets` + `trivy-fs` — the single composite quality gate / CI job
  (skill convention: no separate lint step). gitleaks/trivy/act/java
  mise-managed via `.mise.toml` (`aqua:`/core pins; Renovate native
  `mise` manager tracks them). `make clean` removes
  `dist/ build/ coverage/` (never sources/gallery).
- Local render path (`factcheck`/`gallery`/`render-compare`): **Java**
  is mise-managed (`.mise.toml` Temurin 21; `make deps` installs it),
  **graphviz** is the only system package (no mise backend) —
  `./setup.sh` installs it cross-platform (apt/dnf/brew/pacman,
  idempotent). Neither is needed for CI lint/test/static-check.
- **`make gallery-verify` — deterministic gallery drift gate** (also a
  `ci.yml` `test` step). Regenerates `docs/gallery/drawio/*.drawio`
  (`GALLERY_DRAWIO_ONLY=1`, pure node, no java/docker) and fails on any
  diff vs committed. ANY emit/template change ⇒ run **`make gallery`**
  (full java+docker re-render) and commit the refresh, or this gate
  (and CI) fails. Prevents the P4b-class defect: emit fixed but the
  committed gallery left advertising the old output. PNG freshness is
  NOT gated (needs docker) — the `.drawio` is the deterministic root.
- **`make seq-gallery-verify` — the SEQ analogue (also a `ci.yml`
  `test` step).** The seq pipeline (ADR 0007 a–d2b) is a separate emit
  family from C4, so it needs its OWN committed artifact + drift gate:
  `docs/gallery-seq/drawio/*.drawio` (deterministic, pure node) +
  committed `svg/*.{puml,drawio}.svg` render evidence (the `-tsvg` /
  drawio-export vector basis, NOT gated — same split as the C4 PNGs).
  ANY seq emit/layout change ⇒ run **`make seq-gallery`** (java+docker)
  and commit the refresh. Closes the pre-2026-05-18 gap where seq
  fidelity was an ephemeral `/tmp` render-compare eyeball with zero
  regression protection (every seq phase shipped without a committed
  visual artifact). `scripts/seq-gallery.mjs` mirrors `gallery.mjs`.
- **`make factcheck` — the NO-EYEBALLING fidelity gate (run it for any
  geometry/emit change).** Audits ALL puml→drawio conversions — the
  22-fixture gallery corpus AND the 6 canonical C4-PlantUML-spec
  fixtures in `tests/fixtures/` (c4-exhaustive, c4-all-rel-variants,
  …) — 28 total. Renders each to PlantUML SVG
  (the `-tsvg` vector ground truth) and runs
  `scripts/factcheck-geometry.mjs`, a numeric PlantUML→drawio
  comparator: `entityMiss / relMiss / arrowBad` (arrowhead count ≠ C4
  semantic) `/ labelDrop / attachMerge` (same-pair edges collapsing)
  `/ labelHit` (label over a non-endpoint leaf) `/ nodeOverlap /
  boundaryBands`, plus advisory `rankOrder / wRatio / hRatio`. No args
  → whole-corpus `CLEAN N/22` summary (22 corpus + 6 spec = 28
  audited); `node scripts/factcheck-geometry.mjs
  <stem>…` → per-fixture JSON. A fixture is "clean" ONLY when every
  contract metric is 0 — now **EIGHT**: the prior 7 + `ratioBad`
  (ADR 0011 step 0). `ratioBad` promoted `wRatio`/`hRatio`
  advisory→**contract** via a committed per-fixture **ratchet**
  (`tests/factcheck-ratio-baseline.json`; predicate
  `scripts/factcheck-ratio.mjs`, unit-tested): `|1−ratio|` may only
  improve or hold vs baseline. **An intentional layout/geometry change
  that moves ratios MUST regenerate the baseline** —
  `SVG_DIR=build/factcheck-svg CORPUS_DIR=tests/fixtures/corpus
  UPDATE_FACTCHECK_BASELINE=1 node scripts/factcheck-geometry.mjs` —
  and commit it (same discipline as `golden-update`; the ratchet only
  tightens toward parity). **Visual claims about a fixture MUST cite a
  factcheck number, never a PNG eyeball** (the harness was built by
  fact-checking and fixing each of its own false-positives — offset-
  aware label anchor, mxGraph last-key style, `<br/>`/`\n`/XML-escape
  normalisation). Needs **java** + a one-time `make gallery` (fetches
  the jar). **MANUAL gate, NOT CI** — PlantUML text geometry is
  host-font-dependent, so the `ratioBad` ratchet and ADR 0010's
  `PUML_LEAF_BOX` are reproducible only against the calibration host.
  Docker-pinning it to make it CI-portable was attempted 2026-05-18
  and **empirically closed (negative result)**: the only freely
  portable image (`plantuml/plantuml`, DejaVu-only) renders a
  *noisier, multi-modal* oracle than the ADR-0010 host (inset
  10/11/14 with 20/124 outliers vs a clean exact-10; pitch 12→16
  bimodal `[18,69]` vs a clean 20.62) — adopting it would degrade a
  clean category-1 metric to noise, so it is NOT the canonical
  oracle. `make factcheck` stays the host-JVM manual gate; run it for
  any emit/geometry change. The deterministic render-truth **CI**
  contract is `make arrowskew` (draw.io in a pinned image,
  byte-portable — #117). One real fix DID land from the attempt:
  `factcheck-geometry.mjs` now exits non-zero on any non-clean
  fixture (it previously only printed `CLEAN N/26` and a human had
  to read it — a latent fake-gate even for the manual flow).
- Visual proof (corroborative only): `PLANTUML_VERSION=1.2026.2
  RENDER_SRC=<puml> RENDER_OUT=<dir> make render-compare` (java+docker;
  PlantUML PNG + catalyst→drawio PNG side by side). `make gallery`
  renders the 22-fixture corpus into `docs/gallery/`. Large PNGs:
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
- Decisions: `docs/adr/0001..0013` (0007 sequence design, 0008
  Context→layered, 0009 cycleBreaking=DEPTH_FIRST, 0010 content-fit
  box sizing, 0011 layout-aspect, 0012 completeness invariant,
  **0013 curved edge routing — ACCEPTED, live**); research bases
  `docs/research/*` (incl. `elk-vs-graphviz-dot.md` — deferred
  engine bet); running log `docs/UPGRADE-NOTES.md`; coverage matrix
  `docs/C4-COVERAGE.md`. Render-truth/decision gates: `make
  arrowskew` (CI), `make factcheck` (manual), `make routefidelity`
  (`scripts/route-fidelity*.mjs`, ADR 0013 decision gate). Agent
  memory:
  `~/.claude/projects/-home-andriy-projects-catalyst-fork/memory/`
  (`open-followups` IS the durable tracker — GH Issues are disabled).

## BACKLOG — continue here (priority order)

Everything below is researched, not speculative. Sizes are honest.
Completed-work root-cause prose lives in git history + ADRs +
`docs/UPGRADE-NOTES.md` + agent memories — not re-dumped here.

> ▶ **HANDOFF #21, 2026-05-18 — C4 residuals swept; ADR 0007 COMPLETE;
> seq+C4 reproducible-SVG galleries; coverage-gate fake-gate fixed.**
> 14 catalyst PRs (#127–#140) + 3 claude-config rule commits.
>
> **Sequence — ADR 0007 FULLY IMPLEMENTED (phases a–d2b, NOTHING
> deferred):** `ref` (#131), `create`/`destroy` (#133),
> `box`/`*_Boundary` (#134) landed; `SeqParser.DEFERRED` is now
> intentionally empty (fail-loud kept for malformed/unknown only).
> Empty `====` → thin rule (#130); self-message loop width = own
> measured label not the column gap (#137). 12 `seq-perm-*`
> permutation fixtures + `seq-corpus-sanity` globbing gate (#135) —
> caught & fixed a REAL dispatch defect (C4-macro-form sequence
> mis-routed to the static/ELK path → crash). `make seq-gallery` +
> `seq-gallery-verify` (committed SVG drift gate, CI) (#132).
>
> **C4 residuals — ALL actionable ones done** (each: `c4-feat`
> fixture + committed SVG + tests + `C4-COVERAGE.md` ✗→✓; overlay/
> style-only ⇒ static-C4 corpus byte-identical, proven by
> gallery-verify/golden diff): `HIDE_STEREOTYPE`, `LAYOUT_AS_SKETCH`/
> `SET_SKETCH_STYLE` (#138); `note left|right|top|bottom of X` (#139,
> note-text-render regression fixed #140); `SHOW_LEGEND`,
> `AddProperty`/`SetPropertyHeader` (#140). `make c4feat-gallery` +
> `c4feat-gallery-verify` (CI). `$sprite`/`SHOW_PERSON_SPRITE` =
> **CLOSED, not implementable** (no draw.io sprite registry — a fact,
> not a TODO).
>
> **Infra/correctness:** the vitest 85 % coverage gate was a silent
> no-op (`thresholds.global` is Jest syntax) — fixed to the real
> schema + scoped to `src/**/*.mts`, `src/catalyst.mts` now gated
> (#128). `bendcount` `make` target + the instrument fixed for
> ADR-0013 curved edges (#127). `rel-self-loop`/`rel-fan-stress`
> promoted into `corpus/` (#129). C4 gallery gained committed
> reproducible SVG, parity with seq (#136). C4 gallery eyeball-swept
> 22/22 (content-faithful; dense fixtures are dot-faithful topology,
> not defect-crosswiring).
>
> **Memories:** `silent-fake-gate-classes`, `render-verify-and-emit-
> encoding` (+ MEMORY.md). **claude-config rules added:** gate-RED-
> proves-enforcement; render-verified-must-confirm-content; new-
> parallel-subsystem-needs-own-drift-gate; permutation-matrix-corpus.
>
> **Standing gates (all green @ handoff, main @ post-#140):** `make
> ci` = static-check + build + coverage-check (real 85 %, ≈97 %) +
> gallery-verify + seq-gallery-verify + c4feat-gallery-verify, all
> CLEAN; 560 vitest; arrowskew CLEAN 22/22 (CI render-truth);
> factcheck 26/28 (host-JVM MANUAL — the 2 non-clean are the
> documented ≤0.01 host-font ratio jitter, NOT a defect);
> `make routefidelity` self-verifying. Repo 0 warnings.
>
> **Process discipline (this session's lessons — see memories):**
> a gate's value is its proven RED, never an observed green;
> "render-verified" means the rendered TEXT was confirmed present,
> not that a shape appeared (#139 shipped empty notes); a new
> parallel pipeline needs its OWN committed artifact + drift gate
> from inception; a systematic permutation matrix catches dispatch
> defects curated fixtures hide.

## BACKLOG — remaining (priority order)

Everything from items 1/2/5, the C4-residual sweep, and the
seq/C4 reproducible-SVG infra is **DONE** (handoff #21; detail in
git history + ADRs + memories — not re-dumped). What is left:

1. **ELK→Graphviz-`dot` — RESEARCH BET, deferred, likely its own
   repo.** `docs/research/elk-vs-graphviz-dot.md` is the weighted
   decision base + spike protocol. Do NOT start in-place (it is an
   ADR-0008/0011-superseding rewrite of the layout+gate stack).
   Revisit only if *layout* fidelity (node placement / crossings /
   aspect — NOT connectors; curved routing solved those, ADR 0013)
   becomes the dominant residual after a release.

2. **Gallery-visual residuals P1/P3/P5/P7 — closed-by-AGGREGATE-
   evidence this session, NOT individually re-judged (honest
   follow-up).** P1 (multi-edge lane separation), P3 (long-label
   width blow-up), P5 (hub-label proximity), P7 (short 2-pt edge
   label cram) were retired from the backlog on the *aggregate*
   basis: ADR 0013 curved routing closed the tangled-connector
   class, the full 22/22 C4 gallery eyeball-sweep (handoff #21)
   found every render content-faithful, and `make factcheck` is
   contract-clean on all (26/28 = the 2 documented host-font ratio-
   jitter fixtures, not a defect). They were NOT each re-verified
   with a per-item factcheck number. Bar to act: a render-measured,
   user-pointable defect on a specific fixture WITH the factcheck
   metric that flags it (same evidence discipline as item 4). Likely
   genuinely closed — but the holistic-vs-per-item distinction is
   recorded here so it is a tracked judgement call, not a silent
   retirement.

3. **`$sprite` / `SHOW_PERSON_SPRITE` — CLOSED (not a backlog item).**
   draw.io has no PlantUML sprite registry ⇒ a sprite glyph cannot be
   faithfully rendered. Parsing never breaks; the attribute is
   captured and ignored. Documented in `C4-COVERAGE.md`. Listed here
   only so a future reader does not re-open it as "missing".

4. **layout-readability — DO NOT reopen** without a render-measured,
   user-pointable defect (B1 declined on evidence; tall-ribbon is
   `dot`-faithful per ADR 0011).

5. **Obsolete parked branch:** `feat/seq-phase-b-layout-emit`
   (already gone from origin as of handoff #21; listed only so a
   future reader does not resurrect it) is SUPERSEDED — the
   sequence pipeline is fully implemented on `main`.

The only forward-looking *work* item is the deferred ELK→`dot`
research bet (its own repo); item 2 is a tracked re-verify-if-
challenged, not active work. Sequence support and the C4 surface
are feature-complete.
