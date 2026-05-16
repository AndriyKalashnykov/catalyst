import { describe, it, expect } from 'vitest'
import {
  ELEMENT_TITLE_PX, ELEMENT_BODY_PX, DEPLOYMENT_TITLE_PX,
  ENTERPRISE_BOUNDARY_TITLE_PX, BOUNDARY_TITLE_PX, BOUNDARY_BODY_PX,
  RELATIONSHIP_LABEL_PX, MX,
} from '../../src/mx/c4/theme.mjs'
import { Relastionship } from '../../src/mx/Mx.mjs'
import { Boundary } from '../../src/mx/c4/Boundary.mjs'
import { System } from '../../src/mx/c4/System.mjs'

// Lock the single-sourced C4 typography to the values the renderer
// ACTUALLY applies, and assert the templates/styles still emit exactly
// those — so the measurement side (measureNode/measureEdgeLabel/
// titlePadding, which import these) can never silently desync from the
// shape templates again (the cell-fontSize-override bug class).

describe('c4/theme — single-sourced typography', () => {
  it('holds the deliberate C4 type scale', () => {
    expect(ELEMENT_TITLE_PX).toBe(16)
    expect(ELEMENT_BODY_PX).toBe(11)
    expect(DEPLOYMENT_TITLE_PX).toBe(14)
    expect(ENTERPRISE_BOUNDARY_TITLE_PX).toBe(13)
    expect(BOUNDARY_TITLE_PX).toBe(12)
    expect(BOUNDARY_BODY_PX).toBe(11)
  })

  it('RELATIONSHIP_LABEL_PX is 10 — the Relationship CELL fontSize, NOT mxGraph default 11', () => {
    // This is the bug the consolidation fixed: the Relationship label
    // divs set no font-size, so the cell-level fontSize wins; measuring
    // at 11 over-sized every edge label.
    expect(RELATIONSHIP_LABEL_PX).toBe(10)
    expect(Relastionship.style()).toContain(`fontSize=${RELATIONSHIP_LABEL_PX}`)
  })

  it('MX flags are the fixed mxGraph enum values', () => {
    expect(MX.FONT_NORMAL).toBe(0)
    expect(MX.FONT_BOLD).toBe(1)
    expect(MX.ON).toBe(1)
    expect(MX.OFF).toBe(0)
  })
})

describe('templates emit exactly the single-sourced sizes (no drift)', () => {
  it('element template uses the title/body constants', async () => {
    const html = await System.label()
    expect(html).toContain(`font-size:${ELEMENT_TITLE_PX}px`)
    expect(html).toContain(`font-size:${ELEMENT_BODY_PX}px`)
  })

  it('boundary style carries the boundary title size + a font-derived top inset', () => {
    const s = Boundary.style()
    expect(s).toContain(`fontSize=${BOUNDARY_TITLE_PX}`)
    // spacingTop is the font space-advance at the title size (rounded) —
    // a positive inset so the title clears the dashed stroke.
    const m = /spacingTop=(\d+)/.exec(s)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBeGreaterThan(0)
  })
})
