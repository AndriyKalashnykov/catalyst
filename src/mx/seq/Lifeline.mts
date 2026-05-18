/**
 * draw.io sequence emit family (ADR 0007, phase b).
 *
 * A SIBLING of the C4 `Mx.addMxC4*` family — deliberately NOT an
 * overload of it. To keep the static C4 path byte-identical *by
 * construction* this module touches NOTHING in `Mx.mts`: it builds the
 * same xml2js document shape and serialises it with the SAME pipeline
 * `Mx.generate()` uses (pre-encode `>`/`<`/`\n`, xml2js, then the
 * un-double pass + the MxKey→mxkey rename), so label escaping is the
 * exact proven behaviour the C4 corpus + factcheck already validate.
 *
 * Pure builders: layout geometry comes from `seqLayout` (every number
 * a measured/cited metric there); this module only maps that geometry
 * to cells + the cited mxGraph style strings. No magic constants.
 */
import xml2js from 'xml2js'
import { htmlBreaks } from '../../text/labelLines.mjs'
import { PALETTE, SHAPE } from '../c4/theme.mjs'
import type { SeqLayout, LaidMessage } from '../../seq/seqLayout.mjs'

// Same pre-encode as Mx's private `c4Text` (escGt + escLt + htmlBreaks)
// so the shared un-double serialiser below renders `<`/`>`/`\n`
// identically to the C4 path. Kept verbatim, not refactored out of
// Mx.mts, to avoid any edit to the byte-identical C4 emit.
const escGt = (s: string): string => s.replace(/>/g, '&gt;')
const escLt = (s: string): string => s.replace(/</g, '&amp;lt;')
const seqText = (s: string): string => htmlBreaks(escLt(escGt(s)))

type Cell = Record<string, unknown>

/** mxGraph arrow style per message kind. Heads mirror the C4
 *  `Relationship` semantics (filled block = sync request, open =
 *  async, dashed open = reply/return, both ends = bidirectional);
 *  `REL_ARROW_SIZE` is the cited draw.io arrow size. */
function arrowStyle(arrow: LaidMessage['arrow']): string {
  const sz = `endSize=${SHAPE.REL_ARROW_SIZE};startSize=${SHAPE.REL_ARROW_SIZE}`
  switch (arrow) {
    case 'sync': return `endArrow=block;endFill=1;startArrow=none;${sz}`
    case 'async': return `endArrow=open;endFill=0;startArrow=none;${sz}`
    case 'return': return `endArrow=open;endFill=0;dashed=1;startArrow=none;${sz}`
    case 'bi': return `endArrow=block;endFill=1;startArrow=block;startFill=1;${sz}`
  }
}

const geom = (x: number, y: number, w: number, h: number): Cell =>
  ({ $: { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h), as: 'geometry' } })

/**
 * Build the full xml2js doc for a laid-out sequence diagram.
 * Cells go in `root.MxCell` (vertices/edges) — the `object[]` lane is
 * C4-placeholder-specific and intentionally unused here.
 */
