# C4-PlantUML Coverage Matrix

Tracks catalyst's export coverage against the [C4-PlantUML v2.13.0](https://github.com/plantuml-stdlib/C4-PlantUML/tree/v2.13.0) spec surface. Updated as fixes land.

Legend: `✓` full, `~` partial (rendered but not with dedicated styling), `✗` silently dropped, `!` crashes parser.

**States re-validated against code 2026-05-16** (post v1.5–1.6 plus the cylinder-cap (#43) / `<…>`-literal (#44) / RelIndex (#45) / Context-edge (#24) / nested-compound (#25) work). Several rows that predated v1.5 were
stale and are corrected below.

## Surface delta v2.10.0 → v2.13.0 (verified 2026-05-16)

Enumerated diff of the stdlib `!procedure` definitions across both tags:

- **`C4_Context.puml` / `C4_Container.puml` / `C4_Component.puml` /
  `C4_Deployment.puml`: ZERO user-facing procedures added or removed.**
  The element/relationship macro surface (`Person*`, `System*`,
  `Container*`, `Component*`, `Node*`/`Deployment_Node*`, `Rel*`,
  `BiRel*`, `RelIndex*`, boundaries) is byte-identical v2.10→v2.13.
- `C4.puml` (core) added only: `$bl`, `$fillMissing`,
  `$fixHeaderColumns`, `$l_up/$l_down/$l_left/$l_right`,
  `$updatePropColumns` (all internal `$`-helpers — never user-authored
  top-level statements), `SharpCornerShape`, `UpdateLegendTitle`. None
  are entity-shaped; `EntityParser.isValidEntityType()` rejects any
  non-element token that slips past the `isComponent` skip-list, so
  none can produce a spurious node.

**Conclusion:** the v2.10.0→v2.13.0 stdlib bump required **no parser
change**. Re-run on the next stdlib bump:

```bash
for b in C4 C4_Context C4_Container C4_Component C4_Deployment; do
  for v in <OLD> <NEW>; do
    curl -s "https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/$v/$b.puml" \
      | grep -oE '^!(unquoted )?procedure \$?[A-Za-z_]+' \
      | sed -E 's/^!(unquoted )?procedure //' | sort -u > /tmp/$b.$v
  done
  comm -13 /tmp/$b.<OLD> /tmp/$b.<NEW>   # additions; '$'-prefixed = internal
done
```

## Entity-creation procedures

### Context level

| Primitive | Spec signature | State |
|---|---|---|
| `Person` | `Person($alias, $label, $descr="", $sprite="", $tags="", $link="")` | ✓ |
| `Person_Ext` | same | ✓ |
| `System` | `System($alias, $label, $descr="", $sprite="", $tags="", $link="")` | ✓ |
| `SystemDb` | same | ~ (own template, `cylinder3` — same cylinder styling family as ContainerDb; no per-type colour) |
| `SystemQueue` | same | ~ (own template, dedicated `mxgraph.c4.queue` shape; no per-type colour) |
| `System_Ext` | same | ✓ |
| `SystemDb_Ext` | same | ~ (grey SystemExt) |
| `SystemQueue_Ext` | same | ~ (grey SystemExt) |
| `System_Boundary` | `System_Boundary($alias, $label, $tags="", $link="")` | ✓ |
| `Enterprise_Boundary` | same | ✓ (dedicated `EnterpriseBoundary` template — distinct 13px title) |

### Container level

| Primitive | State |
|---|---|
| `Container` | ✓ |
| `ContainerDb` | ✓ (dedicated cylinder) |
| `ContainerQueue` | ~ (dedicated `mxgraph.c4.queue` shape; no per-type colour) |
| `Container_Ext` | ~ (grey SystemExt) |
| `ContainerDb_Ext` | ~ (grey SystemExt — loses cylinder) |
| `ContainerQueue_Ext` | ~ (grey SystemExt) |
| `Container_Boundary` | ✓ (renders as generic Boundary) |

### Component level

| Primitive | State |
|---|---|
| `Component` | ✓ |
| `ComponentDb` | ~ (own template, `cylinder3`; no per-type colour) |
| `ComponentQueue` | ~ (dedicated `mxgraph.c4.queue` shape; no per-type colour) |
| `Component_Ext` | ~ (grey SystemExt) |
| `ComponentDb_Ext` | ~ (grey SystemExt) |
| `ComponentQueue_Ext` | ~ (grey SystemExt) |

### Deployment level

| Primitive | Spec | State |
|---|---|---|
| `Deployment_Node` | `Deployment_Node($alias, $label, $type="", $descr="", $sprite="", $tags="", $link="")` | ✓ (dedicated template; deep nesting via `layered`; #25 hardened) |
| `Deployment_Node_L` / `_R` | same | ✓ |
| `Node` | same | ✓ (dispatched to `DeploymentNode`) |
| `Node_L` / `_R` | same | ✓ |

### Sequence level (C4_Sequence.puml — ADR 0007, v1 landed)

Dispatched to the parallel `SeqConverter` pipeline (`src/seq/`,
`src/mx/seq/`) via the `catalyst.mts` detector seam — NOT the C4
ELK/box path. v1 = participants + ordered messages + activations +
notes + title; v2-deferred constructs **fail-loud** (no silent drop).

| Primitive | State |
|---|---|
| `participant` / `actor` + all C4 lifeline kinds | ✓ v1 (decl order → lifeline X; `shape=umlLifeline`) |
| Messages `->` `-->` `->>` + `Rel`/`Rel_Back`/`BiRel` kinds | ✓ v1 (source order → monotone Y; sync/async/return/bi arrowheads) |
| `activate` / `deactivate` | ✓ v1 (LIFO-paired activation bars) |
| `note left\|right\|over` | ✓ v1 (note shape; self-loop/activation overlap is a v1.x polish item — ADR 0007) |
| `title` | ✓ v1 (traced to a title cell — completeness invariant) |
| Self-message (`a -> a`) | ✓ v1.x (loop width = own measured label, PlantUML-compact for short labels — #137) |
| `== divider ==` (labelled + empty) | ✓ v1.x (phase d1 — labelled band at source-order Y; empty `====` = thin rule not a band #130; unblocks ibm-wm `==dividers==`) |
| `alt/else/opt/loop/par/critical/group/break` fragments (nested) | ✓ d2 (`umlFrame`-style box behind messages, kind tab + one-line `[guard]`, `else` compartment separators; strict nesting by construction) |
| `ref over` reference frames (inline + block) | ✓ d2b (#131 — self-contained framed box spanning the named lifelines) |
| `create` / `destroy` lifeline lifespan | ✓ d2b (#133 — head drops to first-use Y; foot truncates with an ✕ glyph) |
| `box` / `*_Boundary` lifeline grouping | ✓ d2b (#134 — grouping rect over a contiguous declaration range, head-shifting title band; non-nesting) |
| **ADR 0007 status** | **FULLY IMPLEMENTED — phases a–d2b, NOTHING deferred.** Fail-loud retained for malformed/unknown input only (contract-lock) |
| `autonumber`, `SHOW_ELEMENT_DESCRIPTIONS`, `SHOW_FOOT_BOXES`/`SHOW_INDEX` | ✗ v2 (deferred) |

## Relationships

| Primitive | State |
|---|---|
| `Rel($from, $to, $label, $techn="", $descr="", ...)` | ✓ |
| `Rel_Back` | ✓ (C4-PlantUML `"<<--"`: arrowhead reversed to the `$from` end via `startArrow`+`endArrow=none`, `Mx.mts`; endpoints NOT swapped — matches PlantUML) |
| `Rel_Neighbor` | ~ (arrowhead correct; the Neighbor *placement* hint not honored) |
| `Rel_Back_Neighbor` | ~ (✓ arrowhead reversed like `Rel_Back`; Neighbor placement hint not honored) |
| `Rel_U` / `Rel_D` / `Rel_L` / `Rel_R` | ✓ (captured; hint ignored) |
| `Rel_Up` / `Rel_Down` / `Rel_Left` / `Rel_Right` | ✓ (long-form captured by `relationPattern`; direction via `directionOf`) |
| `BiRel` | ✓ (bidirectional — `startArrow=blockThin` emitted, `Mx.mts`) |
| `BiRel_U/D/L/R` / `BiRel_Up/Down/Left/Right` / `BiRel_Neighbor` | ✓ (captured by `relationPattern`; bidirectional) |
| `RelIndex*` series (dynamic) | ✓ (#45 — leading ordinal preserved as an `n:`-style verb prefix; topology + index rendered) |

## Layout hints

| Primitive | State |
|---|---|
| `Lay_U/D/L/R`, `Lay_Up/Down/Left/Right` | ✓ parsed (`RelParser.getLayoutConstraints`) and fed to `dot` as invisible (`style=invis`), layout-only ranking edges (never drawn) |
| `Lay_Distance` | ✓ parsed; carried as a layout-only constraint |
| `LAYOUT_TOP_DOWN` | ✓ (skipped; `layoutDirection` option gives equivalent) |
| `LAYOUT_LEFT_RIGHT` / `LAYOUT_LANDSCAPE` | ✓ (skipped) |
| `LAYOUT_AS_SKETCH` | ✓ (skipped) |

## Styling

Handled by `src/puml/StyleParser.mts` (colour kwargs `$bgColor`/`$fontColor`/`$borderColor`/`$lineColor`/`$textColor`/`$lineStyle` → drawio `fillColor`/`fontColor`/`strokeColor`/`dashed`).

| Primitive | State |
|---|---|
| `AddElementTag($tagStereo, $bgColor, $fontColor, $borderColor)` | ✓ colour/style AND the `«tag»` stereotype TEXT — matched tags render as `«tag»` segments before the `«type»` line, e.g. `«critical»«System»` (P8 / PR #73; was colour-only before) |
| `AddRelTag($tag, $textColor, $lineColor, $lineStyle, $lineThickness)` | ✓ (applied to rels whose `$tags` matches; full faithful line-style map below) |
| `AddBoundaryTag($tag, $bgColor, $borderColor, $fontColor)` | ✓ (applied to boundaries whose `$tags` matches) |
| `UpdateElementStyle($elementName, ...)` | ✓ for mapped kinds (person/system/container/component + `_ext`/`_db`/`_queue`); unmapped kinds ignored |
| `UpdateRelStyle` / `UpdateBoundaryStyle` | ✓ (global default override) |
| `$tags="critical"` inline on shape / rel / boundary | ✓ (`+`-separated multi-tag supported; last tag wins on conflict) |
| `$link=https://...` | ✓ (emitted as clickable `link=` attribute on the drawio object) |
| `$sprite=img:foo` / `$sprite=&icon` | ✗ (parsed as `sprite`; not rendered — drawio has no PlantUML sprite registry. Parsing never breaks) |
| `$lineStyle`/`$borderStyle` = `DashedLine()`/`DottedLine()`/`BoldLine()`/`SolidLine()` (helper-call OR resolved-literal form) | ✓ **2026-05-16** — faithful map: dashed→`dashed=1`, dotted→`dashed=1;dashPattern=1 4`, bold→`strokeWidth` (cited emphasis), solid→`dashed=0`. Render-compare verified |
| `$lineThickness` / `$borderThickness` (numeric) | ✓ → explicit `strokeWidth`; an explicit value wins over the `bold` keyword default |
| `$shadowing="true"\|"false"` | ✓ → draw.io `shadow=1\|0` (render-compare verified: drop shadow) |
| `SET_SKETCH_STYLE` / `LAYOUT_AS_SKETCH` | ✓ → draw.io `sketch=1` on every cell (PlantUML `skinparam handwritten true`; fact-checked vs pinned v2.13.0 C4.puml; render-verified hand-drawn). Off by default ⇒ static C4 corpus byte-identical |

## Legend / display

| Primitive | State |
|---|---|
| `SHOW_LEGEND`, `SHOW_FLOATING_LEGEND`, `SHOW_DYNAMIC_LEGEND` | ✓ → synthesized tag-entry legend box (one row per AddElementTag/AddRelTag/AddBoundaryTag stereotype: fill swatch + name), placed POST-LAYOUT right of the content (PlantUML's "legend right"). Overlay only ⇒ static-C4 byte-identical. DYNAMIC = deprecated alias |
| `HIDE_STEREOTYPE` | ✓ → drops the `«Type»` line from element labels (PlantUML `hide stereotype`); the `c4Type` structural attribute is KEPT so golden/parity stay byte-identical. v1: box keeps the reserved stereotype-line height (measureNode untouched ⇒ static-C4 layout provably unchanged). Off by default |
| `SHOW_PERSON_OUTLINE` / `_PORTRAIT` / `_SPRITE` | ✗ |
| PlantUML `note left\|right\|top\|bottom of X` / `note over X[,Y]` (single + `… end note` block) | ✓ → `shape=note` placed POST-LAYOUT from the target's laid-out box (`NoteParser` separate pass; the layout engine/EntityParser untouched ⇒ static-C4 byte-identical). v1: the layout engine is note-unaware (no reflow); clamped ≥0 so never off-canvas. Floating `note as <id>` not v1 |

## Properties

| Primitive | State |
|---|---|
| `AddProperty` / `SetPropertyHeader` / `WithoutPropertyHeader` | ✓ → up-to-4-col property table consumed by the NEXT element (fact-checked vs v2.13.0 `$getProps()` semantics), rendered POST-LAYOUT as an html grid just below that element. Overlay only ⇒ static-C4 byte-identical. v1: adjacent cell, not embedded in the element (the layout engine is overlay-unaware — may overlap; structurally faithful, properties SHOWN not dropped) |

## Priority backlog

Ordered by value × tractability.

### Done (structural correctness — parity-gated by `tests/parity.test.mts`)

1. ✅ **Deployment nodes** (`Deployment_Node`/`Node` + `_L`/`_R`), including deep nesting (`dot` `cluster_*` subgraph nesting, any depth).
2. ✅ **BiRel bidirectional** — `startArrow` emitted.
3. ✅ **Long-form Rel names** + `BiRel_*` + `Rel_Back_Neighbor`.
4. ✅ **Parallel relations + self-loops** — one drawio edge per parsed relation (multigraph; was collapsing 17→6).
5. ✅ **`$tags` / `$link` applied; `AddElementTag`/`AddRelTag`/`AddBoundaryTag`/`UpdateElementStyle`/`UpdateRelStyle`/`UpdateBoundaryStyle`** → colour/dashed overrides.

The parity test asserts: every entity → a shape with matching `c4Type`; every relation → an edge; every endpoint resolves; `<diagram id+name>` present. Run against `c4-exhaustive.puml` (the all-encompassing fixture) + 5 real fixtures. Parity + the `tests/golden.test.mjs` structural snapshot are coordinate-free, so they held **unchanged** through every engine change (dagre→elkjs→dot) — proof the swaps preserved topology.

### Layout fidelity (L1–L5) — engine: Graphviz `dot`

As of **2.0.0**, catalyst lays out with **Graphviz `dot`** via the pinned `@hpcc-js/wasm-graphviz` WASM build (ADR 0014, superseding the ELK ADRs 0008/0009/0011; the `elkjs` engine was removed). `dot` IS the engine PlantUML uses for C4, so catalyst reproduces PlantUML's column / rank / ribbon / ranked-cycle **by construction** rather than by approximating it with a same-family engine:

- **`dot` is PlantUML's own C4 engine.** Topology matches the
  reference exactly: `make edgecross` = **0** non-incident crossings
  across the corpus (catalyst == PlantUML == 0), measured on the real
  drawio-export render-truth. Byte-deterministic (the WASM binary
  ships in the pinned npm tarball). `dot`'s spline routes are emitted
  VERBATIM as `curved=1` draw.io edges (ADR 0013) — no orthogonal
  re-route, no perpendicular lane shove (the ELK-era lane apparatus
  that was itself a crossing source was removed; `dot`'s own port
  ordering fans parallel / BiRel / antiparallel same-pair edges).

| Item | State |
|---|---|
| **L1 U/D** | ✓ — the ranking edge is fed reversed so the target ranks above/below (the visible connector is still drawn from `pumlRelations` with the authored direction) |
| **L1 L/R** | ✓ — same-pair pinned with `dot` `rank=same` + an invisible ordering edge; the visible connector is `constraint=false` so it does not perturb ranks |
| **L2 edge routing** | ✓ `dot` spline control points → draw.io `curved=1` waypoints, emitted verbatim (the authoritative-route branch); label slid along the route axis only to clear unrelated leaves |
| **L3 node sizing** | ✓ real font metrics — fontkit + bundled Liberation Sans — pinned into `dot` (`fixedsize=true`); `dot` lays out, it does not re-measure text |
| **L4 nesting** | ✓ `dot` `cluster_*` subgraphs for boundaries / Deployment_Node, any depth |
| **L5 aspect** | ✓ `dot` owns aspect — it IS PlantUML's engine, so the wide-rank ribbon etc. match by construction (ADR 0014, supersedes 0011) |

### Tier 2 — remaining visual fidelity

1. DB/Queue colour + `_Ext` shape — ✓ **FIXED 2026-05-16**.
   Fact-checked + render-verified against pinned C4-PlantUML v2.13.0
   (`C4_Container.puml`): `ContainerDb`/`ContainerQueue`/`Container`
   carry the **same** `$CONTAINER_BG_COLOR` — Db/Queue-ness is the
   SHAPE, not the colour; likewise per System/Component level. The
   earlier claim ("`SystemDb`/`ComponentDb` use ContainerDb-family
   colour; only per-type colour is shared") was **stale/false**:
   `SystemDb`→`SYSTEM_*`, `ContainerDb`→`CONTAINER_*`,
   `ComponentDb`→`COMPONENT_*` were already correct per-level (code-
   traced + render-verified). The genuine residual was the `_Ext`
   variants: `SystemDb_Ext`/`ContainerDb_Ext`/`ComponentDb_Ext` and
   the `*Queue_Ext` trio were flattened to the grey `*Ext` RECTANGLE,
   losing the cylinder/queue shape PlantUML keeps (grey-coloured).
   Fixed: 6 dedicated `*DbExt`/`*QueueExt` templates (cylinder3 /
   `mxgraph.c4.queue` + the matching `*_EXT` palette), routed in
   `Mx.mts`; `measureNode` `CYLINDER3_TYPES` extended to the 3
   `*Db_Ext` so the cap is reserved (no text clip). render-compare:
   `ContainerDb_Ext` is now a grey cylinder matching PlantUML. Zero
   corpus-fixture impact (none use these types); `c4Type` attribute
   unchanged so golden/parity untouched. (The `mxgraph.c4.queue`
   shape itself falls back to a rectangle in drawio-export for BOTH
   `_Ext` and non-`_Ext` queues — a pre-existing, consistent,
   separate export-library limitation, not part of this gap.)
2. Boundary type subtitle — ✓ **FIXED 2026-05-16**. Fact-checked
   against pinned C4-PlantUML v2.13.0 (`C4.puml`/`C4_Context.puml`/
   `C4_Container.puml`): `System_/Container_/Enterprise_Boundary` all
   delegate to `Boundary($a,$l,"",<tag>)` with **identical colour/
   border** — the only difference is the bracketed subtitle. The
   exact subtitle string was settled by **render-compare, not the
   doc**: PlantUML renders the **lowercase tag** verbatim
   (`[container]`, NOT the capitalised `UpdateBoundaryStyle` legend
   arg `[Container]` — that arg is the LEGEND-BOX text). `Mx.mts`
   now bakes the fact-checked subtitle via `boundaryLegend()`:
   `System_Boundary`→`[system]`, `Container_Boundary`→`[container]`,
   `Enterprise_Boundary`→`[enterprise]`; a generic
   `Boundary($a,$l,$type)` surfaces its explicit `$type` verbatim
   (bare `Boundary` keeps the neutral `[Boundary]` — unchanged, no
   corpus fixture exercises it). The structural `c4Type` attribute is
   **unchanged** (raw macro name) so golden/parity fingerprints are
   untouched; byte-scope = the 4 boundary fixtures, subtitle text
   only. render-compare confirmed all three match PlantUML exactly.
3. `$sprite` / `SHOW_PERSON_SPRITE` — **NOT IMPLEMENTABLE (closed,
   not deferred):** draw.io has no PlantUML sprite registry, so a
   sprite glyph cannot be faithfully rendered. Parsing never breaks;
   the attribute is captured and ignored. This is a fact, not a TODO.

### Tier 3 — ✅ DONE (2026-05-18)

1. ✅ `SHOW_LEGEND`/`_FLOATING`/`_DYNAMIC` → synthesized tag-entry
   legend box (PR #140). 2. ✅ `AddProperty`/`SetPropertyHeader`/
   `WithoutPropertyHeader` → POST-LAYOUT property-table grid (PR #140).
   3. ✅ `HIDE_STEREOTYPE`, `LAYOUT_AS_SKETCH`/`SET_SKETCH_STYLE`
   (PR #138). 4. ✅ static-C4 `note … of X` callouts (PR #139, note-
   text-render regression fixed in #140). All overlay/style-only ⇒
   static-C4 corpus byte-identical; each with a `c4-feat` fixture +
   committed SVG + `c4feat-gallery-verify`. **Only `$sprite`/
   `_SPRITE` remain — not implementable (above), not deferred.**
