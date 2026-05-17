# P13 — gallery column-width uniformity (research + decision)

**Status:** decided + implemented 2026-05-17. Presentation-only
(scope: `scripts/gallery.mjs` markdown emission + regenerated
`docs/gallery/README.md`). MUST NOT perturb the emit path /
factcheck — verified (diff touches no `src/`, no `docs/gallery/img/`).

## Problem

`docs/gallery/README.md` shows, per fixture, a 2-cell table: source
PlantUML render next to the catalyst→draw.io render. The corpus spans
a **~26× aspect-ratio range** (`edge-large-graph` w/h ≈ 0.15 →
`topology-wide-rank` w/h ≈ 4). The generator embedded each image with
`<img height="360">`, so every image is 360 px tall and its **width =
360 × aspect** — wildly different column to column (a wide fan is ~4×
the width of a tall chain). The page "reads ragged" (user, 2026-05-17).

## The dominant constraint (fact-checked, version-exact)

GitHub's markdown HTML sanitizer "aggressively removes … inline-styles,
and `class` or `id` attributes" (github/markup README, confirmed
2026-05-17). So **every CSS-based field solution is unavailable on
GitHub**: `object-fit`, `max-height`, `aspect-ratio` boxes, a
`max-width` container, fixed-size thumbnail `<div>`s — all need
`style=`/`class`, which is stripped. The only image-sizing levers that
survive are the `<img width>` / `<img height>` **attributes**, and
setting BOTH distorts aspect (GitHub honours both literally). So a
pure-markdown embed can bound exactly **one** axis per image.

Corollary: uniform *width* AND bounded *height* (true uniform tiles)
is impossible in pure GitHub markdown — it requires resizing/
letterboxing the image **files** at generation time.

## Approaches compared

| # | Approach | Uniform width? | Pair widths match? | Tall-image behaviour | New dep | Image churn | Emit-path risk |
|---|----------|----------------|--------------------|----------------------|---------|-------------|----------------|
| A | `<img height="360">` (status quo) | ❌ (width = 360·aspect, 26× spread) | ❌ | bounded 360 | none | none | none |
| B | **`<img width="W">` uniform** | ✅ exact (= W) | ✅ exact (= W) | tall (h = W/aspect; the explicit trade) | none | none | none |
| C | Pre-letterbox every PNG into a fixed W×H canvas, embed bare | ✅ | ✅ (also heights) | bounded (padded) | image lib (`sharp`/ImageMagick) | re-encodes 40 committed PNGs | none, but heavy |
| D | HTML `<table>` width hints | ❌ (no CSS ⇒ cells size to content) | ❌ | unbounded | none | none | none |

Weights (this project's context): **satisfies the stated goal 0.45**
(uniform *width* column-to-column + pair match — the literal request),
**minimal blast radius / reversibility 0.25**, **no new dependency /
no committed-binary churn 0.2**, **crispness 0.1**.

- A: goal 0/… → it *is* the defect. Score ≈ low.
- **B: goal 1.0, blast 1.0 (one template line + regenerated md, fully
  reversible), no-dep 1.0, crisp 0.8 (W chosen ≤ native/2 ⇒ zero
  upscale for the common case). Weighted ≈ 0.96 — winner.**
- C: goal 1.0 (also equalises height) but blast 0.3 (40 binary
  re-encodes, padding whitespace, a new image dependency in
  `make gallery`) and the extra height-uniformity was **not asked
  for** (user said *width*). Weighted ≈ 0.66. Over-engineered for the
  stated goal; rejected on scope discipline.
- D: doesn't actually work without CSS. Rejected on fact.

## Decision

**Approach B — uniform `<img width="420">`.** Every image is exactly
420 px wide, so every column is uniform down the page and the two
images in a pair match each other in width (P13's explicit primary +
"ideally" sub-goal, both met). 420 px ≈ half the scale-2 median native
width ⇒ the common-case diagram is shown at zero upscale (retina
crisp); only the extreme-aspect outliers up/down-scale. A tall diagram
now renders tall — this is **inherent to "uniform width"** and is the
trade the request explicitly accepts; the gallery is a scroll-down
review page where a tall diagram being tall is acceptable, whereas the
ragged-width page was the actual reported defect.

This deliberately **overrides**, *for the gallery only*, the
bounded-height rationale in agent memory `md-image-embedding` (which
optimised the opposite axis for a different goal). The memory is
updated to record the P13 override and its rationale so the two do
not silently contradict.

## Gate

- Diff confined to `scripts/gallery.mjs` (one embed-template line +
  a `GALLERY_MD_ONLY` fast-path so the markdown can be regenerated
  deterministically without the heavy java/docker re-render, avoiding
  40-PNG churn) and the regenerated `docs/gallery/README.md`. **No
  `src/` change, no `docs/gallery/img/` change** ⇒ emit path and every
  rendered PNG byte-identical.
- `make factcheck` CLEAN 26/26 unchanged (regression gate; factcheck
  does not read the gallery, so this only re-confirms the emit path
  was untouched).
- Visual: regenerated README columns are uniform 420 px width.

## REVERTED 2026-05-17 (same day) — width=420 → height=360

P13 shipped (#90), the post-P4b gallery was regenerated (#92) so the
images became visible, and the user rejected the result: "humongous
fonts … proportion is humongous … lots of ugly garbage".

**Measured root cause (overturns this doc's premise):** the defect is
NOT the embed and NOT box sizing. Per-leaf, catalyst boxes are
PlantUML-correct (`scripts/p4b-box-metrics.mjs`: e.g.
`rel-parallel-duplicate` cat box 93×59 vs PlantUML 92.4×58.1; the
143-leaf table tracks PlantUML closely). The problem is **diagram
aspect**: catalyst's ELK `layered` lays whole diagrams out far
narrower than PlantUML's Graphviz `dot` — `wRatio` (catalyst ÷
PlantUML diagram width) is 0.19–0.67 on **14 of 20** gallery
fixtures. Uniform `width=420` then scales those intrinsically-narrow
(aspect ~0.1–0.3) diagrams up 3–5× to fill the column, blowing the
fonts up side-by-side against PlantUML (which scales up far less).

This is precisely the trade this doc's Decision section called an
"accepted downside" — that judgement was wrong; an embed-width policy
cannot paper over a layout-aspect divergence. `width=420` reverted to
`height=360` (the two-sided bound from memory `md-image-embedding`),
which caps the magnification. The **real fix is the ELK↔dot
layout-aspect mismatch** (catalyst diagrams should spread to roughly
PlantUML's aspect) — tracked as the next backlog item; this doc's
"uniform width" approach is abandoned, not deferred.

Process note: `wRatio`/`hRatio` are *advisory* in the factcheck gate,
so 14 fixtures at 0.19–0.67 still reported "CLEAN 26/26". A measured
fidelity axis guarded only by an advisory metric rots silently — the
layout-aspect fix must also promote a width/height-ratio bound from
advisory to a contract gate (see memory
`derived-artifact-enforcement-gate`).
