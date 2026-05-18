import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      // The coverage CONTRACT is the shipped library: src/**. scripts/*.mjs
      // are dev/measurement instruments (gallery, factcheck, route-fidelity,
      // bendcount, p4b) — their pure cores have targeted unit tests, but a
      // docker-orchestration script has no meaningful aggregate-coverage
      // bar and must not dilute the library gate. Scoping `include` to
      // src/** is what makes the threshold the documented ≈97% (not the
      // ~72% the leaked scripts produced while the broken `global` key —
      // see below — silently disabled enforcement entirely).
      // All source is .mts; scoping to the extension keeps v8's
      // uncovered-file parser away from src/assets (fonts/LICENSE) —
      // a bare src/** glob makes it PARSE_ERROR on the .ttf binaries.
      include: ['src/**/*.mts'],
      exclude: ['src/**/*.d.mts'],
      // Vitest threshold keys live DIRECTLY under `thresholds` (or as glob
      // pattern keys). There is NO `thresholds.global` key — that is
      // Jest/nyc syntax; Vitest treats `global` as a glob matching zero
      // files, so the prior config NEVER enforced anything (cov exit 0 at
      // 72% branch). Verified against vitest.dev/config/coverage (v4.1.6).
      thresholds: {
        branches: 85,
        functions: 85,
        lines: 85,
        statements: 85
      }
    }
  },
  resolve: {
    extensions: ['.mts', '.ts', '.js', '.mjs']
  }
});
