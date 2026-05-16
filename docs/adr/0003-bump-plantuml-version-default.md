# ADR 0003 — Bump default PLANTUML_VERSION 1.2024.7 → 1.2026.2

- Status: accepted
- Date: 2026-05-16

## Context

`Makefile` defaulted `PLANTUML_VERSION ?= 1.2024.7`. Verified against
`github.com/plantuml/plantuml` releases: latest is **v1.2026.2** — the
default was ~2 years stale. `PLANTUML_VERSION` is consumed only by the
visual-proof tooling (`make render-compare`, `make gallery`) to download
the PlantUML jar that renders the *reference* (left-hand) PNG. catalyst's
own draw.io output and the C4-PlantUML stdlib `!include` (pinned at
v2.10.0 in fixtures) are independent of this jar.

## Decision

Bump the documented default to `1.2026.2` (slot-2 externalized default
per the configuration rule; still env-overridable). Land it in the
Phase 2 PR rather than a standalone chore (avoids PR fragmentation during
the autonomous run). For all per-phase local visual gates, invoke with
`PLANTUML_VERSION=1.2026.2` so the before/after comparison uses a current
renderer regardless of when the default lands.

## Correction (same day)

GitHub's latest PlantUML tag is `1.2026.3`, but `render-compare`/`gallery`
download the jar from **Maven Central**, whose latest is `1.2026.2`
(`1.2026.3` 404s — typical Central mirroring lag). A `1.2026.3` default
produced a corrupt 554-byte jar and broke the visual gate. Default is
**1.2026.2** — the latest the downloader can actually resolve. Lesson:
pin to the artifact the tooling can fetch, not the GitHub release tag.

## Consequences

- Reference PlantUML renders reflect a current engine; fidelity of the
  visual gate improves.
- No effect on catalyst output, tests, or golden snapshots (jar is
  render-tooling only).
- Renovate (github-tags datasource) can track future PlantUML bumps; a
  follow-up could add a `# renovate:` hint on this default.
