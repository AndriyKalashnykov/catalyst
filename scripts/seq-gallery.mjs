#!/usr/bin/env node
/**
 * Sequence-diagram render GALLERY — the seq analogue of scripts/gallery.mjs.
 *
 * The seq pipeline (ADR 0007 phases a–d2b) had NO committed visual
 * artifact and NO drift gate, unlike the C4 path (docs/gallery +
 * `gallery-verify` + `arrowskew`). Seq fidelity was a one-time manual
 * `render-compare` eyeball into /tmp with zero regression protection —
 * a violation of this repo's "a committed code-generated artifact MUST
 * have a deterministic drift gate" rule for the whole seq subsystem.
 *
 * For every tests/fixtures/seq/*.puml this produces, side by side:
 *   - <name>.drawio      — the catalyst conversion (DETERMINISTIC, pure
 *                           node; the committed drift-gate root)
 *   - <name>.puml.svg    — PlantUML -tsvg render of the SOURCE (ground
 *                           truth, vector)
 *   - <name>.drawio.svg  — drawio-export render of the conversion
 * plus docs/gallery-seq/README.md with both SVGs side by side.
 *
 * SVG (not PNG): vector, text-diffable, the same `-tsvg` ground-truth
 * basis `make factcheck` uses and the drawio-export SVG `make arrowskew`
 * parses — the right committed render-evidence form for review.
 *
 * Modes (mirror gallery.mjs):
 *   SEQ_DRAWIO_ONLY=1  — regenerate ONLY the .drawio (pure node, NO
 *                        java/docker). This IS `make seq-gallery-verify`,
 *                        the CI drift gate: the .drawio is the emit
 *                        output, so an un-refreshed gallery shows as a
 *                        `git diff` here.
 *   (default)          — full: PlantUML -tsvg + catalyst + drawio-export.
 *
 * Env (documented defaults):
 *   PLANTUML_VERSION    default 1.2026.2
 *   PLANTUML_JAR        default docs/gallery/plantuml.jar (shared with
 *                       the C4 gallery; downloaded if absent)
 *   DRAWIO_EXPORT_IMAGE default rlespinasse/drawio-export:v4.51.0
 *   SEQ_DIR             default tests/fixtures/seq
 *   SEQ_GALLERY_OUT     default docs/gallery-seq
 */
import { execFileSync } from 'node:child_process';
import {
  mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync, readdirSync,
  renameSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Catalyst } from '../dist/catalyst.mjs';

const PLANTUML_VERSION = process.env.PLANTUML_VERSION ?? '1.2026.2';
const DRAWIO_IMAGE = process.env.DRAWIO_EXPORT_IMAGE ?? 'rlespinasse/drawio-export:v4.51.0';
const SEQ_DIR = resolve(process.env.SEQ_DIR ?? 'tests/fixtures/seq');
const OUT = resolve(process.env.SEQ_GALLERY_OUT ?? 'docs/gallery-seq');
const SVG = join(OUT, 'svg');
const DRAWIO_DIR = join(OUT, 'drawio');
const DRAWIO_ONLY = process.env.SEQ_DRAWIO_ONLY === '1';

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });

// Shared with the C4 gallery's fetched jar (single source; fetch if the
// caller has never run `make gallery`). The C4-PlantUML !include in each
// fixture pins v2.13.0 (Renovate-tracked) — see memory
// `c4-plantuml-renovate-tracked`.
function ensureJar() {
  const jar = process.env.PLANTUML_JAR ?? 'docs/gallery/plantuml.jar';
  if (!existsSync(jar)) {
    mkdirSync(resolve(jar, '..'), { recursive: true });
    console.log(`· downloading plantuml ${PLANTUML_VERSION}`);
    sh('curl', ['-sSL', '-o', jar,
      `https://repo1.maven.org/maven2/net/sourceforge/plantuml/plantuml/${PLANTUML_VERSION}/plantuml-${PLANTUML_VERSION}.jar`]);
  }
  return jar;
}

mkdirSync(DRAWIO_DIR, { recursive: true });
const fixtures = readdirSync(SEQ_DIR).filter((f) => f.endsWith('.puml')).sort();
if (fixtures.length === 0) {
  console.error(`no .puml fixtures in ${SEQ_DIR}`);
  process.exit(1);
}

if (DRAWIO_ONLY) console.log('· SEQ_DRAWIO_ONLY=1 — .drawio only (drift gate; no java/docker)');

// Step A — catalyst convert (DETERMINISTIC; the gated artifact). Always.
console.log('· converting seq puml -> drawio (catalyst)');
for (const f of fixtures) {
  const stem = basename(f, '.puml');
  const xml = await Catalyst.convert(readFileSync(join(SEQ_DIR, f), 'utf-8'));
  writeFileSync(join(DRAWIO_DIR, `${stem}.drawio`), xml);
}

