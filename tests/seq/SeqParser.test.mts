import { describe, it, expect } from 'vitest'
import { SeqParser, SeqParseError } from '../../src/seq/SeqParser.mjs'
import type { SeqMessage, SeqNote } from '../../src/seq/SeqModel.interface.mjs'

// ADR 0007 phase-a BLOCKING gate: the parser's ORDERING INVARIANTS
// (declaration order → X index; source order → event order; arrowKind
// incl. Rel_Back/BiRel) and the v2 FAIL-LOUD contract (a deferred
// construct throws a precise, token-naming error — never a silent drop).

const wrap = (body: string) => `@startuml\n${body}\n@enduml\n`
const msgs = (s: ReturnType<typeof SeqParser.parse>) =>
  s.events.filter((e): e is SeqMessage => e.type === 'message')

describe('SeqParser — lifeline declaration order = X index', () => {
  it('raw participant/actor in declaration order', () => {
    const m = SeqParser.parse(wrap(
      'actor "Op" as op\nparticipant "Cert CR" as crt\nparticipant cm\n'
      + 'op -> crt : a\ncrt --> cm : b'))
    expect(m.lifelines.map(l => l.alias)).toEqual(['op', 'crt', 'cm'])
    expect(m.lifelines.map(l => l.index)).toEqual([0, 1, 2])
    expect(m.lifelines[0]).toMatchObject({ alias: 'op', label: 'Op', kind: 'actor' })
    expect(m.lifelines[1]).toMatchObject({ alias: 'crt', label: 'Cert CR', kind: 'participant' })
  })

  it('C4 lifeline macros keep declaration order and carry kind/techn', () => {
    const m = SeqParser.parse(wrap(
      'Person(op, "Operator")\nContainer(api, "API", "Go")\nComponentDb_Ext(db, "Vendor DB")\n'
      + 'Rel(op, api, "calls")'))
    expect(m.lifelines.map(l => l.alias)).toEqual(['op', 'api', 'db'])
    expect(m.lifelines[0]).toMatchObject({ kind: 'Person', label: 'Operator' })
    expect(m.lifelines[1]).toMatchObject({ kind: 'Container', technology: 'Go' })
    expect(m.lifelines[2]).toMatchObject({ kind: 'ComponentDb_Ext', label: 'Vendor DB' })
    expect(m.lifelines[2].technology).toBeUndefined()   // Db variant: no techn arg
  })

  it('an undeclared participant referenced by a message auto-registers in encounter order', () => {
    const m = SeqParser.parse(wrap('a -> b : x\nb -> c : y'))
    expect(m.lifelines.map(l => l.alias)).toEqual(['a', 'b', 'c'])
    expect(m.lifelines.every(l => l.kind === 'participant')).toBe(true)
  })
})

describe('SeqParser — message source order = event order (Y axis)', () => {
  it('events carry a monotonically increasing 0-based order', () => {
    const m = SeqParser.parse(wrap(
      'participant a\nparticipant b\n'
      + 'a -> b : one\nb --> a : two\na ->> b : three'))
    const e = msgs(m)
    expect(e.map(x => x.label)).toEqual(['one', 'two', 'three'])
    expect(e.map(x => x.order)).toEqual([0, 1, 2])
    expect(m.events.map(x => x.order)).toEqual([0, 1, 2])  // dense, source order
  })

  it('arrow kinds: -> sync, --> return, ->> async, <-> bi', () => {
    const m = SeqParser.parse(wrap('a -> b : s\na --> b : r\na ->> b : as\na <-> b : bi'))
    expect(msgs(m).map(x => x.arrow)).toEqual(['sync', 'return', 'async', 'bi'])
  })

  it('reverse arrow `<-` swaps from/to but stays sync', () => {
    const m = SeqParser.parse(wrap('a <- b : reply'))
    expect(msgs(m)[0]).toMatchObject({ from: 'b', to: 'a', arrow: 'sync' })
  })

  it('C4 Rel = sync; Rel_Back reverses from/to; BiRel = bi', () => {
    const m = SeqParser.parse(wrap(
      'Person(a,"A")\nPerson(b,"B")\n'
      + 'Rel(a, b, "go", "gRPC")\nRel_Back(a, b, "back")\nBiRel(a, b, "both")'))
    const e = msgs(m)
    expect(e[0]).toMatchObject({ from: 'a', to: 'b', arrow: 'sync', technology: 'gRPC' })
    expect(e[1]).toMatchObject({ from: 'b', to: 'a', arrow: 'sync' })  // Rel_Back
    expect(e[2]).toMatchObject({ from: 'a', to: 'b', arrow: 'bi' })
  })

  it('-->> is async (dashed async not mis-split as -->)', () => {
    expect(msgs(SeqParser.parse(wrap('a -->> b : x')))[0].arrow).toBe('async')
  })

  it('activation shorthand ++ / -- on the arrow target', () => {
    const m = SeqParser.parse(wrap('a -> b ++ : start\nb -> a -- : done'))
    expect(msgs(m)[0]).toMatchObject({ to: 'b', activateTarget: true })
    expect(msgs(m)[1]).toMatchObject({ deactivateSource: true })
  })
})

