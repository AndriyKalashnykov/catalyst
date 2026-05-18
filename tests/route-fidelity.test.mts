import { describe, it, expect } from 'vitest';
import {
  parsePathD, dist, arcLength, detour, rdp, turn,
  pumlEdges, drawioEdges, routeMetrics, mean, median, summarise,
} from '../scripts/route-fidelity.mjs';

// ── Verbatim REAL SVG (committed ground truth; the user OK'd keeping
//    these). PlantUML `-tsvg` and drawio-export of the SAME fixture
//    `rel-bidirectional` — the instrument MUST separate the dot-spline
//    routes from the orthogonal dog-legs or it is not trustworthy.
const PUML_REL_BIDI = [
  '<path d="M104.2964,106.3229 C91.3464,115.2629 84.95,121.9079 76,135.0679 C63.13,153.9879 58.4851,171.5539 55.9851,190.9039" fill="none" id="a-b"/>',
  '<path d="M150.59,105.3579 C147.66,124.0379 146.33,148.7279 154,169.0679 C158.12,179.9879 160.0202,184.1941 167.7402,192.8941" fill="none" id="a-to-c"/>',
  '<path d="M203.95,198.9979 C202.56,180.4079 199.35,155.7379 192,135.0679 C188.34,124.7579 186.9206,121.0902 181.2506,111.9302" fill="none" id="c-to-a"/>',
  '<polygon points="1,2 3,4" fill="#000"/>',                       // arrowhead glyph (ignored)
  '<path d="M0,0 L1,1 L1,0 Z" fill="none"/>',                      // closed glyph (ignored)
  '<path d="M5,5 C6,6 7,7 8,8" fill="none"/>',                     // id-LESS decoration (boundary/legend) — MUST be excluded
].join('\n');

const DRAWIO_REL_BIDI_ORTHO = [
  '<path d="M 126 106.12 L 126 164 L 59 164 L 59 175.88" fill="none" stroke="#666"/>',
  '<path d="M 196 90 L 196 164 L 176 164 L 248 164 L 248 175.88" fill="none" stroke="#666"/>',
  '<path d="M 126 91.12 L 131 106.12 L 121 106.12 Z" fill="#666"/>',   // arrowhead (Z, excluded)
  '<rect x="0" y="0" width="10" height="10"/>',
].join('\n');

// curved=1 drawio edges are `M..Q..Q..` (quadratic, NO L/C) — the
// route-detection filter MUST accept Q or it false-negatives ~95 % of
// curved edges (the instrument bug caught by distrusting a 9/104 count).
const DRAWIO_CURVED_EDGE =
  '<path d="M 137.23 105.72 Q 124 164 90.5 164 Q 57 164 55 175" fill="none" stroke="#666"/>\n' +
  '<path d="M 1 1 L 2 2 L 1 2 Z" fill="#666"/>';

describe('parsePathD', () => {
  it('empty / whitespace → []', () => {
    expect(parsePathD('')).toEqual([]);
    expect(parsePathD('   ')).toEqual([]);
  });
  it('straight space-format', () => {
    expect(parsePathD('M 0 0 L 10 0')).toEqual([[[0, 0], [10, 0]]]);
  });
  it('comma-format (PlantUML) start/end exact', () => {
    const s = parsePathD('M104.29,106.32 C91.34,115.26 84.95,121.9 76,135.06')[0];
    expect(s[0]).toEqual([104.29, 106.32]);
    expect(s[s.length - 1]).toEqual([76, 135.06]);
  });
  it('dog-leg = 3 exact points', () => {
    expect(parsePathD('M 0 0 L 0 10 L 10 10')).toEqual([[[0, 0], [0, 10], [10, 10]]]);
  });
  it('cubic sampled at `steps` segments, terminal point exact', () => {
    const s = parsePathD('M 0 0 C 0 5 5 10 10 10', 4)[0];
    expect(s.length).toBe(1 + 4);
    expect(s[s.length - 1]).toEqual([10, 10]);
  });
  it('quadratic terminal point exact', () => {
    const s = parsePathD('M 0 0 Q 5 10 10 0', 8)[0];
    expect(s[s.length - 1][0]).toBeCloseTo(10, 6);
    expect(s[s.length - 1][1]).toBeCloseTo(0, 6);
  });
  it('H / V', () => {
    expect(parsePathD('M 0 0 H 10 V 5')).toEqual([[[0, 0], [10, 0], [10, 5]]]);
  });
  it('multiple subpaths', () => {
    expect(parsePathD('M0 0 L1 0 M5 5 L6 5')).toEqual([[[0, 0], [1, 0]], [[5, 5], [6, 5]]]);
  });
  it('Z is a no-op for the open-route polyline', () => {
    expect(parsePathD('M0 0 L1 0 L1 1 Z')).toEqual([[[0, 0], [1, 0], [1, 1]]]);
  });
  it('negatives, decimals, exponents', () => {
    expect(parsePathD('M -1.5 2e1 L 3 -4')).toEqual([[[-1.5, 20], [3, -4]]]);
  });
  it('exponent is NOT mistaken for a relative command', () => {
    const s = parsePathD('M 1e-3 0 L 1 1')[0];
    expect(s[0][0]).toBeCloseTo(0.001, 9);
  });
  it('relative commands throw (never silently mis-measure)', () => {
    expect(() => parsePathD('m 0 0 l 1 1')).toThrow(/relative/);
    expect(() => parsePathD('M 0 0 c 1 1 2 2 3 3')).toThrow(/relative/);
  });
  it('non-string → []', () => {
    // @ts-expect-error deliberate
    expect(parsePathD(null)).toEqual([]);
  });
});

