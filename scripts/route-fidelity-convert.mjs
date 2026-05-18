#!/usr/bin/env node
/**
 * route-fidelity-convert — internal helper for route-fidelity-matrix.
 *
 * Converts a list of .puml to .drawio using the CURRENTLY-built
 * dist/catalyst.mjs, in a FRESH process. The matrix runs this once
 * per edge-style after that style's clean build: a child process is
 * required because Node's ESM loader caches modules per resolved
 * specifier — an in-process `import('../dist/catalyst.mjs?'+ts)`
 * cache-busts only the entry module, NOT its transitive
 * `Relationship.mjs`, so every style would convert with the first
 * build's module graph (caught by the matrix's R4 self-verify).
 *
 * argv: <outDir> <fixture.puml> [<fixture.puml> ...]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { Catalyst } from '../dist/catalyst.mjs';

const [outDir, ...pumls] = process.argv.slice(2);
if (!outDir || pumls.length === 0) {
  console.error('usage: route-fidelity-convert <outDir> <fixture.puml>...');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
for (const p of pumls) {
  const stem = basename(p, '.puml');
  writeFileSync(join(outDir, `${stem}.drawio`),
    await Catalyst.convert(readFileSync(p, 'utf8')));
}
