# ADR 0007 — Sequence-diagram support (design)

- Status: accepted — **FULLY IMPLEMENTED (phases a–d2b complete;
  NOTHING deferred).** v1 + d1 dividers + d2 fragments + d2b
  `ref` + `create`/`destroy` + `box`/`Boundary` lifeline grouping.
  The fail-loud seam is retained for malformed input + future
  grammar (contract-lock), but every ADR-0007 construct converts.
- Date: 2026-05-16 (design); phase-a 2026-05-17; phase-b+c+d1+d2 2026-05-18;
  phase-d2b `ref` + `create`/`destroy` + `box`/`Boundary` 2026-05-18
- Phases: **(a) `SeqParser` + ordering invariants — ✅ DONE
  2026-05-17** (`src/seq/SeqParser.mts` + `SeqModel.interface.mts`,
  29-test ordering+fail-loud matrix). **(b) linear `seqLayout` +
  `umlLifeline` emit + dispatch — ✅ DONE 2026-05-18**
  (`src/seq/seqLayout.mts`, `src/mx/seq/Lifeline.mts`,
  `src/seq/SeqConverter.mts`; `catalyst.mts` detector `throw` →
  `SeqConverter.convert` — the only existing-path change, proven
  zero-risk: factcheck CLEAN 26/26 + arrowskew 20/20 + 26 static
  fixtures byte-identical). **(c) v1 corpus fixture +
  render-compare gate — ✅ DONE 2026-05-18**
  (`tests/fixtures/seq/seq-v1-cert-lifecycle.puml`;
  `tests/seq/SeqConverter.test.mts` whole-path emit contract;
  visual gate run — structurally faithful, see Consequences for
  honest v1 imperfections). **(d1) `== divider ==` — ✅ DONE
  2026-05-18** (parsed to a `SeqDivider` event, laid out as a
  full-width band at its source-order Y, emitted as a band cell;
  removed from the fail-loud `DEFERRED` list; `SeqParser` +
  `SeqConverter` + `output-correctness` divider tests; static C4
  byte-identical 26/26 + factcheck + arrowskew unaffected — separate
  pipeline; **unblocks the ibm-wm `==dividers==` downstream fixture**).
  **(d2) combined fragments — ✅ DONE 2026-05-18**
  (`alt/else/opt/loop/par/critical/group/break`, nested): paired
  `fragment-start|else|end` events (`SeqModel`), a nesting stack in
  `SeqParser` with unterminated/orphan-`else` fail-loud, a
  `LaidFragment` box in `seqLayout` (header-widened so `[guard]` is
  one line; `minChildRight` floor ⇒ a parent strictly encloses its
  children by construction), and `umlFrame`-style emit BEHIND the
  messages (document/z-order). 11 new parser+whole-path tests;
  `tests/fixtures/seq/seq-d2-fragments.puml` render-compare = clean
  vs PlantUML. Zero C4 risk VERIFIED (not just by construction):
  gallery-verify CLEAN (C4 `.drawio` byte-identical) + arrowskew
  CLEAN 20/20 + 475 vitest; factcheck `ratioBad` 24/26 proven
  pre-existing host-calibration noise (origin/main yields identical
  w/hRatio on this host — the documented host-font MANUAL-gate
  caveat; baseline correctly NOT regenerated).
  **(d2b) `ref` reference frames — ✅ DONE 2026-05-18**
  (`ref over A[,B…] : text` inline + `ref over A` … `end ref` block):
  a `SeqRef` event, parsed before the deferred guard (`refBuf`
  accumulator mirrors `noteBuf`; unterminated/empty-over fail-loud),
  a `LaidRef` box in `seqLayout` spanning the named lifelines at its
  source-order Y (NOT a paired Y-range — a self-contained framed box,
  every dim a measured/cited metric), `umlFrame`-style emit (no-fill
  border + filled `ref` kind tab — same shape as the d2 fragment tab;
  `REF_KIND` single-sourced layout↔emit). 10 new parser+whole-path
  tests (54 seq, 495 vitest); `tests/fixtures/seq/seq-d2b-ref.puml`
  render-compare clean vs PlantUML. Zero C4 risk VERIFIED:
  gallery-verify CLEAN (C4 `.drawio` byte-identical ⇒ arrowskew
  input unchanged), separate seq pipeline.
  **(d2b) `create` / `destroy` lifespan — ✅ DONE 2026-05-18**
  (`create [participant|actor] X` + `destroy X`): a `SeqLifecycle`
  event (source-ordered like activate, no own Y row); `seqLayout`
  drops a created lifeline's head to its first-use Y and truncates a
  destroyed one's foot at the destroy Y (clamped ≥ head+headH);
  `destroyMarks` → a crossed-line `X` glyph (half-extent = the cited
  `REL_ARROW_SIZE`, no magic). 8 new parser+whole-path+layout tests
  (69 seq, 510 vitest); `tests/fixtures/seq/seq-d2b-create-destroy.puml`
  render-compare = structurally faithful vs PlantUML. Zero C4 risk
  VERIFIED (gallery-verify + seq-gallery-verify CLEAN; separate
  pipeline). Honest v1 imperfection: the creating message's arrowhead
  lands ON the created head box (PlantUML attaches to the box side) —
  no data loss / mis-order; the same "structurally-faithful first
  draft" bar as the other v1 seq notes.
  **(d2b) `box` / `Boundary` lifeline grouping — ✅ DONE 2026-05-18
  (the final construct; ADR now fully implemented).** Raw
  `box "T"` … `end box` AND C4 `*_Boundary(a,"L")` … `Boundary_End()`
  (also the `{ … }` brace form). A `SeqBox` (contiguous
  declaration-range `firstIdx..lastIdx`; PlantUML boxes do NOT nest —
  nested/unterminated/empty/orphan-close fail loud). `seqLayout`: a
  uniform `boxBandH` title band folded into ONE `topShift =
  titleH + boxBandH` so boxed AND non-boxed heads stay aligned
  (PlantUML draws the box title above a uniform participant row);
  the box rect derives from final post-shift lifeline positions
  (full diagram height). Emitted BEHIND lifelines (no-fill border +
  filled title band, z-order). 14 new parser+whole-path+layout
  tests (77 seq, 519 vitest); the stale "box still fail-louds"
  output-correctness contract was UPDATED (not deleted) to the new
  truth (box converts; malformed box fails loud);
  `tests/fixtures/seq/seq-d2b-box-boundary.puml` render-compare =
  structurally faithful vs PlantUML. Zero C4 risk VERIFIED
  (gallery-verify + seq-gallery-verify CLEAN; separate pipeline).
  **No construct is deferred — the fail-loud seam now guards only
  malformed input + future grammar (contract-lock).**

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