describe('dist / arcLength', () => {
  it('3-4-5', () => expect(dist([0, 0], [3, 4])).toBe(5));
  it('zero-length segment tolerated', () =>
    expect(arcLength([[0, 0], [3, 4], [3, 4]])).toBe(5));
  it('single point = 0', () => expect(arcLength([[1, 1]])).toBe(0));
});

describe('detour', () => {
  it('dead straight = 1', () => expect(detour([[0, 0], [10, 0]])).toBeCloseTo(1, 9));
  it('right angle = 20/√200', () =>
    expect(detour([[0, 0], [0, 10], [10, 10]])).toBeCloseTo(20 / Math.hypot(10, 10), 9));
  it('< 2 points → null', () => expect(detour([[1, 1]])).toBeNull());
  it('coincident endpoints (self-loop) → null', () =>
    expect(detour([[0, 0], [5, 5], [0, 0]])).toBeNull());
});

describe('rdp', () => {
  it('collinear midpoint removed', () =>
    expect(rdp([[0, 0], [5, 0], [10, 0]], 0.01)).toEqual([[0, 0], [10, 0]]));
  it('real corner preserved', () =>
    expect(rdp([[0, 0], [0, 10], [10, 10]], 0.01)).toEqual([[0, 0], [0, 10], [10, 10]]));
  it('< 3 points unchanged', () =>
    expect(rdp([[0, 0], [9, 9]], 1)).toEqual([[0, 0], [9, 9]]));
});

describe('turn (total absolute turning angle, rad)', () => {
  it('straight = 0', () => expect(turn([[0, 0], [5, 0], [10, 0]])).toBeCloseTo(0, 9));
  it('single right angle = π/2', () =>
    expect(turn([[0, 0], [0, 10], [10, 10]])).toBeCloseTo(Math.PI / 2, 6));
  it('two right angles (dog-leg) = π', () =>
    expect(turn([[0, 0], [0, 10], [10, 10], [10, 20]])).toBeCloseTo(Math.PI, 6));
  it('180° reversal ≈ π', () =>
    expect(turn([[0, 0], [10, 0], [0, 0.001]])).toBeGreaterThan(Math.PI - 0.05));
  it('< 3 points = 0', () => expect(turn([[0, 0], [1, 1]])).toBe(0));
  it('bezier-sampled near-straight collapses to ~0 after RDP', () => {
    const pts = parsePathD('M 0 0 C 3.33 0.01 6.66 0.01 10 0', 32)[0];
    expect(turn(pts)).toBeLessThan(0.05);
  });
});

describe('layout invariance (the property that defeats the factcheck FP class)', () => {
  const base = parsePathD('M 0 0 L 0 10 L 10 10 C 12 12 18 18 20 20')[0];
  const d0 = detour(base)!, t0 = turn(base);
  it('detour & turn are invariant under scale + translate', () => {
    const xf = base.map(([x, y]) => [x * 3.7 + 41, y * 3.7 - 17] as [number, number]);
    expect(detour(xf)!).toBeCloseTo(d0, 6);
    expect(turn(xf)).toBeCloseTo(t0, 6);
  });
  it('detour & turn are invariant under rotation', () => {
    const a = 0.9, c = Math.cos(a), s = Math.sin(a);
    const xf = base.map(([x, y]) => [x * c - y * s, x * s + y * c] as [number, number]);
    expect(detour(xf)!).toBeCloseTo(d0, 6);
    expect(turn(xf)).toBeCloseTo(t0, 6);
  });
});

