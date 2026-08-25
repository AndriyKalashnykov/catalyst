#!/usr/bin/env node
/**
 * Batch dual-render GALLERY for the use-case corpus.
 *
 * For every tests/fixtures/corpus/*.puml it produces, side by side:
 *   - <name>.puml.png    — PlantUML render of the SOURCE (ground truth)
 *   - <name>.drawio      — the catalyst conversion
 *   - <name>.drawio.png  — draw.io render of that conversion
 *   - svg/<name>.{puml,drawio}.svg — reproducible vector evidence
 *     (parity with the seq gallery #132; the README embeds the PNGs)
 * and writes docs/gallery/README.md grouping the fixtures by use-case class
 * with both images next to each other so a human can eyeball that every
 * element/connector/label survived the conversion.
 *
 * This is the human-review half of the correctness story; the machine half is
 * tests/corpus-sanity.test.mts (structural gate) + tests/golden.test.mjs.
 * PlantUML and draw.io use different layout engines, so the two images are
 * never pixel-identical even for a perfect conversion — compare CONTENT
 * (boxes, arrows, labels, descriptions), not geometry.
 *
 * Requirements: java, docker, network (PlantUML C4 !include + jar download).
 *
 * Env (all overridable, documented defaults — mirrors render-compare.mjs):
 *   PLANTUML_VERSION    default 1.2026.2
 *   PLANTUML_JAR        default <OUT>/plantuml.jar (downloaded if absent)
 *   DRAWIO_EXPORT_IMAGE default rlespinasse/drawio-export:v4.51.0
 *   DRAWIO_EXPORT_SCALE default 2
 *   CORPUS_DIR          default tests/fixtures/corpus
 *   GALLERY_OUT         default docs/gallery
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync, readdirSync, renameSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Catalyst } from '../dist/catalyst.mjs';

const PLANTUML_VERSION = process.env.PLANTUML_VERSION ?? '1.2026.7';
const DRAWIO_IMAGE = process.env.DRAWIO_EXPORT_IMAGE ?? 'rlespinasse/drawio-export:v4.54.0';
const DRAWIO_SCALE = process.env.DRAWIO_EXPORT_SCALE ?? '2';
// GALLERY_MD_ONLY=1  — regenerate ONLY docs/gallery/README.md from the
//   already-rendered images (skip java/docker render + catalyst
//   convert). For a markdown-template change with ZERO PNG churn.
// GALLERY_DRAWIO_ONLY=1 — regenerate ONLY the catalyst .drawio XML
//   (step 2). Pure node, deterministic, NO java/docker — this is the
//   `make gallery-verify` / CI drift gate: the .drawio IS the emit
//   output, so an emit change that didn't refresh the gallery shows
//   as a `git diff` here (the P4b-class stale-artifact defect).
const MD_ONLY = process.env.GALLERY_MD_ONLY === '1';
const DRAWIO_ONLY = process.env.GALLERY_DRAWIO_ONLY === '1';
// step 1 (PlantUML render) + step 3 (drawio-export) need java/docker;
// run them only for a full `make gallery`.
const RENDER = !MD_ONLY && !DRAWIO_ONLY;
const CORPUS_DIR = resolve(process.env.CORPUS_DIR ?? 'tests/fixtures/corpus');
const OUT = resolve(process.env.GALLERY_OUT ?? 'docs/gallery');
const IMG = join(OUT, 'img');
// Committed reproducible-SVG render evidence (parity with the seq
// gallery, #132): SVG is vector + diff-stable (PNG carries AA jitter —
// e.g. the level-component.puml.png render-noise churn in #129). PNG
// stays for the human README embed; SVG is the reproducible artifact.
const SVG = join(OUT, 'svg');
const DRAWIO_DIR = join(OUT, 'drawio');

const CLASSES = [
  ['Topology shapes', 'topology-', 'Stresses the ELK layout engine: rank ordering, fan-out, wide ranks, cycles, disconnected components, deep nesting.'],
  ['Relationship variants', 'rel-', 'Bidirectional, directional hints, with/without technology, long labels, layout-only `Lay_` constraints.'],
  ['C4 level coverage', 'level-', 'One canonical diagram per C4 abstraction (Component, Dynamic, System Landscape). Context/Container/Deployment live in tests/fixtures/.'],
  ['Edge cases & styling', 'edge-', 'Tags / dashed rels, Unicode & XML-special chars, label-only entities, a ~30-node diagram.'],
  // Inert for the use-case corpus (no `feat-` fixtures there); active
  // when this same script renders the c4-feat gallery (CORPUS_DIR=
  // tests/fixtures/c4-feat) — dedicated coverage for the display/style
  // residual features that have zero use-case-corpus usage.
  ['C4 display/style features', 'feat-', 'HIDE_STEREOTYPE, sketch (LAYOUT_AS_SKETCH/SET_SKETCH_STYLE), note callouts, legend, AddProperty — each zero-corpus-usage, dedicated fixtures + committed SVG.'],
];

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

// Single source of the PlantUML jar fetch (the full-render PNG path,
// step 1). `make factcheck` fetches the jar via its own `make gallery`
// one-time bootstrap (host-JVM manual gate; not CI — see Makefile).
function ensureJar() {
  const jar = process.env.PLANTUML_JAR ?? join(OUT, 'plantuml.jar');
  if (!existsSync(jar)) {
    console.log(`· downloading plantuml ${PLANTUML_VERSION}`);
    sh('curl', ['-sSL', '-o', jar,
      `https://repo1.maven.org/maven2/net/sourceforge/plantuml/plantuml/${PLANTUML_VERSION}/plantuml-${PLANTUML_VERSION}.jar`]);
  }
  return jar;
}

mkdirSync(IMG, { recursive: true });
mkdirSync(DRAWIO_DIR, { recursive: true });
if (RENDER) mkdirSync(SVG, { recursive: true });

const fixtures = readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.puml')).sort();
if (fixtures.length === 0) {
  console.error(`no .puml fixtures in ${CORPUS_DIR}`);
  process.exit(1);
}

if (MD_ONLY) console.log('· GALLERY_MD_ONLY=1 — README only (no render, no convert)');
if (DRAWIO_ONLY) console.log('· GALLERY_DRAWIO_ONLY=1 — .drawio only (drift gate; no java/docker)');

if (RENDER) {
// 1. PlantUML: render the whole corpus dir in one JVM invocation.
const jar = ensureJar();
console.log(`· rendering ${fixtures.length} source puml via PlantUML`);
sh('java', ['-jar', jar, '-tpng', '-nometadata', `${CORPUS_DIR}/`, '-o', IMG]);
for (const f of fixtures) {
  const stem = basename(f, '.puml');
  const produced = join(IMG, `${stem}.png`);
  if (existsSync(produced)) {
    // Rename (not copy) to the committed name so the bare PlantUML <stem>.png
    // isn't left behind as a redundant duplicate of <stem>.puml.png.
    renameSync(produced, join(IMG, `${stem}.puml.png`));
  }
}
// 1b. PlantUML -tsvg (reproducible vector evidence, parity with seq).
sh('java', ['-jar', jar, '-tsvg', '-nometadata', `${CORPUS_DIR}/`, '-o', SVG]);
for (const f of fixtures) {
  const stem = basename(f, '.puml');
  const produced = join(SVG, `${stem}.svg`);
  if (existsSync(produced)) renameSync(produced, join(SVG, `${stem}.puml.svg`));
}
}

// 2. catalyst: puml -> drawio for every fixture. Runs for a full
//    render AND the drift gate (GALLERY_DRAWIO_ONLY); skipped only for
//    the README-only mode.
if (!MD_ONLY) {
console.log('· converting puml -> drawio (catalyst)');
for (const f of fixtures) {
  const stem = basename(f, '.puml');
  const xml = await Catalyst.convert(readFileSync(join(CORPUS_DIR, f), 'utf-8'));
  writeFileSync(join(DRAWIO_DIR, `${stem}.drawio`), xml);
}
}

if (RENDER) {
// 3. draw.io: render every .drawio in one container run (folder input).
//    The container runs as root and writes a root-owned `export/` dir, so its
//    lifecycle is managed root-side (a node rmSync would EACCES).
console.log('· rendering drawio via drawio-export');
const expDir = join(DRAWIO_DIR, 'export');
const cleanExport = () => {
  try {
    sh('docker', ['run', '--rm', '-v', `${DRAWIO_DIR}:/data`,
      '--entrypoint', '/bin/sh', DRAWIO_IMAGE, '-c', 'rm -rf /data/export']);
  } catch { /* nothing to clean */ }
};
cleanExport();
sh('docker', ['run', '--rm', '-v', `${DRAWIO_DIR}:/data`, DRAWIO_IMAGE,
  '-f', 'png', '--scale', DRAWIO_SCALE, '.']);
