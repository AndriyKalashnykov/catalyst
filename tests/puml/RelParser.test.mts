import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RelParser } from '../../src/puml/RelParser.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('RelParser', () => {
  it('should create RelParser instance', () => {
    const rel = { $: { id: 'link_source_target' } };
    const parser = new RelParser(rel);
    
    expect(parser).toBeInstanceOf(RelParser);
  });

  it('should parse relations from PUML string', () => {
    const pumlString = `
      System(system1, "System 1")
      System(system2, "System 2")
      Rel(system1, system2, "Uses", "HTTP API")
      Rel(system2, system1, "Responds", "JSON data")
    `;
    
    const relations = RelParser.getRelations(pumlString);
    
    expect(relations).toHaveLength(2);
    expect(relations[0]).toEqual({
      source: 'system1',
      target: 'system2',
      label: 'Uses',
      description: 'HTTP API',
      bidirectional: false,
      back: false,
    });
    expect(relations[1]).toEqual({
      source: 'system2',
      target: 'system1',
      label: 'Responds',
      description: 'JSON data',
      bidirectional: false,
      back: false,
    });
  });

  it('should return empty array when no relations found', () => {
    const pumlString = `
      System(system1, "System 1")
      System(system2, "System 2")
    `;
    
    const relations = RelParser.getRelations(pumlString);
    
    expect(relations).toHaveLength(0);
  });

  it('should parse path coordinates from SVG path', () => {
    const rel = {
      path: [{
        $: {
          d: 'M100,200 C150,200 200,250 250,300'
        }
      }]
    };
    const parser = new RelParser(rel);
    
    const coordinates = parser.parsePathCoordinates(rel.path[0].$.d);
    
    expect(coordinates).toEqual({
      start: { x: 100, y: 200 },
      end: { x: 250, y: 300 }
    });
  });

  it('should return null for invalid path coordinates', () => {
    const rel = {};
    const parser = new RelParser(rel);
    
    const coordinates = parser.parsePathCoordinates('invalid path');
    
    expect(coordinates).toBeNull();
  });

  it('should get geometry with source and target points', () => {
    const rel = {
      path: [{
        $: {
          d: 'M100,200 C150,200 200,250 250,300'
        }
      }]
    };
    const parser = new RelParser(rel);
    
    const geometry = parser.getpath();
    
    // @ts-expect-error Testing dynamic property
    expect(geometry.mxPoint).toHaveLength(2);
    // @ts-expect-error Testing dynamic property
    expect(geometry.mxPoint[0].$.x).toBe(100);
    // @ts-expect-error Testing dynamic property
    expect(geometry.mxPoint[0].$.y).toBe(200);
    // @ts-expect-error Testing dynamic property
    expect(geometry.mxPoint[0].$.as).toBe('sourcePoint');
    // @ts-expect-error Testing dynamic property
    expect(geometry.mxPoint[1].$.x).toBe(250);
    // @ts-expect-error Testing dynamic property
    expect(geometry.mxPoint[1].$.y).toBe(300);
    // @ts-expect-error Testing dynamic property
    expect(geometry.mxPoint[1].$.as).toBe('targetPoint');
  });

  it('should get geometry without points when no path', () => {
    const rel = {};
    const parser = new RelParser(rel);
    
    const geometry = parser.getpath();
    
    // @ts-expect-error Testing dynamic property
    expect(geometry.mxPoint).toBeUndefined();
  });

  it('should get from and to from relation ID', () => {
    const rel = { $: { id: 'link_source_target' } };
    const parser = new RelParser(rel);
    
    expect(parser.getFrom()).toBe('source');
    expect(parser.getTo()).toBe('target');
  });

  it('should handle complex relation IDs', () => {
    const rel = { $: { id: 'link_system1_container2' } };
    const parser = new RelParser(rel);
    
    expect(parser.getFrom()).toBe('system1');
    expect(parser.getTo()).toBe('container2');
  });

  it('should return empty array when no ID present', () => {
    const rel = {};
    const parser = new RelParser(rel);
    
    expect(parser.getFrom()).toBeUndefined();
    expect(parser.getTo()).toBeUndefined();
  });

  it('should handle malformed relation ID', () => {
    const rel = { $: { id: 'invalid_format' } };
    const parser = new RelParser(rel);
    
    expect(parser.getFrom()).toBe('invalid');
    expect(parser.getTo()).toBe('format');
  });

  it('should parse decimal coordinates', () => {
    const rel = {};
    const parser = new RelParser(rel);
    
    const coordinates = parser.parsePathCoordinates('M100.5,200.7 C150.2,200.3 200.8,250.1 250.9,300.4');
    
    expect(coordinates).toEqual({
      start: { x: 100.5, y: 200.7 },
      end: { x: 250.9, y: 300.4 }
    });
  });

  it('should parse negative coordinates', () => {
    const rel = {};
    const parser = new RelParser(rel);
    
    const coordinates = parser.parsePathCoordinates('M-100,-200 C-150,-200 -200,-250 -250,-300');
    
    expect(coordinates).toEqual({
      start: { x: -100, y: -200 },
      end: { x: -250, y: -300 }
    });
  });
});

