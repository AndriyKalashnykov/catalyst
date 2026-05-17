import { describe, it, expect } from 'vitest'
import { Catalyst } from '../src/catalyst.mjs'

// P8 — an element whose `$tags` match an `AddElementTag` declaration
// renders those tag(s) as `«tag»` stereotype segment(s) BEFORE the
// `«type»` line, exactly as C4-PlantUML does (e.g. `«critical»«System»`).
// Real pipeline (no mocks). Contract:
//   - `c4Type` (the golden/parity fingerprint attribute) stays the bare
//     structural type — never polluted with the stereotype.
//   - `c4Stereotype` carries `tag»«` per matched tag so the spliced
//     `«%c4Stereotype%%c4Type%»` placeholder renders `«tag»«Type»`.
//   - An element with no matching tag emits NO `c4Stereotype` attribute,
//     so untagged output stays byte-for-byte identical.
//   - A `$tags` value with no `AddElementTag` declaration is NOT a
//     stereotype (PlantUML only stereotypes declared tags).

const tagged = `@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/v2.13.0/C4_Context.puml
AddElementTag("critical", $bgColor="#c0392b")
AddElementTag("audited", $bgColor="#27ae60")
System(t, "Tagged", "d", $tags="critical")
System(m, "Multi", "d", $tags="critical+audited")
System(u, "Untagged", "d")
System(x, "Undeclared", "d", $tags="ghost")
@enduml`

describe('P8 — element-tag stereotypes', () => {
  it('emits c4Stereotype for a matched tag, keeping c4Type structural', async () => {
    const xml = await Catalyst.convert(tagged)
    const obj = /<object\b[^>]*c4Name="Tagged"[^>]*>/.exec(xml)![0]
    expect(/\bc4Type="System"/.test(obj)).toBe(true)            // structural, golden-safe
    expect(/\bc4Stereotype="critical»«"/.test(obj)).toBe(true)   // → «critical»«System»
    expect(xml.includes('«%c4Stereotype%%c4Type%»')).toBe(true)  // label spliced
  })

  it('chains multiple matched tags in authored order', async () => {
    const xml = await Catalyst.convert(tagged)
    const obj = /<object\b[^>]*c4Name="Multi"[^>]*>/.exec(xml)![0]
    expect(/\bc4Stereotype="critical»«audited»«"/.test(obj)).toBe(true) // «critical»«audited»«System»
  })

  it('does NOT emit c4Stereotype for an untagged element (byte-stable)', async () => {
    const xml = await Catalyst.convert(tagged)
    const obj = /<object\b[^>]*c4Name="Untagged"[^>]*>/.exec(xml)![0]
    expect(/c4Stereotype=/.test(obj)).toBe(false)
  })

  it('ignores a $tags value with no AddElementTag declaration', async () => {
    const xml = await Catalyst.convert(tagged)
    const obj = /<object\b[^>]*c4Name="Undeclared"[^>]*>/.exec(xml)![0]
    expect(/c4Stereotype=/.test(obj)).toBe(false)
  })
})
