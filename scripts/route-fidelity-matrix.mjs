#!/usr/bin/env node
/**
 * route-fidelity-matrix — the COMMITTED decision harness for ADR 0013.
 *
 * Supersedes the throwaway /tmp per-style driver (2026-05-18) that
 * produced byte-identical garbage across styles (poisoned restore +
 * root-owned drawio-export dirs). This harness is reliable BY
 * CONSTRUCTION and self-verifying — it ABORTS rather than emit an
 * untrustworthy verdict:
 *
 *  R1  Source restore is `git checkout -- <Relationship.mts>` (cannot
 *      be poisoned, unlike a /tmp copy).
 *  R2  Forced clean rebuild per style (rm dist + *.tsbuildinfo) so the
 *      compiled output cannot be stale.
 *  R3  Self-verify the COMPILED dist carries the expected style token
 *      (orthogonal→`orthogonalEdgeStyle`; curved→`curved`; straight→
 *      neither). Abort otherwise.
 *  R4  Self-verify the three styles' representative `.drawio` are
 *      MUTUALLY DISTINCT (the exact check that caught the last
 *      failure). Abort if any two are equal — no verdict off
 *      identical renders.
 *  R5  Each style renders into its OWN mktemp dir; drawio-export's
 *      root-owned `export/` is never reused or user-`rm`'d.
 *
 * Decision metric (per scripts/route-fidelity.mjs — landed, 44-test
 * validated): each style's corpus-wide (detour, turn) distribution vs
 * the PlantUML `-tsvg` target; lower L1 distance = more PlantUML-
 * faithful. The PlantUML target is rendered once (invariant).
 *
 * Inputs: tests/fixtures/corpus/*.puml — the curated corpus now
 * includes the connector-stress fixtures (rel-self-loop,
 * rel-fan-stress; promoted from the former route-stress/ dir per
 * ADR 0013 blast-radius so they also get gallery + factcheck cover).
 *
 * Needs: node, java + docs/gallery/plantuml.jar (one-time `make
 * gallery`), docker (drawio-export). Heavy (3× clean build + render);
 * a manual decision gate, not CI. `make routefidelity`.
 */
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync,
  rmSync, existsSync, copyFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import {
  pumlEdges, drawioEdges, routeMetrics, summarise,
} from './route-fidelity.mjs';

const REL = 'src/mx/c4/Relationship.mts';
const JAR = process.env.PLANTUML_JAR ?? 'docs/gallery/plantuml.jar';
const IMAGE = process.env.DRAWIO_EXPORT_IMAGE ?? 'rlespinasse/drawio-export:v4.51.0';
const CORPUS = 'tests/fixtures/corpus';
const ORTHO_LINE = "            edgeStyle: 'orthogonalEdgeStyle',";

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const md5 = (s) => createHash('md5').update(s).digest('hex');

function die(msg) { console.error(`route-fidelity-matrix: ABORT — ${msg}`); process.exit(2); }

// The three candidate transforms of the single edgeStyle line.
const STYLES = {
  orthogonal: (src) => src, // baseline; line unchanged
  straight: (src) => {
    if (!src.includes(ORTHO_LINE)) die('orthogonal line not found (straight)');
    return src.replace(ORTHO_LINE + '\n', '');
  },
  curved: (src) => {
    if (!src.includes(ORTHO_LINE)) die('orthogonal line not found (curved)');
    return src.replace(ORTHO_LINE, '            curved: 1,');
  },
};
// R3: token the COMPILED dist must (orthogonal/curved) or must NOT
// (straight) contain.
const EXPECT = {
  orthogonal: (j) => j.includes('orthogonalEdgeStyle'),
  straight: (j) => !j.includes('orthogonalEdgeStyle') && !/\bcurved\b/.test(j),
  curved: (j) => /curved/.test(j) && !j.includes('orthogonalEdgeStyle'),
};

const pumls = () =>
  readdirSync(CORPUS).filter((f) => f.endsWith('.puml')).map((f) => join(CORPUS, f));

