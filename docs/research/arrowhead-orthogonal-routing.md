# Research / decision base — orthogonal-edge arrowhead skew (redo of reverted #107)

- Status: **decision base** — diagnosis proven against the real
  `drawio-export` render; implementation NOT started (no fake-green;
  the prior attempt #107 was reverted #109 for exactly this reason).
- Date: 2026-05-18
- Supersedes: the reverted #107 perpendicular-port-stub approach
  (proven a render no-op — see memory `factcheck-harness-gate`
  post-mortem).

## The defect (real, still open)

The `requeues` edge into `Scheduler` in `topology-cyclic` (and the
class generally) renders with the shaft entering the arrowhead
triangle's **side**, not its base — "skewed arrowhead".

## Root cause — proven from draw.io's ACTUAL rendered SVG

Method: render `topology-cyclic.drawio` via `rlespinasse/drawio-export`
to **SVG** (draw.io's real routed path — the independent signal that
`arrowSkew` must use, NOT a reconstruction of emitted points).

Rendered tail of the requeues edge + arrowhead (V0, current `main`):

```text
edge: … L 194 100 L 77 100 L 77 106.12
head: apex (77,91.12)  base (72,106.12)–(82,106.12)   [base horizontal]
```

- The arrowhead itself is geometrically perpendicular (vertical, apex
  up). The defect is **occlusion**: draw.io's orthogonal router runs
  the horizontal feeder at **y=100**, which lies *inside* the
  arrowhead's y-span (91.12 → 106.12). The final perpendicular stub is
  only ~6px; the arrowhead is ~15px (`endSize=14`, a cited renderer
  constant). The long horizontal shaft therefore visually crosses the
  triangle.
- Geometric origin in the EMITTED model: catalyst's last pre-target
  `<Array as="points">` waypoint is `(101,81)`; `Scheduler` (`a`)
  bottom border is `y=71` (box `y=12,h=59`). Only **10px** of
  perpendicular clearance — less than the arrowhead length → overlap.

## Spike results (variants, each measured against the rendered SVG)

| Variant | Outcome | Conclusion |
|---|---|---|
| V0 current | feeder y=100 inside arrowhead span | baseline defect |
| V1 `jettySize=24` (> `endSize`) | **byte-identical to V0** | draw.io ignores `jettySize` when Array points are present |
| V2 `exitX/entryX` on a different side + jetty | route unchanged (still bottom feeder) | **`exitX/entryX` are IGNORED** (confirms why #107 was a no-op) |
| V3 remove `edgeStyle=orthogonalEdgeStyle` | arrowhead becomes diagonal (base neither H nor V) | worse — polyline follows raw Array segments |

**Definitive:** with `orthogonalEdgeStyle`, draw.io's router is
dominated by the emitted `<Array as="points">`. Style knobs
(`jettySize`, `exitX/exitY/entryX/entryY`) do **not** move the route.
The ONLY lever is the **emitted waypoint geometry itself**.

## Fix direction (to be spiked next — NOT yet implemented)

The last pre-target waypoint must give a **perpendicular final
approach ≥ `endSize` (+ small margin)** AND the router must not run a
feeder segment at the border's level. Concretely, to spike:

1. Emit the final pre-target waypoint on the entry border's normal,
   at distance ≥ `endSize` from the border (and the symmetric case at
   the source for the tail), and drop/relocate the intermediate
   waypoint that currently creates the at-border-level feeder.
2. Re-render via `drawio-export`; parse the SVG; assert the last
   rendered segment is (a) perpendicular to the entry border AND
   (b) longer than `endSize` so the arrowhead does not overlap the
   feeder. This SVG-measured predicate is the **rebuilt `arrowSkew`**
   (it parses draw.io's real path, exactly as `factcheck` parses
   PlantUML `-tsvg`). It must stay RED until the *render* is clean.
3. Gate: a **PNG/SVG-freshness check** — re-render each committed
   `.drawio`, fail if the committed render differs (so a no-op or a
   stale artifact can never again be claimed as a visual fix).

`endSize` is a cited renderer constant (theme); the clearance is
`endSize` + a quantisation margin — category-1 measured metric, not a
tuned pad. No magic constant.

## Hard constraints carried from the #107 post-mortem

- `arrowSkew` is rebuilt to parse the `drawio-export` SVG, never a
  reconstruction of emitted points (every catalyst edge is
  `orthogonalEdgeStyle`; the emitted polyline ≠ the drawn polyline).
- Check the independent signal (the real render) BEFORE any "done"
  claim; not-done = not-merged; no advisory downgrade of the contract.
- See memory `factcheck-harness-gate`, CLAUDE.md handoff ▶▶ item 0.