const exported = existsSync(expDir)
  ? readdirSync(expDir).filter((x) => x.endsWith('.png'))
  : [];
for (const f of fixtures) {
  const stem = basename(f, '.puml');
  // drawio-export names files "<stem>-<diagramName>.png" (diagram = "Page-1").
  const hit = exported.find((x) => x === `${stem}.png` || x.startsWith(`${stem}-`));
  if (hit) copyFileSync(join(expDir, hit), join(IMG, `${stem}.drawio.png`));
  else console.warn(`! no drawio png for ${stem}`);
}
cleanExport();
// 3b. drawio-export -f svg (reproducible vector evidence, parity w/ seq).
sh('docker', ['run', '--rm', '-v', `${DRAWIO_DIR}:/data`, DRAWIO_IMAGE,
  '-f', 'svg', '.']);
const exportedSvg = existsSync(expDir)
  ? readdirSync(expDir).filter((x) => x.endsWith('.svg'))
  : [];
for (const f of fixtures) {
  const stem = basename(f, '.puml');
  const hit = exportedSvg.find((x) => x === `${stem}.svg` || x.startsWith(`${stem}-`));
  if (hit) copyFileSync(join(expDir, hit), join(SVG, `${stem}.drawio.svg`));
  else console.warn(`! no drawio svg for ${stem}`);
}
cleanExport();
}

