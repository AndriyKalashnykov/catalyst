# ADR 0001 — Layout-tuning execution strategy (autonomous run)

- Status: accepted
- Date: 2026-05-16
- Context: backlog item 3 (open-followups) — 4-phase layout/readability
  tuning, executed autonomously over a ~6h unattended window.

## Context

The "drawio renders visibly crammed" backlog defines 4 phases (P1 `\n`
line-break bug, P2 edge-label dims → ELK, P3 Context `force`→`stress`,
P4 native compound boundary layout) and a **BLOCKING visual acceptance
gate**: rendered ibm-wm drawio PNGs must be *visibly* better than the
baseline at pinned sha `a6cd3cc`. The backlog permits running the
release chain "per phase **or per grouped phase**".

Constraints discovered this session:

- `AndriyKalashnykov/catalyst` is an independently-maintained,
  standalone repository (no upstream-sync workflow).
- The full acceptance signal needs a 3-repo release chain
  (catalyst → puml2drawio → ibm-wm) plus Docker+Java PNG rendering.
- All three repos and docker+java are available locally.
- catalyst ships `make render-compare` — builds catalyst, converts a
  `.puml`, renders both the PlantUML PNG and the catalyst-drawio PNG.

## Decision

1. **Engineering first, one grouped release chain last.** Implement
   each phase as its own catalyst PR (independently tested + structurally
   gated), merge to `main`, but run the cross-repo release chain
   (catalyst tag → puml2drawio bump+tag → ibm-wm regen) **once**, after
   all merge-eligible phases land. Four separate 3-repo chains would be
   wasteful and the before/after is cleaner measured once.

2. **Local visual gate per phase via `make render-compare`** against the
   real ibm-wm `.puml` sources (c4-admin-sidecar for P1, c4-context for
   P2/P3, c4-container for P4). This validates each phase fast without a
   release chain; the formal ibm-wm regen vs baseline `a6cd3cc` is the
   final gate.

3. **Merge-gating = the structural regression guard.** A phase merges
   only if the full vitest suite (corpus-sanity, layout-quality, parity,
   golden, output-correctness) is green AND it does not worsen a clean
   diagram structurally. Phase 4 (touches the emit model — highest risk)
   merges only if it clears this bar; otherwise it stays an open PR for
   human review rather than tainting P1–P3.

4. **Autonomous-but-conservative.** Outward-facing actions are limited to
   the `AndriyKalashnykov/*` repos. No GitHub Releases on catalyst
   (annotated tag only, per release-chain topology). Decisions recorded
   as ADRs in `docs/adr/`.

## Consequences

- Faster iteration; one coherent visual before/after.
- Risk: a later phase could mask an earlier phase's visual regression in
  the grouped render — mitigated by the per-phase local `render-compare`
  check kept as evidence under `build/phaseN-visual/`.
- If a phase fails its visual gate and can't be fixed within the window,
  it is left as an open PR with findings documented, not force-merged.
