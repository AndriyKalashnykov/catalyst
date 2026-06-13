# Factcheck coverage matrix (#17)

Every geometry/emit code path that can regress visual fidelity, mapped
to the `make factcheck` metric(s) that catch a regression in it. The
point of this matrix is to prove the **no-eyeball gate has no blind
spots**: if a path here had no guarding contract metric, a regression
in it could ship green. Maintained alongside the code — extend it (and
the harness) when a new emit path or fidelity contract is added.

**Verification order (ADR 0012, MDE M2M principle):** this is a
model-to-model transformation, so the **completeness invariant** is
the FIRST gate — *every source construct must trace to ≥1 target
element (no silent drops)* — checked structurally **before** any
geometry/visual metric. PNG/pixel inspection is corroborative only,
and only after the structural gate is green. (`titleMiss` is the first
completeness contract; the title dropped on 100% of diagrams while the
geometry-only oracle stayed green — coverage gaps hide real defects.)

See also: `scripts/factcheck-geometry.mjs` (the comparator),
`docs/adr/0012-completeness-invariant-and-title.md` (the principle +
research), `docs/C4-COVERAGE.md` (C4-PlantUML surface coverage),
CLAUDE.md "Build / test / verify" (how to run the gate).

## Metric classification (the true contract)

A fixture is **clean** iff all **eight contract metrics are 0**
(`scripts/factcheck-geometry.mjs`, the `clean` predicate):

