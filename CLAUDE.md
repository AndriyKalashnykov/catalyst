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
- **Every gate/contract test MUST prove its RED (BLOCKING,
  portfolio-wide `gate-RED-proves-enforcement`).** A test that only
  shows green on correct code is indistinguishable from no test. Any
  new/changed test that asserts a contract (a metric, an invariant, an
  instrument) ships WITH (a) a GREEN case AND (b) a RED case that fails
  on the EXACT defect the contract guards, mutation-verified at least
  once (break the predicate → the RED case fails → restore). A
  fully-mocked "whole-path" test (mock returns a canned string the
  assertion then checks) is green-only — forbidden; de-mock to real
  output bound to a real token. A test that imports nothing from
  `src/` and asserts literals/local mocks is FAKE — delete it (it adds
  zero real coverage by construction). The factcheck contract metrics
  live extracted+RED-tested in `scripts/factcheck-predicates.mjs` /
  `tests/factcheck-predicates.test.mts` (mutation-verified); a
  documented metric blind spot (e.g. `norm()` collapsing `\n`≡`<br/>`)
  is itself ASSERTED so it cannot silently widen. Memory
  `every-gate-proven-red`. The 2026-05-18 suite audit (13/17
  proven-RED, 1 fixed, 2 fake removed/de-mocked) is the baseline —
  keep it at 100%.
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
  `docs/C4-COVERAGE.md`. Render-truth gates: `make arrowskew` (CI),
  `make edgecross` (CI, no-docker via `dot-layout` C6), `make
  factcheck` (host-MANUAL). `make routefidelity` was retired with
  2.0 (the ADR-0013 decision landed); `scripts/route-fidelity.mjs`
  lives on only as the metric library `edgecross` consumes. Agent
  memory:
  `~/.claude/projects/-home-andriy-projects-catalyst-fork/memory/`
  (`open-followups` IS the durable tracker — GH Issues are disabled).

## BACKLOG — continue here (priority order)

Everything below is researched, not speculative. Sizes are honest.
Completed-work root-cause prose lives in git history + ADRs +
`docs/UPGRADE-NOTES.md` + agent memories — not re-dumped here.

