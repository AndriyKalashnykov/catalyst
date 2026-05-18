#!/usr/bin/env bash
set -euo pipefail

# One-time host bootstrap for the LOCAL render path (`make factcheck`,
# `make gallery`, `make render-compare`). NOT needed for CI's lint /
# test / static-check jobs — they only run lint/mdlint/build/
# gallery-drift(pure-node)/test:coverage/security-scans, none of which
# touch PlantUML or graphviz. CI no longer calls this script.
#
# graphviz: PlantUML's `-tsvg` layout engine is Graphviz `dot`; the
# `plantuml.jar` that `make factcheck` runs fails without it. graphviz
# has NO mise/aqua/npm backend (verified: `mise registry`/`ls-remote`
# return nothing) — it's a system C library, so a platform package
# manager is the only install path. This is a one-shot dev bootstrap,
# not a Makefile recipe, so the "no sudo in Make recipes" rule does
# not apply; brew needs no sudo.
#
# Removed 2026-05-18 (/makefile audit — all fact-verified unused):
#   - `npm i -g npm@latest typescript@latest markdownlint-cli@latest`:
#     typescript + markdownlint-cli are PINNED devDependencies; `npm ci`
#     provides both. The unpinned `@latest` globals were drift (the
#     ci-parity-mdlint-gap class).
#   - `docker pull plantuml/plantuml-server`: nothing references that
#     image (factcheck uses plantuml.jar; render/gallery use
#     $DRAWIO_EXPORT_IMAGE).
#   - wget of master C4_*.puml into the repo root: catalyst does NOT
#     network-resolve `!include` (parser skip-lists it; fixtures pin the
#     v2.13.0 include). Files were unused; full suite green without them.

if command -v dot >/dev/null 2>&1; then
    echo "graphviz already installed ($(dot -V 2>&1)) — nothing to do."
    exit 0
fi

echo "Installing graphviz (required by PlantUML -tsvg for local make factcheck/gallery)..."
if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get -q -y update && sudo apt-get -q -y install graphviz
elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y graphviz
elif command -v brew >/dev/null 2>&1; then
    brew install graphviz                       # macOS — no sudo
elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --noconfirm graphviz
else
    echo "ERROR: no supported package manager (apt-get/dnf/brew/pacman)." >&2
    echo "Install graphviz manually: https://graphviz.org/download/" >&2
    exit 1
fi
