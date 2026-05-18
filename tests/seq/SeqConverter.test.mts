import { describe, it, expect } from 'vitest'
import xml2js from 'xml2js'
import { Catalyst } from '../../src/catalyst.mjs'

/**
 * Whole-path emit contract for the sequence pipeline (ADR 0007 phase b,
 * test-strategy #2): real `Catalyst.convert()` end-to-end — parser →
 * `seqLayout` → `Lifeline` emit — asserting the two ordering invariants
 * (declaration order → lifeline X-index; source order → monotone
 * message Y) plus arrowhead kinds, title, note, activation, self-loop.
 * A unit test on a helper could pass while the dispatch seam silently
 * bypassed it — this is the whole path, like output-correctness.
 */
// One place per file holds the C4-PlantUML include URL. The pinned
// `C4-PlantUML/vX.Y.Z/` version literal in the string below is retained
// verbatim ON PURPOSE — renovate.json customManager #4
// (managerFilePatterns `/^tests/.*\.mts$/`) regex-bumps it in lock-step
// with every .puml/.mts occurrence; single-const'ing it would HIDE it
// from that regex manager (memory `c4-plantuml-renovate-tracked`). The
// `vX.Y.Z` here is deliberately non-matching so the comment is not a
// second tracked occurrence.
const seqDoc = (body: string) =>
  '@startuml d\n'
  + '!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/v2.13.0/C4_Sequence.puml\n'
  + `${body}\n@enduml`

const SEQ = seqDoc(`title Cert lifecycle
participant "Operator" as op
participant "Controller" as ctl
participant "Vault" as v
op -> ctl : request
activate ctl
ctl ->> v : issue
v --> ctl : cert
ctl -> ctl : self check
note over ctl : reconcile
ctl -> op : done
deactivate ctl`)

