/**
 * Deterministic linear sequence layout (ADR 0007, phase b).
 *
 * NOT a force/layered engine — a single monotone pass:
 *   - lifelines on X in DECLARATION order, evenly spaced by a MEASURED
 *     column pitch (widest header ∪ widest message label between them);
 *   - every event a row at strictly increasing Y in SOURCE order
 *     (the model's two ordering invariants → geometry, 1:1);
 *   - activate/deactivate paired LIFO into activation bars.
 *
 * Pure & side-effect free. Every spacing value is a real font metric
 * (`TextMetrics`) or a cited theme constant (`PUML_LEAF_BOX.INSET`,
 * `ELEMENT_TITLE_PX`, `ELEMENT_BODY_PX`, `SHAPE.REL_ARROW_SIZE`,
 * `renderedLineHeight` = mxGraph 1.2) — no magic constant, same bar as
 * the C4 path (`measureNode`).
 */
import type {
  SeqModel, SeqMessage, SeqFragmentStart, SeqFragmentElse,
} from './SeqModel.interface.mjs'
import { textWidth, renderedLineHeight, spaceAdvance } from '../text/TextMetrics.mjs'
import { splitLabelLines } from '../text/labelLines.mjs'
import { ELEMENT_TITLE_PX, ELEMENT_BODY_PX, PUML_LEAF_BOX, SHAPE } from '../mx/c4/theme.mjs'

const NAME_PX = ELEMENT_TITLE_PX            // lifeline header name (cited)
const BODY_PX = ELEMENT_BODY_PX             // message / note / techn (cited)
const INSET = PUML_LEAF_BOX.INSET           // measured PlantUML text inset
const ARROW = SHAPE.REL_ARROW_SIZE          // cited draw.io arrow size
// Fragment border must clear the message arrowheads on the outermost
// involved lifelines → 2·arrow each side (same cited-arrow basis as
// `colGap`). Nested frames step inward one arrow size per level so
// their borders stay visibly distinct from the enclosing frame.
const FRAG_PAD = 2 * ARROW
const FRAG_INSET = ARROW
// The keyword PlantUML literally renders in a `ref` frame's corner tab
// — the exact analogue of a fragment's `kind` string used as its tab
// label (a rendered construct keyword, not a tunable). Named so the
// literal is single-sourced between layout (tab metrics) and emit.
export const REF_KIND = 'ref'

export interface LaidLifeline {
  alias: string
  label: string
  kind: string
  /** centre X (the dashed line) */
  cx: number
  headX: number
  headY: number
  headW: number
  headH: number
  /** y of the lifeline foot (bottom of the dashed line) */
  bottomY: number
}

export interface LaidMessage {
  type: 'message'
  fromX: number
  toX: number
  y: number
  selfLoop: boolean
  loopW: number
  loopH: number
  arrow: SeqMessage['arrow']
  label: string
  order: number
}
export interface LaidNote {
  type: 'note'
  x: number
  y: number
  w: number
  h: number
  text: string
  order: number
}
export interface LaidActivation {
  type: 'activation'
  cx: number
  y1: number
  y2: number
}
/** Full-width `== label ==` band at source-order Y (phase d1). `x`/`w`
 *  are filled at emit time from the final canvas width (the band spans
 *  every lifeline); layout only fixes its Y and height. */
export interface LaidDivider {
  type: 'divider'
  y: number
  h: number
  label: string
  order: number
}
/** A `ref over A[,B…]` reference frame (phase d2b). A single
 *  self-contained box at its source-order Y spanning the named
 *  lifelines, with a top-left `ref` tab and centred body text — NOT a
 *  Y-range frame (so it carries its own w/h, like a wide note). */
export interface LaidRef {
  type: 'ref'
  x: number
  y: number
  w: number
  h: number
  /** measured top-left `ref` tab box (so emit needs no metrics). */
  tabW: number
  tabH: number
  text: string
  order: number
}
export type LaidEvent = LaidMessage | LaidNote | LaidDivider | LaidRef

/** A combined/grouped fragment box (phase d2). Spans the involved
 *  lifelines over its source-order Y-range; `headerH` is the reserved
 *  top band carrying the kind tab + guard; `elses` are the in-box
 *  compartment separators (each a Y + its `[guard]`). Emitted BEHIND
 *  the message edges (document order) so the border never occludes. */
