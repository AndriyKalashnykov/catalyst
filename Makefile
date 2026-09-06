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
PLANTUML_VERSION    ?= 1.2026.8
# renovate: datasource=docker depName=rlespinasse/drawio-export
DRAWIO_EXPORT_IMAGE ?= rlespinasse/drawio-export:v4.59.1
DRAWIO_EXPORT_SCALE ?= 2
RENDER_SRC          ?= tests/fixtures/c4-exhaustive.puml
RENDER_OUT          ?= build/render-compare
CORPUS_DIR          ?= tests/fixtures/corpus
GALLERY_OUT         ?= docs/gallery
SEQ_GALLERY_OUT     ?= docs/gallery-seq
C4FEAT_DIR          ?= tests/fixtures/c4-feat
C4FEAT_OUT          ?= docs/gallery-c4feat
PLANTUML_JAR        ?= $(GALLERY_OUT)/plantuml.jar
FACTCHECK_SVG_DIR   ?= build/factcheck-svg
# act's local artifact server binds an ephemeral host port (random in
# this band to avoid collisions across parallel `make ci-run` runs).
ACT_PORT_LOW        ?= 40000
ACT_PORT_HIGH       ?= 59999

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
deps-render: deps
	@command -v java >/dev/null 2>&1 || { echo "Error: java (Temurin) is mise-managed — run 'make deps'."; exit 1; }
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

#static-check: @ Composite quality gate — lint + security (one CI job)
static-check: lint vulncheck secrets trivy-fs
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

