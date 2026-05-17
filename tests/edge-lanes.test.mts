import { describe, it, expect } from 'vitest';
import { assignEdgeLanes, slideLabelAlongLane, EDGE_LANE_GAP_PX, type NodeCenter, type NodeRect } from '../src/layout/edgeLanes.mjs';

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

  it('P10/P12: a 2-edge pair attaches at the two extreme border corners (max separation)', () => {
    // A=(0,0) B=(0,100), 160×80. Vertically stacked ⇒ edges leave/enter
    // the top/bottom border; the spread is along X. P12 fix: attach
    // fractions are EVENLY distributed across the whole border by lane
    // index (0.5 + dir·lane/(K−1)), NOT the old clamp-prone
    // `0.5 ± shift/extent`. For K=2 that is exactly the two corners
    // {0,1} — maximally separated, never the old 0.3625/0.6375 squeeze.
    const [e0, e1] = [0, 1].map((i) => assignEdgeLanes(
      [{ source: 'A', target: 'B' }, { source: 'B', target: 'A' }], AB(), never,
    ).get(i)!);
    expect(e0.exit).toEqual({ x: 1, y: 1 });   // A→B: exit A bottom
    expect(e0.entry).toEqual({ x: 1, y: 0 });  //      enter B top
    expect(e1.exit).toEqual({ x: 0, y: 0 });   // B→A: exit B top (mirror)
    expect(e1.entry).toEqual({ x: 0, y: 1 });  //      enter A bottom
    // load-bearing: distinct attach X ⇒ no visual merge; here maximal.
    expect(e0.exit.x).not.toBe(e1.exit.x);
    expect(Math.abs(e0.exit.x - e1.exit.x) * 160).toBeGreaterThanOrEqual(28); // ≥ ATTACH_SEP_MIN
    for (const e of [e0, e1])
      for (const p of [e.exit, e.entry]) {
        expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(1);
      }
  });

  it('P12: a MANY-edge group spreads attach points EVENLY — no clamp-merge', () => {
    // The c4-all-rel-variants regression: ≥4 same-pair edges. The old
    // `clamp01(0.5 + px·shift/(2·hw))` saturated the outer lanes at the
    // SAME corner (rel0→1.0, rel1→0.96 ⇒ 9 px apart ⇒ visual merge).
    // Contract: K attach fractions are the K evenly-spaced points
    // [0, 1/(K−1), …, 1] — all distinct, adjacent gap = extent/(K−1).
    const K = 5;
    const rels = Array.from({ length: K }, () => ({ source: 'A', target: 'B' }));
    const lanes = assignEdgeLanes(rels, AB(), never);
    const xs = [...Array(K).keys()].map((i) => lanes.get(i)!.exit.x).sort((u, v) => u - v);
    // exactly even, spanning the full border, none clamped together
    for (let i = 0; i < K; i++)
      expect(xs[i]).toBeCloseTo(i / (K - 1), 10);
    expect(new Set(xs).size).toBe(K);                       // all distinct
    // every adjacent pair ≥ box-extent/(K−1) px apart (160/4 = 40 ≥ 28)
    const boxW = 160;
    for (let i = 1; i < K; i++)
      expect((xs[i] - xs[i - 1]) * boxW).toBeGreaterThanOrEqual(28);
  });

  it('P10: a lane on a NARROW box stays pinned on the border [0,1]', () => {
    // 4 edges on a tiny box: even spread still lands every attach in
    // [0,1] (corners included) — never negative / >1 / detached.
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

  // P12: slideLabelAlongLane — a laned label that lands on an unrelated
  // leaf is de-collided by sliding ALONG its lane line (axis = src→tgt
  // unit), the minimal distance that clears every obstacle under the
  // factcheck `labelHit` predicate. Returns 0 when already clear (⇒
  // byte-identical) and respects the containment exception + the
  // integer-rounding envelope.
  describe('slideLabelAlongLane', () => {
    const xAxis = { x: 1, y: 0 };

    it('returns 0 when the label already clears every obstacle', () => {
      const obs: NodeRect[] = [{ x: 100, y: 100, w: 50, h: 50 }];
      expect(slideLabelAlongLane({ x: 0, y: 0 }, xAxis, 40, 18, obs)).toBe(0);
    });

    it('returns 0 for degenerate inputs (no obstacles / zero size / zero axis)', () => {
      expect(slideLabelAlongLane({ x: 0, y: 0 }, xAxis, 40, 18, [])).toBe(0);
      expect(slideLabelAlongLane({ x: 0, y: 0 }, xAxis, 0, 18,
        [{ x: -10, y: -10, w: 20, h: 20 }])).toBe(0);
      expect(slideLabelAlongLane({ x: 0, y: 0 }, { x: 0, y: 0 }, 40, 18,
        [{ x: -10, y: -10, w: 20, h: 20 }])).toBe(0);
    });

    it('slides the MINIMAL distance along the axis to clear an obstacle', () => {
      // PARTIAL overlap (label straddles the node's left edge — the real
      // defect shape; a label fully INSIDE a node is the containment
      // exception, covered below). label 40×18 at origin, half-width
      // 20 + 0.5 envelope = 20.5. obstacle x∈[10,210]: clear leftward at
      // cx ≤ 10 − 20.5 ⇒ t = −10.5 (minimal vs the +230.5 rightward).
      const obs: NodeRect[] = [{ x: 10, y: -50, w: 200, h: 100 }];
      const t = slideLabelAlongLane({ x: 0, y: 0 }, xAxis, 40, 18, obs);
      expect(t).toBeCloseTo(-10.5, 6);
      const lx = t - 20.5, rx = t + 20.5;        // emitted-rect envelope
      expect(rx <= 10 || lx >= 210).toBe(true);  // cleared
    });

    it('slides along Y when the axis is vertical', () => {
      // partial overlap on the label's bottom; axis = +Y. half-height
      // 9 + 0.5 = 9.5; obstacle y∈[5,205] ⇒ clear up at t = 5 − 9.5 = −4.5.
      const obs: NodeRect[] = [{ x: -100, y: 5, w: 200, h: 200 }];
      const t = slideLabelAlongLane({ x: 0, y: 0 }, { x: 0, y: 1 }, 40, 18, obs);
      expect(t).toBeCloseTo(-4.5, 6);
    });

    it('honours the containment exception (label ⊆ node ⇒ not a hit ⇒ 0)', () => {
      // huge obstacle fully containing the label: the factcheck gate
      // does NOT flag this, so the slide must stay inert (byte-identical).
      const obs: NodeRect[] = [{ x: -500, y: -500, w: 1000, h: 1000 }];
      expect(slideLabelAlongLane({ x: 0, y: 0 }, xAxis, 40, 18, obs)).toBe(0);
    });

    it('clears ALL obstacles, not just the first', () => {
      // two partial obstacles flanking the origin; the gap between them
      // (−20 … 10, width 30) is narrower than the 41-wide envelope, so
      // the only feasible slides are fully OUTSIDE both — the optimiser
      // must skip the near candidates that re-hit the other obstacle.
      const obs: NodeRect[] = [
        { x: 10, y: -50, w: 30, h: 100 },
        { x: -60, y: -50, w: 40, h: 100 },
      ];
      const t = slideLabelAlongLane({ x: 0, y: 0 }, xAxis, 40, 18, obs);
      const lx = t - 20.5, rx = t + 20.5;
      for (const o of obs)
        expect(rx <= o.x || lx >= o.x + o.w).toBe(true);
    });
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