describe('RelParser — directional intent (L1)', () => {
  it('extracts direction from short + long Rel/BiRel variants', () => {
    const puml = [
      'Rel(a, b, "plain")',
      'Rel_U(a, c, "short up")',
      'Rel_Down(a, d, "long down")',
      'Rel_L(b, c, "short left")',
      'BiRel_Right(c, d, "bi right")',
      'Rel_Back(d, a, "back has no dir")',
    ].join('\n');
    const rels = RelParser.getRelations(puml);
    const byLabel = Object.fromEntries(rels.map(r => [r.label, r.direction]));
    expect(byLabel['plain']).toBeUndefined();
    expect(byLabel['short up']).toBe('U');
    expect(byLabel['long down']).toBe('D');
    expect(byLabel['short left']).toBe('L');
    expect(byLabel['bi right']).toBe('R');
    expect(byLabel['back has no dir']).toBeUndefined();
  });

  it('parses Lay_* as layout-only constraints (no visible relation)', () => {
    const puml = [
      'Rel(a, b, "visible")',
      'Lay_U(a, c)',
      'Lay_Down(b, d)',
      'Lay_Distance(a, d, 3)',
    ].join('\n');

    // Lay_* must NOT appear as relations (they draw no connector).
    expect(RelParser.getRelations(puml).map(r => r.label)).toEqual(['visible']);

    const lc = RelParser.getLayoutConstraints(puml);
    expect(lc).toEqual([
      { source: 'a', target: 'c', direction: 'U' },
      { source: 'b', target: 'd', direction: 'D' },
      { source: 'a', target: 'd', distance: 3 },
    ]);
  });

  it('returns no constraints when there are no Lay_* directives', () => {
    expect(RelParser.getLayoutConstraints('Rel(a, b, "x")')).toEqual([]);
  });
});
describe('RelParser — RelIndex leading-index + numeric-alias safety (7-a)', () => {
  // #23 fix: the RelIndex ordinal is the POINT of a C4_Dynamic diagram
  // (PlantUML renders "1: opens"); it must be PRESERVED as an `n: ` verb
  // prefix, not discarded. from/to/technology unaffected.
  it('RelIndex($index, $from, $to, $label) preserves the index as an `n: ` prefix', () => {
    const rels = RelParser.getRelations('RelIndex(1, user, web, "opens")');
    expect(rels).toHaveLength(1);
    expect(rels[0]).toMatchObject({ source: 'user', target: 'web', label: '1: opens' });
  });

  it('RelIndex 5-arg keeps technology (group 6) and prefixes the index', () => {
    const rels = RelParser.getRelations('RelIndex(2, web, api, "GET /orders", "JSON/HTTPS")');
    expect(rels[0]).toMatchObject({ source: 'web', target: 'api', label: '2: GET /orders', description: 'JSON/HTTPS' });
  });

  it('RelIndex_* directional variant also preserves the leading index', () => {
    const rels = RelParser.getRelations('RelIndex_Back(3, a, b, "x")');
    expect(rels[0]).toMatchObject({ source: 'a', target: 'b', label: '3: x' });
  });

  it('plain Rel with a numeric leading argument is NOT treated as a RelIndex index', () => {
    // Pathological but legal: a node literally aliased "12". The lookbehind
    // gate means only RelIndex* consumes a leading integer.
    const rels = RelParser.getRelations('Rel(12, b, "x")');
    expect(rels).toHaveLength(1);
    expect(rels[0]).toMatchObject({ source: '12', target: 'b', label: 'x' });
  });

  it('BiRel with a numeric leading alias keeps it as the source', () => {
    const rels = RelParser.getRelations('BiRel(99, target, "syncs")');
    expect(rels[0]).toMatchObject({ source: '99', target: 'target', label: 'syncs', bidirectional: true });
  });
});