> **Dispatch-gate fix (2026-05-18, the seq-perm-* matrix caught it).**
> The seam originally dispatched to `SeqConverter` only inside
> `if (elements.length === 0 && relations.length === 0)`. But
> C4_Sequence legitimately reuses `Rel()`/`Person()`/`*_Boundary()`
> (this §Fact-check), which `RelParser`/`EntityParser` parse as
> relations/elements — so a C4-macro-form sequence diagram fell
> through to the static-C4/ELK path → ELK `Referenced shape does not
> exist` crash / 0 lifelines. The raw-arrow form parsed 0 relations
> so the old gate accidentally worked, hiding the defect until the
> permutation matrix exercised the macro form. Fix: a `C4_Sequence`
> include (or a raw `participant` line) is **authoritative** —
> dispatch to `SeqConverter` FIRST, ungated by element/relation
> counts. Static C4 never includes `C4_Sequence` nor uses
> `participant`, so the static corpus is byte-identical
> (gallery-verify + arrowskew 22/22 + 538 vitest — verified).

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

**Landed after v1:** `==dividers==` (phase d1), the nested
`alt/else/opt/loop/par/critical/group/break` fragments (phase d2 —
the "materially harder nested Y-ranges" are handled by a deterministic
stack: a frame's lifeline span accumulates over ALL events seen while
open, incl. nested children, so depth-inset boxes strictly nest), and
`ref over` reference frames, `create`/`destroy` lifeline lifespan,
and `box`/`Boundary` lifeline grouping (phase d2b — self-contained
framed box; created/destroyed lifelines start/end mid-timeline with
an `X` foot; a `box`/`*_Boundary` grouping rect with a head-shifting
title band over a contiguous declaration range).