#factcheck: @ Numeric PlantUML→drawio fidelity audit of ALL conversions (host-JVM PlantUML; the no-eyeballing MANUAL gate — NOT CI-portable, see ADR 0010 / open-followups)
factcheck: build
	@command -v java >/dev/null 2>&1 || { echo "Error: java (Temurin) is mise-managed — run 'make deps'."; exit 1; }
	@# Host-JVM render. PlantUML text geometry is host-font-dependent, so
	@# the ratioBad ratchet (and ADR 0010's PUML_LEAF_BOX) is reproducible
	@# only against the calibration host — this is a MANUAL gate, not CI.
	@# Docker-pinning it was attempted 2026-05-18 and empirically closed:
	@# the only portable image (plantuml/plantuml, DejaVu-only) renders a
	@# noisier, multi-modal oracle than the ADR-0010 host, so it cannot be
	@# the canonical oracle without degrading a clean category-1 metric.
	@# The deterministic render-truth CI contract is `make arrowskew`.
	@test -f $(PLANTUML_JAR) || { echo "ERROR: $(PLANTUML_JAR) missing — run 'make gallery' once to fetch it"; exit 1; }
	@mkdir -p $(FACTCHECK_SVG_DIR)
	@java -jar $(PLANTUML_JAR) -tsvg -nometadata $(CORPUS_DIR)/*.puml $(dir $(CORPUS_DIR))*.puml -o $(abspath $(FACTCHECK_SVG_DIR))
	@SVG_DIR=$(FACTCHECK_SVG_DIR) CORPUS_DIR=$(CORPUS_DIR) node scripts/factcheck-geometry.mjs

#arrowskew: @ Arrowhead-skew gate on draw.io's REAL render (needs docker; the redo of reverted #107)
arrowskew: build
	@command -v docker >/dev/null 2>&1 || { echo "Error: docker required for drawio-export rendering."; exit 1; }
	@# Every catalyst edge is orthogonalEdgeStyle ⇒ draw.io re-routes;
	@# the EMITTED polyline is NOT what is drawn. #107 scored a
	@# reconstruction of emitted points and shipped a render no-op
	@# false-green. This gate regenerates the .drawio (pure node) then
	@# renders each via drawio-export to SVG and measures draw.io's
	@# ACTUAL path: every arrowhead's shaft must be collinear with the
	@# head axis and no feeder may occlude the head. See
	@# docs/research/arrowhead-orthogonal-routing.md.
	@GALLERY_DRAWIO_ONLY=1 CORPUS_DIR=$(CORPUS_DIR) GALLERY_OUT=$(GALLERY_OUT) node scripts/gallery.mjs >/dev/null
	@DRAWIO_EXPORT_IMAGE=$(DRAWIO_EXPORT_IMAGE) node scripts/arrowskew-svg.mjs

#bendcount: @ Redundant-bend inventory on draw.io's REAL render (needs docker; B1 routing-change probe — ADR 0013 / docs/research/layout-readability.md)
bendcount: build
	@command -v docker >/dev/null 2>&1 || { echo "Error: docker required for drawio-export rendering."; exit 1; }
	@# Measures interior + REDUNDANT (near-collinear) bends on draw.io's
	@# actual rendered path — never the emitted points (the #107 lesson:
	@# catalyst edges re-route, so the emitted polyline is not drawn).
	@# Reuses build/arrowskew SVGs when present (one docker pass serves
	@# both gates); else regenerates the .drawio (pure node) and renders.
	@# Reproducible evidence for any edge-routing change; NOT a CI gate
	@# (the deterministic CI render-truth contract is `make arrowskew`).
	@if [ -d build/arrowskew ]; then \
		ARROWSKEW_REUSE=1 node scripts/bendcount-svg.mjs; \
	else \
		GALLERY_DRAWIO_ONLY=1 CORPUS_DIR=$(CORPUS_DIR) GALLERY_OUT=$(GALLERY_OUT) node scripts/gallery.mjs >/dev/null; \
		DRAWIO_EXPORT_IMAGE=$(DRAWIO_EXPORT_IMAGE) node scripts/bendcount-svg.mjs; \
	fi

#edgecross: @ Non-incident edge-crossing inventory + regression ratchet vs committed render-truth (deterministic; no java/docker)
edgecross: build
	@# Crossings are THE primary readability aesthetic (Purchase 1997).
	@# Measured on the COMMITTED drawio-export render-truth
	@# (docs/gallery/svg) — never emitted points (#107 lesson: draw.io
	@# re-routes). CONTRACT (crossings=0) is honestly RED & DEFERRED:
	@# 30 across 5 multi-edge fixtures vs PlantUML's 0 — the global
	@# routing/port-ordering problem CLAUDE.md item 1 (ELK→dot) owns;
	@# an in-place targeted fix was measured (30→40) and disproved.
	@# This is NOT advisory-downgraded: a per-fixture RATCHET
	@# (tests/edgecross-baseline.json, same pattern as factcheck-ratio)
	@# fails on any REGRESSION beyond baseline (the 30→40 class) while
	@# the contract stays RED & documented. Run on any routing change.
	@node scripts/edgecross-svg.mjs

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

#seq-gallery: @ Dual-render the sequence fixtures into docs/gallery-seq (SVG; needs java+docker)
seq-gallery: deps-render build
	@PLANTUML_VERSION=$(PLANTUML_VERSION) \
		DRAWIO_EXPORT_IMAGE=$(DRAWIO_EXPORT_IMAGE) \
		SEQ_GALLERY_OUT=$(SEQ_GALLERY_OUT) \
		node scripts/seq-gallery.mjs

#seq-gallery-verify: @ Fail if the committed seq gallery .drawio drifted from the current emit (deterministic; no java/docker)
seq-gallery-verify: build
	@# Seq analogue of gallery-verify: the seq .drawio IS catalyst's seq
	@# emit output (pure node, deterministic). A seq emit/layout change
	@# that didn't refresh docs/gallery-seq shows as a git diff here.
	@# The SVG renders (java+docker) are committed evidence, NOT gated
	@# (same split as the C4 gallery PNGs) — this guards the root cause.
	@SEQ_DRAWIO_ONLY=1 SEQ_GALLERY_OUT=$(SEQ_GALLERY_OUT) node scripts/seq-gallery.mjs
	@git diff --quiet -- $(SEQ_GALLERY_OUT)/drawio || { \
		echo "ERROR: docs/gallery-seq is STALE vs the current seq emit — run 'make seq-gallery' and commit the refresh."; \
		git --no-pager diff --stat -- $(SEQ_GALLERY_OUT)/drawio; \
		exit 1; }
	@echo "seq-gallery-verify: docs/gallery-seq .drawio in sync with current emit ✓"

#c4feat-gallery: @ Dual-render the C4 display/style feature fixtures into docs/gallery-c4feat (SVG; needs java+docker)
c4feat-gallery: deps-render build
	@PLANTUML_VERSION=$(PLANTUML_VERSION) \
		PLANTUML_JAR=$(PLANTUML_JAR) \
		DRAWIO_EXPORT_IMAGE=$(DRAWIO_EXPORT_IMAGE) \
		DRAWIO_EXPORT_SCALE=$(DRAWIO_EXPORT_SCALE) \
		CORPUS_DIR=$(C4FEAT_DIR) GALLERY_OUT=$(C4FEAT_OUT) \
		node scripts/gallery.mjs

#c4feat-gallery-verify: @ Fail if the committed c4-feat gallery .drawio drifted from the current emit (deterministic; no java/docker)
c4feat-gallery-verify: build
	@# Same deterministic .drawio drift gate as gallery-verify, for the
	@# C4 display/style feature fixtures (HIDE_STEREOTYPE/sketch/note/
	@# legend/AddProperty — zero use-case-corpus usage, dedicated set).
	@GALLERY_DRAWIO_ONLY=1 CORPUS_DIR=$(C4FEAT_DIR) GALLERY_OUT=$(C4FEAT_OUT) node scripts/gallery.mjs
	@git diff --quiet -- $(C4FEAT_OUT)/drawio || { \
		echo "ERROR: docs/gallery-c4feat is STALE vs the current emit — run 'make c4feat-gallery' and commit the refresh."; \
		git --no-pager diff --stat -- $(C4FEAT_OUT)/drawio; \
		exit 1; }
	@echo "c4feat-gallery-verify: docs/gallery-c4feat .drawio in sync with current emit ✓"

#ci: @ Local CI pipeline — mirrors ci.yml (static-check + build + test jobs)
ci: static-check build coverage-check gallery-verify seq-gallery-verify c4feat-gallery-verify
	@echo "Local CI pipeline passed."

#ci-run: @ Run the real .github/workflows/ci.yml locally via act (mise-managed act; needs Docker)
ci-run: deps
	@docker container prune -f 2>/dev/null || true
	@ACT_PORT=$$(shuf -i $(ACT_PORT_LOW)-$(ACT_PORT_HIGH) -n 1); \
	ARTIFACT_PATH=$$(mktemp -d -t act-artifacts.XXXXXX); \
	act push --workflows .github/workflows/ci.yml \
		--container-architecture linux/amd64 \
		--artifact-server-port "$$ACT_PORT" \
		--artifact-server-path "$$ARTIFACT_PATH"

.PHONY: help deps deps-render clean build lint test coverage-check vulncheck \
	secrets trivy-fs static-check golden-update render-compare gallery \
	factcheck arrowskew bendcount edgecross gallery-verify \
	seq-gallery seq-gallery-verify c4feat-gallery c4feat-gallery-verify \
	ci ci-run
