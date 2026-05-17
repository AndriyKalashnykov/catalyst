/**
 * Sequence-diagram converter (ADR 0007, phase b) — the dispatch target
 * that replaces `catalyst.mts`'s fail-loud `throw` for sequence input.
 *
 * parse → deterministic linear layout → draw.io emit. Each stage is a
 * separate, independently-tested module; `SeqParser.parse` itself
 * fail-louds (throws `SeqParseError`) on a v2-deferred construct or
 * malformed input, so this orchestrator stays a thin pipe and the
 * fail-loud contract is preserved end-to-end.
 */
import { SeqParser } from './SeqParser.mjs'
import { layoutSeq } from './seqLayout.mjs'
import { buildSeqDoc, serializeSeq } from '../mx/seq/Lifeline.mjs'

export class SeqConverter {
  /** @throws {SeqParseError} on a v2-deferred/malformed construct
   *          (propagated from `SeqParser` — never a silent drop). */
  static convert(pumlContent: string): string {
    const model = SeqParser.parse(pumlContent)
    const layout = layoutSeq(model)
    return serializeSeq(buildSeqDoc(layout))
  }
}
