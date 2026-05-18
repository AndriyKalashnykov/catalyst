SHELL := /bin/bash

# mise now manages non-language tools (act, gitleaks, trivy) in
# .mise.toml. Make recipes run in `$(SHELL) -c` sub-shells that do NOT
# source shell rc files, so mise's auto-activation never fires inside a
# recipe. Put mise's shims dir on PATH explicitly — empirically
# confirmed (env -i clean PATH): without this, `gitleaks`/`trivy`/`act`
# resolve to "command not found" inside recipes on any non-mise-
# activated shell and in CI. `export` propagates to every recipe
# sub-shell. ~/.local/bin kept for the curl-bootstrapped mise binary.
export PATH := $(HOME)/.local/share/mise/shims:$(HOME)/.local/bin:$(PATH)

# Catalyst — PlantUML C4 → draw.io converter.
# Tunables mirror scripts/render-compare.mjs env defaults (?= lets env/CI override).
#
# PLANTUML_VERSION / DRAWIO_EXPORT_IMAGE are NOT mise-managed: PlantUML
# ships as a JAR (fetched by `make gallery`) and drawio-export as a
# Docker image — neither has a mise backend. Both are Renovate-tracked
# via the inline comments below (the portfolio's standard exception for
# JAR-download / docker-image-pinned tools).
# renovate: datasource=maven depName=net.sourceforge.plantuml:plantuml
PLANTUML_VERSION    ?= 1.2026.2
# renovate: datasource=docker depName=rlespinasse/drawio-export
DRAWIO_EXPORT_IMAGE ?= rlespinasse/drawio-export:v4.51.0
DRAWIO_EXPORT_SCALE ?= 2
RENDER_SRC          ?= tests/fixtures/c4-exhaustive.puml
RENDER_OUT          ?= build/render-compare
CORPUS_DIR          ?= tests/fixtures/corpus
GALLERY_OUT         ?= docs/gallery
PLANTUML_JAR        ?= $(GALLERY_OUT)/plantuml.jar
FACTCHECK_SVG_DIR   ?= build/factcheck-svg

.DEFAULT_GOAL := help

#help: @ List available tasks
help:
	@grep -E '[a-zA-Z\.\-]+:.*?@ .*$$' $(MAKEFILE_LIST) | tr -d '#' | \
		awk 'BEGIN {FS = ":.*?@ "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

#deps: @ Install toolchain via mise (node, act, gitleaks, trivy) + npm ci
deps:
	@if [ -z "$$CI" ] && ! command -v mise >/dev/null 2>&1; then \
		echo "Installing mise (no root; ~/.local/bin)..."; \
		curl -fsSL https://mise.run | sh; \
		echo "mise installed — activate it, then re-run 'make deps':"; \
		echo '  echo '\''eval "$$(~/.local/bin/mise activate bash)"'\'' >> ~/.bashrc'; \
		exit 0; \
	fi
	@mise install
	@npm ci

#deps-render: @ Verify java + docker (needed by gallery / factcheck / render-compare)
deps-render:
	@command -v java >/dev/null 2>&1 || { echo "Error: java required for PlantUML rendering (see setup.sh)."; exit 1; }
	@command -v docker >/dev/null 2>&1 || { echo "Error: docker required for drawio-export rendering."; exit 1; }

#clean: @ Remove build artifacts (dist/, build/, coverage/) — never sources or the committed gallery
clean:
	@rm -rf dist build coverage *.tsbuildinfo

#build: @ Compile TypeScript -> dist/
build: deps
	@npm run build

#lint: @ oxlint src/ + markdownlint (parity with CI's lint job)
lint: deps
	@npm run lint
	@npm run mdlint

#test: @ Run the full vitest suite (fast; no coverage gate — use coverage-check for the CI gate)
test: deps
	@npm run test:run

#coverage-check: @ Run vitest with the 85% coverage gate (mirrors CI's test job — vitest.config.ts thresholds)
coverage-check: deps
	@npm run test:coverage

#vulncheck: @ Audit npm dependencies for known vulnerabilities
vulncheck: deps
	@npm audit --audit-level=moderate

#secrets: @ Scan the repo for leaked secrets (gitleaks, mise-managed)
secrets: deps
	@gitleaks detect --source . --verbose --redact

#trivy-fs: @ Scan filesystem for vulns, secrets, misconfigs (trivy, mise-managed)
trivy-fs: deps
	@trivy fs --scanners vuln,secret,misconfig --severity CRITICAL,HIGH --exit-code 1 .