export interface LaidFragment {
  type: 'fragment'
  kind: string
  label: string
  x: number
  y: number
  w: number
  h: number
  headerH: number
  /** Measured width of the top-left kind tab (so emit needs no metrics). */
  tabW: number
  elses: { y: number; label: string }[]
  /** start order — emit ascending so an enclosing frame is behind. */
  order: number
}

export interface SeqLayout {
  width: number
  height: number
  title?: string
  titleH: number
  lifelines: LaidLifeline[]
  events: LaidEvent[]
  activations: LaidActivation[]
  fragments: LaidFragment[]
  /** `destroy X` cross-glyph anchors (phase d2b): the lifeline foot is
   *  truncated at `y` and an `X` is drawn centred on `cx`. */
  destroyMarks: { cx: number; y: number }[]
  /** `box`/`Boundary` lifeline groupings (phase d2b): a full-height
   *  bordered rect over a contiguous lifeline range, with a top title
   *  band of `bandH`. Emitted BEHIND the lifelines. */
  boxes: { x: number; y: number; w: number; h: number; bandH: number; label: string }[]
}

const lines = (s: string): string[] => {
  const ls = splitLabelLines(s)
  return ls.length ? ls : ['']
}
const blockW = (s: string, px: number, bold: boolean): number =>
  lines(s).reduce((m, l) => Math.max(m, textWidth(l, px, bold)), 0)
const blockH = (s: string, px: number): number =>
  lines(s).length * renderedLineHeight(px)

