/**
 * Ordered sequence-diagram model (ADR 0007, phase a).
 *
 * Two orderings are load-bearing and are the parser's core contract:
 *  - **lifelines[]** in DECLARATION order → the X axis (left→right).
 *  - **events[]** in SOURCE order        → the Y axis (top→bottom).
 *
 * `events` is a single source-ordered discriminated stream (message |
 * note | activate | deactivate) rather than per-type arrays: the
 * timeline IS the order, and a unified stream makes the phase-b linear
 * layout a trivial monotone Y walk while the per-type views are a
 * one-line `.filter`. Every record carries its 0-based `order` (the
 * event-stream index) so the invariant is directly assertable.
 */

/** Arrow shape, independent of direction. Reverse (`<-`, `Rel_Back`)
 *  is normalised into `from`/`to`, NOT a separate kind. */
export type ArrowKind =
  | 'sync' // `->`  solid filled head (request)
  | 'async' // `->>` solid open head (async)
  | 'return' // `-->` dashed (reply/return)
  | 'bi' // `<->` / `BiRel` bidirectional

/** A lifeline (participant/actor or any C4 sequence kind). */
export interface Lifeline {
  /** Stable id used by messages/notes (the `as` alias, or the bare name). */
  alias: string
  /** Display label (may contain literal PlantUML `\n` breaks, verbatim). */
  label: string
  /** Source kind: `actor` | `participant` | a C4 macro name
   *  (`Person`, `System`, `ContainerDb_Ext`, …). */
  kind: string
  /** Optional `[Technology]` (C4 Container/Component macros only). */
  technology?: string
  /** 0-based DECLARATION index → X order. */
  index: number
}

export interface SeqMessage {
  type: 'message'
  from: string
  to: string
  label: string
  technology?: string
  arrow: ArrowKind
  /** `activate $to` shorthand (`->+`) or an explicit following
   *  `activate`; phase-a only records the explicit `activate`/
   *  `deactivate` events — kept false here unless the `+`/`-`
   *  suffix shorthand was on the arrow. */
  activateTarget: boolean
  deactivateSource: boolean
  order: number
}

export interface SeqNote {
  type: 'note'
  position: 'left' | 'right' | 'over'
  /** Lifelines the note attaches to (`note over a,b` → [a,b];
   *  `note right of x` → [x]; a bare `note left|right` with no
   *  `of` → [] meaning "relative to the previous message"). */
  lifelines: string[]
  /** Note body; multi-line block notes keep `\n` between lines. */
  text: string
  order: number
}

export interface SeqActivation {
  type: 'activate' | 'deactivate'
  lifeline: string
  order: number
}

/** A PlantUML `== label ==` divider — a full-width labelled band that
 *  segments the timeline (ADR 0007 phase d1). Spans all lifelines at
 *  its source-order Y; carries no from/to. */
export interface SeqDivider {
  type: 'divider'
  /** Text between the `==` fences (trimmed; may be empty). */
  label: string
  order: number
}

export type SeqEvent = SeqMessage | SeqNote | SeqActivation | SeqDivider

export interface SeqModel {
  title?: string
  /** PlantUML `autonumber` was present → messages get a running index. */
  autonumber: boolean
  /** DECLARATION order — the X axis. */
  lifelines: Lifeline[]
  /** SOURCE order — the Y axis. */
  events: SeqEvent[]
}
