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

### Sequence level

| Primitive | State |
|---|---|
| All Context/Container/Component types | ✓ (inherited) |
| `Boundary` (generic) | ✓ |
| `SHOW_ELEMENT_DESCRIPTIONS` | ✗ (skipped as comment) |
| `SHOW_FOOT_BOXES` / `SHOW_INDEX` | ✗ (skipped as comment) |

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
| `Lay_U/D/L/R`, `Lay_Up/Down/Left/Right` | ✓ parsed (`RelParser.getLayoutConstraints`) and fed to ELK as invisible, layout-only ranking edges (never drawn) |
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
| `SET_SKETCH_STYLE` / `LAYOUT_AS_SKETCH` | ✗ (sketch/handwritten mode — draw.io `sketch=1`; next Item-2 sub-task, fact-check pending) |

## Legend / display

| Primitive | State |
|---|---|
| `SHOW_LEGEND`, `SHOW_FLOATING_LEGEND`, `SHOW_DYNAMIC_LEGEND` | ✗ (skipped) |
| `HIDE_STEREOTYPE` | ✗ |
| `SHOW_PERSON_OUTLINE` / `_PORTRAIT` / `_SPRITE` | ✗ |

## Properties

| Primitive | State |
|---|---|
| `AddProperty` / `SetPropertyHeader` / `WithoutPropertyHeader` | ✗ |

## Priority backlog

Ordered by value × tractability.

### Done (structural correctness — parity-gated by `tests/parity.test.mts`)

1. ✅ **Deployment nodes** (`Deployment_Node`/`Node` + `_L`/`_R`), including deep nesting (ELK native hierarchical/compound layout).
2. ✅ **BiRel bidirectional** — `startArrow` emitted.
3. ✅ **Long-form Rel names** + `BiRel_*` + `Rel_Back_Neighbor`.
4. ✅ **Parallel relations + self-loops** — one drawio edge per parsed relation (multigraph; was collapsing 17→6).
5. ✅ **`$tags` / `$link` applied; `AddElementTag`/`AddRelTag`/`AddBoundaryTag`/`UpdateElementStyle`/`UpdateRelStyle`/`UpdateBoundaryStyle`** → colour/dashed overrides.

The parity test asserts: every entity → a shape with matching `c4Type`; every relation → an edge; every endpoint resolves; `<diagram id+name>` present. Run against `c4-exhaustive.puml` (the all-encompassing fixture) + 5 real fixtures. Parity + the `tests/golden.test.mjs` structural snapshot held unchanged through the dagre→elkjs engine swap.

### Layout fidelity (L1–L5) — engine: elkjs (Eclipse Layout Kernel)

dagre 3.0.0 was replaced by **elkjs**: its documented option surface (wiki + spike) has no aspect/wrapping/same-rank/in-layer-order control; elkjs does. **Every** C4 diagram type — Context included — uses one algorithm, matching PlantUML's own Graphviz `dot` (ADR 0008, supersedes 0005):

- **Always `org.eclipse.elk.layered`** (flow + orthogonal routing +
  compound nesting + `NETWORK_SIMPLEX` placement). PlantUML renders
  every C4 level with `dot` (hierarchical ranking); ELK `layered` is
  the same family, so catalyst reproduces PlantUML's column / rank /
  ribbon / ranked-cycle in every case. The old people/systems→`stress`
  +`sporeOverlap` Context branch was removed: it diverged from
  PlantUML in every Context shape (chain→staircase, hub→scatter,
  wide→radial). `layered` is overlap-free by construction, so no
  declump pass is needed. Edges (Context and hierarchical alike) carry
  ELK-computed ORTHOGONAL `sections`; laned/antiparallel edges use the
  lane waypoint+offset fan.

| Item | State |
|---|---|
| **L1 U/D** | ✓ (layered path) — engine-agnostic edge reversal ranks the target above/below |
| **L1 L/R** | ~ honored only when the two nodes already land on the same rank (safe post-pass; cross-rank L/R is impossible in any layered engine incl. PlantUML/dot). Parsed + fed as ELK model-order influence otherwise |
| **L2 edge routing** | ✓ ELK-computed `sections` → drawio waypoints (all diagram types, `layered`); laned/antiparallel edges use the lane waypoint+offset fan; multi-bend non-laned edges re-seat the label onto ELK's reserved rect (#56) |
| **L3 node sizing** | ✓ real font metrics — fontkit + bundled Liberation Sans (no estimated ratios) |
| **L4 nesting** | ✓ ELK native hierarchical/compound (boundaries, Deployment_Node), any depth |
| **L5 aspect** | ✓ always `layered` — matches PlantUML/`dot` exactly, including the wide-rank ribbon PlantUML itself embraces (ADR 0008) |

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
3. `$sprite` → drawio shape decorator (no drawio sprite registry; parsing never breaks).

### Tier 3 — nice-to-have

1. `SHOW_LEGEND` → drawio legend box (currently skipped; structural parity unaffected).
2. `AddProperty` / property tables rendered below element.