describe('SeqParser — title, autonumber, activate, notes', () => {
  it('captures title and autonumber', () => {
    const m = SeqParser.parse(wrap('title My Flow — v2 (x)\nautonumber\na -> b : x'))
    expect(m.title).toBe('My Flow — v2 (x)')
    expect(m.autonumber).toBe(true)
  })

  it('explicit activate/deactivate become ordered events on the timeline', () => {
    const m = SeqParser.parse(wrap('participant a\nparticipant b\n'
      + 'a -> b : call\nactivate b\nb --> a : ret\ndeactivate b'))
    expect(m.events.map(e => e.type)).toEqual(['message', 'activate', 'message', 'deactivate'])
    expect(m.events.map(e => e.order)).toEqual([0, 1, 2, 3])
  })

  it('single-line and block notes (left/right of, over a,b)', () => {
    const m = SeqParser.parse(wrap(
      'participant p\nparticipant s\n'
      + 'note right of p : quick\n'
      + 'note over p,s\n  line one\n  line two\nend note'))
    const n = m.events.filter((e): e is SeqNote => e.type === 'note')
    expect(n[0]).toMatchObject({ position: 'right', lifelines: ['p'], text: 'quick' })
    expect(n[1]).toMatchObject({ position: 'over', lifelines: ['p', 's'] })
    expect(n[1].text).toBe('line one\nline two')
  })
})

describe('SeqParser — v2 deferred constructs FAIL LOUD (never silent drop)', () => {
  const cases: [string, RegExp][] = [
    ['== Stage 1 ==', /divider/],
    ['alt success', /fragment/],
    ['opt maybe', /fragment/],
    ['loop 3 times', /fragment/],
    ['par', /fragment/],
    ['else other', /else/],
    ['box "Team"', /box/],
    ['System_Boundary(b, "B")', /Boundary/],
    ['Boundary_End()', /Boundary_End/],
    ['ref over a : see X', /ref/],
    ['create participant z', /create|destroy/],
    ['destroy z', /create|destroy/],
  ]
  for (const [line, re] of cases) {
    it(`throws SeqParseError naming the token: "${line}"`, () => {
      let err: unknown
      try { SeqParser.parse(wrap(`participant a\nparticipant b\na -> b : ok\n${line}`)) }
      catch (e) { err = e }
      expect(err).toBeInstanceOf(SeqParseError)
      expect((err as SeqParseError).message).toMatch(re)
      expect((err as SeqParseError).message).toMatch(/v1|v2|ADR 0007/)
      expect((err as SeqParseError).line).toBeGreaterThan(0)
    })
  }

  it('the real ibm-wm divider-using fixture fails loud on the first `==` (v1 contract)', () => {
    const fixture = '@startuml\ntitle X\nactor "Op" as op\nparticipant c\n'
      + 'op -> c : apply\n== Stage 1 — Born ==\nc --> op : ok\n@enduml'
    expect(() => SeqParser.parse(fixture)).toThrowError(/divider.*v1|v1.*divider/)
  })

  it('an unrecognised construct fails loud, not a silent drop', () => {
    // No arrow, no macro, no keyword, not a preprocessor `!` line —
    // must hit the terminal fail-loud, never be silently dropped.
    expect(() => SeqParser.parse(wrap('a -> b : ok\ntotally bogus gibberish')))
      .toThrowError(/unrecognised construct/)
  })

  it('an unterminated note block fails loud', () => {
    expect(() => SeqParser.parse(wrap('participant a\nnote over a\nдangling')))
      .toThrowError(/unterminated `note/)
  })

  it('empty diagram (no lifelines) fails loud', () => {
    expect(() => SeqParser.parse(wrap('title only'))).toThrowError(/no participants/)
  })
})

describe('SeqParser — preprocessor / comments / toggles are ignored (valid v1)', () => {
  it('skips @start/@end, !include, comments, C4 SHOW_* toggles', () => {
    const m = SeqParser.parse(
      "@startuml s\n!include https://x/C4_Sequence.puml\n"
      + "' a line comment\n/' block\ncomment '/\n"
      + 'SHOW_FOOT_BOXES()\nSHOW_INDEX()\n'
      + 'Person(a,"A")\nPerson(b,"B")\na -> b : ok\n@enduml')
    expect(m.lifelines.map(l => l.alias)).toEqual(['a', 'b'])
    expect(msgs(m)).toHaveLength(1)
  })
})
