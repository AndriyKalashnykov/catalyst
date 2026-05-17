/**
 * Pure PlantUML `-tsvg` entity-geometry parser for the P4b box-metric
 * fact-check (ADR 0010). Extracted so it is unit-testable in isolation
 * (no fs / no Catalyst): a silent regex/parse regression here would
 * rot the ADR's measured constants, so this is contract-locked by
 * `tests/p4b-svg-geom.test.mts`.
 *
 * For every `<!--entity|cluster X-->` group: parse the <rect> and
 * EVERY <text> (x, baseline y, textLength, font-size). Returns one
 * record per group with:
 *  - kind: 'entity' (leaf — the category-1 metric source) | 'cluster'
 *    (boundary — rect spans children, corner title; its inset is NOT
 *    a leaf metric and MUST be excluded by callers)
 *  - left/right: horizontal text-inset (rect edge → text)
 *  - topGap/botGap: rect.y→firstBaseline / lastBaseline→rect.bottom
 *    (baseline-relative — no font-metric guessing; all in the SVG)
 *  - pitches: consecutive inter-baseline deltas tagged by font sizes
 *  - hasImage: a non-rect glyph (sprite/person/db) is present
 * By construction `topGap + Σ(pitch.d) + botGap === rect.height`
 * (modulo float) — callers can assert this as a parse self-check.
 */
export function entityGeom(svg, stem = '') {
  const out = []
  const re = /<!--(entity|cluster) ([^>]+?)-->\s*<g[^>]*>(.*?)<\/g>/gs
  let m
  while ((m = re.exec(svg)) !== null) {
    const kind = m[1], alias = m[2].trim(), body = m[3]
    const rr = /<rect[^>]*?height="([\d.]+)"[^>]*?width="([\d.]+)"[^>]*?x="([-\d.]+)"[^>]*?y="([-\d.]+)"/.exec(body)
    if (!rr) continue
    const rx = +rr[3], ry = +rr[4], rw = +rr[2], rh = +rr[1]
    const ts = [...body.matchAll(/<text[^>]*?font-size="(\d+)"[^>]*?(?:textLength="([\d.]+)"[^>]*?)?x="([-\d.]+)"[^>]*?y="([-\d.]+)"/g)]
      .map(t => ({ fs: +t[1], len: t[2] ? +t[2] : 0, x: +t[3], y: +t[4] }))
      .sort((a, b) => a.y - b.y)
    if (!ts.length) continue
    const hasImage = /<image\b|<use\b|<ellipse\b|<polygon\b/.test(body)
    const left = +(Math.min(...ts.map(t => t.x)) - rx).toFixed(2)
    const right = +((rx + rw) - Math.max(...ts.map(t => t.x + t.len))).toFixed(2)
    const topGap = +(ts[0].y - ry).toFixed(2)
    const botGap = +((ry + rh) - ts[ts.length - 1].y).toFixed(2)
    const pitches = ts.slice(1).map((t, i) => ({ from: ts[i].fs, to: t.fs, d: +(t.y - ts[i].y).toFixed(2) }))
    out.push({ stem, alias, kind, rw, rh, nText: ts.length, fonts: ts.map(t => t.fs).join('+'),
      hasImage, left, right, topGap, botGap, pitches })
  }
  return out
}
