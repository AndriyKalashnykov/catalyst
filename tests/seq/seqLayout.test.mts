import { describe, it, expect } from 'vitest'
import { SeqParser } from '../../src/seq/SeqParser.mjs'
import { layoutSeq } from '../../src/seq/seqLayout.mjs'
import type {
  LaidDivider, LaidRef, LaidLifeline,
} from '../../src/seq/seqLayout.mjs'
import type { LaidFragment } from '../../src/seq/seqLayout.mjs'

/**
 * Pure-unit geometry contracts on `layoutSeq` — the layer the
 * whole-path SeqConverter tests sit on top of. Targets the
 * session's new/changed geometry: the phase-d1 v1.x empty-divider
 * footprint (#130) and the phase-d2b `ref` frame box (#131), plus
 * the `ref`↔enclosing-fragment span interaction.
 */
const lay = (body: string) =>
  layoutSeq(SeqParser.parse(`@startuml\n${body}\n@enduml\n`))
const divs = (b: string) =>
  lay(b).events.filter((e): e is LaidDivider => e.type === 'divider')
const refs = (b: string) =>
  lay(b).events.filter((e): e is LaidRef => e.type === 'ref')

describe('layoutSeq — phase d1 v1.x empty-divider footprint (#130)', () => {
  it('an empty ==== reserves a SMALLER footprint than a labelled band', () => {
    const [empty] = divs('participant a\nparticipant b\na -> b : m\n====')
    const [labelled] = divs('participant a\nparticipant b\na -> b : m\n== Phase ==')
    expect(empty.label).toBe('')
    expect(labelled.label).toBe('Phase')
    expect(empty.h).toBeGreaterThan(0)
    expect(empty.h).toBeLessThan(labelled.h)               // thin rule ≪ band
  })

  it('the empty-divider footprint is constant regardless of (absent) label', () => {
    const [a] = divs('participant a\na -> a : x\n====')
    const [b] = divs('participant p\nparticipant q\np -> q : y\n====')
    expect(a.h).toBe(b.h)                                   // label-independent
  })

  it('a divider keeps strictly-increasing source-order Y vs messages', () => {
    const L = lay('participant a\nparticipant b\na -> b : one\n== Mid ==\nb -> a : two')
    const dy = L.events.find((e): e is LaidDivider => e.type === 'divider')!.y
    const ys = L.events.filter((e) => e.type === 'message').map((e) => e.y)
    expect(ys[0]).toBeLessThan(dy)
    expect(dy).toBeLessThan(ys[1])
  })
})

describe('layoutSeq — phase d2b `ref` frame geometry (#131)', () => {
  const cx = (L: { lifelines: LaidLifeline[] }, alias: string) =>
    L.lifelines.find((l) => l.alias === alias)!.cx

  it('a multi-lifeline ref box spans from ≤cx[lo] to ≥cx[hi]', () => {
    const L = lay('participant a\nparticipant b\nparticipant c\n'
      + 'a -> b : go\nref over b, c : see ADR\nb -> c : next')
    const r = L.events.find((e): e is LaidRef => e.type === 'ref')!
    expect(r.x).toBeLessThanOrEqual(cx(L, 'b'))
    expect(r.x + r.w).toBeGreaterThanOrEqual(cx(L, 'c'))
    expect(r.tabW).toBeGreaterThan(0)
    expect(r.h).toBeGreaterThanOrEqual(r.tabH)              // box hosts the tab
  })

  it('a single-lifeline ref still has a positive box ≥ tab+text width', () => {
    const r = refs('participant a\nparticipant b\na -> b : x\nref over a : note here')[0]
    expect(r.w).toBeGreaterThan(r.tabW)                     // text widens past tab
    expect(r.h).toBeGreaterThan(0)
  })

  it('a block (multi-line) ref is taller than a single-line ref', () => {
    const one = refs('participant a\nparticipant b\nref over a, b : short')[0]
    const many = refs('participant a\nparticipant b\n'
      + 'ref over a, b\n  line one\n  line two\n  line three\nend ref')[0]
    expect(many.h).toBeGreaterThan(one.h)
  })

  it('the canvas width includes a ref that overhangs the rightmost lifeline', () => {
    const L = lay('participant a\nparticipant b\nref over a, b : x')
    const r = L.events.find((e): e is LaidRef => e.type === 'ref')!
    expect(L.width).toBeGreaterThanOrEqual(r.x + r.w)
  })

  it('an enclosing fragment STRICTLY encloses a ref nested inside it', () => {
    // `touch()` must fold the ref''s lifeline span into the open frame
    // so the frame box ⊇ the ref box (no clipped reference frame).
    const L = lay('participant a\nparticipant b\nparticipant c\n'
      + 'opt guarded\nref over a, c : spans wide\nend\na -> b : after')
    const f = L.fragments[0] as LaidFragment
    const r = L.events.find((e): e is LaidRef => e.type === 'ref')!
    expect(f).toBeDefined()
    expect(f.x).toBeLessThanOrEqual(r.x)
    expect(f.x + f.w).toBeGreaterThanOrEqual(r.x + r.w)
    expect(f.y).toBeLessThanOrEqual(r.y)
    expect(f.y + f.h).toBeGreaterThanOrEqual(r.y + r.h)
  })

  it('refs preserve source-order Y between surrounding messages', () => {
    const L = lay('participant a\nparticipant b\n'
      + 'a -> b : first\nref over a, b : mid\nb -> a : last')
    const ry = L.events.find((e): e is LaidRef => e.type === 'ref')!.y
    const ys = L.events.filter((e) => e.type === 'message').map((e) => e.y)
    expect(ys[0]).toBeLessThan(ry)
    expect(ry).toBeLessThan(ys[1])
  })
})

