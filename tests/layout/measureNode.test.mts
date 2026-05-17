import { describe, it, expect } from 'vitest';
import { measureNode } from '../../src/layout/measureNode.mjs';
import { PUML_LEAF_BOX, CYLINDER3_CAP_PX, PUML_FONT } from '../../src/mx/c4/theme.mjs';
import { textWidth } from '../../src/text/TextMetrics.mjs';
import type { EntityDescriptor } from '../../src/puml/EntityDescriptor.interface.mjs';

// A wide single-line title makes the box wide enough that each short
// description segment fits on its own line WITHOUT word-wrap — isolating
// the effect of the explicit `\n` breaks from greedy wrapping, and lifting
// the box past the per-type minimum width floor.
const WIDE_TITLE = 'A reasonably wide container title used for sizing tests';

const ent = (over: Partial<EntityDescriptor>): EntityDescriptor => ({
  type: 'Container',
  alias: 'a',
  label: WIDE_TITLE,
  ...over,
});

const lines = (n: number) => Array.from({ length: n }, (_, i) => `seg${i}`).join('\\n');

describe('measureNode — multi-line (Phase 1)', () => {
  it('explicit \\n breaks grow the box height past a single-line description', () => {
    const single = measureNode(ent({ description: 'short' }));
    const many = measureNode(ent({ description: lines(12) }));
    expect(many.height).toBeGreaterThan(single.height);
  });

  it('height keeps growing as more explicit lines are added', () => {
    const h8 = measureNode(ent({ description: lines(8) })).height;
    const h16 = measureNode(ent({ description: lines(16) })).height;
    const h24 = measureNode(ent({ description: lines(24) })).height;
    expect(h16).toBeGreaterThan(h8);
    expect(h24).toBeGreaterThan(h16);
  });

  it('a multi-line title is measured by its LONGEST line, not as one giant line', () => {
    // SHORT segment so it does not hit the ADR-0011 C3 WRAP_WIDTH=200
    // cap — isolates the explicit-`\n` "longest line, not the
    // concatenation" behaviour from word-wrap.
    const seg = 'Order';
    const wide = measureNode(ent({ label: `${seg} ${seg} ${seg}` }));   // 1 line, 3 words
    const split = measureNode(ent({ label: `${seg}\\n${seg}\\n${seg}` })); // 3 lines, 1 word each
    // split form's width = one segment; one-line form = three segments.
    expect(split.width).toBeLessThan(wide.width);
  });

  it('a multi-line title adds height (one row per title line)', () => {
    const oneLineTitle = measureNode(ent({ label: 'T', description: lines(10) }));
    const fiveLineTitle = measureNode(ent({ label: 'T\\nT\\nT\\nT\\nT', description: lines(10) }));
    expect(fiveLineTitle.height).toBeGreaterThan(oneLineTitle.height);
  });

});

