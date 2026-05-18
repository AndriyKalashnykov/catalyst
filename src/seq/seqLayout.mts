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
import type { SeqModel, SeqMessage } from './SeqModel.interface.mjs'
import { textWidth, renderedLineHeight, spaceAdvance } from '../text/TextMetrics.mjs'
import { splitLabelLines } from '../text/labelLines.mjs'
import { ELEMENT_TITLE_PX, ELEMENT_BODY_PX, PUML_LEAF_BOX, SHAPE } from '../mx/c4/theme.mjs'

const NAME_PX = ELEMENT_TITLE_PX            // lifeline header name (cited)
const BODY_PX = ELEMENT_BODY_PX             // message / note / techn (cited)
const INSET = PUML_LEAF_BOX.INSET           // measured PlantUML text inset
const ARROW = SHAPE.REL_ARROW_SIZE          // cited draw.io arrow size

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
export type LaidEvent = LaidMessage | LaidNote | LaidDivider

export interface SeqLayout {
  width: number
  height: number
  title?: string
  titleH: number
  lifelines: LaidLifeline[]
  events: LaidEvent[]
  activations: LaidActivation[]
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
  const marginX = 2 * INSET
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
  const idxOf = new Map(model.lifelines.map((l, i) => [l.alias, i]))
  const loopW = Math.ceil(colGap / 2 + ARROW)           // self-message loop

  for (const ev of model.events) {
    if (ev.type === 'divider') {
      // Full-width band at this source-order Y (phase d1). Height = a
      // measured label line + insets (same metric basis as a note row);
      // x/w are set at emit from the final canvas width.
      const h = Math.ceil(blockH(ev.label, BODY_PX) + 2 * INSET)
      laidEvents.push({ type: 'divider', y, h, label: ev.label, order: ev.order })
      y += h + rowGap
      continue
    }
    if (ev.type === 'activate') {
      const st = actStack.get(ev.lifeline) ?? []
      st.push(y)
      actStack.set(ev.lifeline, st)
      continue
    }
    if (ev.type === 'deactivate') {
      const st = actStack.get(ev.lifeline)
      const i = idxOf.get(ev.lifeline)
      if (st && st.length && i !== undefined)
        activations.push({ type: 'activation', cx: cxs[i], y1: st.pop()!, y2: y })
      continue
    }
    if (ev.type === 'note') {
      const ls = idxOf.has(ev.lifelines[0] ?? '')
        ? ev.lifelines.map((a) => idxOf.get(a)!).filter((v) => v !== undefined)
        : []
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
    // message — explicit positive narrow (SeqActivation's discriminant
    // is the 2-value union 'activate'|'deactivate', which TS does not
    // fully eliminate via successive negative checks; assert it here).
    if (ev.type !== 'message') continue
    const fi = idxOf.get(ev.from)
    const ti = idxOf.get(ev.to)
    if (fi === undefined || ti === undefined) continue   // unreachable: parser ensure()
    const selfLoop = ev.from === ev.to
    const labelH = blockH(ev.label, BODY_PX)
    if (selfLoop) {
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
  const lifelines: LaidLifeline[] = model.lifelines.map((ll, i) => ({
    alias: ll.alias,
    label: ll.label,
    kind: ll.kind,
    cx: cxs[i],
    headX: Math.round(cxs[i] - heads[i].headW / 2),
    headY,
    headW: heads[i].headW,
    headH: heads[i].headH,
    bottomY,
  }))

  // canvas extent (include any note that overhangs the last lifeline)
  const noteRight = laidEvents.reduce(
    (m, e) => e.type === 'note' ? Math.max(m, e.x + e.w) : m, 0)
  const llRight = lifelines.reduce((m, l) => Math.max(m, l.headX + l.headW), 0)
  const titleH = model.title
    ? Math.ceil(renderedLineHeight(NAME_PX) + 2 * INSET) : 0
  // shift everything down by the title band
  if (titleH) {
    for (const l of lifelines) { l.headY += titleH; l.bottomY += titleH }
    for (const e of laidEvents) e.y += titleH
    for (const a of activations) { a.y1 += titleH; a.y2 += titleH }
  }

  return {
    width: Math.ceil(Math.max(noteRight, llRight) + marginX),
    height: Math.ceil(bottomY + titleH),
    ...(model.title ? { title: model.title } : {}),
    titleH,
    lifelines,
    events: laidEvents,
    activations,
  }
}
