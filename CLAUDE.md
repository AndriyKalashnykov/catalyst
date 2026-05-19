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

The C4-residual sweep and seq/C4 reproducible-SVG infra are **DONE**
(handoff #21). P3/P5/P7 are CLOSED with cited numbers (item 2). P1 is
REOPENED and folded into item 1 (edge crossings = global routing).
What is left:

1. **Edge-crossing minimization — in-pipeline approach DISPROVED;
   residual escalated to 1a (2026-05-18).** P1 QUANTIFIED & GATED:
   `make edgecross` = 30 non-incident crossings / 5 multi-edge
   fixtures vs PlantUML 0; ratchet `tests/edgecross-baseline.json`.
   Full research→matrix→decision→spike→measure done
   (`docs/research/edge-crossing-minimization.md`). The ranked
   approach (correct-by-construction post-layout bearing-sorted
   port-ordering pass, `assignPortOrder` + exhaustive geometry-derived
   tests `tests/portorder.test.mts` proving rotation-system I1 /
   nested-fan I2 / 0 pure-model crossings) was implemented and
   RENDER-measured: it sharply improves the P1 multi-edge class
   (those 4 fixtures 12→5) BUT draw.io's `orthogonalEdgeStyle`
   re-router overrides the proven attach geometry on dense
   (edge-large-graph 18→30) and boundary (c4-context 0→2) graphs →
   net regression → **reverted, not shipped** (two prior in-place
   tweaks also measured-worse: 30→40, 30→49/38). `assignPortOrder` is
   RETAINED (proven-correct, deterministic, unit-tested, SVG models
   in `build/portorder-models/`) but NOT wired — it is the building
   block for 1a. Conclusion: the attach lever is necessary but not
   sufficient against draw.io's own router; the fix REQUIRES owning
   routing end-to-end ⇒ item 1a.

   1a. **ELK→Graphviz-`dot` engine swap — ACTIVE, IN THIS REPO
   (user decision 2026-05-18; supersedes the "new repo" prior in
   `elk-vs-graphviz-dot.md`).** THE detailed phased plan:
   **`docs/research/dot-engine-swap-plan.md`** (P0 engine-spike+
   determinism → P1 C4→dot emitter → P2 dot→LayoutResult adapter →
   P3 spline routing → P4 `LAYOUT_ENGINE=elk|dot` flag → P5 parity+
   re-baseline+ADR 0014 → P6 flip default). Long-lived branch
   **`feat/dot-engine`** (created with the plan); ELK stays the
   DEFAULT and fallback until P5 fully green. Acceptance = the existing
   instrument suite under `dot`: `edgecross` 30→**0** (the target),
   `route-fidelity`→parity, `factcheck` completeness, `corpus-sanity`
   no-drop, galleries regenerated, ADR 0014 superseding 0008/0011.
   Guardrails (replace "separate repo" as risk control): flag-gated,
   per-phase byte-baseline + `git diff --exit-code`, determinism a P0
   hard gate, no fake-green/fixture-exclusion/contract-downgrade.
   Banked: proven `assignPortOrder`+tests+`build/portorder-models/`,
   the `edgecross` ratchet, `route-fidelity`, the full research base.
   The three disproved in-place attempts (30→40/49/38,
   `edge-crossing-minimization.md`) are the "why owning routing
   end-to-end is required" evidence; do NOT re-attempt in-place
   lane tweaks.

2. **Gallery-visual residuals — P3/P5/P7 CLOSED; P1 REOPENED &
   RE-SCOPED to item 1 (2026-05-18).** P1's earlier "CLOSED on
   `attachMerge=0`" was WRONG and is retracted: `attachMerge` only
   measures same-pair *collapse*, NOT edge *crossings* — an unmeasured
   property is UNKNOWN, not pass (the BLOCKING done-on-a-green-gate
   rule; the user caught it by eyeballing the gallery, the exact
   failure that rule names):
     - **P1 — REOPENED, re-scoped under item 1.** A NEW rendered-SVG
       contract `make edgecross` (`scripts/edgecross-svg.mjs`, RED +
       mutation-tested `tests/edgecross-svg.test.mjs`) measures
       non-incident edge crossings on the COMMITTED drawio-export
       render-truth. The ratchet is **CI-enforced via vitest** (a
       deterministic no-docker test reads the committed gallery SVGs;
       fails on any regression past `tests/edgecross-baseline.json`)
       AND an independent-signal FP guard (PlantUML render side must
       be 0) — both fact-checked 2026-05-18 (no PlantUML FP, no
       self-split FP, edge-large-graph's 1 spurious path = 0
       crossings, FP-corrected==instrument). LIMITATION (honest): it
       gates the COMMITTED render; `gallery-verify` refreshes only
       `.drawio`, so an emit change that worsens crossings is caught
       when the gallery SVGs are re-rendered and committed
       (`make gallery`, docker) — same freshness model as the gallery
       PNGs, not a live emit gate. Honest inventory: **catalyst 30 crossings across
       5 multi-edge fixtures (edge-large-graph 18, rel-fan-stress 6,
       rel-tech-vs-notech 3, rel-parallel-duplicate 2,
       rel-bidirectional 1) vs PlantUML 0** — the other 17 fixtures
       are 0=0. Root cause: lane separation is a LOCAL per-pair
       perpendicular translation of ELK's route, ignorant of other
       edges → it shoves a laned route across non-group neighbours.
       A targeted in-place fix (emit ELK's route as-is) was
       implemented and MEASURED via docker re-render: **30→40
       (regression) — disproved, reverted, not shipped** (negative
       result, per the rules). This is the global routing/port-order
       problem item 1 explicitly owns ("crossings"); not an in-place
       fixable residual. Guard: per-fixture ratchet
       `tests/edgecross-baseline.json` (= factcheck-ratio pattern) —
       contract stays honestly RED (NOT advisory-downgraded), the
       ratchet fails any regression past baseline (would have caught
       the 30→40).
     - **P3 long-label width — CLOSED + sufficiency note.**
       rel-long-labels wRatio=0.98 (NO blow-up — narrower than
       PlantUML), labelDrop=0, ratioBad=0. edge-multiline-labels:
       literal `\n` verified emitted as `&lt;br/&gt;` in the
       `.drawio` (NOT tofu), hRatio=1.63 within ratchet. SUFFICIENCY:
       factcheck `norm()` collapses `\n`≡`<br/>` so `labelDrop` is
       blind to a literal-`\n` regression — that class is guarded by
       `corpus-sanity` pt 6 (`not.toMatch(/\\n/)`) + `output-
       correctness` Phase-1 (triple-covered), and the blind spot is
       now an ASSERTED limitation in `factcheck-predicates.test.mts`.
     - **P5 hub-label proximity — CLOSED.** topology-hub-spoke (6
       spokes) labelHit=0 nodeOverlap=0 min-leaf-clearance 53.9px;
       topology-wide-rank (8-wide ribbon) labelHit=0 clearance
       56.8px; ratios within ratchet. `partialOverlap` (the labelHit
       core) RED-tested.
     - **P7 short 2-pt edge-label cram — CLOSED.** Both fixtures are
       all-0-waypoint (the genuine 2-point branch): edge-tags-styling
       labelHit=0 clearance 225.5px; level-dynamic 185–204px. Robust.
   Instrument hardened (no longer green-only): the 8 factcheck
   contract predicates extracted to `scripts/factcheck-predicates.mjs`
   (byte-identical 28-fixture baseline) + RED+GREEN unit tests
   (mutation-verified). Whole test suite RED-audited (see discipline
   below): `catalyst-functions.test.mts` (100% fake — zero `src/`
   imports) DELETED; `catalyst.test.mts` de-mocked into a real
   RED-capable public-API contract.

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

Active work: the deferred **item 1** (ELK→`dot` research bet, its own
repo) — now the owner of the P1 edge-crossing residual, QUANTIFIED &
ratchet-gated by `make edgecross` (30 vs PlantUML 0), with the
in-place fix empirically disproved. P3/P5/P7 are CLOSED with cited
numbers; the sequence pipeline and the C4 *directive* surface are
feature-complete. The honest standing state: crossings are a real,
measured, deferred residual — not "no residual outstanding".