> ▶ **HANDOFF #22, 2026-05-19 — catalyst 2.0.0: Graphviz `dot` is the
> SOLE layout engine; the edge-crossing problem is SOLVED.** This
> supersedes HANDOFF #21 (C4-residual sweep / ADR 0007 seq complete /
> seq+C4 SVG galleries — all still true, now history; see git + ADRs +
> `docs/UPGRADE-NOTES.md`).
>
> **The swap (ADR 0014, PRs #150 swap · #151 ELK removal · #152
> pre-2.0 hardening · #154 release `v2.0.0`; supersedes ADR
> 0008/0009/0011):** elkjs → Graphviz `dot` via pinned
> `@hpcc-js/wasm-graphviz` (`src/layout/DotLayout.mjs`;
> `LayoutResult`/`Node`/`Edge` in `src/layout/types.mjs`, no shape
> change). `dot` IS PlantUML's C4 engine ⇒ topology matches by
> construction: **`make edgecross` 30 → 0** (catalyst == PlantUML ==
> 0 on the real drawio-export render-truth), factcheck **CLEAN
> 28/28** (was 26/28), arrowskew 22/22, byte-deterministic.
> `dot` splines emitted VERBATIM as `curved=1` (ADR 0013).
>
> **Removed (all dead post-swap, proven byte-identical via
> `gallery-verify` where applicable):** `elkjs` dep,
> `LayoutEngine.mts`, the `layoutEngine`/`LAYOUT_ENGINE` selector +
> ELK-impl tests (#151); the vestigial ELK lane apparatus
> (`assignEdgeLanes`/`assignPortOrder`/`enforceApproachClearance`) +
> the dead multibend emit branch + `tests/portorder.test.mts` +
> `tests/edge-lanes.test.mts` (slide-label coverage rehomed to
> `tests/layout/`); the moot ADR-0013 `make routefidelity` decision
> driver (`route-fidelity-matrix/-convert.mjs`) — the
> `route-fidelity.mjs` metric library lives on (consumed by the live
> `edgecross` gate). `edgeLanes.mts` is now a lean
> label-de-collision + midpoint module.
>
> **Pre-2.0 skill sweep (#152):** /test-coverage-analysis clean;
> /upgrade-analysis (deps + mise tools all latest, 0 CVEs; oxlint/
> @types/node drop-ins); /renovate (added the `@hpcc-js/wasm-graphviz`
> `automerge:false` coupling gate — every render baseline + the P0
> determinism proof are pinned to its graphviz version); /readme +
> /repo-about re-derived from post-swap state. README, C4-COVERAGE,
> FACTCHECK-COVERAGE, UPGRADE-NOTES, GitHub About all re-derived.
>
> **Downstream:** puml2drawio `CATALYST_REF` → v2.0.0 (PR #99, full
> CI incl. e2e green). **Downstream chain CLOSED:**
> ibm-wm-cert-management `_drawio` regenerated under dot — PR #40
> MERGED (diagrams.yml pinned to puml2drawio `# v1.6.0`) — see
> [[open-followups]].
>
> **Standing gates (all green @ `v2.0.0`):** `make ci` =
> static-check + build + coverage-check (86%) + gallery-verify +
> seq-gallery-verify + c4feat-gallery-verify, all CLEAN; 579 vitest;
> arrowskew 22/22; edgecross 0; factcheck 28/28 (host-JVM MANUAL).
> Repo 0 warnings.

## BACKLOG — remaining (priority order)

Completed work lives in git history + ADRs + `docs/UPGRADE-NOTES.md` +
agent memories — not re-dumped here.

**The edge-crossing problem is SOLVED** (catalyst 2.0.0 / ADR 0014:
`dot` is PlantUML's own engine ⇒ `make edgecross` 0). Sequence
(ADR 0007 a–d2b) and the C4 directive surface are feature-complete;
P3/P5/P7 closed with cited numbers (history). Nothing in catalyst
itself is actionably open. Remaining items (NOT silently dropped) —
one deliberately deferred, one decision-gated research spike;
item 2 CLOSED this session:

1. **factcheck `attachMerge`/`labelHit` on the 2 SYNTHETIC
   exhaustiveness fixtures** (`c4-all-rel-variants`,
   `c4-exhaustive`) — honestly RED, ratchet-guarded
   (`tests/factcheck-dot-baseline.json`, `scripts/factcheck-dot-ratchet.mjs`,
   RED-tested), NOT advisory-downgraded. `dot` packs many parallel
   same-pair edges tightly exactly as PlantUML's own `dot` does, so
   on these synthetic fixtures it is faithful-to-reference, not a
   defect (the real 22-fixture corpus is `attachMerge=0`,
   `edgecross=0`). The "most-correct" close — a PlantUML-edge-spline
   independent-signal guard generalising the `edgecross`
   PlantUML-floor — is named in ADR 0014 as a follow-up; the ratchet
   is the correct interim terminal state (a freshly-built guard is
   the least-trusted thing — `gate-RED-proves-enforcement`).
   `make factcheck` is host-MANUAL, not CI; the CI render-truth
   contracts are `edgecross` (=0, via `dot-layout` C6) + `arrowskew`.

2. **ibm-wm-cert-management `_drawio` regeneration — CLOSED
   2026-05-19, PR #40 MERGED.** The third release-chain link
   (catalyst v2.0.0 → puml2drawio v1.6.0 [PR #99] → ibm-wm)
   completed this session: ibm-wm `diagrams.yml` repinned to
   puml2drawio `# v1.6.0` and `docs/architecture/_drawio` +
   `*.drawio.png` regenerated under the dot layout (content-faithful
   diff, as predicted). See [[open-followups]] /
   [[release-chain-topology]].

3. **RESEARCH (very deep, decision-gated — do NOT implement before
   the research doc is reviewed): broaden PlantUML coverage beyond the
   C4 + C4-sequence families.** catalyst today converts the C4 static
   family and the C4 dynamic/sequence family (ADR 0007). PlantUML spans
   *dozens* of unrelated diagram families catalyst does **not**
   convert — class, object, activity, state, use-case, component
   (non-C4), timing, ER, JSON/YAML, mindmap, gantt, WBS, network
   (nwdiag), salt/wireframe, and more — which is exactly why the
   title/About must stay scoped ("…for PlantUML C4 & sequence
   diagrams"), not the overclaiming "PlantUML → draw.io". This item
   is a **research spike**, not a build commitment: produce a
   committed decision doc (`docs/research/plantuml-beyond-c4.md`)
   covering, per family — (a) PlantUML grammar surface & how it's
   parsed (PlantUML's own grammar is notoriously irregular; assess
   feasibility honestly), (b) a faithful draw.io shape/edge mapping
   (or proof none exists), (c) layout-engine fit (does `dot` serve
   it, or does the family need a different engine — see the deferred
   `elk-vs-graphviz-dot.md` bet), (d) demand/value vs maintenance
   cost, (e) architecture impact on the parser/emit/gate pipeline and
   the completeness-invariant gates (ADR 0012). Output is a weighted
   matrix + ranking + a per-family ACCEPT/DECLINE recommendation
   (parallel-research → weighted-matrix → spike methodology). Expect
   most families to be **DECLINE on evidence** — a negative,
   well-argued result is a valid deliverable; the goal is a defensible
   scope boundary, not feature sprawl. Gate: nothing ships to the
   parser/emit until the doc is reviewed and a family is explicitly
   ACCEPTED. See [[open-followups]].

**DO NOT reopen** without a render-measured, user-pointable defect:
`$sprite`/`SHOW_PERSON_SPRITE` (CLOSED — no draw.io sprite registry,
documented in `C4-COVERAGE.md`); layout-readability / tall-ribbon
(`dot`-faithful by construction — it IS PlantUML's engine).