**Nothing is deferred — the ADR is fully implemented.** The pipeline
still **fails loud with a precise message** (never silently drops —
the contract-lock rule) on malformed input (nested/unterminated/empty
box, orphan close, …) or a genuinely-unknown line, naming the exact
token + line, so downstream sees a clear error not a wrong diagram.

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

### Known v1 imperfections (honest; non-blocking, no data loss)

Recorded from the phase-c render-compare visual gate
(`seq-v1-cert-lifecycle`, draw.io vs PlantUML). v1's bar is "a clean,
structurally-faithful first draft" — these are aesthetic, not
correctness, and every construct renders with the ordering invariants
intact:

- **Self-message** (`a -> a`) renders as a wide rectangular loop with
  a full sync arrowhead, vs PlantUML's compact hook. Semantically
  correct (it IS a self-message); a v1.x polish candidate (tighten the
  `loopW`/use a smaller return-style head).
- **`note over` slightly overlaps** the activation bar / self-loop
  when both land on the same lifeline row. **v1.x re-examined against
  the real render (2026-05-18) — DECLINED on evidence.** The suggested
  remediation ("reserve the note's row *height* against the activation
  extent") is mis-targeted: the overlap is on **X** (a `note over L` is
  centred on `L`'s `cx`, the same `cx` the activation bar sits on), not
  on Y, so reserving row height cannot address it. Catalyst already
  emits notes AFTER activations in document order ⇒ the note draws
  ON TOP of the bar with the bar continuing above/below — which is
  exactly PlantUML's own behaviour for `note over` an active lifeline.
  No data loss, no message-text occlusion, render is faithful; a true
  fix would mean *moving* a semantically-centred `note over` off its
  lifeline, which is less faithful, not more. Same B1-class lesson:
  a backlog note's proposed fix is an untested hypothesis — verified
  against the render, not applied.
- Lifeline spacing is generous (measured `colGap`) — sparse, not
  crammed; acceptable, tunable later if a wide fixture needs it.
- **(phase d1) — FIXED 2026-05-18 (v1.x).** An EMPTY `====` divider
  used to render as a blank full-width band; it now emits a thin
  full-width separator RULE (a no-fill/no-arrow line edge centred in
  a `2·INSET` footprint) matching PlantUML's hairline. The labelled
  `== X ==` band is unchanged (regression-guarded by the same
  whole-path emit-contract test). Verified by render-compare on
  `seq-v1-dividers`.
- **(phase d2)** a fragment's left border can graze the activation bar
  on its leftmost involved lifeline (same family as the note↔activation
  overlap above) — the box is anchored on `cx ± FRAG_PAD`, not on the
  activation-bar outer edge. No occlusion of message text or arrowheads;
  ordering and nesting intact. v1.x candidate: widen `FRAG_PAD` to clear
  the activation extent on the boundary lifelines. The kind tab is a
  plain filled rect (a clean, deterministic stand-in for PlantUML's
  notched pentagon) — cosmetic, not a fidelity gap.

These are tracked for v1.x/v2 polish; they do NOT gate the phase (the
structural emit contract + fail-loud-on-deferred are the bar).
