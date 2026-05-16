import { openSync } from 'fontkit'
import type { Font } from 'fontkit'
import { fileURLToPath } from 'node:url'

/**
 * Real text measurement (L3) via fontkit on the bundled Liberation Sans TTFs
 * (SIL OFL 1.1; metric-compatible with Arial/Helvetica — mxGraph/drawio's
 * default label font). Every value comes from the font's own tables:
 *   width      — Σ glyph advances (hmtx) ÷ unitsPerEm × fontSize
 *   lineHeight — (ascent − descent + lineGap) ÷ unitsPerEm × fontSize
 *   space()    — advance of ' ' (used as the font-derived padding unit)
 * No estimated ratios. The bundled font makes it deterministic regardless of
 * host fonts (the documented residual caveat: a drawio-export host could
 * fall back to a different installed font — accepted ceiling).
 */
const fontDir = fileURLToPath(new URL('../assets/fonts/', import.meta.url))
const regular: Font = openSync(`${fontDir}LiberationSans-Regular.ttf`) as Font
const bold: Font = openSync(`${fontDir}LiberationSans-Bold.ttf`) as Font

const pick = (isBold: boolean): Font => (isBold ? bold : regular)

/** Rendered width (px) of a single line at the given px size. */
export function textWidth(text: string, fontSizePx: number, isBold = false): number {
  const f = pick(isBold)
  if (!text) return 0
  const run = f.layout(text)
  return (run.advanceWidth / f.unitsPerEm) * fontSizePx
}

/** Natural line height (px) — includes the font's own leading (lineGap).
 *  This is the FONT-INTRINSIC value (Liberation Sans ≈ 1.150·fontSize).
 *  Do NOT use it to size a box to its drawio-rendered label — drawio
 *  renders via mxGraph, which lays each line out at a fixed relative
 *  line box, not the font's hhea metrics (see {@link renderedLineHeight}). */
export function lineHeight(fontSizePx: number, isBold = false): number {
  const f = pick(isBold)
  return ((f.ascent - f.descent + f.lineGap) / f.unitsPerEm) * fontSizePx
}

/**
 * mxGraph's HTML-label line box: `LINE_HEIGHT = 1.2`, `ABSOLUTE_LINE_HEIGHT
 * = false` (i.e. 1.2 × fontSize, relative) — verified in the authoritative
 * mxGraph source (`util/mxConstants.js`) and its maxGraph successor
 * (`util/Constants.ts`). drawio renders every catalyst C4 label through
 * mxGraph, so a box sized to fit its rendered text MUST use THIS height,
 * not fontkit's font-intrinsic ≈1.150 (which under-sizes ~4.4 %/line and
 * clips the last line of tall multi-line descriptions). Real renderer
 * metric, not an invented constant.
 */
const MX_LINE_HEIGHT = 1.2

/**
 * mxGraph's default label font size, `DEFAULT_FONTSIZE = 11` — verified
 * in the authoritative mxGraph source (`util/mxConstants.js`,
 * `DEFAULT_FONTSIZE: 11`, `DEFAULT_FONTFAMILY: 'Arial,Helvetica'`) and
 * its maxGraph successor (`DEFAULT_FONTSIZE = 11`). Any catalyst label
 * `<div>` that does NOT set an explicit `font-size` (the Relationship
 * verb/technology template) renders at THIS size, so its measurement
 * MUST use it. A cited renderer constant — exactly like
 * {@link MX_LINE_HEIGHT}, not an invented number. (The Arial/Helvetica
 * default is also why the bundled metric-compatible Liberation Sans is
 * the correct measurement font.)
 */
export const MX_DEFAULT_FONTSIZE = 11

export function renderedLineHeight(fontSizePx: number): number {
  return fontSizePx * MX_LINE_HEIGHT
}

/** Advance (px) of a space — the font-derived padding unit. */
export function spaceAdvance(fontSizePx: number, isBold = false): number {
  return textWidth(' ', fontSizePx, isBold)
}

/**
 * Greedy word-wrap to a max content width; returns the wrapped lines. Mirrors
 * drawio's `whiteSpace=wrap` (break on spaces). A single word longer than the
 * width is kept on its own line (drawio does not hyphenate).
 */
export function wrap(text: string, maxWidthPx: number, fontSizePx: number, isBold = false): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let line = words[0]
  for (let i = 1; i < words.length; i++) {
    const candidate = `${line} ${words[i]}`
    if (textWidth(candidate, fontSizePx, isBold) <= maxWidthPx) {
      line = candidate
    } else {
      lines.push(line)
      line = words[i]
    }
  }
  lines.push(line)
  return lines
}
