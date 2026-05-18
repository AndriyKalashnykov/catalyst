/**
 * C4-PlantUML `SetPropertyHeader` / `AddProperty` / `WithoutPropertyHeader`
 * parser for the STATIC C4 path.
 *
 * Fact-checked vs pinned C4-PlantUML v2.13.0 `C4.puml`:
 *   SetPropertyHeader($c1,$c2="",$c3="",$c4="")   → up to 4 column heads
 *   AddProperty($c1,$c2="",$c3="",$c4="")         → accumulates a row
 *   WithoutPropertyHeader()                        → clears the header
 * The accumulated table is consumed (and cleared) by the **NEXT element
 * declaration** — `$getProps()` runs inside `$getElementBase()`. So a
 * `SetPropertyHeader`/`AddProperty` block attaches to whichever element
 * macro is declared immediately after it.
 *
 * Separate pass (the StyleParser/NoteParser pattern): EntityParser
 * skip-lists these directives, so they were silently dropped. The
 * extracted table is rendered POST-LAYOUT next to its element
 * (`catalyst.mts`) ⇒ ELK/EntityParser untouched, static-C4 corpus
 * byte-identical by construction.
 */
export interface C4PropertyTable {
  /** column headers (1–4); empty array = headerless. */
  header: string[];
  /** rows, each 1–4 cells. */
  rows: string[][];
}

const ELEMENT_RE =
  /^(?:Person|System|Container|Component|Deployment_Node|Node)(?:Db|Queue)?(?:_Ext)?(?:_[LR])?\s*\(\s*"?([A-Za-z_][\w]*)"?/;

/** `a, "b, c", d` → ['a','b, c','d'] (comma-split respecting quotes). */
function splitArgs(inner: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (const ch of inner) {
    if (ch === '"') { q = !q; cur += ch; }
    else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim() !== '' || out.length) out.push(cur.trim());
  return out;
}
const unq = (s: string): string =>
  s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;

export function parseProperties(puml: string): Map<string, C4PropertyTable> {
  const byAlias = new Map<string, C4PropertyTable>();
  let header: string[] = [];
  let rows: string[][] = [];

  for (const raw of puml.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith("'") || line.startsWith('!')) continue;

    let m = /^SetPropertyHeader\s*\((.*)\)\s*$/.exec(line);
    if (m) { header = splitArgs(m[1]).map(unq).filter((s, i) => i === 0 || s !== ''); continue; }
    if (/^WithoutPropertyHeader\s*\(\s*\)\s*$/.test(line)) { header = []; continue; }
    m = /^AddProperty\s*\((.*)\)\s*$/.exec(line);
    if (m) { rows.push(splitArgs(m[1]).map(unq)); continue; }

    // First element declaration after a block consumes + clears it
    // (mirrors $getProps()). Empty pending table → element unaffected.
    const el = ELEMENT_RE.exec(line);
    if (el && rows.length > 0) {
      byAlias.set(el[1], { header, rows });
      header = [];
      rows = [];
    }
  }
  return byAlias;
}
