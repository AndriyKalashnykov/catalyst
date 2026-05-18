import { describe, it, expect } from 'vitest'
import { SeqParser, SeqParseError } from '../../src/seq/SeqParser.mjs'
import type {
  SeqMessage, SeqNote, SeqDivider, SeqRef, SeqLifecycle,
} from '../../src/seq/SeqModel.interface.mjs'

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
    // d1 divider, d2 fragments, d2b `ref` + `create`/`destroy` are NOT
    // here — they are supported (see the phase describes below). Only
    // `box`/`Boundary` lifeline grouping remains deferred.
    ['box "Team"', /box/],
    ['System_Boundary(b, "B")', /Boundary/],
    ['Boundary_End()', /Boundary_End/],
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

describe('SeqParser — phase d2 fragments (alt/opt/loop/par/critical/group/break)', () => {
  type FStart = Extract<ReturnType<typeof SeqParser.parse>['events'][number], { type: 'fragment-start' }>

  it('alt/else/end → paired fragment-start/else/end in SOURCE order, same fragId', () => {
    const m = SeqParser.parse(wrap(
      'participant a\nparticipant b\n'
      + 'alt success\na -> b : ok\nelse failure\na -> b : retry\nend\n'
      + 'a -> b : after'))
    const kinds = m.events.map((e) => e.type)
    expect(kinds).toEqual([
      'fragment-start', 'message', 'fragment-else', 'message',
      'fragment-end', 'message',
    ])
    const fs = m.events[0] as FStart
    expect(fs).toMatchObject({ kind: 'alt', label: 'success' })
    const el = m.events.find((e) => e.type === 'fragment-else')!
    const fe = m.events.find((e) => e.type === 'fragment-end')!
    expect((el as { fragId: number }).fragId).toBe(fs.fragId)
    expect((fe as { fragId: number }).fragId).toBe(fs.fragId)
    expect((el as { label: string }).label).toBe('failure')
    // order is the event-stream index — strictly monotone
    expect(m.events.map((e) => e.order)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('nested fragments pair by fragId across depth (LIFO)', () => {
    const m = SeqParser.parse(wrap(
      'participant a\nparticipant b\n'
      + 'alt outer\nloop 3 times\na -> b : tick\nend\nend'))
    const starts = m.events.filter((e) => e.type === 'fragment-start') as FStart[]
    const ends = m.events.filter((e) => e.type === 'fragment-end')
    expect(starts.map((s) => s.kind)).toEqual(['alt', 'loop'])
    expect(starts[1].label).toBe('3 times')
    // inner `end` closes the loop (LIFO), outer `end` closes the alt
    expect((ends[0] as { fragId: number }).fragId).toBe(starts[1].fragId)
    expect((ends[1] as { fragId: number }).fragId).toBe(starts[0].fragId)
    expect(starts[0].fragId).not.toBe(starts[1].fragId)
  })

  it.each(['opt', 'loop', 'par', 'critical', 'group', 'break'])(
    'parses `%s` fragment (kind lower-cased, label verbatim)', (kw) => {
      const m = SeqParser.parse(wrap(
        `participant a\nparticipant b\n${kw} the label\na -> b : x\nend`))
      const fs = m.events[0] as FStart
      expect(fs).toMatchObject({ type: 'fragment-start', kind: kw, label: 'the label' })
    })

  it('an unterminated fragment fails loud naming the kind + its open line', () => {
    let err: unknown
    try { SeqParser.parse(wrap('participant a\nparticipant b\nalt x\na -> b : ok')) }
    catch (e) { err = e }
    expect(err).toBeInstanceOf(SeqParseError)
    expect((err as SeqParseError).message).toMatch(/unterminated `alt`/)
    expect((err as SeqParseError).message).toMatch(/missing `end`/)
    // line points at the opener (`alt x` is line 4 incl. @startuml)
    expect((err as SeqParseError).line).toBe(4)
  })

  it('an `else` with no open fragment fails loud (not a silent drop)', () => {
    expect(() => SeqParser.parse(wrap('participant a\nparticipant b\nelse oops')))
      .toThrowError(/`else` with no open fragment/)
  })

  it('a stray `end` with no open fragment still fails loud', () => {
    expect(() => SeqParser.parse(wrap('participant a\na -> a : x\nend')))
      .toThrowError(/unexpected `end`/)
  })

  it('participant whose name starts with a fragment keyword is NOT mis-read', () => {
    // `optional`/`parser` etc. — \b after the keyword must not match.
    const m = SeqParser.parse(wrap('participant optional\nparticipant parser\noptional -> parser : x'))
    expect(m.lifelines.map((l) => l.alias)).toEqual(['optional', 'parser'])
    expect(m.events.every((e) => e.type === 'message')).toBe(true)
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

describe('SeqParser — phase d1: `== divider ==`', () => {
  it('parses dividers in source order; trims label; empty ==== ⇒ ""', () => {
    const m = SeqParser.parse(wrap(
      'participant a\nparticipant b\n== Phase 1 ==\na -> b : x\n==  spaced  ==\nb --> a : y\n===='))
    const ev = m.events
    expect(ev.map(e => e.type)).toEqual(['divider', 'message', 'divider', 'message', 'divider'])
    const labels = ev.filter((e): e is SeqDivider => e.type === 'divider').map(d => d.label)
    expect(labels).toEqual(['Phase 1', 'spaced', ''])
    expect(ev.every((e, i) => e.order === i)).toBe(true)   // order = stream index
  })

  it('a divider is NOT a message/note (no from/to leakage)', () => {
    const m = SeqParser.parse(wrap('participant a\nparticipant b\n== X ==\na -> b : m'))
    const d = m.events.find((e): e is SeqDivider => e.type === 'divider')!
    expect(d).toBeDefined()
    expect(Object.keys(d).sort()).toEqual(['label', 'order', 'type'])
  })

  it('the real ibm-wm divider fixture now CONVERTS (phase d1 unblocks downstream)', () => {
    const fixture = '@startuml\ntitle X\nactor "Op" as op\nparticipant c\n'
      + 'op -> c : apply\n== Stage 1 — Born ==\nc --> op : ok\n@enduml'
    const m = SeqParser.parse(fixture)
    const divs = m.events.filter((e): e is SeqDivider => e.type === 'divider')
    expect(divs).toHaveLength(1)
    expect(divs[0].label).toBe('Stage 1 — Born')
    expect(m.events.map(e => e.type)).toEqual(['message', 'divider', 'message'])
  })
})

describe('SeqParser — phase d2b `ref` reference frames', () => {
  it('inline `ref over A,B : text` → a ref event with the over-list + text', () => {
    const m = SeqParser.parse(wrap(
      'participant a\nparticipant b\nparticipant c\n'
      + 'a -> b : go\nref over b, c : see Issuance ADR\nb -> c : next'))
    expect(m.events.map((e) => e.type)).toEqual(['message', 'ref', 'message'])
    const r = m.events.find((e): e is SeqRef => e.type === 'ref')!
    expect(r.lifelines).toEqual(['b', 'c'])
    expect(r.text).toBe('see Issuance ADR')
    expect(r.order).toBe(1)                                  // source-order Y
  })

  it('block `ref over A` … `end ref` accumulates multi-line text', () => {
    const m = SeqParser.parse(wrap(
      'participant a\nparticipant b\n'
      + 'ref over a, b\n  reconcile loop\n  until Ready\nend ref\na -> b : done'))
    const r = m.events.find((e): e is SeqRef => e.type === 'ref')!
    expect(r.lifelines).toEqual(['a', 'b'])
    expect(r.text).toBe('reconcile loop\nuntil Ready')
    expect(m.events.map((e) => e.type)).toEqual(['ref', 'message'])
  })

  it('`ref over` referencing an undeclared lifeline auto-registers it (decl order)', () => {
    const m = SeqParser.parse(wrap('participant a\nref over a, z : x'))
    expect(m.lifelines.map((l) => l.alias)).toEqual(['a', 'z'])
  })

  it('`ref over` with no lifeline fails loud (never a silent drop)', () => {
    expect(() => SeqParser.parse(wrap('participant a\nref over  : x')))
      .toThrowError(/`ref over` needs at least one lifeline/)
  })

  it('an unterminated block `ref over … (no end ref)` fails loud', () => {
    expect(() => SeqParser.parse(wrap('participant a\nref over a\ndangling')))
      .toThrowError(/unterminated `ref over/)
  })
})

describe('SeqParser — phase d2b `create` / `destroy` lifespan', () => {
  const life = (s: ReturnType<typeof SeqParser.parse>) =>
    s.events.filter((e): e is SeqLifecycle =>
      e.type === 'create' || e.type === 'destroy')

  it('`create participant "L" as x` declares the lifeline AND emits a create event', () => {
    const m = SeqParser.parse(wrap(
      'participant a\na -> b : spawn\ncreate participant "Job" as j\na -> j : run'))
    expect(m.lifelines.find((l) => l.alias === 'j')).toMatchObject({ label: 'Job' })
    const l = life(m)
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ type: 'create', lifeline: 'j' })
  })

  it('bare `create X` / `destroy X` auto-register + emit ordered events', () => {
    const m = SeqParser.parse(wrap(
      'participant a\ncreate x\na -> x : go\ndestroy x\na -> a : done'))
    expect(m.lifelines.map((l) => l.alias)).toContain('x')
    expect(life(m).map((e) => e.type)).toEqual(['create', 'destroy'])
    // source order: create(1) < destroy(3)
    expect(m.events.map((e) => e.type)).toEqual(
      ['create', 'message', 'destroy', 'message'])
  })

  it('`create` / `destroy` with no lifeline fails loud (no silent drop)', () => {
    expect(() => SeqParser.parse(wrap('participant a\ndestroy   ')))
      .toThrowError(/`destroy` needs a lifeline/)
    expect(() => SeqParser.parse(wrap('participant a\ncreate participant   ')))
      .toThrowError(/`create participant` with no name/)
  })
})
