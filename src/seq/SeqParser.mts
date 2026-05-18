/**
 * PlantUML / C4-PlantUML sequence-diagram parser (ADR 0007, phase a).
 *
 * Produces the ordered {@link SeqModel}: lifelines in DECLARATION order
 * (the X axis) and a single SOURCE-ordered event stream (the Y axis).
 * Pure & side-effect free — unit-testable without layout/emit/ELK.
 *
 * Grammar fact-checked 2026-05-17 against the real
 * `ibm-wm/sequence-leaf-cert-lifecycle.puml` and the pinned C4-PlantUML
 * v2.13.0 `C4_Sequence.puml` macro surface (see ADR 0007 §Fact-check).
 *
 * v1 scope: raw `participant`/`actor` + every C4 lifeline macro
 * (`Person`/`System`/`Container`/`Component` + `Db`/`Queue`/`_Ext`);
 * `->`,`-->`,`->>`,`<-` raw arrows + `Rel`/`Rel_Back`/`BiRel`; `title`;
 * `autonumber`; `activate`/`deactivate`; `note left|right|over`
 * (single-line and `… end note` block).
 *
 * Phase d1 adds `== divider ==`; phase d2 adds the combined/grouped
 * fragments `alt/else/opt/loop/par/critical/group/break` (nested),
 * parsed into paired `fragment-start|else|end` events; phase d2b adds
 * `ref over` reference frames and `create`/`destroy` lifeline lifespan.
 *
 * DEFERRED to a later phase — the parser FAILS LOUD (never silently
 * drops, per the contract-lock rule) naming the exact token + line:
 * `box`/`Boundary*` lifeline grouping.
 */
import type {
  SeqModel, SeqEvent, Lifeline, ArrowKind,
} from './SeqModel.interface.mjs'

export class SeqParseError extends Error {
  constructor(message: string, public readonly line: number) {
    super(message)
    this.name = 'SeqParseError'
  }
}

/** C4 sequence lifeline macros (v2.13.0). Container/Component variants
 *  carry `$techn` as arg index 2; the rest do not. */
const C4_TECHN_KINDS = new Set([
  'Container', 'Container_Ext', 'ContainerDb', 'ContainerDb_Ext',
  'ContainerQueue', 'ContainerQueue_Ext',
  'Component', 'Component_Ext', 'ComponentDb', 'ComponentDb_Ext',
  'ComponentQueue', 'ComponentQueue_Ext',
])
const C4_PLAIN_KINDS = new Set([
  'Person', 'Person_Ext',
  'System', 'System_Ext', 'SystemDb', 'SystemDb_Ext',
  'SystemQueue', 'SystemQueue_Ext',
])
const C4_LIFELINE_KINDS = new Set([...C4_TECHN_KINDS, ...C4_PLAIN_KINDS])

/** v2-deferred constructs. Each maps a detector to the precise,
 *  token-naming fail-loud message (so downstream sees a clear error,
 *  not a wrong diagram). Order matters: most specific first. */