describe('SeqConverter — whole-path emit contract (ADR 0007)', () => {
  it('lifelines emit in DECLARATION order on X', async () => {
    const xml = await Catalyst.convert(SEQ)
    const order = [...xml.matchAll(/id="ll-([^"]*)"/g)].map((m) => m[1])
    expect(order).toEqual(['op', 'ctl', 'v'])
    expect((xml.match(/shape=umlLifeline/g) ?? []).length).toBe(3)
  })

  it('messages emit in SOURCE order at monotone non-decreasing Y', async () => {
    const xml = await Catalyst.convert(SEQ)
    const ys = [...xml.matchAll(/id="seq-msg-\d+"[\s\S]*?y="(\d+)"[^>]*as="sourcePoint"/g)]
      .map((m) => +m[1])
    expect(ys.length).toBe(5)                              // 5 messages
    expect(ys.every((v, i) => i === 0 || v >= ys[i - 1])).toBe(true)
  })

  it('arrowheads map per message kind (sync/async/return)', async () => {
    const xml = await Catalyst.convert(SEQ)
    expect(xml).toContain('endArrow=block;endFill=1')      // sync  `->`
    expect(xml).toContain('endArrow=open;endFill=0')       // async `->>` / return
    expect(xml).toContain('dashed=1')                      // return `-->`
  })

  it('title, note, activation bar and a self-loop are all emitted', async () => {
    const xml = await Catalyst.convert(SEQ)
    expect(xml).toMatch(/id="seq-title-/)                  // PlantUML title traced
    expect(xml).toContain('shape=note')                    // note over ctl
    expect((xml.match(/id="seq-act-/g) ?? []).length).toBe(1) // activate/deactivate
    expect(xml).toContain('as="points"')                   // ctl->ctl self-loop route
  })

  it('output is strict-XML well-formed (downstream renderer contract)', async () => {
    const xml = await Catalyst.convert(SEQ)
    await expect(xml2js.parseStringPromise(xml)).resolves.toBeDefined()
  })

  // phase d1: `== divider ==` emits a full-width band, Y-ordered with
  // the surrounding messages (source order → monotone Y, unchanged).
  it('dividers emit as full-width bands interleaved in source order', async () => {
    const xml = await Catalyst.convert(seqDoc(`participant "A" as a
participant "B" as b
== Setup ==
a -> b : init
== Work ==
b --> a : done`))
    expect((xml.match(/id="seq-divider-/g) ?? []).length).toBe(2)
    // band spans the full canvas: x=0, width = pageWidth
    const pw = +(/pageWidth="(\d+)"/.exec(xml) ?? [])[1]
    const band = /id="seq-divider-0"[\s\S]*?<mxGeometry x="0" y="(\d+)" width="(\d+)"/.exec(xml)
    expect(band).not.toBeNull()
    expect(+band![2]).toBe(pw)                               // full-width
    // "Setup" divider Y < "Work" divider Y (source order preserved)
    const ys = [...xml.matchAll(/id="seq-divider-\d+"[\s\S]*?<mxGeometry x="0" y="(\d+)"/g)]
      .map((m) => +m[1])
    expect(ys[0]).toBeLessThan(ys[1])
    await expect(xml2js.parseStringPromise(xml)).resolves.toBeDefined()
  })

  // phase d2: combined fragments. Whole-path contract — real convert(),
  // assert the frame box, kind tab, else separator, nesting containment,
  // BEHIND-messages z-order, and that message source-order is unchanged.
  const FRAG = seqDoc(`participant "A" as a
participant "B" as b
alt success
a -> b : ok
loop 2 times
b --> a : tick
end
else failure
a -> b : retry
end
a -> b : after`)

  it('fragments emit a frame box + kind tab + else separator', async () => {
    const xml = await Catalyst.convert(FRAG)
    expect((xml.match(/id="seq-frag-\d+"/g) ?? []).length).toBe(2)   // alt + loop
    const tabs = [...xml.matchAll(/id="seq-frag-tab-\d+"[^>]*value="([^"]*)"/g)]
      .map((m) => m[1])
    expect(tabs.sort()).toEqual(['alt', 'loop'])
    // else separator carries the alternative guard as its edge label
    expect(xml).toMatch(/id="seq-frag-else-\d+"[^>]*value="failure"/)
    expect(xml).toMatch(/id="seq-frag-guard-\d+"[^>]*value="success"/)
    await expect(xml2js.parseStringPromise(xml)).resolves.toBeDefined()
  })

  it('fragment frames render BEHIND messages (document/z-order)', async () => {
    const xml = await Catalyst.convert(FRAG)
    const firstFrag = xml.indexOf('id="seq-frag-')
    const firstMsg = xml.indexOf('id="seq-msg-')
    expect(firstFrag).toBeGreaterThanOrEqual(0)
    expect(firstFrag).toBeLessThan(firstMsg)
  })

  it('a nested fragment is strictly inside its enclosing frame', async () => {
    const xml = await Catalyst.convert(FRAG)
    const boxes = [...xml.matchAll(
      /id="seq-frag-(\d+)"[\s\S]*?<mxGeometry x="(-?\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)]
      .map((m) => ({ x: +m[2], y: +m[3], w: +m[4], h: +m[5] }))
    expect(boxes.length).toBe(2)
    // outer (alt) emitted first (lower order) → boxes[0]; loop nested in it
    const [outer, inner] = boxes
    expect(inner.x).toBeGreaterThanOrEqual(outer.x)
    expect(inner.x + inner.w).toBeLessThanOrEqual(outer.x + outer.w)
    expect(inner.y).toBeGreaterThanOrEqual(outer.y)
    expect(inner.y + inner.h).toBeLessThanOrEqual(outer.y + outer.h)
  })

  it('messages stay in SOURCE order with fragments present (no regression)', async () => {
    const xml = await Catalyst.convert(FRAG)
    const ys = [...xml.matchAll(/id="seq-msg-\d+"[\s\S]*?y="(\d+)"[^>]*as="sourcePoint"/g)]
      .map((m) => +m[1])
    expect(ys.length).toBe(4)                              // ok, tick, retry, after
    expect(ys.every((v, i) => i === 0 || v >= ys[i - 1])).toBe(true)
  })
})