async function buildStyle(style, work) {
  const orig = readFileSync(REL, 'utf8');
  writeFileSync(REL, STYLES[style](orig));
  try {
    rmSync('dist', { recursive: true, force: true });
    for (const f of readdirSync('.')) if (f.endsWith('.tsbuildinfo')) rmSync(f);
    sh('npm', ['run', 'build']);
    // R3 — compiled dist must carry the expected style token.
    const compiled = readFileSync('dist/mx/c4/Relationship.mjs', 'utf8');
    if (!EXPECT[style](compiled)) die(`compiled dist token mismatch for "${style}"`);
    // Convert in a FRESH child process BEFORE restoring/rebuilding —
    // an in-process dynamic import would reuse Node's cached
    // Relationship.mjs (only the entry specifier is cache-busted), so
    // every style would emit the first build's graph (the R4-caught
    // failure). The child imports this style's freshly-built dist.
    const draw = join(work, 'drawio');
    sh('node', ['scripts/route-fidelity-convert.mjs', draw, ...pumls()]);
    return draw;
  } finally {
    sh('git', ['checkout', '--', REL]); // R1 — reliable restore
  }
}

function renderSvgs(drawDir, work) {
  // R5 — isolated dir; drawio-export writes a root-owned export/ here
  // that we never reuse or user-rm.
  const stage = mkdtempSync(join(tmpdir(), 'rfm-'));
  for (const f of readdirSync(drawDir)) copyFileSync(join(drawDir, f), join(stage, f));
  sh('docker', ['run', '--rm', '-v', `${stage}:/data`, IMAGE, '-f', 'svg', '/data']);
  return join(stage, 'export');
}

async function main() {
  if (!existsSync(JAR)) die(`${JAR} missing — run \`make gallery\` once to fetch it`);
  try { sh('java', ['-version']); } catch { die('java required (mise-managed; `make deps`)'); }
  try { sh('docker', ['version']); } catch { die('docker required (drawio-export)'); }

  const root = mkdtempSync(join(tmpdir(), 'route-fidelity-'));

  // PlantUML target — rendered ONCE (invariant across catalyst styles).
  const pumlSvg = join(root, 'puml-svg');
  mkdirSync(pumlSvg, { recursive: true });
  sh('java', ['-jar', JAR, '-tsvg', '-nometadata', ...pumls(), '-o', pumlSvg]);
  const pumlRows = [];
  for (const f of readdirSync(pumlSvg).filter((x) => x.endsWith('.svg')))
    for (const e of pumlEdges(readFileSync(join(pumlSvg, f), 'utf8')))
      pumlRows.push(routeMetrics(e.d));
  const P = summarise(pumlRows.filter((m) => m.n >= 2));

  const reprHash = {};
  const results = {};
  for (const style of ['orthogonal', 'straight', 'curved']) {
    const work = join(root, style);
    mkdirSync(work, { recursive: true });
    const drawDir = await buildStyle(style, work);
    reprHash[style] = md5(readFileSync(join(drawDir, 'rel-bidirectional.drawio'), 'utf8'));
    const svgDir = renderSvgs(drawDir, work);
    const rows = [];
    for (const f of readdirSync(svgDir).filter((x) => x.endsWith('.svg')))
      for (const e of drawioEdges(readFileSync(join(svgDir, f), 'utf8')))
        rows.push(routeMetrics(e.d));
    results[style] = summarise(rows.filter((m) => m.n >= 2));
  }

  // R4 — the three representative .drawio MUST be mutually distinct.
  const h = Object.values(reprHash);
  if (new Set(h).size !== 3)
    die(`representative .drawio not mutually distinct across styles ` +
        `(${JSON.stringify(reprHash)}) — the per-style build did not differentiate; ` +
        `verdict would be garbage`);

  console.log(`PlantUML target : edges=${P.edges} meanDetourExcess=${P.meanDetourExcess} ` +
    `medianDetour=${P.medianDetour} meanTurn=${P.meanTurn}`);
  let best = null;
  for (const style of ['orthogonal', 'straight', 'curved']) {
    const C = results[style];
    const dDet = +Math.abs(C.meanDetourExcess - P.meanDetourExcess).toFixed(4);
    const dTrn = +Math.abs(C.meanTurn - P.meanTurn).toFixed(4);
    const L1 = +(dDet + dTrn / Math.PI).toFixed(4); // turn normalised by π (a right angle)
    console.log(`  ${style.padEnd(11)}: edges=${C.edges} meanDetourExcess=${C.meanDetourExcess} ` +
      `meanTurn=${C.meanTurn}  detourΔ=${dDet} turnΔ=${dTrn}  L1=${L1}`);
    if (!best || L1 < best.L1) best = { style, L1 };
  }
  console.log(`\nWINNER (closest to PlantUML target): ${best.style}  (L1=${best.L1})`);
  console.log(`(detourExcess: 0=all straight; turn in rad, ~π per right angle. ` +
    `Lower L1 = more dot-spline-faithful.)`);
}

main();