describe('layoutSeq — phase d2b create/destroy lifespan', () => {
  it('a created lifeline head Y > a normal lifeline head Y', () => {
    const L = lay('participant a\na -> a : warm\ncreate j\na -> j : go')
    const a = L.lifelines.find((l) => l.alias === 'a')!
    const j = L.lifelines.find((l) => l.alias === 'j')!
    expect(j.headY).toBeGreaterThan(a.headY)
  })

  it('a destroyed lifeline foot Y < a normal lifeline foot Y, + a destroy mark', () => {
    const L = lay('participant a\na -> a : one\ncreate j\na -> j : go\n'
      + 'destroy j\na -> a : later\na -> a : even later')
    const a = L.lifelines.find((l) => l.alias === 'a')!
    const j = L.lifelines.find((l) => l.alias === 'j')!
    expect(j.bottomY).toBeLessThan(a.bottomY)
    expect(L.destroyMarks).toHaveLength(1)
    expect(L.destroyMarks[0].cx).toBe(j.cx)
    expect(L.destroyMarks[0].y).toBe(j.bottomY)
  })

  it('destroy clamps foot ≥ head+headH even if destroy precedes growth', () => {
    const L = lay('participant a\ncreate j\ndestroy j\na -> a : x')
    const j = L.lifelines.find((l) => l.alias === 'j')!
    expect(j.bottomY).toBeGreaterThanOrEqual(j.headY + j.headH)
  })
})

describe('layoutSeq — phase d2b box/Boundary grouping', () => {
  it('a box spans the contiguous range, full height, title band above heads', () => {
    const L = lay('participant op\nbox "CP"\nparticipant ctl\nparticipant iss\n'
      + 'end box\nparticipant v\nop -> ctl : go\niss -> v : x')
    expect(L.boxes).toHaveLength(1)
    const b = L.boxes[0]
    const ctl = L.lifelines.find((l) => l.alias === 'ctl')!
    const iss = L.lifelines.find((l) => l.alias === 'iss')!
    const op = L.lifelines.find((l) => l.alias === 'op')!
    expect(b.x).toBeLessThan(ctl.headX)
    expect(b.x + b.w).toBeGreaterThan(iss.headX + iss.headW)
    expect(op.headX).toBeLessThan(b.x)                       // op outside
    expect(b.y).toBeLessThan(ctl.headY)                      // title band above
    expect(b.y + b.h).toBeGreaterThanOrEqual(ctl.bottomY)    // full height
    expect(b.bandH).toBeGreaterThan(0)
    expect(b.label).toBe('CP')
  })

  it('the box header band shifts every head down equally (alignment invariant)', () => {
    const noBox = lay('participant a\nparticipant b\na -> b : m')
    const withBox = lay('participant a\nbox "X"\nparticipant b\nend box\na -> b : m')
    const aNo = noBox.lifelines.find((l) => l.alias === 'a')!.headY
    const wA = withBox.lifelines.find((l) => l.alias === 'a')!.headY
    const wB = withBox.lifelines.find((l) => l.alias === 'b')!.headY
    expect(wA).toBe(wB)                                       // aligned
    expect(wA).toBeGreaterThan(aNo)                           // shifted down by the band
  })

  it('a C4 *_Boundary(...) … Boundary_End() lays out the same as raw box', () => {
    const L = lay('Person(op,"Op")\nSystem_Boundary(cp,"Plane")\n'
      + 'Container(ctl,"Ctl","Go")\nBoundary_End()\nRel(op, ctl, "go")')
    expect(L.boxes).toHaveLength(1)
    expect(L.boxes[0].label).toBe('Plane')
    const ctl = L.lifelines.find((l) => l.alias === 'ctl')!
    expect(L.boxes[0].x).toBeLessThan(ctl.headX)
  })
})
