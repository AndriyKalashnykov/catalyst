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
const SEQ = `@startuml d
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/v2.13.0/C4_Sequence.puml
title Cert lifecycle
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
deactivate ctl
@enduml`

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
})