// ADR 0010 (backlog P4b) — content-fit box sizing replaces the fixed
// per-type C4_MIN floor. These lock the measured closed form:
//   height = ceil(TOP_GAP + Σ pitch(line stack) + BOT_GAP + capReserve)
//   width  = ceil(widest rendered line + 2×INSET)
// The constants are imported from theme (single source) so the test
// validates the FORMULA, not a transcribed number.
describe('measureNode — content-fit box (ADR 0010 / P4b)', () => {
  const { INSET, TOP_GAP, BOT_GAP, PITCH } = PUML_LEAF_BOX;
  // 2-line minimum («stereo» 12 + Name 16): exactly PlantUML's measured
  // smallest box height — 22.83 + 20.62 + 14.69 = 58.14 ⇒ ceil 59.
  const MIN_H = Math.ceil(TOP_GAP + PITCH['12>16'] + BOT_GAP);

  it('a short-label leaf is the 2-line content-fit minimum, NOT a 200×120 floor', () => {
    const d = measureNode(ent({ type: 'Container', label: 'X' }));
    expect(d.height).toBe(MIN_H);                       // == 59, the measured min
    // width = widest rendered line + 2×INSET, measured at PlantUML's
    // PER-RUN fonts (ADR 0011 cause D): «stereotype» at 12, Name at 16.
    const widest = Math.max(
      textWidth('X', PUML_FONT.NAME, true),
      textWidth('«Container»', PUML_FONT.STEREO, false));
    expect(d.width).toBe(Math.ceil(widest + 2 * INSET));
    // the empty-box defect is GONE: far below the old fixed 200×120 floor
    expect(d.width).toBeLessThan(200);
    expect(d.height).toBeLessThan(120);
  });

  it('every per-type leaf collapses to the same content-fit minimum (no per-type floor)', () => {
    for (const type of ['System', 'Container', 'Component', 'Node', 'Person']) {
      const d = measureNode(ent({ type, label: 'X' }));
      expect(d.height, type).toBe(MIN_H);
    }
  });

  // Closed-form height for a PlantUML font-size line stack (ADR 0010
  // fact 2) — the EXACT formula measureNode implements, derived here
  // independently from the imported constants so the test validates the
  // model rather than a transcribed number.
  const modelH = (stack: number[]): number => {
    let s = TOP_GAP + BOT_GAP;
    for (let i = 1; i < stack.length; i++) s += PITCH[`${stack[i - 1]}>${stack[i]}`];
    return Math.ceil(s);
  };

  it('height is the exact closed-form for the emitted line stack (stereo/Name/desc)', () => {
    // ADR 0011 cause D: description renders at PlantUML font 14, with
    // ONE blank font-14 SPACER line between Name and the first desc
    // line (observed in `-tsvg`). So: no desc → [12,16]; +1 desc →
    // [12,16, 14(spacer), 14(desc)]; +2 desc → [12,16,14,14,14].
    expect(measureNode(ent({ type: 'Container', label: 'X' })).height)
      .toBe(modelH([12, 16]));
    expect(measureNode(ent({ type: 'Container', label: 'X', description: 'a' })).height)
      .toBe(modelH([12, 16, 14, 14]));
    expect(measureNode(ent({ type: 'Container', label: 'X', description: 'a\\nb' })).height)
      .toBe(modelH([12, 16, 14, 14, 14]));
  });

  it('technology adds one Name→tech (16→12) line: height == closed-form [12,16,12]', () => {
    const noTech = measureNode(ent({ type: 'Container', label: 'X' }));
    const tech = measureNode(ent({ type: 'Container', label: 'X', technology: 'Go' }));
    expect(noTech.height).toBe(modelH([12, 16]));
    expect(tech.height).toBe(modelH([12, 16, 12]));        // stereo, Name, [tech]
  });

  it('width is the widest rendered line + 2×INSET (content-fit, no padding constant)', () => {
    const e = ent({ type: 'System', label: 'A wide system name', technology: 'gRPC' });
    // PlantUML per-run fonts (ADR 0011 cause D): Name 16, «stereo» 12,
    // [tech] 12. No description ⇒ no font-14 run.
    const titleW = textWidth('A wide system name', PUML_FONT.NAME, true);
    const stereoW = textWidth('«System»', PUML_FONT.STEREO, false);
    const techW = textWidth('[gRPC]', PUML_FONT.TECH, false);
    expect(measureNode(e).width).toBe(
      Math.ceil(Math.max(titleW, stereoW, techW) + 2 * INSET));
  });

  it('a cylinder3 *Db type reserves 2×CYLINDER3_CAP_PX extra height (cap non-regression)', () => {
    const plain = measureNode(ent({ type: 'Container', label: 'X' }));
    const db = measureNode(ent({ type: 'ContainerDb', label: 'X' }));
    expect(db.height - plain.height).toBe(2 * CYLINDER3_CAP_PX);
  });
});
