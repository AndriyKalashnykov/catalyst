# ADR 0014 — Graphviz `dot` layout engine (supersedes ELK for layout+routing)

- Status: **ACCEPTED & LIVE — P6 DONE then ELK REMOVED 2026-05-19
  (explicit user sign-off, FU1): `dot` is the SOLE engine.** The
  `elkjs` dep, `LayoutEngine.mts`, the `layoutEngine`/`LAYOUT_ENGINE`
  selector, the ELK-impl tests, and the now-vestigial ELK-compensation
  emit machinery (`assignEdgeLanes` lane branch + the dead multi-bend
  branch in `layoutData2mx`) are deleted. Lane/multibend removal
  proven BYTE-IDENTICAL (gallery-verify) — they were dead under dot.
  edgecross **30→0** on the committed real drawio-export render-truth;
  factcheck **CLEAN 28/28** under dot (best ever; ELK was 26/28);
  arrowskew 22/22; coverage 86.09%.
- Date: 2026-05-19
- **Supersedes ADR 0008** (Context→`layered`) and **ADR 0011**
  (layout-aspect fidelity ratchet): under `dot` the layout engine IS
  PlantUML's own engine, so Context ranking and aspect ratio are
  correct by construction, not by an ELK-tuned heuristic + ratchet.
- Decision record for **CLAUDE.md backlog item 1a**. The "why a swap
  is required, not an in-place tweak" evidence is
  `docs/research/edge-crossing-minimization.md` (three in-place
  lane-tweaks measured WORSE: 30→40 / 30→49 / 30→38) and ADR 0013
  (catalyst owns only edge *style*; draw.io re-routes — the routing
  must be owned end-to-end). Full phased plan + per-phase evidence:
  `docs/research/dot-engine-swap-plan.md`.

## Context — the measured problem

Edge crossings are THE primary graph-drawing readability aesthetic
(Purchase 1997). catalyst-under-ELK shipped **30 non-incident
crossings across 5 multi-edge corpus fixtures** vs PlantUML's **0**
(`tests/edgecross-baseline.json`). Root cause (proven, not theorised):
ELK's layered router + catalyst's ELK-era `assignEdgeLanes`
perpendicular-shove is a *local per-pair* translation ignorant of
other edges; on dense/boundary graphs it shoves laned routes across
non-group neighbours. Three independent in-place fixes each measured
WORSE. PlantUML renders C4 with Graphviz `dot`, which orders ports
around each node so incident edges fan monotonically and parallels
separate — 0 crossings by construction.

## Decision

Replace the elkjs `layered` layout+routing with Graphviz `dot`
(`@hpcc-js/wasm-graphviz`, pinned `--save-exact` at 1.21.6, bundles
graphviz 14.1.5 — the wasm binary ships in the pinned npm tarball, so
it is byte-identical across CI/host by construction). `DotLayout.mts`
mirrors `LayoutEngine`'s static signature and produces the existing
`LayoutResult` contract; `layoutData2mx` emits dot's globally
crossing-free spline VERBATIM (`curved=1`, ADR 0013) via
`routesAuthoritative`, bypassing the ELK-era lane machinery. The C4
parse, the emit (Mx/templates), and every gate are UNTOUCHED — the
swap is one binding behind `LAYOUT_ENGINE`.

## The evidence — MEASURED, not eyeballed (P0–P5)

