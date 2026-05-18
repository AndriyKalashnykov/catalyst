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

> ▶ **RESUME HERE — session handoff 2026-05-18 (refreshed #16 —
> `main` @ post-#114, clean, 0 warnings/0 errors, no parked
> branches). This session landed, all MERGED: #109 revert #107
> false-green · #110 arrowhead decision-base · #111 arrowhead
> REDONE PROPERLY (`enforceApproachClearance` + `make arrowskew`
> drawio-SVG render-truth gate, CLEAN 20/20) · #112 Sequence #12 v1
> (phases b+c: dispatch flip + v1 pipeline) · #113 B1 DECLINED on
> evidence (render no-op not shipped) + `scripts/bendcount-svg.mjs`
> instrument + layout-readability backlog dissolved · #114 ADR 0007
> **phase d1 `== divider ==`** + SeqParser oxlint fix.
>
> **▶▶ NEXT SESSION — pick up here (priority order):**
>
> 1. **ADR 0007 phase (d2): v2 sequence fragments** —
>    `alt/opt/loop/par/critical`, `box`/`Boundary` grouping, `ref`,
>    create/destroy. Currently fail-loud with token+line (the
>    no-silent-drop guard). The ADR's explicitly "materially harder"
>    nested-Y-range layout; do it as its own phased PR(s) (maybe
>    d2a single-level alt/opt/loop, d2b nested+box) with the SAME
>    gates: render-compare visual + factcheck 26/26 + arrowskew
>    20/20 + 26 static byte-identical (separate seq pipeline ⇒ zero
>    C4 risk by construction, but VERIFY).
> 2. **Sequence v1.x polish** (small, real, render-measurable; ADR
>    0007 "Known v1 imperfections"): note↔activation row overlap;
>    empty `====` → thin rule not a full band. NOTE: the
>    self-message-loop-width tweak was MEASURED a no-op for
>    long-label fixtures — only re-spike with a SHORT-self-label
>    fixture proving the shrink, else leave it (don't ship a no-op).
> 3. **Downstream release** catalyst→puml2drawio→ibm-wm — arrowhead
>    fix + sequence v1 + dividers now justify a release; the
>    downstream `skip-unsupported` sequence fixture now CONVERTS.
>    Cross-repo — coordinate per memory `release-chain-topology`;
>    confirm scope before starting (release = annotated git tag on
>    `main`, no GitHub Release; per CLAUDE.md release rule).
> 4. **layout-readability — DO NOT reopen** without a
>    render-measured defect a user can point to (B1 declined on
>    evidence; spacing/tall-ribbon are `dot`-faithful per ADR 0011;
>    `docs/research/layout-readability.md` "Post-spike conclusion").
>    Optional only: B4 `contentAlignment`, B6 `aspectRatio` (low).
>
> **Standing gates (all green at handoff):** `make factcheck` 26/26,
> `make arrowskew` 20/20 (drawio-SVG render-truth — the anti-#107
> instrument), 419 vitest, `make ci` green, repo 0 warnings.**
>
> **Process lesson (codified — `factcheck-harness-gate`):** a "visual"
> contract MUST be measured from the renderer's ACTUAL output
> (`make arrowskew` parses the drawio-export SVG — the render-truth
> gate that would have caught #107), never a reconstruction the
> renderer ignores. `gallery-verify` only diffs the deterministic
> `.drawio`; `make arrowskew` is the standing render-truth gate
> (docker, like `make factcheck`). Distrust a new gate's own flags —
> fact-check each against the real render before trusting OR acting.
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
> **Parked WIP branch (on `origin`, NO PR — do NOT prune; needs a
> rebase onto fresh `origin/main` before resuming — branched off
> pre-#102 main):**
>
> - `feat/seq-phase-b-layout-emit` @ `c18a403` (base `62acfcd`).
>   See item 1 below. (The old `feat/perpendicular-arrowhead-routing`
>   branch's port-stub-on-EMITTED-waypoints approach was a no-op for
>   `orthogonalEdgeStyle` — do NOT resurrect it. The correct fix
>   landed this PR: `enforceApproachClearance` + the `make arrowskew`
>   render-truth gate.)
>
> **arrowhead skew — REDONE PROPERLY this PR (supersedes reverted
> #107).** `enforceApproachClearance` (`src/layout/edgeLanes.mts`)
> pushes the endpoint-adjacent emitted waypoint + its feeder to a
> `2·REL_ARROW_SIZE+½-ULP` perpendicular standoff so draw.io's
> orthogonal feeder can't occlude the arrowhead; wired into the
> non-laned multi-bend AND laned multi-point branches (the
> single-midpoint fan is left untouched — different geometry). The
> render-truth gate is **`make arrowskew`** (`scripts/arrowskew-svg.mjs`,
> docker; renders each `.drawio` via drawio-export → SVG, asserts
> shaft⇔head-axis collinearity + no feeder occlusion). CLEAN 20/20.
> `factcheck` "CLEAN 26/26" = the legitimate 7 contracts
> (un-regressed; `arrowSkew` is NOT a factcheck metric — it lives in
> the SVG gate, which is the only thing that can measure draw.io's
> real route). Lesson: the #11 handoff's "laned same-pair port-stub"
> label was too narrow — the fix is universal across multi-bend
> pinned edges (memory `factcheck-harness-gate`).
>
> **Surfaced, NOT absorbed (next-session follow-ups):**
>
> - `vitest.config.ts` `exclude:` omits `src/catalyst.mts` (the core
>   orchestrator, heavily changed #101/#107) from the 85%
>   `thresholds.global` gate — CI gate correct, coverage *scope* is a
>   `/test-coverage-analysis` finding. Pursue.
> - oxlint advisory `unicorn(prefer-string-starts-ends-with)` at
>   `src/seq/SeqParser.mts:154` (`/^!/.test(t)` → `t.startsWith('!')`)
>   — pre-existing on `origin/main` from #91 Phase (a); `make ci`
>   tolerates it (advisory, exit 0). Fix opportunistically in the
>   Sequence phase-(b) PR (same file area).
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
> THIS session: **#107 was merged then REVERTED — a false-green.**
> The construction looked correct (`incidentAxis`+`endpointStub`
> port-stub) and `make factcheck` reported `arrowSkew` 26/26, but the
> metric reconstructed `[exit,…emitted-wps,entry]` while EVERY
> catalyst edge carries `edgeStyle=orthogonalEdgeStyle` ⇒ draw.io
> discards the emitted waypoints and routes itself. The user caught
> the still-skewed `requeues` arrowhead by eyeballing the merged
> `topology-cyclic.drawio.png`; an independent drawio-export render
> proved pre-#107 == post-#107 == committed PNG (`md5 1e061af…`) —
> the change is a render no-op. Reverted via PR (this work). #108
> (handoff #12 + `docs/research/layout-readability.md`) was a
> separate docs PR — kept, but its #107 references corrected.
> `docs/research/layout-readability.md`'s findings (ELK "bare
> defaults" premise FALSE — catalyst sets `nodesep:50`/`ranksep:36`;
> "tall ribbon" PlantUML-faithful per ADR 0011) remain valid (they
> are independent of #107). Memory `factcheck-harness-gate` updated
> with the false-green post-mortem: a "visual" contract MUST be
> measured from the renderer's REAL output (parse drawio-export SVG),
> never a reconstruction; gate the gallery PNG as a fresh render.
> Memories carried: `derived-artifact-enforcement-gate`,
> `self-audit-introduced-literals`, `no-guesses-fact-check-discipline`,
> `factcheck-harness-gate`.
>
> ### ▶▶ NEXT SESSION (priority order)
>
> 0. **arrowhead skew — DONE this PR (supersedes reverted #107).**
>    Root cause proven vs the real drawio-export SVG: every catalyst
>    edge is `orthogonalEdgeStyle` ⇒ draw.io re-routes; the skew is
>    the orthogonal feeder OCCLUDING the arrowhead when the
>    endpoint-adjacent waypoint is closer to the border than the
>    arrowhead is long (`exitX/entryX`/`jettySize` are ignored —
>    spiked, ruled out). Fix: `enforceApproachClearance`
>    (`2·REL_ARROW_SIZE+½-ULP` standoff) on the non-laned multi-bend
>    and laned multi-point paths. Gate: `make arrowskew`
>    (`scripts/arrowskew-svg.mjs`, drawio-export SVG, render-truth)
>    CLEAN 20/20; 26 vitest; factcheck 26/26 un-regressed; visual
>    corroboration done. The single-midpoint laned fan was left
>    untouched (different geometry — re-spike if a future fixture
>    flags it on the gate). No further arrowhead work unless
>    `make arrowskew` reports a regression.
> 1. **Layout readability — BACKLOG DISSOLVED under fact-check (see
>    `docs/research/layout-readability.md` "Post-spike conclusion").**
>    B1 (bend-reduction) DECLINED on evidence: `collapseCollinearBends`
>    was a proven full render no-op (20/20 `.drawio` byte-identical;
>    the redundant ≤1.5 px bends are draw.io `orthogonalEdgeStyle`
>    router-owned, not in catalyst's emit — the #111/#107 lesson
>    again). B2 not-applicable (canvas already tracks content bbox).
>    B5 already-correct (measured PlantUML `INSET`, not 0). Spacing
>    premise was FALSE (`nodesep:50`/`ranksep:36`); tall-ribbon is
>    `dot`-faithful (ADR 0011). Net: the `dot`-fidelity design target
>    is met; **no further layout-readability work** beyond optional
>    low-priority B4 (`contentAlignment` nesting) / B6 (`aspectRatio`,
>    soft). Instrument `scripts/bendcount-svg.mjs` kept as the
>    reproducible evidence + future routing-change probe. Re-open only
>    with a render-measured defect a user can point to, not a metric
>    in isolation.
>    (ADR 0011 layout-**aspect** remains CLOSED — that was the gate,
>    not the product; this is the distinct readability/aesthetic axis.)
> 2. **Sequence diagrams** (#12, ADR 0007) — **phases (a)+(b)+(c)+(d1)
>    DONE** (a: SeqParser #91; b+c #112; **d1 `== divider ==` this
>    PR** — `SeqDivider` event + full-width band emit + render-compare
>    gate; SeqParser:154 oxlint advisory also fixed in-scope ⇒ repo
>    now 0 warnings; factcheck 26/26 + arrowskew 20/20 + 26 static
>    byte-identical prove zero C4 risk; **unblocks ibm-wm
>    `==dividers==`**). **Remaining: phase (d2) v2 fragments**
>    (`alt/opt/loop/par/critical`, `box`/`Boundary` grouping, `ref`,
>    create/destroy) — still fail-loud with token+line (no-silent-drop
>    guard; the materially-harder nested-Y-range layout). Plus the
>    recorded v1.x polish (ADR 0007 "Known v1 imperfections":
>    self-message loop = MEASURED no-op for the long-label fixture,
>    only helps short labels — re-spike only with a short-self-label
>    fixture; note↔activation overlap; empty `====` → thin rule not a
>    full band). Coordinate the catalyst→puml2drawio→ibm-wm release
>    now that v1+dividers ship (memory `release-chain-topology` —
>    downstream `skip-unsupported` sequence fixture now converts).
> 3. C4 surface TRUE residuals (`$sprite`, sketch, legend, dropped
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
