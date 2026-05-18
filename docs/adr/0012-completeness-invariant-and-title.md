# ADR 0012 — Completeness invariant as the first gate; render the `title`

- Status: **accepted**
- Date: 2026-05-17
- Supersedes nothing; adds a structural gate ahead of the existing
  factcheck geometry/visual metrics.

## Context

catalyst is a **model-to-model (M2M) transformation**: PlantUML-C4
(source model) → draw.io mxGraph (target model). A user gallery review
found the diagram `title` missing on **100% of diagrams** — every
fixture. Root cause: `EntityParser` skip-lists `title`, so it is parsed
and discarded; nothing re-emits it. The existing factcheck oracle
(entity/rel presence + geometry + ratchet) never caught it because no
metric *counted* the title as an emitted element — a **coverage gap**,
not a false positive.

The deeper failure was methodological: verification was
geometry/PNG-first. The user asked for the established community
principle instead of ad-hoc comparison.

## Research — the established principle (primary-sourced)

M2M-transformation testing is a studied field. The relevant principles:

1. **Traceability-driven testing** — every source-model element gets a
   trace link to the target element(s) the rule produced; the oracle
   checks those links exist. (Tisi et al., *A Traceability-Driven
   Approach to Model Transformation Testing*, CEUR Vol-1077.)
2. **Completeness / totality invariant** — the transformation is
   correct only if *total*: every source construct maps to ≥1 target
   element; **no silent drops**, verified structurally **before** any
   visual oracle. (Cabot & Clarisó, *V&V of declarative M2M
   transformations through invariants*, Sci. Comp. Programming.)
3. **Expected-model / structural oracle, not pixels** — compare parsed
   *models* (graph isomorphism with semantic feasibility); PNG/pixel
   comparison is the weakest oracle. (*Model Transformation Testing &
   Debugging: A Survey*, ACM CSUR 2022; NetworkX VF2.)
4. The upstream `localgod/catalyst` has the **same gap** — coverage %
   only, no completeness/traceability oracle.

The user's "same count of elements in drawio as in the source puml" is
exactly the operationalisation of the **completeness invariant**.

## Decision

1. **Completeness invariant is the FIRST gate.** Before any
   geometry/visual metric, the factcheck oracle asserts every source
   construct traces to a target element. Concretely added now:
   `titleMiss` — a `title` directive in the `.puml` ⟹ a non-empty
   `__title` cell in the `.drawio` (else the fixture is not clean).
   Wired into the `clean` predicate alongside the existing contracts.
2. **Render the title** as a draw.io text cell, id `__title`,
   `c4Type="Title"`, bold-black `DIAGRAM_TITLE_PX` (=14, cited from
   every `-tsvg` ground-truth render), seated one blank line above the
   topmost shape (mirroring PlantUML's top placement; content below).
3. **The title is a trace element, NOT a C4 node.** It is excluded
   from every C4-node metric — factcheck node-extent/overlap/labelHit,
   the golden fingerprint, and the corpus-sanity node count — exactly
   as PlantUML's own title text is excluded from the SVG node-extent
   regex. This keeps `wRatio`/`hRatio` like-for-like, the ratchet
   baseline valid, and every pre-existing cell **byte-identical**
   (the only emit delta is one added `__title` cell per titled
   diagram; verified by an `origin/main` worktree byte-diff).
4. **Visual/PNG inspection is corroborative only, after the structural
   gate passes** — the methodology the research prescribes.

## Consequences

- Derived artifacts regenerated in the same change: `make gallery`
  (20 `.drawio` + 20 `.png`; +5 lines each = only the title cell);
  the #93 gallery-drift gate stays green.
- No ratchet re-baseline (title excluded from ratio metrics).
- Generalisation (future): extend the completeness gate from `title`
  to a full per-construct source→target count (notes, legend) — the
  same principle, broader coverage. Tracked in CLAUDE.md backlog.
- The `c4-exhaustive` / `c4-all-rel-variants` element-count parity
  needs the full pinned-stdlib macro inventory before those two can
  join a strict count gate (researched, deferred — not guessed).

## Why ADR

It introduces a new first-class gate and a verification *principle*
(completeness invariant, research-grounded), and changes every titled
diagram's output — the "decision/principle base, then implement" class.

Sources: [Traceability-Driven MT Testing](https://ceur-ws.org/Vol-1077/amt13_submission_7.pdf) ·
[V&V of M2M transformations through invariants](https://www.sciencedirect.com/science/article/abs/pii/S0164121209001976) ·
[MT Testing & Debugging Survey (ACM CSUR)](https://dl.acm.org/doi/10.1145/3523056) ·
[NetworkX VF2](https://networkx.org/documentation/stable/reference/algorithms/isomorphism.vf2.html) ·
[localgod/catalyst](https://github.com/localgod/catalyst)