if (DRAWIO_ONLY) {
  console.log(`· SEQ_DRAWIO_ONLY — wrote ${fixtures.length} .drawio to ${DRAWIO_DIR}`);
  console.log('  (drift gate: `git diff --exit-code -- docs/gallery-seq/drawio`)');
  process.exit(0);
}

mkdirSync(SVG, { recursive: true });

// Step B — PlantUML -tsvg of the SOURCE (vector ground truth), one JVM.
const jar = ensureJar();
console.log(`· rendering ${fixtures.length} source puml via PlantUML -tsvg`);
sh('java', ['-jar', jar, '-tsvg', '-nometadata', `${SEQ_DIR}/`, '-o', SVG]);
for (const f of fixtures) {
  const stem = basename(f, '.puml');
  const produced = join(SVG, `${stem}.svg`);
  // Rename (not copy) to the committed name so the bare PlantUML
  // <stem>.svg isn't left behind as a redundant duplicate.
  if (existsSync(produced)) renameSync(produced, join(SVG, `${stem}.puml.svg`));
}

// Step C — drawio-export -f svg of every .drawio (one container run).
// drawio-export runs as root and writes a root-owned export/ dir; its
// lifecycle is managed root-side (a node rm would EACCES) — same
// discipline as gallery.mjs.
console.log('· rendering drawio via drawio-export -f svg');
const expDir = join(DRAWIO_DIR, 'export');
const cleanExport = () => {
  try {
    sh('docker', ['run', '--rm', '-v', `${DRAWIO_DIR}:/data`,
      '--entrypoint', '/bin/sh', DRAWIO_IMAGE, '-c', 'rm -rf /data/export']);
  } catch { /* nothing to clean */ }
};
cleanExport();
sh('docker', ['run', '--rm', '-v', `${DRAWIO_DIR}:/data`, DRAWIO_IMAGE,
  '-f', 'svg', '.']);
const exported = existsSync(expDir)
  ? readdirSync(expDir).filter((x) => x.endsWith('.svg')) : [];
for (const f of fixtures) {
  const stem = basename(f, '.puml');
  const hit = exported.find((x) => x === `${stem}.svg` || x.startsWith(`${stem}-`));
  if (hit) copyFileSync(join(expDir, hit), join(SVG, `${stem}.drawio.svg`));
  else console.warn(`! no drawio svg for ${stem}`);
}
cleanExport();

// README — flat list (seq fixtures are a phase progression, not C4
// use-case classes); SVG embedded via <img> (GitHub renders inline SVG
// <img>; height-bounded per memory `md-image-embedding`).
const seqRel = SEQ_DIR.replace(`${process.cwd()}/`, '');
const lines = [
  '# Sequence-diagram conversion gallery',
  '',
  'Generated by `make seq-gallery` (`scripts/seq-gallery.mjs`) from every',
  `fixture in [\`${seqRel}/\`](../../${seqRel}/) — ADR 0007 phases a–d2b.`,
  'Each row: the **source PlantUML** `-tsvg` render next to the',
  '**catalyst → draw.io** render.',
  '',
  '> Different layout engines — never pixel-identical. Compare **content**:',
  '> every lifeline, message, arrowhead, note, divider, fragment and `ref`',
  '> frame must survive in source order. The deterministic machine gate is',
  '> `make seq-gallery-verify` (the `.drawio` drift gate, CI); the',
  '> structural gate is `tests/seq/SeqConverter.test.mts`.',
  '',
  'Regenerate after any seq emit change: `make seq-gallery && git add docs/gallery-seq/`.',
  '',
];
for (const f of fixtures) {
  const stem = basename(f, '.puml');
  const src = readFileSync(join(SEQ_DIR, f), 'utf-8').trim();
  const cell = (kind) =>
    `<img src="svg/${stem}.${kind}.svg" alt="${stem} ${kind}" height="360">`;
  lines.push(`## \`${f}\``, '',
    '| Source PlantUML | catalyst → draw.io |', '|---|---|',
    `| ${cell('puml')} | ${cell('drawio')} |`, '',
    '<details><summary>PlantUML source</summary>', '', '```plantuml', src, '```', '',
    '</details>', '');
}
writeFileSync(
  join(OUT, 'README.md'),
  lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n');

console.log(`\nseq-gallery: ${join(OUT, 'README.md')}`);
console.log(`  ${fixtures.length} fixtures · svg in ${SVG} · drawio in ${DRAWIO_DIR}`);