export function buildSeqDoc(L: SeqLayout): unknown {
  const cells: Cell[] = [{ $: { id: '0' } }, { $: { id: '1', parent: '0' } }]
  let n = 0
  const id = (p: string) => `seq-${p}-${n++}`

  if (L.title) {
    cells.push({
      $: {
        id: id('title'), value: seqText(L.title),
        style: `text;html=1;align=center;verticalAlign=middle;fontSize=16;fontStyle=1;fontColor=${PALETTE.BOUNDARY_FONT}`,
        vertex: 1, parent: '1',
      },
      MxGeometry: geom(0, 0, L.width, L.titleH),
    })
  }

  // Lifelines: draw.io native umlLifeline (head box + dashed line).
  // `size=` = the head height (cited: drawio CylinderShape-style head
  // band convention for umlLifeline). Neutral palette (cited PALETTE).
  for (const ll of L.lifelines) {
    cells.push({
      $: {
        id: `ll-${ll.alias}`, value: seqText(ll.label),
        style: `shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;`
          + `container=0;collapsible=0;recursiveResize=0;outlineConnect=0;`
          + `size=${ll.headH};`
          + `fillColor=${PALETTE.DEPLOYMENT_NODE_FILL};strokeColor=${PALETTE.BOUNDARY_STROKE};`
          + `fontColor=${PALETTE.BOUNDARY_FONT};fontStyle=1;verticalAlign=top`,
        vertex: 1, parent: '1',
      },
      MxGeometry: geom(ll.headX, ll.headY, ll.headW, ll.bottomY - ll.headY),
    })
  }

  // Activation bars (paired activate/deactivate). Thin rect on the
  // lifeline; width = the cited arrow size (a real metric, not a guess).
  const actW = SHAPE.REL_ARROW_SIZE
  for (const a of L.activations) {
    cells.push({
      $: {
        id: id('act'),
        style: `html=1;fillColor=${PALETTE.DEPLOYMENT_NODE_FILL};strokeColor=${PALETTE.BOUNDARY_STROKE}`,
        vertex: 1, parent: '1',
      },
      MxGeometry: geom(a.cx - actW / 2, a.y1, actW, Math.max(a.y2 - a.y1, 1)),
    })
  }

  // Fragments (phase d2): emitted BEFORE the event cells so the frame
  // border sits BEHIND the messages it groups (draw.io z-order =
  // document order). Ascending `order` ⇒ an enclosing frame is emitted
  // before — behind — its nested children. Border has no fill so the
  // grouped messages remain visible through it.
  for (const f of [...L.fragments].sort((a, b) => a.order - b.order)) {
    cells.push({
      $: {
        id: id('frag'),
        style: `rounded=0;html=1;fillColor=none;strokeColor=${PALETTE.BOUNDARY_STROKE};`
          + `verticalAlign=top;align=left`,
        vertex: 1, parent: '1',
      },
      MxGeometry: geom(f.x, f.y, f.w, f.h),
    })
    // else compartment separators: a dashed full-width rule carrying the
    // alternative's `[guard]` as its edge label (mirrors PlantUML).
    for (const el of f.elses) {
      cells.push({
        $: {
          id: id('frag-else'), value: seqText(el.label),
          style: `html=1;endArrow=none;startArrow=none;dashed=1;`
            + `strokeColor=${PALETTE.BOUNDARY_STROKE};fontColor=${PALETTE.BOUNDARY_FONT};`
            + `verticalAlign=bottom;align=left`,
          edge: 1, parent: '1',
        },
        MxGeometry: {
          $: { relative: 1, as: 'geometry' },
          mxPoint: [
            { $: { x: Math.round(f.x), y: Math.round(el.y), as: 'sourcePoint' } },
            { $: { x: Math.round(f.x + f.w), y: Math.round(el.y), as: 'targetPoint' } },
          ],
        },
      })
    }
    // top-left kind tab (notched-corner look via a plain filled rect —
    // a clean, deterministic v1 of PlantUML's pentagon label).
    cells.push({
      $: {
        id: id('frag-tab'), value: seqText(f.kind),
        style: `rounded=0;html=1;fillColor=${PALETTE.DEPLOYMENT_NODE_FILL};`
          + `strokeColor=${PALETTE.BOUNDARY_STROKE};fontColor=${PALETTE.BOUNDARY_FONT};`
          + `fontStyle=1;align=center;verticalAlign=middle`,
        vertex: 1, parent: '1',
      },
      MxGeometry: geom(f.x, f.y, f.tabW, f.headerH),
    })
    if (f.label) {
      cells.push({
        $: {
          id: id('frag-guard'), value: seqText(f.label),
          style: `text;html=1;align=left;verticalAlign=middle;`
            + `fontColor=${PALETTE.BOUNDARY_FONT};whiteSpace=wrap`,
          vertex: 1, parent: '1',
        },
        MxGeometry: geom(f.x + f.tabW, f.y, Math.max(f.w - f.tabW, 1), f.headerH),
      })
    }
  }

  // Events: messages (edges) + notes + dividers, in source order.
  for (const ev of L.events) {
    if (ev.type === 'divider') {
      if (ev.label.trim().length === 0) {
        // Empty `====` → a thin full-width separator RULE (PlantUML's
        // hairline), centred in the reserved INSET footprint; emitted
        // as a line edge (no fill, no arrowheads) exactly like a
        // fragment else-separator. NOT a filled band — phase d1 v1.x.
        const ry = Math.round(ev.y + ev.h / 2)
        cells.push({
          $: {
            id: id('divider'),
            style: `html=1;endArrow=none;startArrow=none;strokeColor=${PALETTE.BOUNDARY_STROKE}`,
            edge: 1, parent: '1',
          },
          MxGeometry: {
            $: { relative: 1, as: 'geometry' },
            mxPoint: [
              { $: { x: 0, y: ry, as: 'sourcePoint' } },
              { $: { x: Math.round(L.width), y: ry, as: 'targetPoint' } },
            ],
          },
        })
        continue
      }
      // Labelled `== X ==` → full-width band (phase d1). PlantUML draws
      // the divider as a centred label on a banded separator spanning
      // every lifeline — a neutral filled rect, bold centred text.
      cells.push({
        $: {
          id: id('divider'), value: seqText(ev.label),
          style: `text;html=1;align=center;verticalAlign=middle;fontStyle=1;`
            + `fillColor=${PALETTE.DEPLOYMENT_NODE_FILL};strokeColor=${PALETTE.BOUNDARY_STROKE};`
            + `fontColor=${PALETTE.BOUNDARY_FONT};whiteSpace=wrap`,
          vertex: 1, parent: '1',
        },
        MxGeometry: geom(0, ev.y, L.width, ev.h),
      })
      continue
    }
    if (ev.type === 'note') {
      cells.push({
        $: {
          id: id('note'), value: seqText(ev.text),
          style: `shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;darkOpacity=0.05;`
            + `fillColor=${PALETTE.DEPLOYMENT_NODE_FILL};strokeColor=${PALETTE.BOUNDARY_STROKE};`
            + `fontColor=${PALETTE.BOUNDARY_FONT};align=left;verticalAlign=top`,
          vertex: 1, parent: '1',
        },
        MxGeometry: geom(ev.x, ev.y, ev.w, ev.h),
      })
      continue
    }
    // message edge
    const style = `html=1;rounded=0;${arrowStyle(ev.arrow)};`
      + `strokeColor=${PALETTE.REL_STROKE};fontColor=${PALETTE.REL_FONT};`
      + `verticalAlign=bottom;endFill=${ev.arrow === 'return' ? 0 : 1}`
    const g: Cell = { $: { relative: 1, as: 'geometry' } }
    if (ev.selfLoop) {
      const lx = ev.fromX
      ;(g as Record<string, unknown>).mxPoint = [
        { $: { x: Math.round(lx), y: Math.round(ev.y), as: 'sourcePoint' } },
        { $: { x: Math.round(lx), y: Math.round(ev.y + ev.loopH), as: 'targetPoint' } },
      ]
      ;(g as Record<string, unknown>).Array = {
        $: { as: 'points' },
        mxPoint: [
          { $: { x: Math.round(lx + ev.loopW), y: Math.round(ev.y) } },
          { $: { x: Math.round(lx + ev.loopW), y: Math.round(ev.y + ev.loopH) } },
        ],
      }
    } else {
      ;(g as Record<string, unknown>).mxPoint = [
        { $: { x: Math.round(ev.fromX), y: Math.round(ev.y), as: 'sourcePoint' } },
        { $: { x: Math.round(ev.toX), y: Math.round(ev.y), as: 'targetPoint' } },
      ]
    }
    cells.push({
      $: { id: id('msg'), value: seqText(ev.label), style, edge: 1, parent: '1' },
      MxGeometry: g,
    })
  }

  return {
    MxFile: {
      $: { version: '20.1.4', type: 'atlas' },
      diagram: {
        $: { id: 'catalyst-diagram', name: 'Page-1' },
        MxGraphModel: {
          $: { pageHeight: Math.ceil(L.height), pageWidth: Math.ceil(L.width) },
          root: { MxCell: cells },
        },
      },
    },
  }
}

/** Serialise EXACTLY as `Mx.generate()` does: xml2js headless build,
 *  then the un-double pass (`&amp;(lt|gt|quot|amp|#39);`→`&$1;`) and
 *  the MxKey→mxkey rename — so escaping is the proven C4 behaviour. */
export function serializeSeq(doc: unknown): string {
  const xml = new xml2js.Builder({ headless: true }).buildObject(doc)
    .replace(/&amp;(lt|gt|quot|amp|#39);/g, '&$1;')
  const tags: [RegExp, string][] = [
    [/\bMxGraphModel\b/g, 'mxGraphModel'],
    [/\bMxCell\b/g, 'mxCell'],
    [/\bMxGeometry\b/g, 'mxGeometry'],
    [/\bMxFile\b/g, 'mxfile'],
  ]
  return tags.reduce((s, [re, v]) => s.replace(re, v), xml)
}
