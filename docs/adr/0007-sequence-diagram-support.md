# ADR 0007 — Sequence-diagram support (design)

- Status: accepted — phased implementation in progress
- Date: 2026-05-16 (design); phase-a landed 2026-05-17
- Phases: **(a) `SeqParser` + ordering invariants — ✅ DONE
  2026-05-17** (`src/seq/SeqParser.mts` + `SeqModel.interface.mts`,
  29-test ordering+fail-loud matrix; net-new, zero existing-path
  change, factcheck CLEAN 26/26 by construction). Next: (b) linear
  `seqLayout` + `umlLifeline` emit; (c) corpus fixture +
  render-compare gate; (d) v2 fragments/dividers.

## Context

catalyst converts the **static** C4 subset (Context / Container /
Component / Deployment). C4-PlantUML *dynamic* diagrams
(`C4_Sequence.puml`) are currently **fail-loud**: `Catalyst.convert`
throws `unsupported C4-PlantUML diagram type: C4_Sequence …` (detector
in `src/catalyst.mts`, keyed on a `C4_Sequence` include or a
`^\s*participant\s+` line with zero parsed C4 entities/relations).

The ask: actually convert sequence diagrams to draw.io.

**Why this is a new subsystem, not a tweak.** catalyst's entire
pipeline is the C4 box-and-arrow graph: `EntityParser`/`RelParser` →
ELK graph layout (`layered`/`stress`) → `Mx` C4 shape emit. A sequence
diagram is lifelines + *time-ordered* messages + activations +
`==divider==` + fragments. None of the three layers maps:

- **Model.** Order matters (Y = source order); ELK would scramble it.
- **Parser.** PlantUML sequence grammar subset, distinct from the C4
  entity/relation regexes.
- **Layout.** Deterministic linear pass, NOT a force/layered engine.
- **Emit.** draw.io has a native UML sequence family
  (`shape=umlLifeline;`, messages as edges between lifeline X-points,
  fragments as group rectangles) — a sibling template family, not new
  branches in `Mx.addMxC4*`.

### Fact-check — pinned C4-PlantUML v2.13.0 `C4_Sequence.puml`

Verified against the pinned stdlib source (the version every fixture
`!include`s; Renovate-tracked — see memory `c4-plantuml-renovate-tracked`):

- Lifeline declarations re-skin PlantUML `participant`:
  `Person`/`Person_Ext`/`System`/`System_Ext`/`Container`/`Component`
  and the `*Db`/`*Queue`/`_Ext` variants → `$getParticipant(<kind>, …)`.
  **Declaration order = lifeline X-order.**
- `Boundary`/`System_Boundary`/`Container_Boundary`/`Enterprise_Boundary`
  → PlantUML `box … end box`, closed by `Boundary_End()`.
- `Rel($from,$to,$label,$techn,…,$index,$rel)` → message arrow via
  `$getRel($rel, …)`, default `$rel="->"`. **Source order = Y order.**
  `Rel_Back`-style reverse + `BiRel` exist as in static C4 (the
  arrowhead-end semantics from ADR-less PR #58 / `Rel_Back` carry over).
- Display toggles: `SHOW_ELEMENT_DESCRIPTIONS`, `SHOW_FOOT_BOXES`,
  `SHOW_INDEX`, `autonumber` (PlantUML built-in).
- Underlying PlantUML constructs in scope: `activate`/`deactivate`,
  `note left|right|over`, `alt/else/opt/loop/par/end` fragments,
  `==divider==`, `autonumber`.

## Decision

Implement a **parallel sequence pipeline** behind the existing
fail-loud detector as the dispatch seam — when the detector matches,
call the new converter instead of throwing. Keep it a separate module
family; do NOT overload `Mx.addMxC4*` or the ELK path.

### Architecture

```text
src/seq/SeqParser.mts      participant/actor + message + fragment grammar
src/seq/seqLayout.mts      deterministic linear pass (no ELK)
src/mx/seq/Lifeline.mts     umlLifeline / activation / fragment / note templates
src/seq/SeqConverter.mts   orchestration; the dispatch target
src/catalyst.mts           detector → SeqConverter.convert (replaces throw)
```

- **Parser** → an ordered model: `lifelines[]` (declaration order),
  `messages[]` (source order, with from/to/label/techn/arrowKind/
  activate flags), `fragments[]` (type + spanned lifelines + Y-range),
  `notes[]`, `dividers[]`, `autonumber` flag.
- **Layout** (deterministic, pure geometry — mirrors the
  no-magic-constant discipline): lifelines evenly spaced on X by a
  measured header width (reuse `measureNode`/font metrics); each
  message a row at monotonically increasing Y in source order;
  activation bars = stacked rects on a lifeline; fragments = bordered
  boxes spanning involved lifelines over their Y-range; dividers = full
  width bands. Every spacing value derived from real font metrics or a
  cited draw.io constant — same bar as the rest of catalyst.
- **Emit** → draw.io `shape=umlLifeline;` for lifelines, edges with
  the message arrow style (reusing the `Rel`/`Rel_Back`/`BiRel`
  arrowhead mapping from PR #58), `shape=umlFrame;`-style group rects
  for fragments, note shapes for notes.

### Scope — v1 (this ADR) vs deferred

**In v1:** `participant`/`actor` + all C4 lifeline kinds (decl order),
sync/async/return messages (`->`,`-->`,`->>`,`<-` incl. `Rel_Back`/
`BiRel`), `title`, `autonumber`, `activate`/`deactivate`,
`note left|right|over`.

**Deferred v2 (explicit out-of-scope here):** `alt/else/opt/loop/par`
nested fragments (the layout is materially harder — nested Y-ranges),
`==dividers==`, `box`/`Boundary` lifeline grouping, `ref`,
create/destroy. v1 must **fail-loud with a precise message** on a
deferred construct (never silently drop — the contract-lock rule),
naming the unsupported token, so downstream sees a clear error not a
wrong diagram.

### Test strategy (BLOCKING gates, same bar as the C4 path)

1. `SeqParser` unit matrix — **ordering invariants** (declaration
   order → X index; source order → Y index; arrowKind incl. Rel_Back).
2. Whole-path emit contract — real `convert()` of a fixture, assert
   lifeline X-order, message Y-order, arrowheads, autonumber prefixes.
3. A corpus sequence fixture (from the ibm-wm
   `sequence-leaf-cert-lifecycle.puml` shape) + `render-compare`
   against PlantUML (the BLOCKING visual gate — tests-alone never
   sufficient for a layout, per the codebase rule).
4. Deferred-construct fail-loud test (asserts the precise throw, not a
   silent drop).

## Consequences

- Broadens catalyst's stated scope beyond "static C4 subset"; the
  README / `docs/C4-COVERAGE.md` "Sequence level" rows move from ✗ to
  ✓ as phases land. The fail-loud detector is retained as the dispatch
  seam (and as the v1→v2 guard for deferred constructs).
- Net-new code only; zero risk to the static C4 path (separate
  modules; the only `src/catalyst.mts` change is `throw` → dispatch).
  Corpus byte-identical for all existing static fixtures by
  construction.
- Implementation is **phased** (parser+ordering → linear layout+emit →
  render-compare gate → v2 fragments), each phase its own PR with the
  standard byte-scope + render-compare gates. This ADR is the design;
  it does not itself ship code.
- Downstream: puml2drawio's scheduled consumer test currently feeds a
  sequence fixture and relies on `skip-unsupported`; once v1 lands,
  that fixture converts instead of erroring (coordinate the release
  per the catalyst→puml2drawio→ibm-wm chain — memory
  `release-chain-topology`).
