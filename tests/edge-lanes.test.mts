import { describe, it, expect } from 'vitest';
import { assignEdgeLanes, EDGE_LANE_GAP_PX, type NodeCenter } from '../src/layout/edgeLanes.mjs';

/**
 * Unit contract for the multi-edge lane separator (finding #9 fix).
 * Pure function — no ELK/draw.io. Synthetic centres are chosen so the
 * perpendicular/midpoint math is exact and assertable.
 *
 * A=(0,0) B=(0,100): dx=0 dy=100 → unit perpendicular (px,py)=(-1,0),
 * midpoint=(0,50). So waypoint = (-shift, 50), shift = lane*gap.
 */
const AB = (): Map<string, NodeCenter> =>
  new Map([['A', { cx: 0, cy: 0 }], ['B', { cx: 0, cy: 100 }]]);
const never = () => false;

describe('assignEdgeLanes', () => {
  it('leaves a SINGLE edge between a pair untouched (no lane entry)', () => {
    const lanes = assignEdgeLanes([{ source: 'A', target: 'B' }], AB(), never);
    expect(lanes.size).toBe(0);
  });

  it('leaves many distinct single-edge pairs untouched', () => {
    const lanes = assignEdgeLanes(
      [{ source: 'A', target: 'B' }, { source: 'B', target: 'C' }, { source: 'A', target: 'C' }],
      new Map([['A', { cx: 0, cy: 0 }], ['B', { cx: 0, cy: 100 }], ['C', { cx: 100, cy: 0 }]]),
      never,
    );
    expect(lanes.size).toBe(0);
  });

  it('excludes self-loops (source === target) but still lanes a sibling group', () => {
    const lanes = assignEdgeLanes(
      [
        { source: 'A', target: 'A' }, // self-loop — must be ignored
        { source: 'A', target: 'B' },
        { source: 'B', target: 'A' },
      ],
      AB(),
      never,
    );
    expect(lanes.has(0)).toBe(false);          // self-loop not laned
    expect(lanes.has(1)).toBe(true);           // the real A/B pair still fans
    expect(lanes.has(2)).toBe(true);
  });

  it('excludes a pair when either endpoint is excluded (cluster/boundary)', () => {
    const isExcluded = (id: string) => id === 'BND';
    const lanes = assignEdgeLanes(
      [{ source: 'A', target: 'BND' }, { source: 'BND', target: 'A' }],
      new Map([['A', { cx: 0, cy: 0 }], ['BND', { cx: 0, cy: 100 }]]),
      isExcluded,
    );
    expect(lanes.size).toBe(0);
  });

  it('antiparallel pair: ONE canonical frame ⇒ waypoints mirror about the midpoint (the regression that bit us)', () => {
    const lanes = assignEdgeLanes(
      [{ source: 'A', target: 'B' }, { source: 'B', target: 'A' }],
      AB(),
      never,
    );
    const w0 = lanes.get(0)!;
    const w1 = lanes.get(1)!;
    // Distinct (not collinear/cancelled).
    expect(w0.waypoint).not.toEqual(w1.waypoint);
    // Mirror about midpoint (0,50): the two offsets are exact negatives.
    expect((w0.waypoint.x + w1.waypoint.x) / 2).toBe(0);
    expect((w0.waypoint.y + w1.waypoint.y) / 2).toBe(50);
    expect(w0.waypoint).toEqual({ x: 22, y: 50 });   // lane -0.5 → shift -22 → x=-(-22)=22
    expect(w1.waypoint).toEqual({ x: -22, y: 50 });  // lane +0.5 → shift +22 → x=-22
    // Label offsets mirror about the anchor too (px=-1,py=0,ex=0,ey=1):
    // dx = -120·lane, dy = 150·lane.
    expect(w0.labelOffset).toEqual({ dx: 60, dy: -75 });
    expect(w1.labelOffset).toEqual({ dx: -60, dy: 75 });
    expect(w0.labelOffset.dx).toBe(-w1.labelOffset.dx);
    expect(w0.labelOffset.dy).toBe(-w1.labelOffset.dy);
  });

  it('≥3-edge group: symmetric fan {-gap, 0, +gap}, middle edge sits on the midpoint', () => {
    const lanes = assignEdgeLanes(
      [
        { source: 'A', target: 'B' },
        { source: 'A', target: 'B' },
        { source: 'B', target: 'A' },
      ],
      AB(),
      never,
    );
    const [a, b, c] = [lanes.get(0)!, lanes.get(1)!, lanes.get(2)!];
    // lanes are -1, 0, +1 → shifts -gap, 0, +gap
    expect(a.waypoint).toEqual({ x: EDGE_LANE_GAP_PX, y: 50 });   // -(-44)
    expect(b.waypoint).toEqual({ x: 0, y: 50 });                  // middle == midpoint
    expect(c.waypoint).toEqual({ x: -EDGE_LANE_GAP_PX, y: 50 });
    // Three distinct routes; symmetric (sum of x-offsets about midpoint = 0).
    expect(new Set([a, b, c].map((l) => `${l.waypoint.x},${l.waypoint.y}`)).size).toBe(3);
    expect(a.waypoint.x + b.waypoint.x + c.waypoint.x).toBe(0);
    // Label offsets: lanes -1,0,+1 → dx=-120·lane, dy=150·lane; symmetric,
    // middle on the anchor, all distinct.
    expect([a.labelOffset, b.labelOffset, c.labelOffset]).toEqual([
      { dx: 120, dy: -150 }, { dx: 0, dy: 0 }, { dx: -120, dy: 150 },
    ]);
  });

  it('4-edge group: half-integer lanes, all distinct, none on the midpoint, symmetric', () => {
    const rels = [0, 1, 2, 3].map(() => ({ source: 'A', target: 'B' }));
    const lanes = assignEdgeLanes(rels, AB(), never);
    const ws = [0, 1, 2, 3].map((i) => lanes.get(i)!.waypoint);
    expect(new Set(ws.map((w) => `${w.x},${w.y}`)).size).toBe(4); // all distinct
    expect(ws.some((w) => w.x === 0)).toBe(false);                // none on midpoint
    expect(ws.reduce((s, w) => s + w.x, 0)).toBe(0);              // symmetric about midpoint
    const offs = [0, 1, 2, 3].map((i) => lanes.get(i)!.labelOffset);
    expect(new Set(offs.map((o) => `${o.dx},${o.dy}`)).size).toBe(4); // labels all distinct too
  });

  it('respects a custom gap (offset scales linearly)', () => {
    const rels = [{ source: 'A', target: 'B' }, { source: 'B', target: 'A' }];
    const def = assignEdgeLanes(rels, AB(), never);
    const wide = assignEdgeLanes(rels, AB(), never, EDGE_LANE_GAP_PX * 2);
    expect(Math.abs(wide.get(0)!.waypoint.x)).toBe(Math.abs(def.get(0)!.waypoint.x) * 2);
  });

  it('skips a group whose endpoint has no centre (no throw)', () => {
    const lanes = assignEdgeLanes(
      [{ source: 'A', target: 'Z' }, { source: 'Z', target: 'A' }],
      new Map([['A', { cx: 0, cy: 0 }]]), // 'Z' missing
      never,
    );
    expect(lanes.size).toBe(0);
  });

  it('keys the result by the ORIGINAL relation index (emission order preserved)', () => {
    const lanes = assignEdgeLanes(
      [
        { source: 'X', target: 'Y' }, // 0: single — not laned
        { source: 'A', target: 'B' }, // 1: group
        { source: 'B', target: 'A' }, // 2: group
      ],
      new Map([
        ['A', { cx: 0, cy: 0 }], ['B', { cx: 0, cy: 100 }],
        ['X', { cx: 9, cy: 9 }], ['Y', { cx: 9, cy: 90 }],
      ]),
      never,
    );
    expect([...lanes.keys()].sort()).toEqual([1, 2]); // index 0 absent
  });
});
