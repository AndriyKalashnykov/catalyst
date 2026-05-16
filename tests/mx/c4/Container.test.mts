import { describe, it, expect } from 'vitest';
import { Container } from '../../../src/mx/c4/Container.mjs';

describe('Container', () => {
  it('should generate label with proper HTML structure', async () => {
    const label = await Container.label();
    
    // Check that HTML is properly encoded
    expect(label).toContain('&lt;div');
    expect(label).toContain('&gt;');
    expect(label).toContain('&quot;');
    
    // Check that placeholders are present
    expect(label).toContain('%c4Name%');
    expect(label).toContain('%c4Type%');
    expect(label).toContain('%c4Technology%');
    expect(label).toContain('%c4Description%');
    
    // Check that styles are applied
    expect(label).toContain('font-size:16px;font-weight:bold;');
    expect(label).toContain('font-size:11px;color:#cccccc;');
  });

  it('should generate style string with correct properties', () => {
    const style = Container.style();
    
    expect(style).toContain('rounded=1');
    expect(style).toContain('whiteSpace=wrap');
    expect(style).toContain('html=1');
    expect(style).toContain('fillColor=#23A2D9');
    expect(style).toContain('fontColor=#ffffff');
    expect(style).toContain('strokeColor=#0E7DAD');
    expect(style).toContain('align=center');
    expect(style).toContain('verticalAlign=top');
    expect(style).toContain('arcSize=10');
    expect(style).toContain('metaEdit=1');
    expect(style).toContain('resizable=1');
  });

  it('should format style as semicolon-separated key=value pairs', () => {
    const style = Container.style();
    const parts = style.split(';');
    
    expect(parts.length).toBeGreaterThan(5);
    parts.forEach(part => {
      if (part) {
        expect(part).toMatch(/^[a-zA-Z]+=.+$/);
      }
    });
  });

  it('should have specific Container colors', () => {
    const style = Container.style();
    
    expect(style).toContain('fillColor=#23A2D9');
    expect(style).toContain('strokeColor=#0E7DAD');
  });

  it('does NOT emit the misspelled fontZize key (typo removed)', () => {
    // `fontZize` was a typo (mxGraph silently ignores the unknown key,
    // so it shipped as a garbage `fontZize=11;` token doing nothing).
    // Removed entirely — no sibling element template sets a cell
    // fontSize, and Container's label <div>s all set inline font-size,
    // so the line was inert. render-compare proved zero visual change.
    const style = Container.style();
    expect(style).not.toContain('fontZize');
    expect(style).not.toContain('fontSize=11'); // not "fixed" to an inert lone key — removed
  });
});