| Property | ELK (default) | `dot` | How measured |
|---|---|---|---|
| **edgecross** (rendered drawio-export render-truth, #107 rule) | 30 / 5 fixtures | **0 / 0 fixtures** | `make edgecross` on the dot-rendered gallery; all 22 corpus catalyst==PlantUML==0, 0 regressions |
| **edgecross in-pipeline (CI, no docker)** | n/a | **0** | `tests/dot-layout.test.mts` C6 asserts `==0` via the project's own `countCrossings` |
| **determinism** (byte-exact) | — | **byte-stable** | `scripts/p0-dot-spike.mjs`: 6 in-process + fresh-OS-process renders, all 8 fixtures identical |
| completeness (`entityMiss/relMiss/labelDrop/arrowBad/nodeOverlap/titleMiss`) | 0 / 28 | **0 / 28** | `make factcheck` (host-manual) under both |
| corpus-sanity + output-correctness + spec-coverage | green | **65/65** | vitest under `LAYOUT_ENGINE=dot` |
| full vitest suite | 628/628 | **633/633** | golden/parity/etc. are coordinate-FREE ⇒ engine-INVARIANT (see below) |

### golden/parity need NO re-baseline (a finding, not a skip)

`golden.test.mjs` and `parity.test.mts` fingerprint the SET of
nodes (id+c4Type) and edges (source→target) and **explicitly exclude
coordinates** ("layout noise, not contract"). They are therefore
engine-INVARIANT and pass byte-unchanged under `dot`. The plan's
conservative "re-capture golden/parity" is unnecessary — verified by
the full suite passing 633/633 under `LAYOUT_ENGINE=dot` with zero
baseline edits. This avoids a large, risky regenerated-baseline diff.

### Honest residual — `attachMerge`/`labelHit` on 2 SYNTHETIC fixtures

`c4-all-rel-variants` (`attachMerge=15`) and `c4-exhaustive`
(`labelHit=3`) are deliberately-pathological exhaustiveness fixtures
(5×`a→b`, 4×`a→c`, 4×`a→d`… every C4 relationship macro between the
same 2–3 nodes). `dot` packs many parallel same-pair edges tightly —
exactly as PlantUML's own `dot` does; under ELK these read 0 ONLY
because `assignEdgeLanes` artificially spread them (the precise
machinery that caused the 30 real-corpus crossings). On these
synthetic fixtures non-zero `attachMerge` under `dot` is the FAITHFUL
consequence of matching PlantUML, not a regression. The **real corpus
is fully clean** (corpus `attachMerge=0`, `edgecross=0`, all
completeness contracts `0`/28).

Per the no-fake-green discipline this is **NOT** advisory-downgraded
and **NOT** fixture-excluded. It is handled by the project's OWN
established pattern (identical to `edgecross-baseline.json` /
`factcheck-ratio-baseline.json`): a committed per-fixture **dot
ratchet** (`tests/factcheck-dot-baseline.json`) — the contract stays
honestly RED & documented (faithful-to-PlantUML, deferred), the
ratchet fails any REGRESSION beyond the captured dot baseline.
`make factcheck` is the host-MANUAL gate (PlantUML text geometry is
host-font-dependent — see ADR 0010); the CI render-truth contracts
are `edgecross` (=0, via `dot-layout` C6, CI-portable) + `arrowskew`.
The "most-correct" fix (a PlantUML-edge-spline independent-signal
guard generalising the `edgecross` PlantUML-floor) is a named
follow-up, deliberately not built under autonomous time pressure (a
freshly-built guard is the least-trusted thing — every-gate-proven-red).

## Blast radius & gates

| Artifact | Effect | Action |
|---|---|---|
| ELK default path | NONE — `routesAuthoritative` absent ⇒ legacy branch | byte-identical; full suite 628/628 unchanged (the rollback guarantee) |
| `golden` / `parity` | coordinate-free ⇒ engine-invariant | NO change (verified 633/633 under dot) |
| committed gallery / `edgecross-baseline`(=30) / `factcheck-ratio-baseline` | ELK-default artifacts; ELK IS still default until P6 | UNCHANGED until P6 (re-baselined WITH the default flip, not before — else `gallery-verify` regen(ELK)≠committed) |
| dot crossing contract | new | `dot-layout.test.mts` C6 (`==0`, CI, committed) |
| dot fidelity ratchet | new | `tests/factcheck-dot-baseline.json` + dot-ratchet + RED test |
| dual-engine CI | new | CI runs the suite under `LAYOUT_ENGINE=dot` (633/633) |

## Consequences

The 30-crossing readability defect — RED for the project's entire
life, the reason item 1/1a exist — is closed at the engine level
under `dot`. ELK remains the default + the only fallback until P6
(explicit sign-off; outward-facing — `puml2drawio` consumes catalyst
downstream). The `assignPortOrder` work banked from the disproved
in-place attempt remains unwired (no longer needed — dot owns port
order). ADR 0008/0011's ELK-specific Context/aspect tuning is
superseded: `dot` is PlantUML's engine, so its layout IS the fidelity
target rather than an approximation of it.

## P6 — DONE 2026-05-19 (explicit user sign-off)

- Default flipped `elk`→`dot` in `catalyst.mts`; engine detection
  synced everywhere (`factcheck-geometry` `DOT = env!=='elk'`,
  dual-engine CI step now gates the `elk` opt-out).
- Now-default committed artifacts re-baselined UNDER `dot`, in this
  same change (derived-artifact discipline): `docs/gallery/*`
  (.drawio + SVG + PNG), `docs/gallery-c4feat/*`,
  `tests/edgecross-baseline.json` → **all 0** (re-derived from the
  committed dot render, not hand-typed), `tests/factcheck-ratio-
  baseline.json` (28, dot-calibrated). `arrowskew` **CLEAN 22/22**
  under dot (a clean/dirty contract — no baseline). `golden`/`parity`
  unchanged (engine-invariant). `seq-gallery` byte-identical (seq
  pipeline is engine-independent — verified).
- **ELK-fallback caveat (documented, not a defect):** `make
  factcheck` is the host-MANUAL fidelity gate, now calibrated to the
  DEFAULT engine (`dot`); under `LAYOUT_ENGINE=elk` its dot-calibrated
  `factcheck-ratio` baseline legitimately mismatches (CLEAN 14/28).
  The ELK fallback is gated by the **vitest suite** (639/639 under
  `LAYOUT_ENGINE=elk`, CI dual-engine step) + its structural
  contracts, NOT the dot-host-manual ratio gate. ELK is legacy and
  scheduled for removal (≥1 green dot release).
- Eyeball evidence committed: `docs/gallery-compare/` (PlantUML | ELK
  | dot side-by-side SVGs, per-fixture crossing counts —
  `scripts/engine-compare-gallery.mjs`). Corpus: ELK 30 → dot 0,
  PlantUML 0.

### Follow-up status

- **ELK path + `elkjs` dep — REMOVED 2026-05-19 (FU1).** The user
  directed removal now rather than waiting ≥1 release; justified —
  dot shipped green (PR #150: CI green, 661/661, edgecross 0,
  factcheck 28/28). No rollback escape hatch remains by design; the
  proven byte-identical lane/multibend removal + the full
  render-truth suite are the safety net.
- `puml2drawio` consumes catalyst at a pinned `CATALYST_REF`; the
  2.0.0 bump picks up `dot`. **BREAKING**: the `layoutEngine` option
  is removed (was additive, now gone) and rendered output changes
  substantially (0 crossings) → catalyst **2.0.0** (major). Flag both
  in the puml2drawio bump PR; ibm-wm then regenerates `_drawio`.
