# ADR 0004 — Modernize the toolchain to latest

- Status: accepted
- Date: 2026-05-16

## Context

Audit during the layout-tuning run found multiple stale pins (user:
"why do you use old garbage??? upgrade everything to the latest"):

| Item | Was | Now | Notes |
|------|-----|-----|-------|
| TypeScript | 5.8.3 | 6.0.3 | major |
| vitest / coverage-v8 | 4.1.4 | 4.1.6 | |
| oxlint | 1.59.0 | 1.65.0 | |
| @types/node | 25.6.0 | 25.8.0 | |
| PLANTUML_VERSION default | 1.2024.7 | 1.2026.2 | ~2yr stale; render-tooling only (ADR 0003) |
| C4-PlantUML stdlib pin | v2.10.0 | v2.13.0 | fixtures/tests/docs |
| Node version mgmt | none | mise `.mise.toml` node=26 | portfolio-mandatory |
| elkjs / fontkit / xml2js | — | — | already latest (0.11.1 / 2.0.4 / 0.6.2) |

## Decision

1. **TypeScript 6.** `tsconfig.json`: `moduleResolution` `Node`
   (=node10, deprecated & removed-in-TS7) → **`bundler`**; explicit
   `rootDir: "./src"` (TS6 TS5011); `typeScriptVersion` → `6.0.3`.
   `bundler` chosen over `nodenext` because the code default-imports the
   CJS `elkjs/lib/elk.bundled.js`; `nodenext` broke that
   (`TS2351: not constructable`) while `bundler` keeps the existing
   lenient CJS-default interop with zero source changes. Build + 239
   tests + lint all green under TS6.

2. **C4-PlantUML v2.10.0 → v2.13.0.** Bumped in every fixture, the
   `output-correctness` C4 helper, README/gallery/C4-COVERAGE, and the
   `EntityParser` sync comment. Safe for the parser: catalyst parses the
   `.puml` text directly and skips `!include` lines — the pin only
   changes what the *reference* PlantUML renderer downloads. v2.11–2.13
   additions over v2.10 are sprite/tag/legend/layout helpers already
   matched by the existing `Add*Tag` / `LAYOUT_` / `SHOW_` / `Update*Style`
   skip-prefix regexes; no new entity-shaped procedure.

3. **mise.** `.mise.toml` pins `node = "26"` (latest 26.x), mirroring
   CI's `node-version: 'latest' + check-latest`. `make deps` now runs
   `mise install` before `npm ci`.

## Consequences

- One-time modernization PR landed before the layout phases so all
  per-phase work + visual gates run on current tooling.
- Follow-ups (tracked in `docs/UPGRADE-NOTES.md`): wire `jdx/mise-action`
  into CI for true local↔CI parity; add a `# renovate:` hint on the
  `PLANTUML_VERSION` default; deep-review the full C4-PlantUML v2.13
  procedure surface against the skip-list if a user diagram uses a
  v2.11+ macro.
- TS7 will remove `node10`; `bundler` is forward-safe.
