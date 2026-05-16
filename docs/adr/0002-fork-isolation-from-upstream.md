# ADR 0002 — Fork isolation from upstream localgod/catalyst

- Status: accepted
- Date: 2026-05-16

## Context

`AndriyKalashnykov/catalyst` is a fork of the OSS project
`localgod/catalyst`. The local checkout had an `upstream` remote pointing
at the parent. A bare `gh pr create` resolves its base to the fork's
**parent**, so a Phase-1 PR was opened against `localgod/catalyst#572`
by mistake (immediately closed with an apology; reopened correctly as
`AndriyKalashnykov/catalyst#16`). User directive: "forget
localgod/catalyst at all".

## Decision

Treat `AndriyKalashnykov/catalyst` as a **standalone** repository. The
`upstream` remote is **removed** (`git remote -v` shows only `origin`)
and `gh repo set-default AndriyKalashnykov/catalyst` is set, so `gh`
cannot resolve to the parent. Never re-add an `upstream` remote; never
open PRs/issues, push, or otherwise interact with `localgod/*`. Always
sanity-check that any PR/issue URL host path is
`AndriyKalashnykov/catalyst` before treating it as opened.

## Consequences

- Structurally impossible to target the parent via `gh` defaults.
- No upstream-sync workflow; this fork diverges deliberately.