describe('SVG edge extraction', () => {
  it('pumlEdges keeps fill=none open paths with ids, drops glyphs', () => {
    const e = pumlEdges(PUML_REL_BIDI);
    expect(e.map((x) => x.id)).toEqual(['a-b', 'a-to-c', 'c-to-a']);
  });
  it('drawioEdges keeps open multi-seg paths, drops Z arrowheads & rects', () => {
    const e = drawioEdges(DRAWIO_REL_BIDI_ORTHO);
    expect(e.length).toBe(2);
    expect(e.every((x) => /L/.test(x.d) && !/Z/.test(x.d))).toBe(true);
  });
  it('drawioEdges keeps curved (Q-only) edges, drops the Z arrowhead', () => {
    const e = drawioEdges(DRAWIO_CURVED_EDGE);
    expect(e.length).toBe(1);
    expect(/Q/.test(e[0].d) && !/[LC]/.test(e[0].d)).toBe(true); // pure-Q route survives
  });
  it('pumlEdges EXCLUDES id-less fill=none decoration paths', () => {
    // PUML_REL_BIDI has 3 id-ful edges + 1 id-less fill=none C-path
    // (boundary/legend decoration). Only the 3 real edges count.
    const e = pumlEdges(PUML_REL_BIDI);
    expect(e.length).toBe(3);
    expect(e.every((x) => x.id)).toBe(true);
  });
});

describe('routeMetrics', () => {
  it('straight → detour 1, turn 0', () => {
    const m = routeMetrics('M 0 0 L 10 0');
    expect(m.detour).toBeCloseTo(1, 9);
    expect(m.turn).toBeCloseTo(0, 9);
  });
  it('orthogonal dog-leg → detour 30/√500, turn ≈ π', () => {
    // pts (0,0)(0,10)(10,10)(10,20): arclen 10+10+10=30,
    // endpoint dist hypot(10,20)=√500 ⇒ detour 30/√500 ≈ 1.3416.
    const m = routeMetrics('M 0 0 L 0 10 L 10 10 L 10 20');
    expect(m.detour!).toBeCloseTo(30 / Math.hypot(10, 20), 6);
    expect(m.turn).toBeCloseTo(Math.PI, 4);
  });
});

describe('aggregation', () => {
  it('mean / median', () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(mean([])).toBe(0);
    expect(median([])).toBe(0);
  });
  it('summarise filters null detours, reports the decision scalars', () => {
    const s = summarise([
      { detour: 1, turn: 0 }, { detour: 2, turn: Math.PI }, { detour: null, turn: 1 },
    ]);
    expect(s.edges).toBe(3);
    expect(s.meanDetourExcess).toBeCloseTo(0.5, 4); // (|1-1|+|2-1|)/2
  });
  it('empty → zeros', () => {
    expect(summarise([])).toEqual({
      edges: 0, meanDetourExcess: 0, medianDetour: 0, meanTurn: 0, medianTurn: 0,
    });
  });
});

// ── The distrust-the-new-gate validation: on the SAME fixture, the
//    instrument MUST show PlantUML's dot-splines as markedly straighter
//    & smoother than catalyst's orthogonal dog-legs. If it cannot
//    separate these obviously-different renders it is a bad metric and
//    no decision may rest on it.
describe('INSTRUMENT VALIDATION — separates dot-spline from orthogonal (rel-bidirectional, real SVG)', () => {
  const puml = summarise(pumlEdges(PUML_REL_BIDI).map((e) => routeMetrics(e.d)));
  const ortho = summarise(drawioEdges(DRAWIO_REL_BIDI_ORTHO).map((e) => routeMetrics(e.d)));

  it('PlantUML splines are near-direct (low detour excess)', () => {
    expect(puml.meanDetourExcess).toBeLessThan(0.25);
  });
  it('PlantUML splines are smooth (low total turn)', () => {
    expect(puml.meanTurn).toBeLessThan(1.0);
  });
  it('catalyst orthogonal dog-legs detour MORE than PlantUML', () => {
    expect(ortho.meanDetourExcess).toBeGreaterThan(puml.meanDetourExcess);
  });
  it('catalyst orthogonal dog-legs turn MORE than PlantUML (right angles)', () => {
    expect(ortho.meanTurn).toBeGreaterThan(puml.meanTurn);
    expect(ortho.meanTurn).toBeGreaterThan(Math.PI - 0.3); // ≈2 right angles
  });
});
