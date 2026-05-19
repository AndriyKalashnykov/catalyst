# ADR 0008 — Context layout: `layered` (like PlantUML/dot), NOT `stress`

- Status: accepted — **SUPERSEDED by ADR 0014** (2026-05-19): under
  the `dot` engine the layout engine IS PlantUML's own, so Context
  ranking is correct by construction, not by this ELK-`layered`
  choice. Retained as the ELK-default rationale until 1a/P6.
- Date: 2026-05-17
- **Supersedes ADR 0005** (Context → `stress`+`sporeOverlap`). The
  non-hierarchical Context branch is removed entirely; every C4 diagram
  type — Context included — now uses `org.eclipse.elk.layered`.

## Context

ADR 0005 chose `org.eclipse.elk.stress`+`sporeOverlap` for the C4 Context
branch (people/systems only). Its decision metric was **edge-crossing
count**, and it only ever compared `force` vs `stress` — it never compared
either against `layered`, and it never evaluated *fidelity to PlantUML*,
which is the actual objective of the #19 acceptance gate ("aesthetic
fidelity to PlantUML is a first-class requirement").

The premise embedded in `LayoutEngine` was: *"a C4 Context diagram is an
inherently hub-and-spoke overview that `layered` spreads into a wide
ribbon (true of dagre, ELK AND PlantUML's own Graphviz/dot)."*

That premise was **empirically false**, proven directly from the gallery
ground-truth PlantUML renders. PlantUML renders *every* C4 diagram —
Context included — with Graphviz `dot`, which is hierarchical layered
ranking. It does not force-direct, and it does not avoid the ribbon:

| Context shape | PlantUML/`dot` (ground truth) | catalyst `stress` (removed) |
|---|---|---|
| linear chain (`topology-linear-chain`) | straight column | diagonal staircase (x-spread 0 → 132) |
| hub-and-spoke (`topology-hub-spoke`) | clean 3-rank hierarchy | scattered tangle |
| wide rank (`topology-wide-rank`) | embraced wide ribbon | radial fan (NOT what PlantUML shows) |
| cycle (`topology-cyclic`) | ranked DAG + routed back-edge | force scatter |

`stress` diverged from PlantUML in **every** Context shape. ELK
`layered` — the same hierarchical-ranking family as `dot` — reproduces
PlantUML's layout in all of them, which is exactly the fidelity target.

Root-cause spike (`topology-linear-chain`, 5 `System` chain):
`stress`+`sporeOverlap` produced `x=[8,53,90,119,140]` (spread 132 — the
P4 "diagonal staircase"); `layered` DOWN produced `x=[12,12,12,12,12]`
(spread 0 — a column). A bare ELK `layered` graph of the same structure
also gave spread 0 regardless of node-placement strategy, confirming the
staircase was the algorithm choice, not a placement bug.

## Decision

Remove the non-hierarchical Context branch. `LayoutEngine` always uses
`org.eclipse.elk.layered` (with the existing `NETWORK_SIMPLEX` node
placement, `INCLUDE_CHILDREN`, ORTHOGONAL routing, model-order biasing,
and font-derived edge-label spacing). Deleted as dead-by-construction:

- the `stress` `layoutOptions` branch,
- the `declump()` `sporeOverlap` second pass (it existed only to remove
  the node overlaps `stress` left; `layered` is overlap-free by
  construction, like `dot`),
- the `isHierarchical()` discriminator,
- the `LayoutResult.context` flag and the now-unreachable `#24`
  synthetic-centre-waypoint emit block in `catalyst.mts` that it gated
  (former-Context edges now carry deterministic ELK ORTHOGONAL routes,
  exactly like hierarchical edges, so no synthetic waypoint is needed).

The #25 nested-boundary fix is preserved by construction: `layered`
already reserves the per-compound title band, which was the whole reason
nested compounds were force-routed to `layered` before.

## Consequences

- **Byte-scope (proven):** exactly the 15 former-Context corpus fixtures
  changed; the 5 hierarchical fixtures (`edge-large-graph`,
  `level-component`, `topology-deep-nesting`, `edge-multiline-labels`,
  `edge-empty-descriptions`) are **byte-identical** — zero hierarchical
  regression by construction.
- **Tests:** full suite green (golden/parity fingerprint topology not
  coordinates → unaffected; `layout-quality` confirms zero node overlap
  under `layered` for the former-Context graphs; `corpus-sanity` route
  signatures regenerated). `context-stress.test` → rewritten as
  `context-layered.test` locking the new contract (linear chain = column,
  hub ranks below its targets, zero overlap, deterministic). Reverting to
  `stress` fails every assertion.
- **Render-compare gate (BLOCKING, PASSED):** every Context fixture's
  regenerated `drawio.png` matches the PlantUML `puml.png` aesthetic —
  column / 3-rank / ribbon / ranked-cycle / side-by-side components.
- The crossing-count metric ADR 0005 optimised is no longer the
  objective; PlantUML fidelity is. Where `dot` accepts crossings (dense
  meshes), `layered` matching `dot` is correct *because* it matches
  `dot`.
- `stress` was seed-stable but the determinism argument is moot:
  `layered` is also deterministic.
- Separate, out-of-scope follow-up: former-Context boxes look empty
  because the `C4_MIN` per-type floor (a documented C4 convention) +
  `verticalAlign=top` leave whitespace below short content. That is a
  cross-cutting visual question touching all 20 fixtures and a
  documented constant; it is tracked separately, not bundled here.