| Contract metric | What a non-zero means | 0 == |
|---|---|---|
| `entityMiss` | a parsed entity has no emitted shape at the right place (alias + structural c4Type, text-normalised) | every node rendered |
| `relMiss` | a parsed relation has no matching emitted edge | no relation dropped |
| `arrowBad` | an edge's arrowhead COUNT ≠ the C4 semantic (BiRel ⇒ 2, one-way Rel/Rel_Back ⇒ exactly 1) | arrows semantically correct |
| `labelDrop` | a relation's verb / an entity's name text is absent from its emitted cell | no label text lost |
| `attachMerge` | same-pair edges whose BOTH endpoint attach points are within `ATTACH_SEP_MIN` in the **2-D** plane (Euclidean, P12 fix) | parallel edges visually distinct |
| `labelHit` | an edge-label rect lands over a NON-endpoint leaf | no label on an unrelated box |
| `nodeOverlap` | a PARTIAL node–node overlap (containment = legit nesting, excluded) | no box collision |
| `ratioBad` | (ADR 0011) the parity distance `abs(1−wRatio)` **or** `abs(1−hRatio)` grew > one quantisation quantum (0.01) vs the committed per-fixture baseline (`tests/factcheck-ratio-baseline.json`; ratchet, regen via `UPDATE_FACTCHECK_BASELINE=1`; predicate `scripts/factcheck-ratio.mjs`, unit-tested). **wRatio/hRatio = catalyst node-extent ÷ PlantUML node-extent — like-for-like** (NOT PlantUML's title-inflated SVG viewBox; 2026-05-17 fix, locked by `tests/factcheck-geometry.test.mts`) | no node-extent-aspect fidelity regression vs PlantUML on either axis |
| `titleMiss` | (ADR 0012 — the **completeness invariant**, the FIRST-class structural gate, checked before any geometry/visual metric) the source `.puml` has a `title` directive but the `.drawio` has no non-empty `__title` trace cell | every source construct traces to a target element — no silent drops (the class that dropped the title on 100% of diagrams while entity/rel-only stayed green) |

**Advisory** diagnostics — reported, NOT clean-disqualifying. catalyst
now lays out with `dot` (PlantUML's own engine, ADR 0014) so topology
matches by construction, but the same-rank tie-break order and
boundary-band pixel extents are not contract-stable through draw.io's
re-render (it re-renders dot's layout with its own renderer/fonts):
`rankOrder`, `boundaryBands`. (`wRatio`/`hRatio` themselves are still
reported raw, but a *regression* in them is now the **contract**
`ratioBad` — ADR 0011 promoted this axis advisory→contract. NOTE: the
"14 fixtures at wRatio 0.19–0.67" that motivated the promotion was
later (2026-05-17) found to be a **comparator artefact** — catalyst
node-extent vs PlantUML *title-inflated viewBox*; the like-for-like
fix shows the honest corpus is 0.73–1.05. The ratchet is still a valid
no-regression contract; its baseline was regenerated against the
corrected metric. Memories `factcheck-harness-gate` (FP class #7),
`derived-artifact-enforcement-gate`.)

## Path → guarding metric matrix

Emit/geometry paths are in `src/catalyst.mts` `layoutData2mx` unless
noted. "Exemplar fixtures" are conversions in the 28-fixture gate that
exercise the path (any regression there flips a contract metric).

| # | Geometry/emit path | Source | Guarding contract metric(s) | Exemplar fixtures |
|---|---|---|---|---|
| 1 | Cluster/boundary shape emit (title band, subtitle) | `addMxC4` (cluster) + `DotLayout` cluster `bb` (dot `cluster_*` subgraph label band) | `entityMiss`, `nodeOverlap`; advisory `boundaryBands` | c4-container, topology-deep-nesting, level-component |
| 2 | Leaf shape emit + position | `addMxC4` (leaf) + `DotLayout` node geometry (dot `pos`, 1 pt = 1 px) | `entityMiss`, `nodeOverlap` | every fixture |
| 3 | Leaf sizing (min size, multiline, cylinder3 cap) | `measureNode` + `theme.C4_MIN`/`CYLINDER3_CAP_PX`, pinned into dot (`fixedsize=true`) | `nodeOverlap` (too big/small), `layout-quality` test (≥ C4 min); advisory `wRatio/hRatio` | edge-multiline-labels, edge-large-graph (Db) |
| 4 | **Authoritative-route branch**: dot spline emitted VERBATIM as `curved=1` waypoints + along-route-axis label slide | `catalyst.mts` `if (routesAuthoritative && poly>2 && !cluster)` → `polylineMidpoint`, `slideLabelAlongLane` | `relMiss`, `attachMerge`, `labelHit`, `arrowBad` | rel-parallel-duplicate, rel-bidirectional, rel-fan-stress, c4-all-rel-variants |
| 5 | **Straight / cluster-endpoint fallback**: no waypoint; midpoint label de-collision | `catalyst.mts` final `else` → `resolveLabelOverlap` | `labelHit`, `relMiss`, `arrowBad` | topology-wide-rank, topology-cyclic, rel-directional |
| 6 | Edge arrowhead/style (Rel_Back reversal, BiRel, tag styles) | `addMxC4Relationship` + `relOvr` | `arrowBad`, `labelDrop` | rel-bidirectional, edge-tags-styling, c4-all-rel-variants |
| 7 | Label text content (c4Name/desc/tech, XML/HTML escape, `<br/>`, RelIndex `n:` prefix) | `Mx` / `labelLines` / `RelParser` | `labelDrop`, `entityMiss` (normalised) | edge-unicode-specialchars, edge-multiline-labels, level-dynamic |
| 8 | Layout algorithm (Graphviz `dot` — PlantUML's own engine; 0 crossings) | `DotLayout` (`@hpcc-js/wasm-graphviz`, ADR 0014) | feeds ALL of the above; advisory `rankOrder` | topology-linear-chain, topology-hub-spoke |

Every `catalyst.mts` edge-emit branch (authoritative-route / straight) and
both node-emit calls (cluster / leaf) appear above with ≥1 contract
metric — **no emit path is unguarded**.

## Known coverage gaps (documented, not silent)

1. **Advisory-only dimensions are not contracts.** Only `rankOrder`
   (same-rank tie-break order is not pinned through draw.io's
   re-render even under dot) and `boundaryBands` remain advisory.
   `wRatio`/`hRatio` were advisory until ADR 0011 promoted a
   *regression* in them to the contract `ratioBad` (the silent-rot
   fix): the raw ratio still differs because draw.io re-renders dot's
   layout with its own renderer/fonts, but it may no longer regress
   AWAY from PlantUML vs the committed baseline. An over-ranking /
   compaction regression is caught by that ratchet, not by strict
   order equality.
2. **`boundaryBands`** is reported but advisory; the hard
   title-band contract is the `compound-title-clearance` /
   `compound-boundary` unit tests + `nodeOverlap` (a too-small band
   collides → `nodeOverlap`/`labelHit`).
3. **Sequence diagrams** (`C4_Sequence` / PlantUML sequence) are NOT in
   the 28-fixture gate — `factcheck-geometry.mjs` covers only the C4
   static family. Sequence is **fully implemented** (ADR 0007 a–d2b) and
   has its own committed drift gate (`make seq-gallery-verify` +
   `docs/gallery-seq` render evidence), but lacks a numeric factcheck
   metric. Before any sequence geometry change, the gate MUST gain a
   lifeline/message/order metric + seq fixtures (CLAUDE.md directive).
4. **Pure-aesthetic spacing** (e.g. P4b box-emptiness) is intentionally
   NOT a contract — it is a deliberate cross-cutting visual change
   gated by render-compare + a byte baseline, not by factcheck.

## Maintenance rule

When a new emit branch or fidelity contract is added: (a) add a row
here, (b) ensure ≥1 contract metric guards it, (c) if none does,
extend `scripts/factcheck-geometry.mjs` (don't fork it) before merging.
A path with no guarding contract metric is a blind spot — treat it as
BLOCKING.