// The drift gate stops here: it only needs the regenerated .drawio
// (step 2) to `git diff` against the committed copies.
if (DRAWIO_ONLY) {
  console.log(`· GALLERY_DRAWIO_ONLY — wrote ${fixtures.length} .drawio to ${DRAWIO_DIR}`);
  console.log('  (drift gate: `git diff --exit-code -- docs/gallery/drawio`)');
} else {

// 4. Gallery README — grouped by class, both images side by side.
const lines = [];
lines.push('# Conversion gallery — use-case corpus');
lines.push('');
lines.push('Generated by `make gallery` (`scripts/gallery.mjs`) from every fixture in');
lines.push('[`tests/fixtures/corpus/`](../../tests/fixtures/corpus/). Each row shows the');
lines.push('**source PlantUML** render next to the **catalyst → draw.io** render.');
lines.push('');
lines.push('> PlantUML and draw.io use different layout engines — the two images are');
lines.push('> never pixel-identical. Compare **content**: every box, arrow, verb,');
lines.push('> technology `[in brackets]`, and description must survive. The machine');
lines.push('> gate is [`tests/corpus-sanity.test.mts`](../../tests/corpus-sanity.test.mts).');
lines.push('');
lines.push('Regenerate after any engine change: `make gallery && git add docs/gallery/`.');
lines.push('');
for (const [title, prefix, blurb] of CLASSES) {
  const members = fixtures.filter((f) => f.startsWith(prefix));
  if (members.length === 0) continue;
  lines.push(`## ${title}`);
  lines.push('');
  lines.push(blurb);
  lines.push('');
  for (const f of members) {
    const stem = basename(f, '.puml');
    const src = readFileSync(join(CORPUS_DIR, f), 'utf-8').trim();
    lines.push(`### \`${f}\``);
    lines.push('');
    lines.push('| Source PlantUML | catalyst → draw.io |');
    lines.push('|---|---|');
    // Height-bounded HTML <img> (per memory `md-image-embedding`).
    // GitHub's sanitizer strips `style=`/`class`, so only the
    // width|height ATTR bounds an image and only ONE axis. `height=360`
    // + GitHub's built-in `max-width:100%` is a two-sided bound: tall
    // images cap at 360px high; wide ones are bound by column width
    // (aspect preserved). 360 keeps the scale-2 median crisp.
    //
    // P13's `width="420"` (uniform columns) was REVERTED here: catalyst
    // boxes are PlantUML-correct per-leaf, but ELK lays diagrams out
    // much narrower than PlantUML's dot (wRatio 0.19–0.67 across 14/20
    // fixtures — a layout-aspect mismatch, NOT a box-size bug).
    // Uniform `width=420` then magnified those intrinsically-narrow
    // diagrams 3–5× → "humongous fonts" side-by-side (the trade P13's
    // research flagged as "accepted" — user rejected it). `height=360`
    // caps that magnification until the layout-aspect issue itself is
    // fixed (the real fix; see docs/research/p13-gallery-uniformity.md
    // "REVERTED" note + the CLAUDE.md backlog layout-aspect item).
    const cell = (kind) =>
      `<img src="img/${stem}.${kind}.png" alt="${stem} ${kind}" height="360">`;
    lines.push(`| ${cell('puml')} | ${cell('drawio')} |`);
    lines.push('');
    lines.push('<details><summary>PlantUML source</summary>');
    lines.push('');
    lines.push('```plantuml');
    lines.push(src);
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }
}
// Collapse any accidental run of blank lines to a single one and end with
// exactly one trailing newline — markdownlint MD012 (no multiple consecutive
// blank lines) is enforced by `npm run mdlint` in CI.
writeFileSync(
  join(OUT, 'README.md'),
  lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n',
);

console.log(`\ngallery: ${join(OUT, 'README.md')}`);
console.log(`  ${fixtures.length} fixtures · images in ${IMG} · drawio in ${DRAWIO_DIR}`);
}
