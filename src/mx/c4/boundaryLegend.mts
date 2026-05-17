/**
 * C4-PlantUML v2.13.0 boundary subtitle ("legend") label.
 *
 * Fact-checked against the pinned stdlib source (C4.puml /
 * C4_Context.puml / C4_Container.puml):
 *
 *   System_Boundary($a,$l,…)    → Boundary($a,$l,"", 'system',  …)
 *   Container_Boundary($a,$l,…) → Boundary($a,$l,"", 'container',…)
 *   Enterprise_Boundary($a,$l,…)→ Boundary($a,$l,"", 'enterprise',…)
 *
 * All delegate to the generic Boundary with an EMPTY $type plus a tag
 * (`'system'`/`'container'`/`'enterprise'`), and there is NO colour/
 * border difference. PlantUML renders the boundary's bracketed
 * subtitle as that **lowercase tag** verbatim — verified by
 * render-compare (PlantUML shows `[container]`, not `[Container]`;
 * the capitalised UpdateBoundaryStyle legend arg is the LEGEND-BOX
 * text, NOT the in-situ subtitle). render-compare is ground truth
 * here, overriding the doc-derived capitalisation.
 *
 * A generic `Boundary($a,$l,$type)` shows its explicit `$type` verbatim
 * (PlantUML renders the literal `$type` string). The C4-PlantUML
 * fixtures the parser feeds put that 3rd positional arg in `.technology`.
 *
 * When `$type` is empty on a generic Boundary PlantUML shows no type
 * word; catalyst keeps the neutral "Boundary" so the subtitle line is
 * never blank (the box would otherwise lose its kind cue). That bare
 * case is unchanged from prior behaviour and appears in no corpus
 * fixture — deliberately conservative, not a guess about PlantUML.
 */
export function boundaryLegend(type: string, explicitType?: string): string {
  switch (type) {
    case 'System_Boundary': return 'system'
    case 'Container_Boundary': return 'container'
    case 'Enterprise_Boundary': return 'enterprise'
    default: {
      const t = (explicitType ?? '').trim()
      return t.length > 0 ? t : 'Boundary'
    }
  }
}
