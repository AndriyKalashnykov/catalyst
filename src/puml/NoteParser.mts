/**
 * PlantUML `note` callout parser for the STATIC C4 path.
 *
 * `note` is recognised-and-skipped by `EntityParser` (so it is never
 * mis-parsed as an entity) — which meant it was *silently visually
 * dropped*, a contract-lock / no-silent-drop violation. This is a
 * SEPARATE pass over the same source (the StyleParser pattern): it
 * extracts the callouts; `catalyst.mts` then places each one
 * POST-LAYOUT relative to its target node's laid-out box, so ELK and
 * EntityParser are untouched and the static-C4 corpus stays
 * byte-identical by construction.
 *
 * Supported v1 forms (single-line and `… end note` block):
 *   note left|right|top|bottom of <alias> [: text]
 *
 * `note over X[,Y]` is INTENTIONALLY NOT here: fact-checked against
 * PlantUML — `note over` is a SEQUENCE-diagram construct (it needs
 * participants); PlantUML itself errors on `note over` in a static
 * component/deployment (C4-static) diagram. The sequence pipeline has
 * its own `note over` handling (`SeqParser`); this is the C4-box path.
 * Also not v1: floating `note as <id>` + `<id> .. <alias>` link (rare
 * in static C4; remains unrendered — a documented v1 limitation, NOT
 * a regression: it was already dropped).
 */
export type NotePos = 'left' | 'right' | 'top' | 'bottom';

export interface C4Note {
  pos: NotePos;
  /** target alias (the `of` element). */
  targets: string[];
  text: string;
}

const OF_RE = /^note\s+(left|right|top|bottom)\s+of\s+([A-Za-z_][\w]*)\s*(?::\s*(.*))?$/i;
const END_RE = /^end\s*note\b/i;

export function parseNotes(puml: string): C4Note[] {
  const notes: C4Note[] = [];
  let buf: { note: C4Note; lines: string[] } | null = null;

  for (const raw of puml.split('\n')) {
    const line = raw.trim();

    if (buf) {
      if (END_RE.test(line)) {
        buf.note.text = buf.lines.join('\n');
        notes.push(buf.note);
        buf = null;
      } else {
        buf.lines.push(raw.trim());
      }
      continue;
    }
    if (line === '' || line.startsWith("'") || line.startsWith('!')) continue;

    const mOf = OF_RE.exec(line);
    if (mOf) {
      const note: C4Note = {
        pos: mOf[1].toLowerCase() as NotePos,
        targets: [mOf[2]],
        text: (mOf[3] ?? '').trim(),
      };
      if (mOf[3] === undefined) buf = { note, lines: [] };  // block form
      else notes.push(note);
      continue;
    }
  }
  return notes;
}