export function layoutSeq(model: SeqModel): SeqLayout {
  const hasFrag = model.events.some((e) => e.type === 'fragment-start')
  // Reserve a left gutter when fragments exist so the outermost frame's
  // `FRAG_PAD` border never clips off-canvas (depth-0 frame uses the
  // full pad; deeper frames inset inward, so FRAG_PAD is sufficient).
  const marginX = 2 * INSET + (hasFrag ? FRAG_PAD : 0)
  const marginY = 2 * INSET
  const rowGap = renderedLineHeight(BODY_PX)            // inter-event breathing
  const messages = model.events.filter(
    (e): e is SeqMessage => e.type === 'message')

  // --- header sizes (per lifeline) -----------------------------------
  const heads = model.lifelines.map((ll) => {
    const nameW = blockW(ll.label, NAME_PX, true)
    const techW = ll.technology ? textWidth(`[${ll.technology}]`, BODY_PX, false) : 0
    const headW = Math.ceil(Math.max(nameW, techW) + 2 * INSET)
    const headH = Math.ceil(
      blockH(ll.label, NAME_PX)
      + (ll.technology ? renderedLineHeight(BODY_PX) : 0)
      + 2 * INSET)
    return { headW, headH }
  })
  const maxHeadH = heads.reduce((m, h) => Math.max(m, h.headH), 0)

  // --- X: declaration order, MEASURED column pitch -------------------
  // Gap between two adjacent lifelines must host the widest message
  // label that rides between them, plus arrowheads each side. Pure
  // geometry (widest measured label, cited arrow size) — no constant.
  const maxMsgW = messages.reduce(
    (m, msg) => Math.max(m, blockW(msg.label, BODY_PX, false)), 0)
  const colGap = Math.ceil(Math.max(maxMsgW, 2 * ARROW) + 2 * ARROW)

  const cxs: number[] = []
  let cursor = marginX
  model.lifelines.forEach((_, i) => {
    const hw = heads[i].headW / 2
    cursor += hw
    cxs.push(cursor)
    cursor += hw + colGap
  })

  // --- Y: source order, strictly monotone ----------------------------
  const headY = marginY
  let y = headY + maxHeadH + rowGap                     // first event row
  const laidEvents: LaidEvent[] = []
  const activations: LaidActivation[] = []
  const actStack = new Map<string, number[]>()          // alias → LIFO of startY
  // phase d2b lifespan: created lifelines start their head at first-use
  // Y (not the top); destroyed ones end the foot at the destroy Y.
  const createY = new Map<string, number>()
  const destroyY = new Map<string, number>()
  const idxOf = new Map(model.lifelines.map((l, i) => [l.alias, i]))

  // Open-fragment frames (LIFO). `min`/`max` accumulate the lifeline
  // span of EVERY event seen while the frame is open (including events
  // inside nested child frames) → an enclosing frame always spans ⊇ its
  // children, so depth-inset boxes strictly nest.
  const fragments: LaidFragment[] = []
  const fragStack: {
    fragId: number; kind: string; label: string
    y1: number; depth: number; headerH: number
    min: number; max: number
    /** rightmost edge of any already-closed child (so a parent's box
     *  always encloses its children's header-widened width). */
    minChildRight: number
    elses: { y: number; label: string }[]
    order: number
  }[] = []
  const touch = (i: number | undefined): void => {
    if (i === undefined) return
    for (const f of fragStack) { f.min = Math.min(f.min, i); f.max = Math.max(f.max, i) }
  }

  for (const ev of model.events) {
    if (ev.type === 'fragment-start') {
      const fs = ev as SeqFragmentStart
      const headerH = Math.ceil(blockH(fs.label || fs.kind, BODY_PX) + 2 * INSET)
      fragStack.push({
        fragId: fs.fragId, kind: fs.kind, label: fs.label,
        y1: y, depth: fragStack.length, headerH,
        min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY,
        minChildRight: Number.NEGATIVE_INFINITY,
        elses: [], order: fs.order,
      })
      y += headerH                                       // reserve the tab/guard band
      continue
    }
    if (ev.type === 'fragment-else') {
      const fe = ev as SeqFragmentElse
      const top = fragStack[fragStack.length - 1]
      if (top) {
        top.elses.push({ y, label: fe.label })
        y += Math.ceil(renderedLineHeight(BODY_PX) + 2 * INSET) // separator + guard row
      }
      continue
    }
    if (ev.type === 'fragment-end') {
      const f = fragStack.pop()
      if (f) {
        // No involved lifeline (degenerate empty fragment) → span all.
        const lo = f.min <= f.max ? f.min : 0
        const hi = f.min <= f.max ? f.max : model.lifelines.length - 1
        const x1 = Math.round(cxs[lo] - FRAG_PAD + f.depth * FRAG_INSET)
        const tabW = Math.ceil(blockW(f.kind, BODY_PX, true) + 2 * INSET)
        // Box must be wide enough to host (a) the lifeline span, (b) its
        // own one-line header `tab + [guard]` (so the guard never wraps —
        // PlantUML keeps it one line), and (c) every closed child's
        // header-widened right edge (so a parent always encloses its
        // children). All terms are measured metrics — no constant.
        const guardW = f.label
          ? Math.ceil(blockW(f.label, BODY_PX, false) + 2 * INSET) : 0
        const x2 = Math.round(Math.max(
          cxs[hi] + FRAG_PAD - f.depth * FRAG_INSET,
          x1 + tabW + guardW,
          f.minChildRight,
        ))
        y += INSET                                         // bottom in-box padding
        const right = Math.max(x2, x1 + 1)
        const parent = fragStack[fragStack.length - 1]
        if (parent) parent.minChildRight = Math.max(parent.minChildRight, right)
        fragments.push({
          type: 'fragment', kind: f.kind, label: f.label,
          x: x1, y: f.y1, w: Math.max(right - x1, 1), h: Math.max(y - f.y1, 1),
          headerH: f.headerH, tabW, elses: f.elses, order: f.order,
        })
        y += rowGap                                        // breathing after the box
      }
      continue
    }
    if (ev.type === 'divider') {
      // A labelled `== X ==` → full-width centred band sized to the
      // label (PlantUML's filled pill — phase d1). An EMPTY `====` is a
      // thin separator RULE in PlantUML, NOT a band (phase d1 v1.x): it
      // gets only the symmetric `2·INSET` footprint around a
      // zero-thickness line. INSET is the same measured PlantUML text
      // inset used for every other band's padding — reused, not a new
      // constant; for the label-less footprint (which neither PlantUML
      // nor draw.io defines canonically) it is a documented convention.
      // x/w are set at emit from the final canvas width.
      const labelled = ev.label.trim().length > 0
      const h = labelled
        ? Math.ceil(blockH(ev.label, BODY_PX) + 2 * INSET)
        : Math.ceil(2 * INSET)
      laidEvents.push({ type: 'divider', y, h, label: ev.label, order: ev.order })
      y += h + rowGap
      continue
    }
    if (ev.type === 'create' || ev.type === 'destroy') {
      // Lifespan markers — no own Y row (like activate/deactivate).
      // `create` head starts at the current cursor (the creating
      // message lands just below); `destroy` foot ends here + an X.
      touch(idxOf.get(ev.lifeline))
      ;(ev.type === 'create' ? createY : destroyY).set(ev.lifeline, y)
      continue
    }
    if (ev.type === 'activate') {
      touch(idxOf.get(ev.lifeline))
      const st = actStack.get(ev.lifeline) ?? []
      st.push(y)
      actStack.set(ev.lifeline, st)
      continue
    }
    if (ev.type === 'deactivate') {
      const st = actStack.get(ev.lifeline)
      const i = idxOf.get(ev.lifeline)
      touch(i)
      if (st && st.length && i !== undefined)
        activations.push({ type: 'activation', cx: cxs[i], y1: st.pop()!, y2: y })
      continue
    }
    if (ev.type === 'note') {
      const ls = idxOf.has(ev.lifelines[0] ?? '')
        ? ev.lifelines.map((a) => idxOf.get(a)!).filter((v) => v !== undefined)
        : []
      ls.forEach(touch)
      const w = Math.ceil(blockW(ev.text, BODY_PX, false) + 2 * INSET)
      const h = Math.ceil(blockH(ev.text, BODY_PX) + 2 * INSET)
      let x: number
      if (ev.position === 'over' && ls.length) {
        const c = ls.reduce((s, i) => s + cxs[i], 0) / ls.length
        x = Math.round(c - w / 2)
      } else if (ev.position === 'left' && ls.length) {
        x = Math.round(cxs[ls[0]] - w - 2 * INSET)
      } else if (ev.position === 'right' && ls.length) {
        x = Math.round(cxs[ls[0]] + 2 * INSET)
      } else {
        x = marginX
      }
      laidEvents.push({ type: 'note', x, y, w, h, text: ev.text, order: ev.order })
      y += h + rowGap
      continue
    }
    if (ev.type === 'ref') {
      // Self-contained box spanning the named lifelines at this Y, with
      // a top-left `ref` tab + centred body text. Every dimension a
      // measured metric or cited constant (FRAG_PAD/INSET/font) — no
      // magic. Degenerate (no resolvable lifeline) → span all.
      const ls = ev.lifelines.map((a) => idxOf.get(a)).filter(
        (v): v is number => v !== undefined)
      ls.forEach(touch)
      const lo = ls.length ? Math.min(...ls) : 0
      const hi = ls.length ? Math.max(...ls) : model.lifelines.length - 1
      const tabW = Math.ceil(blockW(REF_KIND, BODY_PX, true) + 2 * INSET)
      const tabH = Math.ceil(renderedLineHeight(BODY_PX) + 2 * INSET)
      const textW = blockW(ev.text, BODY_PX, false)
      const textH = blockH(ev.text, BODY_PX)
      const x1 = Math.round(cxs[lo] - FRAG_PAD)
      const span = Math.round(cxs[hi] + FRAG_PAD) - x1
      const w = Math.max(span, Math.ceil(tabW + textW + 2 * INSET))
      const h = Math.max(tabH, Math.ceil(textH + 2 * INSET))
      laidEvents.push({
        type: 'ref', x: x1, y, w, h, tabW, tabH,
        text: ev.text, order: ev.order,
      })
      y += h + rowGap
      continue
    }
    // message — explicit positive narrow (SeqActivation's discriminant
    // is the 2-value union 'activate'|'deactivate', which TS does not
    // fully eliminate via successive negative checks; assert it here).
    if (ev.type !== 'message') continue
    const fi = idxOf.get(ev.from)
    const ti = idxOf.get(ev.to)
    if (fi === undefined || ti === undefined) continue   // unreachable: parser ensure()
    touch(fi); touch(ti)
    const selfLoop = ev.from === ev.to
    const labelH = blockH(ev.label, BODY_PX)
    if (selfLoop) {
      // Self-loop width is driven by THIS message's own measured label
      // (compact for a short label — PlantUML's hook — wide enough for
      // a long one; the prior "no-op for long labels" finding holds:
      // a long label needs width anyway, now from ITS label not the
      // unrelated neighbour-column gap). Floor = 2·ARROW so the hook
      // always clears the arrowhead (cited-metric floor, no magic).
      const loopW = Math.ceil(Math.max(
        blockW(ev.label, BODY_PX, false) + 2 * INSET, 2 * ARROW))
      const loopH = Math.ceil(Math.max(labelH, renderedLineHeight(BODY_PX)) + 2 * INSET)
      laidEvents.push({
        type: 'message', fromX: cxs[fi], toX: cxs[ti], y,
        selfLoop: true, loopW, loopH, arrow: ev.arrow,
        label: ev.label, order: ev.order,
      })
      y += loopH + rowGap
    } else {
      // label sits above the arrow line; reserve it + arrow clearance
      y += Math.ceil(labelH + spaceAdvance(BODY_PX, false))
      laidEvents.push({
        type: 'message', fromX: cxs[fi], toX: cxs[ti], y,
        selfLoop: false, loopW: 0, loopH: 0, arrow: ev.arrow,
        label: ev.label, order: ev.order,
      })
      y += ARROW + rowGap
    }
  }

  // close any still-open activations at the foot (unbalanced source)
  for (const [alias, st] of actStack) {
    const i = idxOf.get(alias)
    if (i === undefined) continue
    for (const s of st) activations.push({ type: 'activation', cx: cxs[i], y1: s, y2: y })
  }

  const bottomY = y + 2 * INSET
  const lifelines: LaidLifeline[] = model.lifelines.map((ll, i) => {
    // phase d2b: a created lifeline's head drops to its first-use Y;
    // a destroyed one's foot truncates at the destroy Y (clamped so
    // the head box always fits even if destroy precedes any growth).
    const hY = createY.get(ll.alias) ?? headY
    const bY = destroyY.has(ll.alias)
      ? Math.max(destroyY.get(ll.alias)!, hY + heads[i].headH)
      : bottomY
    return {
      alias: ll.alias,
      label: ll.label,
      kind: ll.kind,
      cx: cxs[i],
      headX: Math.round(cxs[i] - heads[i].headW / 2),
      headY: hY,
      headW: heads[i].headW,
      headH: heads[i].headH,
      bottomY: bY,
    }
  })
  // `destroy X` cross-glyph anchors (foot of the truncated lifeline).
  const destroyMarks = [...destroyY].flatMap(([alias, dy]) => {
    const i = idxOf.get(alias)
    return i === undefined ? [] : [{ cx: cxs[i], y: dy }]
  })

  // canvas extent (include a note/ref OR a fragment box that overhangs
  // the last lifeline — FRAG_PAD pushes past the rightmost cx)
  const noteRight = laidEvents.reduce(
    (m, e) => (e.type === 'note' || e.type === 'ref') ? Math.max(m, e.x + e.w) : m, 0)
  const fragRight = fragments.reduce((m, f) => Math.max(m, f.x + f.w), 0)
  const llRight = lifelines.reduce((m, l) => Math.max(m, l.headX + l.headW), 0)
  const titleH = model.title
    ? Math.ceil(renderedLineHeight(NAME_PX) + 2 * INSET) : 0
  // phase d2b: a uniform box title band above the (aligned) heads when
  // any `box`/`Boundary` exists. One measured text line + insets — the
  // same metric basis as every other band; deterministic for labelled
  // AND unlabelled boxes (an unlabelled box just has an empty band).
  const boxBandH = model.boxes.length
    ? Math.ceil(renderedLineHeight(BODY_PX) + 2 * INSET) : 0
  // single top shift = title band + box band, so boxed and non-boxed
  // heads stay aligned (PlantUML draws the box title ABOVE a uniform
  // participant row). Generalises the former title-only shift.
  const topShift = titleH + boxBandH
  if (topShift) {
    for (const l of lifelines) { l.headY += topShift; l.bottomY += topShift }
    for (const e of laidEvents) e.y += topShift
    for (const a of activations) { a.y1 += topShift; a.y2 += topShift }
    for (const f of fragments) {
      f.y += topShift
      for (const el of f.elses) el.y += topShift
    }
    for (const d of destroyMarks) d.y += topShift
  }

  // Box rects, derived from FINAL lifeline positions (post-shift): a
  // full-height border over the contiguous declaration range, its
  // title band sitting in the `boxBandH` strip just above the heads.
  const diagramBottom = lifelines.reduce((m, l) => Math.max(m, l.bottomY), bottomY + topShift)
  const laidBoxes = model.boxes.map((b) => {
    const lo = lifelines[b.firstIdx]
    const hi = lifelines[b.lastIdx]
    const x = lo.headX - INSET
    const w = (hi.headX + hi.headW + INSET) - x
    const y = lo.headY - boxBandH
    return { x, y, w, h: diagramBottom - y, bandH: boxBandH, label: b.label }
  })

  const boxRight = laidBoxes.reduce((m, b) => Math.max(m, b.x + b.w), 0)
  return {
    width: Math.ceil(Math.max(noteRight, fragRight, llRight, boxRight) + marginX),
    height: Math.ceil(bottomY + topShift),
    ...(model.title ? { title: model.title } : {}),
    titleH,
    lifelines,
    events: laidEvents,
    activations,
    fragments,
    destroyMarks,
    boxes: laidBoxes,
  }
}
