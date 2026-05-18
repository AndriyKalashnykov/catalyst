import { describe, it, expect } from 'vitest';
import { onCurvePoints, offChord, measure, edges } from '../scripts/bendcount-svg.mjs';

// Verbatim REAL drawio-export path `d` strings (committed ground truth,
// same convention as route-fidelity.test.mts). ADR 0013 made every
// catalyst edge `curved:1` ⇒ shafts render as `M a Q c p Q c p …`
// quadratic beziers; the instrument MUST count only the ON-CURVE
// waypoints (segment endpoints), never the Q control points, or it
// regresses to the pre-fix silent no-op (edges=0 on the whole corpus).

describe('onCurvePoints — bezier/line waypoint extraction', () => {
  it('keeps Q endpoints, drops Q control points (curved:1 shaft)', () => {
    // real rel-bidirectional edge: M a Q c1 p1 Q c2 p2
    const d = 'M 137.23 105.72 Q 124 164 90.5 164 Q 57 164 56.9 175.88';
    expect(onCurvePoints(d)).toEqual([
      [137.23, 105.72], // M start (on-curve)
      [90.5, 164],      // 1st Q endpoint (124,164 control dropped)
      [56.9, 175.88],   // 2nd Q endpoint (57,164 control dropped)
    ]);
  });

  it('handles the pre-0013 orthogonal Manhattan shaft (M L L L)', () => {
    const d = 'M 10 10 L 10 50 L 90 50 L 90 90';
    expect(onCurvePoints(d)).toEqual([[10, 10], [10, 50], [90, 50], [90, 90]]);
  });

  it('handles a cubic-bezier shaft (M C), dropping both controls', () => {
    const d = 'M 0 0 C 5 0 5 10 10 10';
    expect(onCurvePoints(d)).toEqual([[0, 0], [10, 10]]);
  });
});

describe('edges — shaft selection', () => {
  it('selects open L/Q/C paths, rejects closed (Z) node rects + arrowhead glyphs', () => {
    const svg = [
      '<path d="M 137.23 105.72 Q 124 164 90.5 164 Q 57 164 56.9 175.88" fill="none"/>',
      '<path d="M 140.55 91.09 L 142.11 106.83 L 132.36 104.61 Z" fill="#000"/>', // arrowhead (Z)
      '<path d="M 0 0 L 100 0 L 100 60 L 0 60 Z" fill="#fff"/>',                  // node rect (Z)
    ].join('\n');
    const e = edges(svg);
    expect(e.length).toBe(1);
    expect(e[0]).toEqual([[137.23, 105.72], [90.5, 164], [56.9, 175.88]]);
  });
});

describe('offChord — perpendicular distance from the a..c line', () => {
  it('is 0 for a collinear midpoint', () => {
    expect(offChord([0, 0], [5, 5], [10, 10])).toBeCloseTo(0, 9);
  });
  it('is the offset for an off-line midpoint', () => {
    expect(offChord([0, 0], [5, 3], [10, 0])).toBeCloseTo(3, 9);
  });
});

describe('measure — interior + redundant bend counts', () => {
  it('flags a near-collinear waypoint (≤EPS) as redundant', () => {
    // midpoint 1.0px off the chord — within the 1.5px quantisation EPS
    const svg = '<path d="M 0 0 L 50 1 L 100 0" fill="none"/>';
    expect(measure(svg)).toEqual({ edgeN: 1, interior: 1, redundant: 1 });
  });
  it('does NOT flag a genuine bend (>EPS) as redundant', () => {
    const svg = '<path d="M 0 0 L 50 40 L 100 0" fill="none"/>';
    expect(measure(svg)).toEqual({ edgeN: 1, interior: 1, redundant: 0 });
  });
  it('counts a 2-point edge as 0 interior bends', () => {
    const svg = '<path d="M 0 0 L 100 0" fill="none"/>';
    expect(measure(svg)).toEqual({ edgeN: 1, interior: 0, redundant: 0 });
  });
});
