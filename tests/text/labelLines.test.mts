import { describe, it, expect } from 'vitest';
import { splitLabelLines, htmlBreaks, wrapEdgeLabelLines } from '../../src/text/labelLines.mjs';
import { MX_DEFAULT_FONTSIZE, textWidth } from '../../src/text/TextMetrics.mjs';

describe('splitLabelLines', () => {
  it('returns [] for empty / undefined', () => {
    expect(splitLabelLines(undefined)).toEqual([]);
    expect(splitLabelLines('')).toEqual([]);
  });

  it('keeps a single-line string intact', () => {
    expect(splitLabelLines('Admin API')).toEqual(['Admin API']);
  });

  it('splits the PlantUML \\n escape (one backslash + n)', () => {
    expect(splitLabelLines('K8s Secret\\n<workload>-tls'))
      .toEqual(['K8s Secret', '<workload>-tls']);
  });

  it('splits the double-escaped \\\\n form', () => {
    expect(splitLabelLines('a\\\\nb')).toEqual(['a', 'b']);
  });

  it('splits a real newline (defensive)', () => {
    expect(splitLabelLines('a\nb')).toEqual(['a', 'b']);
    expect(splitLabelLines('a\r\nb')).toEqual(['a', 'b']);
  });

  it('preserves an intentionally blank middle line', () => {
    expect(splitLabelLines('a\\n\\nb')).toEqual(['a', '', 'b']);
  });
});

describe('htmlBreaks', () => {
  it('is a no-op when there is no break', () => {
    expect(htmlBreaks('Admin API')).toBe('Admin API');
  });

  it('emits the pre-encoded &lt;br/&gt; token (strict-XML safe)', () => {
    expect(htmlBreaks('a\\nb')).toBe('a&lt;br/&gt;b');
    expect(htmlBreaks('a\\n\\nb')).toBe('a&lt;br/&gt;&lt;br/&gt;b');
  });

  it('does not contain a raw < or > (would break a strict consumer)', () => {
    const out = htmlBreaks('one\\ntwo');
    expect(out).not.toMatch(/<br/);
    expect(out).not.toContain('br/>');
  });
});

describe('MX_DEFAULT_FONTSIZE', () => {
  // Lock the cited renderer constant. mxGraph's mxConstants.DEFAULT_FONTSIZE
  // (and the maxGraph successor) is 11; a catalyst label <div> with no
  // explicit font-size (the Relationship verb/technology template) renders
  // at this size, so edge-label measurement is anchored to it. If mxGraph
  // ever changes its default this test must be revisited together with the
  // measurement base — that is the point of locking it.
  it('is mxGraph DEFAULT_FONTSIZE (11)', () => {
    expect(MX_DEFAULT_FONTSIZE).toBe(11);
  });
});

describe('wrapEdgeLabelLines', () => {
  const PX = MX_DEFAULT_FONTSIZE;

  it('Infinity cap = no wrap: identical to splitLabelLines (incl. \\n + blanks)', () => {
    const s = 'a very long single line that would otherwise wrap somewhere';
    expect(wrapEdgeLabelLines(s, PX, true, Infinity)).toEqual(splitLabelLines(s));
    expect(wrapEdgeLabelLines('x\\n\\ny', PX, false, Infinity)).toEqual(['x', '', 'y']);
    expect(wrapEdgeLabelLines(undefined, PX, false, Infinity)).toEqual([]);
  });

  it('a finite cap wraps a long segment into multiple lines, each within the cap', () => {
    const long = 'submits a payment authorization request and waits synchronously for settlement confirmation';
    const cap = 220;
    const lines = wrapEdgeLabelLines(long, PX, true, cap);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) {
      // Each wrapped line's measured width must not exceed the cap (the
      // whole point: a label never wider than the narrower endpoint box).
      expect(textWidth(l, PX, true)).toBeLessThanOrEqual(cap);
    }
    // No content lost (same words, just re-flowed).
    expect(lines.join(' ').split(/\s+/).sort()).toEqual(long.split(/\s+/).sort());
  });

  it('explicit \\n breaks are honoured first, then each segment wrapped', () => {
    const lines = wrapEdgeLabelLines('short\\nanother short bit', PX, false, 9999);
    expect(lines[0]).toBe('short');           // the \n break is kept
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('a short label is returned unchanged regardless of a generous cap', () => {
    expect(wrapEdgeLabelLines('Uses', PX, true, 220)).toEqual(['Uses']);
  });

  it('narrower cap ⇒ at least as many lines as a wider cap (monotonic)', () => {
    const s = 'reads and writes the durable settlement ledger over a secure channel';
    const wide = wrapEdgeLabelLines(s, PX, false, 400).length;
    const narrow = wrapEdgeLabelLines(s, PX, false, 160).length;
    expect(narrow).toBeGreaterThanOrEqual(wide);
  });
});