// C4-PlantUML v2.13.0 C4.puml:
//   Rel       → $getRel("-->>", $from, $to, …)   arrowhead at $to
//   Rel_Back  → $getRel("<<--", $from, $to, …)   arrowhead at $from ONLY
//   Rel_Back_Neighbor → "<<-"   (still a $from-side arrowhead)
//   BiRel     → "<<-->>"        arrowheads at BOTH ends
// Rel_Back does NOT swap $from/$to — only the arrowhead end moves. The
// parser exposes this as a `back` boolean; `_Back` in the primitive
// name is the sole discriminator and is mutually exclusive with BiRel
// (C4-PlantUML has no BiRel_Back).
describe('RelParser — Rel_Back arrow-reversal flag', () => {
  it('plain Rel → back:false, bidirectional:false', () => {
    const r = RelParser.getRelations('Rel(a, b, "uses")')[0];
    expect(r).toMatchObject({ source: 'a', target: 'b', back: false, bidirectional: false });
  });

  it('Rel_Back → back:true and does NOT swap source/target', () => {
    const r = RelParser.getRelations('Rel_Back(a, b, "acks")')[0];
    // critical: $from/$to order preserved exactly (only the arrowhead reverses)
    expect(r).toMatchObject({ source: 'a', target: 'b', label: 'acks', back: true, bidirectional: false });
  });

  it('Rel_Back with a 4th technology arg still flags back:true', () => {
    const r = RelParser.getRelations('Rel_Back(b, a, "callback", "webhook")')[0];
    expect(r).toMatchObject({ source: 'b', target: 'a', label: 'callback', description: 'webhook', back: true });
  });

  it('Rel_Back_Neighbor → back:true (the "<<-" form is still $from-side)', () => {
    const r = RelParser.getRelations('Rel_Back_Neighbor(q, api, "drains")')[0];
    expect(r).toMatchObject({ source: 'q', target: 'api', back: true, bidirectional: false });
  });

  it('RelIndex_Back → back:true and keeps the ordinal prefix', () => {
    const r = RelParser.getRelations('RelIndex_Back(3, a, b, "x")')[0];
    expect(r).toMatchObject({ source: 'a', target: 'b', label: '3: x', back: true });
  });

  it('BiRel → back:false (mutually exclusive; no BiRel_Back in C4-PlantUML)', () => {
    const r = RelParser.getRelations('BiRel(a, b, "syncs")')[0];
    expect(r).toMatchObject({ back: false, bidirectional: true });
  });

  it('forward directional Rel_Up is NOT back (only _Back reverses)', () => {
    const r = RelParser.getRelations('Rel_Up(a, b, "up")')[0];
    expect(r).toMatchObject({ back: false, bidirectional: false });
  });

  it('counts every Rel_Back* in the all-rel-variants fixture', () => {
    const rels = RelParser.getRelations(
      readFileSync(join(__dirname, '..', 'fixtures', 'c4-all-rel-variants.puml'), 'utf-8'),
    );
    // Fixture has Rel_Back(a,b,…) + Rel_Back_Neighbor(a,b,…) = 2 back rels;
    // none of the plain/forward/BiRel lines are back.
    expect(rels.filter((r) => r.back).length).toBe(2);
    expect(rels.filter((r) => r.back && r.bidirectional).length).toBe(0);
  });
});
