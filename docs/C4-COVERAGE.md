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
| `AddElementTag($tagStereo, $bgColor, $fontColor, $borderColor)` | ✓ (applied to elements whose `$tags` matches) |
| `AddRelTag($tag, $textColor, $lineColor, $lineStyle)` | ✓ (applied to rels whose `$tags` matches; `DashedLine()` → `dashed=1`) |
| `AddBoundaryTag($tag, $bgColor, $borderColor, $fontColor)` | ✓ (applied to boundaries whose `$tags` matches) |
| `UpdateElementStyle($elementName, ...)` | ✓ for mapped kinds (person/system/container/component + `_ext`/`_db`/`_queue`); unmapped kinds ignored |
| `UpdateRelStyle` / `UpdateBoundaryStyle` | ✓ (global default override) |
| `$tags="critical"` inline on shape / rel / boundary | ✓ (`+`-separated multi-tag supported; last tag wins on conflict) |
| `$link=https://...` | ✓ (emitted as clickable `link=` attribute on the drawio object) |
| `$sprite=img:foo` / `$sprite=&icon` | ✗ (parsed as `sprite`; not rendered — drawio has no PlantUML sprite registry. Parsing never breaks) |
| `$shadowing`, custom `$lineStyle` (Bold/Dotted), `SET_SKETCH_STYLE` | ✗ (parsed/skipped; not mapped to drawio equivalents) |

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

dagre 3.0.0 was replaced by **elkjs**: its documented option surface (wiki + spike) has no aspect/wrapping/same-rank/in-layer-order control; elkjs does. Algorithm is chosen per the **C4 spec level** of the source (a semantic fact, not a heuristic):

- **Hierarchical** → `org.eclipse.elk.layered` (flow + orthogonal
  routing + compound nesting). Triggered by EITHER (a) a
  Container/Component/Node/Deployment_Node entity, OR (b) a **nested
  compound** — a boundary inside a boundary (#25: only `layered`
  honors `elk.padding` for nested-compound title bands; `stress`
  ignores it).
- **Context** (people/systems only, ≤1-level boundaries — hub-and-
  spoke) → `org.eclipse.elk.stress` + an `org.eclipse.elk.sporeOverlap`
  declump post-pass (deterministic, crossing-minimal, zero node
  overlap — replaced the old seed-based `force`). Non-laned solo
  Context edges get a catalyst-emitted centre-midpoint waypoint so
  drawio routes deterministically and labels anchor predictably
  (#24); laned/antiparallel edges use the lane waypoint+offset fan.

| Item | State |
|---|---|
| **L1 U/D** | ✓ (layered path) — engine-agnostic edge reversal ranks the target above/below |
| **L1 L/R** | ~ honored only when the two nodes already land on the same rank (safe post-pass; cross-rank L/R is impossible in any layered engine incl. PlantUML/dot). Parsed + fed as ELK model-order influence otherwise |
| **L2 edge routing** | ✓ layered: ELK-computed `sections` → drawio waypoints; Context (`stress`): catalyst-emitted centre-midpoint waypoint for non-laned solo edges (#24) + lane fan for laned/antiparallel |
| **L3 node sizing** | ✓ real font metrics — fontkit + bundled Liberation Sans (no estimated ratios) |
| **L4 nesting** | ✓ ELK native hierarchical/compound (boundaries, Deployment_Node), any depth |
| **L5 aspect** | ✓ spec-driven `stress`/`layered` selection (the wide-star ribbon is fixed) |

### Tier 2 — remaining visual fidelity

1. Per-type **colour** distinction for the `~` rows: `SystemDb`/
   `ComponentDb` (own `cylinder3` templates, ContainerDb-family
   colour), `*Queue` (own `mxgraph.c4.queue` shape, shared colour),
   and the `_Ext` variants (`SystemDb_Ext`/`ContainerDb_Ext` lose the
   cylinder → grey `SystemExt`). The shapes are dedicated now; only
   the per-type fill/stroke colour is shared — that is the residual
   `~`.
2. Boundary type distinction: `Container_Boundary` rendered as
   generic `Boundary` (`~`); `Enterprise_Boundary` now distinct (✓).
3. `$sprite` → drawio shape decorator (no drawio sprite registry; parsing never breaks).

### Tier 3 — nice-to-have

1. `SHOW_LEGEND` → drawio legend box (currently skipped; structural parity unaffected).
2. `AddProperty` / property tables rendered below element.