const DEFERRED: { re: RegExp; what: string }[] = [
  // NB: `== divider ==` (d1), `alt/opt/loop/par/critical/group/break`
  // + `else` (d2), `ref` (d2b) and `create`/`destroy` (d2b) are parsed
  // below, NOT in this fail-loud list. `box`/`Boundary` remain
  // deferred to a later phase.
  { re: /^\s*box\b/i, what: '`box` lifeline grouping' },
  { re: /^\s*end\s+box\b/i, what: '`end box`' },
  { re: /^\s*(Enterprise_Boundary|System_Boundary|Container_Boundary|Boundary)\s*\(/, what: 'C4 sequence `Boundary(...)` grouping' },
  { re: /^\s*Boundary_End\s*\(/, what: '`Boundary_End()`' },
]

/** Arrow token → (kind, reversed). Longest tokens first so `-->>`
 *  is not mis-split as `-->`. `bi` ignores direction. */
const ARROWS: { tok: string; kind: ArrowKind; rev: boolean }[] = [
  { tok: '<-->', kind: 'bi', rev: false },
  { tok: '<->', kind: 'bi', rev: false },
  { tok: '-->>', kind: 'async', rev: false },
  { tok: '->>', kind: 'async', rev: false },
  { tok: '-->', kind: 'return', rev: false },
  { tok: '<--', kind: 'return', rev: true },
  { tok: '->', kind: 'sync', rev: false },
  { tok: '<-', kind: 'sync', rev: true },
]

/** Split a macro arg list on commas NOT inside double quotes. */
function splitArgs(inner: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (const ch of inner) {
    if (ch === '"') { q = !q; cur += ch }
    else if (ch === ',' && !q) { out.push(cur.trim()); cur = '' }
    else cur += ch
  }
  if (cur.trim() !== '' || out.length) out.push(cur.trim())
  return out
}

const unquote = (s: string): string =>
  s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s

export class SeqParser {
  /** Parse PlantUML/C4 sequence source into the ordered model.
   *  @throws {SeqParseError} on a v2-deferred construct or malformed
   *          message (precise, token-naming — never a silent drop). */
  static parse(src: string): SeqModel {
    const lifelines: Lifeline[] = []
    const byAlias = new Map<string, Lifeline>()
    const events: SeqEvent[] = []
    let title: string | undefined
    let autonumber = false
    // Open-fragment stack (LIFO) for `alt/opt/loop/par/critical/group/
    // break` … optional `else` … `end`. `fragId` is a monotone counter
    // pairing a fragment's three marker kinds across nesting depth.
    const fragStack: { fragId: number; kind: string; lineNo: number }[] = []
    let fragSeq = 0
    const FRAGMENT_KW = /^(alt|opt|loop|par|critical|group|break)\b\s*(.*)$/i

    const addLifeline = (alias: string, label: string, kind: string, technology?: string): void => {
      if (byAlias.has(alias)) return
      const ll: Lifeline = { alias, label, kind, index: lifelines.length }
      if (technology) ll.technology = technology
      lifelines.push(ll)
      byAlias.set(alias, ll)
    }
    // PlantUML auto-creates an undeclared participant on first message
    // use, in encounter order — preserves the decl-order→X invariant.
    const ensure = (alias: string): void => {
      if (!byAlias.has(alias)) addLifeline(alias, alias, 'participant')
    }

    const rawLines = src.split(/\r?\n/)
    let inBlockComment = false
    let noteBuf: { ev: Extract<SeqEvent, { type: 'note' }>; lines: string[] } | null = null
    // Block-form `ref over A,B` … `end ref` accumulator (phase d2b),
    // mirroring noteBuf — text accrues until the terminating `end ref`.
    let refBuf: { ev: Extract<SeqEvent, { type: 'ref' }>; lines: string[] } | null = null

    for (let i = 0; i < rawLines.length; i++) {
      const lineNo = i + 1
      let line = rawLines[i]

      // Block comment /' … '/ (may span lines).
      if (inBlockComment) {
        if (line.includes("'/")) { line = line.slice(line.indexOf("'/") + 2); inBlockComment = false }
        else continue
      }
      const bc = line.indexOf("/'")
      if (bc !== -1) {
        const close = line.indexOf("'/", bc + 2)
        if (close !== -1) line = line.slice(0, bc) + line.slice(close + 2)
        else { line = line.slice(0, bc); inBlockComment = true }
      }

      const t = line.trim()

      // Inside a multi-line note block: accumulate until `end note`.
      if (noteBuf) {
        if (/^end\s*note\b/i.test(t)) {
          noteBuf.ev.text = noteBuf.lines.join('\n')
          events.push(noteBuf.ev)
          noteBuf = null
        } else {
          noteBuf.lines.push(rawLines[i].trim())
        }
        continue
      }

      // Inside a block `ref over …`: accumulate until `end ref`.
      if (refBuf) {
        if (/^end\s+ref\b/i.test(t)) {
          refBuf.ev.text = refBuf.lines.join('\n')
          events.push(refBuf.ev)
          refBuf = null
        } else {
          refBuf.lines.push(rawLines[i].trim())
        }
        continue
      }

      if (t === '') continue
      if (t.startsWith("'")) continue                       // line comment
      if (/^@(start|end)uml\b/i.test(t)) continue
      if (t.startsWith('!')) continue                       // !include / !define / preprocessor
      if (/^(skinparam|hide|show|!theme|!pragma|mainframe|footer|header|left header|legend|end legend)\b/i.test(t)) continue
      // C4 display toggles — valid v1, no ordering effect.
      if (/^(SHOW_ELEMENT_DESCRIPTIONS|SHOW_FOOT_BOXES|SHOW_INDEX|LAYOUT_[A-Z_]+|SET_[A-Z_]+|AddElementTag|AddRelTag|UpdateElementStyle|skinparamSequence)\s*\(/.test(t)) continue

      // `== label ==` divider (phase d1) — a full-width band at this
      // source-order Y. Parsed BEFORE the deferred guard so it is
      // consumed, not failed-loud. `==` fences with the label between;
      // an empty label (`====`) is legal (a plain separator line).
      const div = /^==+(.*?)==+$/.exec(t)
      if (div) {
        events.push({ type: 'divider', label: div[1].trim(), order: events.length })
        continue
      }

      // `create [participant|actor] X` / `destroy X` (phase d2b) —
      // lifeline lifespan markers, source-ordered like activate (no
      // own Y row). `create` may carry a declaration; both ensure the
      // lifeline. Parsed BEFORE the deferred guard.
      const mLife = /^(create|destroy)\b\s*(.*)$/i.exec(t)
      if (mLife) {
        const kind = mLife[1].toLowerCase() as 'create' | 'destroy'
        const rest = mLife[2].trim()
        const mDeclKw = /^(participant|actor|boundary|control|entity|database|collections|queue)\b\s*(.*)$/i.exec(rest)
        let alias: string
        if (kind === 'create' && mDeclKw) {
          const dk = mDeclKw[1].toLowerCase()
          const r = mDeclKw[2].trim()
          let label: string
          const mAs = /^(.*?)\s+as\s+([A-Za-z_][\w]*)\s*$/i.exec(r)
          if (mAs) { label = unquote(mAs[1].trim()); alias = mAs[2].trim() }
          else { alias = unquote(r).replace(/\s+/g, '_'); label = unquote(r) }
          if (!alias) {
            throw new SeqParseError(
              `sequence: \`create ${dk}\` with no name (line ${lineNo}).`, lineNo)
          }
          addLifeline(alias, label || alias, dk === 'actor' ? 'actor' : 'participant')
        } else {
          alias = unquote(rest)
          if (!alias) {
            throw new SeqParseError(
              `sequence: \`${kind}\` needs a lifeline (line ${lineNo}: `
              + `"${t}"). This is a fail-loud guard, not a silent drop.`, lineNo)
          }
          ensure(alias)
        }
        events.push({ type: kind, lifeline: alias, order: events.length })
        continue
      }

      // `ref over A[,B…] [: text]` (phase d2b) — a self-contained
      // labelled box spanning the named lifelines at this source-order
      // Y. Inline (`: text`) or block (`ref over A` … `end ref`).
      // Parsed BEFORE the deferred guard so it is consumed, not failed.
      const mRef = /^ref\s+over\b\s*(.*)$/i.exec(t)
      if (mRef) {
        const rest = mRef[1].trim()
        const colon = rest.indexOf(':')
        const head = (colon === -1 ? rest : rest.slice(0, colon)).trim()
        const lls = head ? head.split(',').map((s) => unquote(s.trim())).filter(Boolean) : []
        if (!lls.length) {
          throw new SeqParseError(
            `sequence: \`ref over\` needs at least one lifeline (line `
            + `${lineNo}: "${t}").`, lineNo)
        }
        lls.forEach(ensure)
        const ev = {
          type: 'ref' as const, lifelines: lls,
          text: colon === -1 ? '' : rest.slice(colon + 1).trim(),
          order: events.length,
        }
        if (colon === -1) refBuf = { ev, lines: [] }       // block form
        else events.push(ev)                                // single-line
        continue
      }

      // --- fragments (phase d2): alt/opt/loop/par/critical/group/break,
      // optional `else` compartments, closed by a matching `end`.
      // Parsed BEFORE the deferred guard so they are consumed, and
      // BEFORE the message/macro grammar so a fragment keyword is never
      // mis-read as a participant or message. Nesting via fragStack.
      const mFrag = FRAGMENT_KW.exec(t)
      if (mFrag) {
        const fragId = fragSeq++
        fragStack.push({ fragId, kind: mFrag[1].toLowerCase(), lineNo })
        events.push({
          type: 'fragment-start', kind: mFrag[1].toLowerCase(),
          label: mFrag[2].trim(), fragId, order: events.length,
        })
        continue
      }
      const mElse = /^else\b\s*(.*)$/i.exec(t)
      if (mElse) {
        const top = fragStack[fragStack.length - 1]
        if (!top) {
          throw new SeqParseError(
            `sequence: \`else\` with no open fragment (line ${lineNo}: `
            + `"${t}"). This is a fail-loud guard, not a silent drop.`, lineNo)
        }
        events.push({
          type: 'fragment-else', fragId: top.fragId,
          label: mElse[1].trim(), order: events.length,
        })
        continue
      }
      // `end` closing the most-recently-opened fragment (note blocks are
      // consumed above; `end box` stays deferred and is unreachable
      // because `box` itself fails loud at its opener).
      if (/^end\b/i.test(t) && !/^end\s*note\b/i.test(t)
          && !/^end\s+box\b/i.test(t) && fragStack.length) {
        const top = fragStack.pop()!
        events.push({ type: 'fragment-end', fragId: top.fragId, order: events.length })
        continue
      }

      // deferred → fail loud, naming the token + line.
      for (const d of DEFERRED) {
        if (d.re.test(t)) {
          throw new SeqParseError(
            `sequence: ${d.what} is not supported in v1 (ADR 0007 — `
            + `deferred to v2). Line ${lineNo}: "${t}". This is a `
            + `fail-loud guard, not a silent drop.`, lineNo)
        }
      }
      // A bare `end` here can only be a fragment/box close (note blocks
      // are consumed above) → the deferred opener was missed; fail loud.
      if (/^end\b/i.test(t) && !/^end\s*note\b/i.test(t)) {
        throw new SeqParseError(
          `sequence: unexpected \`end\` (line ${lineNo}: "${t}") — a `
          + `fragment/box close with no v1-supported opener.`, lineNo)
      }

      // title …
      const mTitle = /^title\s+(.+)$/i.exec(t)
      if (mTitle) { title = mTitle[1].trim(); continue }

      // autonumber [start [step]] ["format"] | autonumber stop|resume
      if (/^autonumber\b/i.test(t)) { autonumber = true; continue }

      // activate / deactivate X
      const mAct = /^(activate|deactivate)\s+(.+)$/i.exec(t)
      if (mAct) {
        const alias = unquote(mAct[2].trim())
        ensure(alias)
        events.push({
          type: mAct[1].toLowerCase() as 'activate' | 'deactivate',
          lifeline: alias, order: events.length,
        })
        continue
      }

      // note left|right [of X] : text   /   note over X[,Y] : text
      // note left|right|over …            (block, until `end note`)
      const mNote = /^[rh]?note\s+(left|right|over)\b(.*)$/i.exec(t)
      if (mNote) {
        const position = mNote[1].toLowerCase() as 'left' | 'right' | 'over'
        let rest = mNote[2].trim()
        let lls: string[] = []
        if (position === 'over') {
          const colon = rest.indexOf(':')
          const head = (colon === -1 ? rest : rest.slice(0, colon)).trim()
          lls = head ? head.split(',').map((s) => unquote(s.trim())) : []
          rest = colon === -1 ? '' : rest.slice(colon + 1).trim()
        } else {
          const mOf = /^of\s+([^:]+?)\s*(?::\s*(.*))?$/i.exec(rest)
          if (mOf) {
            lls = [unquote(mOf[1].trim())]
            rest = (mOf[2] ?? '').trim()
          } else {
            const colon = rest.indexOf(':')
            rest = colon === -1 ? '' : rest.slice(colon + 1).trim()
          }
        }
        lls.forEach(ensure)
        const ev = {
          type: 'note' as const, position, lifelines: lls,
          text: rest, order: events.length,
        }
        const colon = mNote[2].indexOf(':')
        if (colon === -1) noteBuf = { ev, lines: [] }   // block form
        else events.push(ev)                            // single-line
        continue
      }

      // C4 lifeline macro: Kind(alias, "label"[, techn|descr…])
      const mMacro = /^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*$/.exec(t)
      if (mMacro && C4_LIFELINE_KINDS.has(mMacro[1])) {
        const kind = mMacro[1]
        const args = splitArgs(mMacro[2])
        const alias = unquote((args[0] ?? '').trim())
        if (!alias) {
          throw new SeqParseError(
            `sequence: ${kind}(...) with no alias (line ${lineNo}).`, lineNo)
        }
        const label = unquote((args[1] ?? alias).trim()) || alias
        const techn = C4_TECHN_KINDS.has(kind)
          ? unquote((args[2] ?? '').trim()) || undefined
          : undefined
        addLifeline(alias, label, kind, techn)
        continue
      }

      // C4 message macros: Rel/Rel_Back/BiRel($from,$to,$label,$techn,…)
      const mRel = /^(BiRel|Rel_Back|Rel|Rel_U|Rel_D|Rel_L|Rel_R)\s*\((.*)\)\s*$/.exec(t)
      if (mRel) {
        const macro = mRel[1]
        const a = splitArgs(mRel[2])
        let from = unquote((a[0] ?? '').trim())
        let to = unquote((a[1] ?? '').trim())
        if (!from || !to) {
          throw new SeqParseError(
            `sequence: ${macro}(...) needs $from,$to (line ${lineNo}).`, lineNo)
        }
        if (macro === 'Rel_Back') { const s = from; from = to; to = s }
        const arrow: ArrowKind = macro === 'BiRel' ? 'bi' : 'sync'
        ensure(from); ensure(to)
        const label = unquote((a[2] ?? '').trim())
        const technology = unquote((a[3] ?? '').trim()) || undefined
        events.push({
          type: 'message', from, to, label,
          ...(technology ? { technology } : {}),
          arrow, activateTarget: false, deactivateSource: false,
          order: events.length,
        })
        continue
      }

      // raw participant / actor declaration:  participant "L" as a | actor a
      const mDecl = /^(participant|actor|boundary|control|entity|database|collections|queue)\b\s*(.*)$/i.exec(t)
      if (mDecl) {
        const kind = mDecl[1].toLowerCase()
        let rest = mDecl[2].trim()
        let label: string, alias: string
        const mAs = /^(.*?)\s+as\s+([A-Za-z_][\w]*)\s*$/i.exec(rest)
        if (mAs) { label = unquote(mAs[1].trim()); alias = mAs[2].trim() }
        else { alias = unquote(rest).replace(/\s+/g, '_'); label = unquote(rest) }
        if (!alias) {
          throw new SeqParseError(
            `sequence: ${kind} declaration with no name (line ${lineNo}).`, lineNo)
        }
        addLifeline(alias, label || alias, kind === 'actor' ? 'actor' : 'participant')
        continue
      }

      // raw message:  A -> B [: label]   (arrow tokens, longest-first)
      const arrowHit = SeqParser.findArrow(t)
      if (arrowHit) {
        const { idx, spec } = arrowHit
        const lhs = t.slice(0, idx).trim()
        let rhsAll = t.slice(idx + spec.tok.length)
        let label = ''
        const colon = rhsAll.indexOf(':')
        if (colon !== -1) { label = rhsAll.slice(colon + 1).trim(); rhsAll = rhsAll.slice(0, colon) }
        let rhs = rhsAll.trim()
        // activation shorthand: trailing ++ / -- / ** / ! after target
        let activateTarget = false, deactivateSource = false
        const mSfx = /\s*(\+\+|--|\*\*|!)\s*$/.exec(rhs)
        if (mSfx) {
          if (mSfx[1] === '++') activateTarget = true
          else if (mSfx[1] === '--') deactivateSource = true
          rhs = rhs.slice(0, mSfx.index).trim()
        }
        const L = unquote(lhs), R = unquote(rhs)
        if (!L || !R) {
          throw new SeqParseError(
            `sequence: malformed message (line ${lineNo}: "${t}") — `
            + `expected "A ${spec.tok} B [: label]".`, lineNo)
        }
        const from = spec.rev ? R : L
        const to = spec.rev ? L : R
        ensure(from); ensure(to)
        events.push({
          type: 'message', from, to, label,
          arrow: spec.kind, activateTarget, deactivateSource,
          order: events.length,
        })
        continue
      }

      // Anything else unrecognised → fail loud (never silently drop).
      throw new SeqParseError(
        `sequence: unrecognised construct (line ${lineNo}: "${t}"). `
        + `If this is a valid v1 construct it is a parser gap; if it `
        + `is a fragment/divider it is v2-deferred (ADR 0007).`, lineNo)
    }

    if (noteBuf) {
      throw new SeqParseError(
        'sequence: unterminated `note … end note` block.', rawLines.length)
    }
    if (refBuf) {
      throw new SeqParseError(
        'sequence: unterminated `ref over … end ref` block.', rawLines.length)
    }
    if (fragStack.length) {
      const f = fragStack[fragStack.length - 1]
      throw new SeqParseError(
        `sequence: unterminated \`${f.kind}\` fragment opened on line `
        + `${f.lineNo} — missing \`end\`. This is a fail-loud guard, `
        + `not a silent drop.`, f.lineNo)
    }
    if (lifelines.length === 0) {
      throw new SeqParseError(
        'sequence: no participants/lifelines found.', 0)
    }
    return {
      ...(title ? { title } : {}),
      autonumber,
      lifelines,
      events,
    }
  }

  /** Earliest arrow token in the line (longest-match at equal index
   *  via the longest-first {@link ARROWS} order), or null. The real
   *  arrow always precedes the `:` label, so an arrow-looking glyph
   *  inside the label can never win on the earliest-index rule. */
  private static findArrow(line: string): { idx: number; spec: typeof ARROWS[number] } | null {
    const scan = line
    let best: { idx: number; spec: typeof ARROWS[number] } | null = null
    for (const spec of ARROWS) {
      const idx = scan.indexOf(spec.tok)
      if (idx === -1) continue
      // earliest position wins; at equal pos the longer token wins
      // (ARROWS is longest-first, so first hit at the min idx is best)
      if (best === null || idx < best.idx) best = { idx, spec }
    }
    return best
  }
}
