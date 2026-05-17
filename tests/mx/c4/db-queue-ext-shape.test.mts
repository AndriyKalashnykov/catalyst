import { describe, it, expect } from 'vitest'
import { parseStringPromise } from 'xml2js'
import { Catalyst } from '../../../src/catalyst.mjs'
import { PALETTE } from '../../../src/mx/c4/theme.mjs'

// C4-PlantUML keeps the DATABASE (cylinder) / QUEUE shape for the
// external `_Ext` variants — only the colour goes external grey.
// catalyst previously flattened all six to the generic grey *Ext
// RECTANGLE, losing the shape. This is the whole-path emit contract:
// real Catalyst.convert output, asserting shape + the matching
// *_EXT palette colour, and that it is no longer a plain rectangle.

async function vertexStyle(xml: string, id: string): Promise<string> {
  const doc = await parseStringPromise(xml)
  const root = doc?.mxfile?.diagram?.[0]?.mxGraphModel?.[0]?.root?.[0] ?? {}
  for (const obj of (root.object ?? [])) {
    if ((obj.$ ?? {}).id === id) return obj.mxCell?.[0]?.$?.style ?? ''
  }
  throw new Error(`no vertex id=${id}`)
}

const styleMap = (s: string) =>
  Object.fromEntries(s.split(';').filter(Boolean).map((kv) => {
    const i = kv.indexOf('=')
    return i === -1 ? [kv, ''] : [kv.slice(0, i), kv.slice(i + 1)]
  }))

describe('_Ext DB/Queue keep the C4-PlantUML shape (grey-coloured)', () => {
  const cases = [
    ['SystemDb_Ext',     'cylinder3',        PALETTE.SYSTEM_EXT_FILL,    PALETTE.SYSTEM_EXT_STROKE],
    ['ContainerDb_Ext',  'cylinder3',        PALETTE.CONTAINER_EXT_FILL, PALETTE.CONTAINER_EXT_STROKE],
    ['ComponentDb_Ext',  'cylinder3',        PALETTE.COMPONENT_EXT_FILL, PALETTE.COMPONENT_EXT_STROKE],
    ['SystemQueue_Ext',  'mxgraph.c4.queue', PALETTE.SYSTEM_EXT_FILL,    PALETTE.SYSTEM_EXT_STROKE],
    ['ContainerQueue_Ext','mxgraph.c4.queue',PALETTE.CONTAINER_EXT_FILL, PALETTE.CONTAINER_EXT_STROKE],
    ['ComponentQueue_Ext','mxgraph.c4.queue',PALETTE.COMPONENT_EXT_FILL, PALETTE.COMPONENT_EXT_STROKE],
  ] as const

  for (const [type, shape, fill, stroke] of cases) {
    it(`${type} → shape=${shape} + ${type.split('_')[0]} external palette`, async () => {
      const xml = await Catalyst.convert(`${type}(x, "X", "tech", "desc")\nSystem(s,"S")\nRel(s,x,"uses")\n`)
      const st = styleMap(await vertexStyle(xml, 'x'))
      expect(st.shape, `${type} keeps the C4 shape`).toBe(shape)
      expect(st.fillColor, `${type} external fill`).toBe(fill)
      expect(st.strokeColor, `${type} external stroke`).toBe(stroke)
      // It must NOT be the plain grey rounded rectangle anymore.
      expect(st.shape, `${type} is not a bare rectangle`).not.toBe(undefined)
      expect(st.rounded, `${type} not the *Ext rounded rect`).not.toBe('1')
    })
  }

  it('external fill differs from the non-_Ext same-level DB (grey vs level colour)', async () => {
    const xml = await Catalyst.convert(
      'ContainerDb(a,"A")\nContainerDb_Ext(b,"B")\nSystem(s,"S")\nRel(s,a,"x")\nRel(s,b,"y")\n')
    const a = styleMap(await vertexStyle(xml, 'a'))
    const b = styleMap(await vertexStyle(xml, 'b'))
    expect(a.shape).toBe('cylinder3')
    expect(b.shape).toBe('cylinder3')                       // same shape
    expect(a.fillColor).toBe(PALETTE.CONTAINER_FILL)        // level colour
    expect(b.fillColor).toBe(PALETTE.CONTAINER_EXT_FILL)    // external grey
    expect(a.fillColor).not.toBe(b.fillColor)               // …and they differ
  })
})
