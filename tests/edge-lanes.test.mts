import { describe, it, expect } from 'vitest';
import { assignEdgeLanes, EDGE_LANE_GAP_PX, type NodeCenter } from '../src/layout/edgeLanes.mjs';

/**
 * Unit contract for the multi-edge lane separator (finding #9 + review
 * follow-ups 8-a/8-c). Pure function — no ELK/draw.io. Synthetic boxes are
 * chosen so the perpendicular/midpoint math is exact and assertable.
 *
 * AB: A=(0,0) B=(0,100), each 160×80 (hw=80, hh=40). Edge dir (ex,ey)=(0,1) →
 * perpendicular (px,py)=(-1,0), midpoint=(0,50). The label rides its own
 * lane line (labelOffset 0); separation is the waypoint/effGap.
 */
const bx = (cx: number, cy: number): NodeCenter => ({ cx, cy, hw: 80, hh: 40 });
const AB = (): Map<string, NodeCenter> =>
  new Map([['A', bx(0, 0)], ['B', bx(0, 100)]]);
const never = () => false;

describe('assignEdgeLanes', () => {
  it('leaves a SINGLE edge between a pair untouched (no lane entry)', () => {
    expect(assignEdgeLanes([{ source: 'A', target: 'B' }], AB(), never).size).toBe(0);
  });

  it('leaves many distinct single-edge pairs untouched', () => {
    const lanes = assignEdgeLanes(
      [{ source: 'A', target: 'B' }, { source: 'B', target: 'C' }, { source: 'A', target: 'C' }],
      new Map([['A', bx(0, 0)], ['B', bx(0, 100)], ['C', bx(100, 0)]]),
      never,
    );
    expect(lanes.size).toBe(0);
  });

  it('excludes self-loops but still lanes a sibling group', () => {
    const lanes = assignEdgeLanes(
      [{ source: 'A', target: 'A' }, { source: 'A', target: 'B' }, { source: 'B', target: 'A' }],
      AB(), never,
    );
    expect(lanes.has(0)).toBe(false);
    expect(lanes.has(1)).toBe(true);
    expect(lanes.has(2)).toBe(true);
  });

  it('excludes a pair when either endpoint is excluded (cluster/boundary)', () => {
    const lanes = assignEdgeLanes(
      [{ source: 'A', target: 'BND' }, { source: 'BND', target: 'A' }],
      new Map([['A', bx(0, 0)], ['BND', bx(0, 100)]]),
      (id) => id === 'BND',
    );
    expect(lanes.size).toBe(0);
  });

  it('antiparallel pair: ONE canonical frame ⇒ waypoints + offsets mirror about the anchor', () => {
    const lanes = assignEdgeLanes(
      [{ source: 'A', target: 'B' }, { source: 'B', target: 'A' }],
      AB(), never,
    );
    const w0 = lanes.get(0)!;
    const w1 = lanes.get(1)!;
    expect(w0.waypoint).toEqual({ x: 22, y: 50 });   // lane -0.5 → shift -22 → x=-(-22)
    expect(w1.waypoint).toEqual({ x: -22, y: 50 });
    expect(w0.waypoint).not.toEqual(w1.waypoint);
    // New contract (P1 fix): labelOffset = the lane's OWN perpendicular
    // shift `(px,py)·shift`, seating the label exactly on its lane line
    // (drawio anchors at the A↔B midpoint, so this offset == waypoint −
    // midpoint). NOT the old separate ±120/±150 fan that detached labels.
    // px=-1,py=0,shift=∓22 ⇒ dx=±22, dy=0; == (waypoint.x, waypoint.y−50).
    expect(w0.labelOffset).toEqual({ dx: 22, dy: 0 });
    expect(w1.labelOffset).toEqual({ dx: -22, dy: 0 });
    expect(w0.labelOffset.dx).toBe(w0.waypoint.x);          // on its lane line
    expect(w1.labelOffset.dx).toBe(w1.waypoint.x);
    expect(w0.labelOffset.dx).toBe(-w1.labelOffset.dx);     // symmetric
    // perp unit + signed shift exposed for the ELK-polyline (#3) path.
    expect(w0.perp).toEqual({ x: -1, y: 0 });
    expect(w0.shift).toBe(-22);
    expect(w1.shift).toBe(22);
  });

  it('P10: each lane gets DISTINCT box-border attach points (no centre merge)', () => {
    // A=(0,0) B=(0,100), 160×80. Vertically stacked ⇒ edges leave/enter
    // the top/bottom border; the perpendicular spread is along X as a
    // fraction of the 160-wide box. A→B exits A's BOTTOM (y=1) enters
    // B's TOP (y=0); B→A is the mirror. The two antiparallel edges MUST
    // attach at different X fractions (else they collapse to the centre
    // — the P10 defect). centre 0.5 ± 22/160 = 0.3625 / 0.6375.
    const [e0, e1] = [0, 1].map((i) => assignEdgeLanes(
      [{ source: 'A', target: 'B' }, { source: 'B', target: 'A' }], AB(), never,
    ).get(i)!);
    // A→B: exit A bottom, enter B top
    expect(e0.exit).toEqual({ x: 0.6375, y: 1 });
    expect(e0.entry).toEqual({ x: 0.6375, y: 0 });
    // B→A: exit B top, enter A bottom (mirrored fraction)
    expect(e1.exit).toEqual({ x: 0.3625, y: 0 });
    expect(e1.entry).toEqual({ x: 0.3625, y: 1 });
    // the load-bearing property: distinct attach X ⇒ no visual merge
    expect(e0.exit.x).not.toBe(e1.exit.x);
    expect(Math.abs(e0.exit.x - e1.exit.x) * 160).toBeGreaterThanOrEqual(28); // ≥ ATTACH_SEP_MIN
    // fractions are clamped onto the border
    for (const e of [e0, e1])
      for (const p of [e.exit, e.entry]) {
        expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(1);
      }
  });

  it('P10: a clamped lane pins to the border, never detaches outside', () => {
    // 4 edges on a NARROW box ⇒ outer lanes would exceed the box; the
    // fraction must clamp to [0,1] (corner) not go negative / >1.
    const tiny = new Map([['A', { cx: 0, cy: 0, hw: 10, hh: 10 }],
                          ['B', { cx: 0, cy: 200, hw: 10, hh: 10 }]]);
    const ls = assignEdgeLanes([0, 1, 2, 3].map(() => ({ source: 'A', target: 'B' })), tiny, never);
    for (const i of [0, 1, 2, 3]) {
      const e = ls.get(i)!;
      expect(e.exit.x).toBeGreaterThanOrEqual(0); expect(e.exit.x).toBeLessThanOrEqual(1);
      expect(e.entry.x).toBeGreaterThanOrEqual(0); expect(e.entry.x).toBeLessThanOrEqual(1);
    }
  });

  it('≥3-edge group: symmetric fan, middle edge on the anchor', () => {
    const lanes = assignEdgeLanes(
      [{ source: 'A', target: 'B' }, { source: 'A', target: 'B' }, { source: 'B', target: 'A' }],
      AB(), never,
    );
    const [a, b, c] = [lanes.get(0)!, lanes.get(1)!, lanes.get(2)!];
    expect(a.waypoint).toEqual({ x: EDGE_LANE_GAP_PX, y: 50 });
    expect(b.waypoint).toEqual({ x: 0, y: 50 });
    expect(c.waypoint).toEqual({ x: -EDGE_LANE_GAP_PX, y: 50 });
    expect(new Set([a, b, c].map((l) => `${l.waypoint.x},${l.waypoint.y}`)).size).toBe(3);
    expect(a.waypoint.x + b.waypoint.x + c.waypoint.x).toBe(0);
    // Each label sits on its OWN lane line: offset == (px,py)·shift ==
    // (waypoint.x − mcx, waypoint.y − mcy). mcx=0,mcy=50; px=-1,py=0.
    expect([a.labelOffset, b.labelOffset, c.labelOffset]).toEqual([
      { dx: EDGE_LANE_GAP_PX, dy: 0 }, { dx: 0, dy: 0 }, { dx: -EDGE_LANE_GAP_PX, dy: 0 },
    ]);
    expect([a, b, c].every((l) => l.labelOffset.dx === l.waypoint.x)).toBe(true);
    expect([a.shift, b.shift, c.shift]).toEqual([-EDGE_LANE_GAP_PX, 0, EDGE_LANE_GAP_PX]);
  });

  it('4-edge group: half-integer lanes, all distinct, symmetric', () => {
    const rels = [0, 1, 2, 3].map(() => ({ source: 'A', target: 'B' }));
    const lanes = assignEdgeLanes(rels, AB(), never);
    const ws = [0, 1, 2, 3].map((i) => lanes.get(i)!.waypoint);
    expect(new Set(ws.map((w) => `${w.x},${w.y}`)).size).toBe(4);
    expect(ws.some((w) => w.x === 0)).toBe(false);
    expect(ws.reduce((s, w) => s + w.x, 0)).toBe(0);
    // Labels ride their own lane lines: 4 distinct offsets, each == its
    // waypoint displacement from the midpoint (px,py)·shift.
    const offs = [0, 1, 2, 3].map((i) => lanes.get(i)!.labelOffset);
    expect(new Set(offs.map((o) => `${o.dx},${o.dy}`)).size).toBe(4);
    expect([0, 1, 2, 3].every((i) => lanes.get(i)!.labelOffset.dx === lanes.get(i)!.waypoint.x)).toBe(true);
  });

  it('respects a custom waypoint gap (offset scales linearly)', () => {
    const rels = [{ source: 'A', target: 'B' }, { source: 'B', target: 'A' }];
    const def = assignEdgeLanes(rels, AB(), never);
    const wide = assignEdgeLanes(rels, AB(), never, EDGE_LANE_GAP_PX * 2);
    expect(Math.abs(wide.get(0)!.waypoint.x)).toBe(Math.abs(def.get(0)!.waypoint.x) * 2);
  });

  it('skips a group whose endpoint has no centre (no throw)', () => {
    const lanes = assignEdgeLanes(
      [{ source: 'A', target: 'Z' }, { source: 'Z', target: 'A' }],
      new Map([['A', bx(0, 0)]]), never,
    );
    expect(lanes.size).toBe(0);
  });

  it('keys the result by the ORIGINAL relation index (emission order preserved)', () => {
    const lanes = assignEdgeLanes(
      [{ source: 'X', target: 'Y' }, { source: 'A', target: 'B' }, { source: 'B', target: 'A' }],
      new Map([['A', bx(0, 0)], ['B', bx(0, 100)], ['X', bx(9, 9)], ['Y', bx(9, 90)]]),
      never,
    );
    expect([...lanes.keys()].sort()).toEqual([1, 2]);
  });

  // 8-a: pair grouping must be robust to ANY alias content (no delimiter
  // round-trip — the old join('|')/split('|') broke on a '|' in an alias).
  it('groups correctly when an alias contains the old separator or special chars', () => {
    const lanes = assignEdgeLanes(
      [{ source: 'a|b', target: 'c"]d' }, { source: 'c"]d', target: 'a|b' }],
      new Map([['a|b', bx(0, 0)], ['c"]d', bx(0, 100)]]),
      never,
    );
    expect(lanes.size).toBe(2);
    expect(lanes.get(0)!.waypoint).not.toEqual(lanes.get(1)!.waypoint);
  });

  // P1 fix: when label widths are supplied the per-group lane gap widens to
  // the group's WIDEST label (+ pad) so every label, sitting on its own
  // lane line, clears the neighbouring lane's label. Each label spans
  // ≤ maxW and adjacent lane centres are `effGap` apart, so effGap ≥ maxW
  // is the exact non-overlap condition (pure geometry).
  it('widens the lane gap to the group widest label so on-line labels clear', () => {
    const rels = [{ source: 'A', target: 'B' }, { source: 'B', target: 'A' }];
    // Default gap (44) when no label widths given.
    const plain = assignEdgeLanes(rels, AB(), never);
    expect(Math.abs(plain.get(0)!.shift)).toBe(EDGE_LANE_GAP_PX / 2); // ±0.5·44=22
    // Wide labels (90px) + pad 6 ⇒ effGap = max(44, 96) = 96.
    const wide = assignEdgeLanes(rels, AB(), never, undefined, () => 90, 6);
    expect(Math.abs(wide.get(0)!.shift)).toBe(96 / 2);               // ±0.5·96=48
    // Adjacent lane centres are |2·shift| = effGap apart ≥ label width.
    const sep = Math.abs(wide.get(0)!.waypoint.x - wide.get(1)!.waypoint.x);
    expect(sep).toBeGreaterThanOrEqual(90);
    // label rides the (now well-separated) line: offset == waypoint−midpoint.
    expect(wide.get(0)!.labelOffset).toEqual({ dx: 48, dy: 0 });
    expect(wide.get(0)!.labelOffset.dx).toBe(wide.get(0)!.waypoint.x);
  });

  it('keeps the minimum gap when labels are narrower than EDGE_LANE_GAP_PX', () => {
    const rels = [{ source: 'A', target: 'B' }, { source: 'A', target: 'B' }];
    // Narrow labels (10px) ⇒ effGap = max(44, 10+0) = 44 (floor wins).
    const lanes = assignEdgeLanes(rels, AB(), never, undefined, () => 10, 0);
    expect(Math.abs(lanes.get(0)!.shift)).toBe(EDGE_LANE_GAP_PX / 2);
  });

  it('per-group gap uses that group widest label (groups independent)', () => {
    // Group {A,B} has a 100px label; group {X,Y} has a 12px label. Each
    // group's gap is driven by ITS OWN widest label, not a global max.
    const rels = [
      { source: 'A', target: 'B' }, { source: 'B', target: 'A' },
      { source: 'X', target: 'Y' }, { source: 'Y', target: 'X' },
    ];
    const centers = new Map([
      ['A', bx(0, 0)], ['B', bx(0, 100)], ['X', bx(500, 0)], ['Y', bx(500, 100)],
    ]);
    const w = (i: number) => (i < 2 ? 100 : 12);
    const lanes = assignEdgeLanes(rels, centers, never, undefined, w, 0);
    expect(Math.abs(lanes.get(0)!.shift)).toBe(100 / 2);          // {A,B} → 50
    expect(Math.abs(lanes.get(2)!.shift)).toBe(EDGE_LANE_GAP_PX / 2); // {X,Y} → 22 (floor)
  });
});
