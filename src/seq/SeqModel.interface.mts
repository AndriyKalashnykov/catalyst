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

/** ADR 0007 phase d2b — `create X` / `destroy X` lifeline lifespan.
 *  `create` shifts the lifeline head DOWN to its first-use Y (it does
 *  not exist before); `destroy` truncates the foot at that Y with an
 *  `X` glyph. Source-ordered like activate/deactivate (no own Y row). */
export interface SeqLifecycle {
  type: 'create' | 'destroy'
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

/** ADR 0007 phase d2 — combined/grouped fragment.
 *
 * Fragments nest, so they enter the SOURCE-ordered stream as paired
 * markers (`fragment-start` … optional `fragment-else` … `fragment-end`)
 * rather than a sub-tree: the timeline IS the order, and the linear
 * layout pass closes a stack frame on `fragment-end` exactly as the C4
 * path never has to. `fragId` is a monotone counter pairing the three
 * marker kinds of one fragment across arbitrary nesting depth. */
export interface SeqFragmentStart {
  type: 'fragment-start'
  /** `alt|opt|loop|par|critical|group|break` (lower-cased). */
  kind: string
  /** Text after the keyword: an `alt [guard]`, a `loop` count, a
   *  `group` title — verbatim, may be empty. */
  label: string
  fragId: number
  order: number
}
/** A compartment separator inside an open fragment (`else [guard]`). */
export interface SeqFragmentElse {
  type: 'fragment-else'
  fragId: number
  /** The text after `else` (the alternative's guard); may be empty. */
  label: string
  order: number
}
/** The `end` that closes the most-recently-opened fragment. */
export interface SeqFragmentEnd {
  type: 'fragment-end'
  fragId: number
  order: number
}

/** ADR 0007 phase d2b — a `ref over A[,B…] : text` reference frame.
 *  Unlike a fragment it is NOT a paired Y-range over events: it is a
 *  single self-contained labelled box at its source-order Y spanning
 *  the named lifelines (like a framed, multi-lifeline note). Inline
 *  (`: text`) or block (`ref over A` … `end ref`). */
export interface SeqRef {
  type: 'ref'
  /** The `over` lifeline list (≥1, declaration aliases). */
  lifelines: string[]
  text: string
  order: number
}

export type SeqEvent =
  | SeqMessage | SeqNote | SeqActivation | SeqDivider
  | SeqFragmentStart | SeqFragmentElse | SeqFragmentEnd | SeqRef
  | SeqLifecycle

export interface SeqModel {
  title?: string
  /** PlantUML `autonumber` was present → messages get a running index. */
  autonumber: boolean
  /** DECLARATION order — the X axis. */
  lifelines: Lifeline[]
  /** SOURCE order — the Y axis. */
  events: SeqEvent[]
}
