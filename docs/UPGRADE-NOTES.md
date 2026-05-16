# Upgrade Notes

Running log of upgrade decisions and the docs/diagrams each one touches.
Maintained during the 2026-05-16 layout-tuning + modernization run.

## 2026-05-16 — Toolchain modernization (PR-A, see ADR 0004)

Applied:

- TypeScript 5.8 → 6.0; `tsconfig` `moduleResolution: bundler` + `rootDir`.
- vitest/coverage 4.1.4 → 4.1.6; oxlint 1.59 → 1.65; @types/node bump.
- `PLANTUML_VERSION` 1.2024.7 → 1.2026.2 (Makefile + both scripts'
  defaults & doc comments).
- C4-PlantUML stdlib v2.10.0 → v2.13.0 (all fixtures + corpus +
  `output-correctness` helper + EntityParser comment).
- mise `.mise.toml` (node 26); `make deps` → `mise install` + `npm ci`.

Docs/diagrams updated in lock-step:

- `README.md` Tech Stack — TypeScript 6.0; Runtime "Node.js 26,
  mise-managed (.mise.toml)".
- `docs/C4-COVERAGE.md` — spec surface ref + link → v2.13.0.
- `docs/gallery/README.md` — embedded `!include` pins → v2.13.0
  (regenerate via `make gallery` so the rendered PNGs match the bumped
  PlantUML + stdlib).
- ADRs 0001–0004 added under `docs/adr/`.

Open follow-ups (not blocking the layout phases):

- [ ] CI: add `jdx/mise-action` so CI uses the same Node as `.mise.toml`
      (today CI uses `node-version: 'latest'`; parity holds but is not
      pinned). A `/ci-workflow` concern.
- [ ] `# renovate:` inline hint on the `PLANTUML_VERSION` Makefile
      default + a Renovate rule for the C4-PlantUML stdlib pin.
- [ ] Deep-review C4-PlantUML v2.11–2.13 procedure surface vs
      `EntityParser` skip-list if a real diagram uses a v2.11+ macro.
- [ ] `make gallery` regen of `docs/gallery/*` PNGs after the layout
      phases land (the visual artifacts are part of "relevant diagrams").

## Layout phases (see ADR 0001 + open-followups item 3)

Each phase's PR updates: `README.md` if behavior/algorithm visible to
users changes; `docs/C4-COVERAGE.md` if a spec cell flips; `CHANGELOG.md`;
`docs/gallery/*` regenerated; the ibm-wm `_drawio` PNGs at the grouped
release-chain step (the BLOCKING visual acceptance gate).

- Phase 1 (`\n` → `<br/>`): merged (PR #16). Docs: CHANGELOG pending at
  release; gallery regen pending.
- Phase 2 (edge-label dims → ELK): done — PR pending. Local visual gate
  PASS on ibm-wm c4-context (baseline had labels on top of boxes; after,
  all labels clear). CHANGELOG Unreleased updated.
- Phase 3 (Context `force` → `stress` + `sporeOverlap` declump): done —
  PR pending. README "Layout engine" line + diagram + Tech Stack updated;
  ADR-0005; CHANGELOG. Local visual gate PASS on ibm-wm c4-context
  (compact, 0 overlaps, no tangle vs baseline). force=21 / stress=0 /
  pipeline≈5 on the synthetic spike.
- Phase 4 (NETWORK_SIMPLEX node placement — NOT per-boundary subgraphs):
  done — PR pending. Backlog hypothesis (SEPARATE_CHILDREN) empirically
  disproven (115 vs 44 crossings); real fix is a one-option node-placement
  change, zero emit-model change, zero regression (full-corpus spike).
  README layout-engine line + ADR-0006 + CHANGELOG. Local visual gate
  PASS on ibm-wm c4-container (44→30 crossings, containment correct).
