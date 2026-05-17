# Catalyst — PlantUML C4 → draw.io converter.
# Tunables mirror scripts/render-compare.mjs env defaults (?= lets env/CI override).
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

.PHONY: help
help: ## List targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n",$$1,$$2}'

.PHONY: deps
deps: ## Install dependencies (mise-managed Node + npm ci)
	mise install
	npm ci

.PHONY: build
build: ## Compile TypeScript -> dist/
	npm run build

.PHONY: lint
lint: ## oxlint src/ + markdownlint (parity with CI's lint job)
	npm run lint
	npm run mdlint

.PHONY: test
test: ## Run the full vitest suite (parity + golden + units)
	npm run test:run

.PHONY: golden-update
golden-update: ## Regenerate drawio structural snapshots after an intentional change
	npm run golden:update

.PHONY: render-compare
render-compare: build ## Visual proof: render SRC puml + catalyst drawio side-by-side (needs java+docker)
	PLANTUML_VERSION=$(PLANTUML_VERSION) \
	DRAWIO_EXPORT_IMAGE=$(DRAWIO_EXPORT_IMAGE) \
	DRAWIO_EXPORT_SCALE=$(DRAWIO_EXPORT_SCALE) \
	node scripts/render-compare.mjs "$(RENDER_SRC)" "$(RENDER_OUT)"

.PHONY: gallery
gallery: build ## Dual-render the use-case corpus into docs/gallery (needs java+docker)
	PLANTUML_VERSION=$(PLANTUML_VERSION) \
	DRAWIO_EXPORT_IMAGE=$(DRAWIO_EXPORT_IMAGE) \
	DRAWIO_EXPORT_SCALE=$(DRAWIO_EXPORT_SCALE) \
	CORPUS_DIR=$(CORPUS_DIR) \
	GALLERY_OUT=$(GALLERY_OUT) \
	node scripts/gallery.mjs

.PHONY: factcheck
factcheck: build ## Numeric PlantUML→drawio fidelity audit of the whole corpus (needs java); the no-eyeballing gate
	@mkdir -p $(FACTCHECK_SVG_DIR)
	@test -f $(PLANTUML_JAR) || { echo "ERROR: $(PLANTUML_JAR) missing — run 'make gallery' once to fetch it"; exit 1; }
	java -jar $(PLANTUML_JAR) -tsvg -nometadata $(CORPUS_DIR)/ -o $(abspath $(FACTCHECK_SVG_DIR))
	SVG_DIR=$(FACTCHECK_SVG_DIR) CORPUS_DIR=$(CORPUS_DIR) node scripts/factcheck-geometry.mjs

.PHONY: ci
ci: build lint test ## Local CI pipeline (build + lint + tests)

.PHONY: ci-run
ci-run: deps ## Run the real .github/workflows/ci.yml locally via act (mise-managed; needs Docker)
	@docker container prune -f 2>/dev/null || true
	@ACT_PORT=$$(shuf -i 40000-59999 -n 1); \
	ARTIFACT_PATH=$$(mktemp -d -t act-artifacts.XXXXXX); \
	act push --workflows .github/workflows/ci.yml \
		--container-architecture linux/amd64 \
		--artifact-server-port "$$ACT_PORT" \
		--artifact-server-path "$$ARTIFACT_PATH"
