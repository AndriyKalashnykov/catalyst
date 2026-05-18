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
  **gallery-verify** (mirrors ci.yml's canonical graph: `changes` →
  `static-check` → `build`+`test` → `ci-pass`). `coverage-check` runs
  `test:coverage` — the real 85 % `thresholds.global` gate (NOTE:
  `vitest.config.ts` `exclude:` omits `src/catalyst.mts` from the
  gate — a `/test-coverage-analysis` follow-up, not a CI concern).
  `make ci-run` = the real `ci.yml` via mise-managed `act`.
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
  normalisation). Needs java + a one-time `make gallery` to fetch
  `plantuml.jar`.
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

> ▶ **RESUME HERE — session handoff 2026-05-17 (refreshed #11 —
> ADR 0011 CLOSED [#99 wRatio comparator-artefact fix]; ADR 0012
> `title` on ALL diagrams + `titleMiss` completeness gate [#101];
> `/makefile` audit [#102]; `/readme` review [#103]; `/ci-workflow`
> canonical restructure [#104] — all MERGED, `main` @ `284e44d`,
> tree clean. NEXT = finish parked perpendicular-arrowhead branch
> → PR, then Sequence #12 phase (b)).**
>
> **Infra now in place (post #102/#104 — next session relies on
> this):** `make static-check` is COMPOSITE
> (`lint`+`mdlint`+`vulncheck`+`secrets`+`trivy-fs`, one CI job);
> `make ci` = `static-check build coverage-check gallery-verify`,
> mirroring the canonical 5-job `ci.yml`
> (`changes→static-check→build+test→ci-pass`, single required check
> `ci-pass`); `.mise.toml` manages node/java/act/gitleaks/trivy
> (NO `# renovate:` inside — native mise manager); `setup.sh`
> cross-platform (apt/dnf/brew/pacman). `make ci-run` = the real
> `ci.yml` via mise-managed `act`.
>
> **Parked WIP branches (on `origin`, NO PR — do NOT prune; each
> needs a rebase onto fresh `origin/main` before resuming, both
> branched off pre-#102 main):**
>
> - `feat/perpendicular-arrowhead-routing` @ `afc5f95` (base
>   `d2536db`=#101). Multi-bend perpendicular border-anchor DONE;
>   `arrowSkew` is an HONEST CONTRACT metric at **20/26** (NOT
>   advisory — do not downgrade it); `arrowSkew` row already in
>   `docs/FACTCHECK-COVERAGE.md`. REMAINING: the laned same-pair
>   port-stub so `arrowSkew`=0 corpus-wide + unit tests for
>   `endpointAttachFraction`/`arrowSkew`/comparator-`endpt`, then
>   `make gallery`+commit, byte-scope worktree-diff, render-compare,
>   PR. Do NOT merge until `arrowSkew`=26/26.
> - `feat/seq-phase-b-layout-emit` @ `c18a403` (base `62acfcd`).
>   See item 1 below.
>
> **Surfaced, NOT absorbed (next-session follow-up):**
>
>
> `vitest.config.ts` `exclude:` omits `src/catalyst.mts` (the core
> orchestrator, most-changed file this session) from the 85%
> `thresholds.global` gate — the CI gate is correct, the coverage
> *scope* is a `/test-coverage-analysis` finding. Pursue given how
> much `catalyst.mts` changed (title emit + parked arrowhead work).
>
> **Methodology (ADR 0012, researched MDE M2M principle — do NOT
> hand-roll):** this is a model-to-model transformation. Verify in
> this order: (1) **completeness invariant** — every source construct
> traces to a target element, no silent drops (`titleMiss` is the
> first; generalise to notes/legend); (2) structural/geometry
> contracts; (3) PNG visual LAST, corroborative only. The `title`
> was dropped on 100% of diagrams for the project's whole life
> because nothing COUNTED it — coverage gaps hide real defects.
> `make factcheck` is THE gate (numeric PlantUML→drawio comparator,
> ALL 26 conversions vs `-tsvg`; NO eyeballing — every visual claim
> cites a metric). It now has **8 contract metrics** incl. `ratioBad`
> (the wRatio/hRatio ratchet, ADR 0011 step 0). **NO auto-merge** —
> per-PR flow: branch from fresh `origin/main` → push → `gh pr
> create` → wait CI green → **explicit `gh pr merge <n> --squash
> --delete-branch`** → `git fetch --prune && git reset --hard
> origin/main`. **Any emit/geometry change MUST `make gallery` +
> commit the refreshed `docs/gallery/` in the SAME PR** — the #93
> gallery-drift CI gate fails otherwise (it caught a stale gallery
> twice this session; do it BEFORE pushing, it's a derived artifact).
>
> **Operating discipline — emphatic, REPEATEDLY violated this session
> (the user escalated to "you're full of shit", "not improving"):**
>
> 1. **A gate's pass is read ONLY from its OWN `rc=$?` on its OWN
>    line.** NEVER `grep`/`tail`/`||`/`&&`/`echo $?`-after-pipe
>    between a gate and a commit. Bit ≥5× across sessions incl. THIS
>    one (mdlint, then `make gallery-verify`). Run gate bare →
>    capture rc → branch on it as a separate statement → THEN commit.
> 2. **Self-audit EVERY literal YOU introduce** — string AND numeric,
>    in code, COMMENTS, and TEST args/keys — against existing named
>    constants (`PUML_FONT`, `PUML_LEAF_BOX`, `theme.*`,
>    `SHAPE.REL_ARROW_SIZE`, …) BEFORE surfacing. Flagged 4× this
>    session. See memory `self-audit-introduced-literals`.
> 3. **Tests for new/changed code are PART of the change**, written
>    automatically, never user-prompted; report coverage as a stated
>    fact in the done-summary.
> 4. **Do NOT narrate intent to "record in memory / fold into
>    checklist" — silently DO it that turn, report it done.** The
>    promise-instead-of-act IS the failure (memory
>    `self-audit-introduced-literals` ESCALATION note).
> 5. Real fact-based fixes ONLY; root-cause not launder; fact-check
>    before AND after via version-exact docs + the tool's own
>    registry; surface tensions, don't force.
>
> THIS session shipped (all MERGED, in order): **#99 ADR 0011
> wRatio comparator-artefact fix + honest re-baseline + C2/C1
> declined on evidence** (catalyst emit byte-identical; `factcheck`
> CLEAN 26/26; new `tests/factcheck-geometry.test.mts`) · **#100
> lockfile maint** · **#101 ADR 0012 `title` on ALL diagrams +
> `titleMiss` completeness-invariant gate** (researched MDE M2M
> methodology — see Methodology block) · **#102 `/makefile` audit**
> (composite `static-check`, `.mise.toml` java/act/gitleaks/trivy,
> cross-platform `setup.sh`, `?=`/Renovate conventions) · **#103
> `/readme` review** (stale stress/Context→ADR 0008, title↔About,
> section order, java→mise) · **#104 `/ci-workflow` canonical**
> (5-job graph + `ci-pass` + path-filter; SHA-verified
> `dorny/paths-filter`; README/CLAUDE doc-sync). Methodology lessons
> codified into portfolio rules this session
> (`claude-config/rules/common/testing.md` + `git-workflow.md`):
> MDE M2M completeness-invariant-first; never fake-green;
> not-done = not-merged. Memories carried:
> `derived-artifact-enforcement-gate`, `self-audit-introduced-literals`,
> `no-guesses-fact-check-discipline`, `factcheck-harness-gate`.
>
> ### ▶▶ NEXT SESSION (priority order)
>
> 0. **ADR 0011 layout-aspect — CLOSED (fact-check, this session).**
>    The "0.19–0.67× WIDTH on 14/20" premise was substantially a
>    **comparator artefact**: `factcheck-geometry.mjs` compared
>    catalyst **node-extent** vs PlantUML **full viewBox** (title
>    banner + margins + label spread). Fixed `parsePlantumlSvg` to
>    node-vs-node (like-for-like); honest corpus is **0.73–1.05** —
>    catalyst layout is already faithful to `dot`. **C2** (synthetic
>    fan-width node) was implemented + measured under the corrected
>    metric: it does NOT move the sole real residual
>    `rel-tech-vs-notech` (0.732→0.732 — pads canvas not node-extent)
>    and REGRESSES `c4-all-rel-variants` (0.916→1.121) ⇒ **reverted /
>    DECLINED on evidence; C1 declined by extension** (its premise is
>    the artefact). Accepted residual: `rel-tech-vs-notech ≈ 0.73`
>    (one fixture, modest `dot`-antiparallel-vnode spread; held by the
>    ratchet). Net deliverable: the comparator false-positive-class
>    fix + locking unit test + honest re-baseline (catalyst emit
>    byte-identical to `origin/main`). See ADR 0011 §"Status — premise
>    CORRECTED" + memory `factcheck-harness-gate`. **No further
>    layout-aspect work — the gap was the gate, not the product.**
> 1. **Sequence diagrams** (#12, ADR 0007) — phased. **Phase (a)
>    `SeqParser` ✅ DONE 2026-05-17** (`src/seq/`, 29-test matrix,
>    net-new). Phase (b) WIP parked on branch
>    `feat/seq-phase-b-layout-emit` (`c18a403`: seqLayout +
>    Lifeline.mts emit + SeqConverter written; catalyst.mts dispatch,
>    emit-contract tests, and rebase remain). **NEXT = phase (b):** deterministic linear
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
> (P13 SHIPPED then REVERTED 2026-05-17 — uniform `width=420`
> magnified the item-0 layout-aspect mismatch into "humongous fonts";
> embed back to `height=360`. See `docs/research/p13-gallery-
> uniformity.md` "REVERTED". P4b box-sizing ✅ correct (per-leaf
> verified) — but its "render-compare at PlantUML parity" claim above
> was overstated: only 2 of 3 fixtures were eyeballed; aspect is
> item-0, not P4b.)
> Re-confirm P1/P3/P5/P7 status against the post-P4b gallery before
> spiking them — content-fit re-sized every box, so the
> defect-catalog below may have shifted (re-render + re-judge via
> factcheck numbers, never PNG eyeball).
>
> **DONE & pruned** (detail in git history + ADRs + memories per the
> convention at the top of BACKLOG — NOT re-dumped): P12, P2 (#85),
> P4b+cause-D (ADR 0010 + ADR 0011 §Status), #15, #17, ADR 0011
> step 0/C3/D, **ADR 0011 CLOSED** (wRatio comparator-artefact fix +
> C2/C1 declined on evidence — see item 0). **P13** = SHIPPED then
> REVERTED same-day (uniform
> `width=420` magnified the item-0 layout-aspect gap → reverted to
> `height=360`; idea ABANDONED, superseded by item-0;
> `docs/research/p13-gallery-uniformity.md` "REVERTED" + memory
> `md-image-embedding`). `GALLERY_MD_ONLY`/`GALLERY_DRAWIO_ONLY`
> infra + the #93 drift gate are kept.
>
> **OPEN (priority): (1) Sequence diagrams #12 phase (b)+ — WIP
> parked on branch `feat/seq-phase-b-layout-emit` @ `c18a403`, see
> item 1 (now the TOP priority — ADR 0011 closed). (2) C4 surface
> true residuals. Plus the open gallery-visual residuals below —
> RE-JUDGE each via the corrected `make factcheck` numbers (the C2
> "subsumes these" note is void; they were never the artefact, but
> they ARE now measured honestly node-vs-node).**

### ▶▶ GALLERY VISUAL OPEN RESIDUALS (P2/P4/P6 DONE — pruned)

Audit basis: `docs/gallery/img/<stem>.{puml,drawio}.png` pairs
(regen `make gallery`). Aesthetic fidelity to PlantUML is
first-class. **The earlier "cause B / subsumed by C2" framing is
VOID** — ADR 0011 found the wRatio gap was a comparator artefact
(node-extent vs title-inflated viewBox), now fixed; C2 declined.
Re-judge each below against the **corrected** `make factcheck`
node-vs-node numbers + the pair images; do NOT assume a width
defect exists without a corrected-metric number citing it (memory
`factcheck-harness-gate`: distrust the gate, cite a number).

- **P1 — multi-edge lane separation** (`rel-parallel-duplicate`,
  `rel-tech-vs-notech`, `rel-bidirectional`): same-pair fan
  under-separated / labels flung. = **cause B / C2** (the fan is
  post-ELK). Re-check post-C2; factcheck `attachMerge` already 0.
- **P3 — long edge label → width blow-up** (`rel-long-labels`):
  ELK reserves a huge label rect. Interacts with C2/`measureEdgeLabel`
  wrap cap. Re-check post-C2.
- **P5 — hub label proximity** (`topology-hub-spoke`,
  `topology-wide-rank`): likely already resolved by ADR 0008
  (always-`layered`); re-judge, gate vs PlantUML.
- **P7 — short 2-point hierarchical-edge label cram**
  (`edge-tags-styling`, `level-dynamic`): may be covered by the
  routed/laned label de-collision (`slideLabelAlongLane`, extended
  for routed edges in #97). Re-check; small along-edge offset for the
  non-laned 2-point branch if it still reproduces.
- **P8 — `«tag»` stereotype text not rendered** (LOW, independent of
  C2): `edge-tags-styling` Core shows `«System»`, PlantUML
  `«critical»«system»`. Prepend matched tag stereotypes to the
  element `«type»` line. Gate: re-rendered Core shows `«critical»`.

---

1. **Sequence-diagram support #12 (ADR 0007), phased.** Design in
   `docs/adr/0007-sequence-diagram-support.md`: parallel non-ELK
   pipeline (`SeqParser` → linear `seqLayout` → `umlLifeline` emit)
   behind the fail-loud detector; v1 vs deferred-v2; each phase its
   own byte-scope+render-compare gated PR. **(a) `SeqParser` DONE
   (#91).** **(b) NEXT** — linear `seqLayout` + `src/mx/seq/
   Lifeline.mts` emit + `SeqConverter` + flip the `src/catalyst.mts`
   detector `throw`→dispatch; **WIP PARKED on branch
   `feat/seq-phase-b-layout-emit` @ `c18a403`** (seqLayout +
   Lifeline.mts + SeqConverter written; catalyst.mts dispatch +
   emit-contract tests + rebase-on-fresh-main remain). (c) corpus
   fixture + render-compare gate; (d) v2 fragments/dividers. v1
   fails loud on deferred constructs (the ibm-wm fixture uses
   `==dividers==` ⇒ it is a phase-(c)/(d) fixture, NOT a v1 success
   fixture; phase (c) needs a divider-free v1 sequence fixture).

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
