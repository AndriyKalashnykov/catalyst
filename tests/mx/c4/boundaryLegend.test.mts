import { describe, it, expect } from 'vitest'
import { boundaryLegend } from '../../../src/mx/c4/boundaryLegend.mjs'

// C4-PlantUML v2.13.0: the named boundary macros differ from a generic
// Boundary ONLY by the bracketed subtitle text (no colour/border delta).
// PlantUML renders that subtitle as the LOWERCASE tag verbatim —
// render-compare verified (`[container]`, not `[Container]`).
// boundaryLegend maps the parsed macro name → that tag so catalyst's
// `[…]` subtitle matches PlantUML instead of the raw macro name.
describe('boundaryLegend', () => {
  it('maps the three named boundary macros to their lowercase PlantUML tag', () => {
    expect(boundaryLegend('System_Boundary')).toBe('system')
    expect(boundaryLegend('Container_Boundary')).toBe('container')
    expect(boundaryLegend('Enterprise_Boundary')).toBe('enterprise')
  })

  it('a named boundary ignores any stray explicit-type arg (macro wins)', () => {
    // Named macros pass $type="" to Boundary(); the tag is authoritative.
    expect(boundaryLegend('Container_Boundary', 'ignored')).toBe('container')
  })

  it('generic Boundary with an explicit $type surfaces that $type verbatim', () => {
    expect(boundaryLegend('Boundary', 'my-type')).toBe('my-type')
    expect(boundaryLegend('Boundary', '  spaced  ')).toBe('spaced')
  })

  it('generic Boundary without $type falls back to the neutral "Boundary"', () => {
    expect(boundaryLegend('Boundary')).toBe('Boundary')
    expect(boundaryLegend('Boundary', '')).toBe('Boundary')
    expect(boundaryLegend('Boundary', '   ')).toBe('Boundary')
  })

  it('an unknown type behaves like a generic Boundary (no throw)', () => {
    expect(boundaryLegend('SomethingElse')).toBe('Boundary')
    expect(boundaryLegend('SomethingElse', 'x')).toBe('x')
  })
})