#static-check: @ Composite security/quality gate (vulncheck + secrets + trivy-fs)
static-check: vulncheck secrets trivy-fs
	@echo "static-check passed."

#golden-update: @ Regenerate drawio structural snapshots after an intentional change
golden-update: deps
	@npm run golden:update

#render-compare: @ Visual proof: render SRC puml + catalyst drawio side-by-side (needs java+docker)
render-compare: deps-render build
	@PLANTUML_VERSION=$(PLANTUML_VERSION) \
		DRAWIO_EXPORT_IMAGE=$(DRAWIO_EXPORT_IMAGE) \
		DRAWIO_EXPORT_SCALE=$(DRAWIO_EXPORT_SCALE) \
		node scripts/render-compare.mjs "$(RENDER_SRC)" "$(RENDER_OUT)"

#gallery: @ Dual-render the use-case corpus into docs/gallery (needs java+docker)
gallery: deps-render build
	@PLANTUML_VERSION=$(PLANTUML_VERSION) \
		DRAWIO_EXPORT_IMAGE=$(DRAWIO_EXPORT_IMAGE) \
		DRAWIO_EXPORT_SCALE=$(DRAWIO_EXPORT_SCALE) \
		CORPUS_DIR=$(CORPUS_DIR) \
		GALLERY_OUT=$(GALLERY_OUT) \
		node scripts/gallery.mjs

#factcheck: @ Numeric PlantUML→drawio fidelity audit of ALL conversions (needs java; the no-eyeballing gate)
factcheck: build
	@command -v java >/dev/null 2>&1 || { echo "Error: java required for PlantUML -tsvg rendering (see setup.sh)."; exit 1; }
	@mkdir -p $(FACTCHECK_SVG_DIR)
	@test -f $(PLANTUML_JAR) || { echo "ERROR: $(PLANTUML_JAR) missing — run 'make gallery' once to fetch it"; exit 1; }
	@java -jar $(PLANTUML_JAR) -tsvg -nometadata $(CORPUS_DIR)/*.puml $(dir $(CORPUS_DIR))*.puml -o $(abspath $(FACTCHECK_SVG_DIR))
	@SVG_DIR=$(FACTCHECK_SVG_DIR) CORPUS_DIR=$(CORPUS_DIR) node scripts/factcheck-geometry.mjs

#gallery-verify: @ Fail if the committed gallery .drawio drifted from the current emit (deterministic; no java/docker)
gallery-verify: build
	@# The .drawio XML IS catalyst's emit output; regenerating it is pure
	@# node + deterministic. If it differs from the committed copies, an
	@# emit/template change shipped without refreshing docs/gallery (the
	@# P4b-class stale-artifact defect). PNG re-render needs docker and is
	@# intentionally NOT gated here — this guards the deterministic root
	@# cause; a failure means "run `make gallery` and commit the refresh".
	@GALLERY_DRAWIO_ONLY=1 CORPUS_DIR=$(CORPUS_DIR) GALLERY_OUT=$(GALLERY_OUT) node scripts/gallery.mjs
	@git diff --quiet -- $(GALLERY_OUT)/drawio || { \
		echo "ERROR: docs/gallery is STALE vs the current emit — run 'make gallery' and commit the refresh."; \
		git --no-pager diff --stat -- $(GALLERY_OUT)/drawio; \
		exit 1; }
	@echo "gallery-verify: docs/gallery .drawio in sync with current emit ✓"

#ci: @ Local CI pipeline — mirrors .github/workflows/ci.yml (lint job + test job) plus static-check
ci: build lint static-check coverage-check gallery-verify
	@echo "Local CI pipeline passed."

#ci-run: @ Run the real .github/workflows/ci.yml locally via act (mise-managed act; needs Docker)
ci-run: deps
	@docker container prune -f 2>/dev/null || true
	@ACT_PORT=$$(shuf -i 40000-59999 -n 1); \
	ARTIFACT_PATH=$$(mktemp -d -t act-artifacts.XXXXXX); \
	act push --workflows .github/workflows/ci.yml \
		--container-architecture linux/amd64 \
		--artifact-server-port "$$ACT_PORT" \
		--artifact-server-path "$$ARTIFACT_PATH"

.PHONY: help deps deps-render clean build lint test coverage-check vulncheck \
	secrets trivy-fs static-check golden-update render-compare gallery \
	factcheck gallery-verify ci ci-run
