import { RELATIONSHIP_LABEL_PX, PALETTE, MX, SHAPE } from './theme.mjs';
class Relastionship {
    static async label() {
        // Bold line = the relationship verb (c4Name, e.g. "Uses"); second line
        // = the technology. The bracket is pre-applied to the c4Technology
        // VALUE in Mx.addMxC4Relationship (so an absent technology yields an
        // empty <div>, not a literal "[]" tofu box). Do NOT hardcode the
        // bracket in this template — that was the cause of the "[]" artifact.
        const html = `<div style="text-align: center;font-weight:bold;">%c4Name%</div><div style="text-align: center;">%c4Technology%</div>`;
        
        // Simple whitespace collapse
        const minifiedHtml = html.replace(/>\s+</g, '><');
        
        // Simple HTML entity encoding
        return this.encodeHtmlEntities(minifiedHtml);
    }

    private static encodeHtmlEntities(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    static style() {
        const styles: Record<string, unknown> = {
            endArrow: 'blockThin',
            html: MX.ON,
            fontSize: RELATIONSHIP_LABEL_PX,
            fontColor: PALETTE.REL_FONT,
            strokeWidth: SHAPE.STROKE_WIDTH_REL,
            endFill: 1,
            strokeColor: PALETTE.REL_STROKE,
            metaEdit: MX.ON,
            endSize: SHAPE.REL_ARROW_SIZE,
            startSize: SHAPE.REL_ARROW_SIZE,
            jumpStyle: 'arc',
            jumpSize: SHAPE.REL_JUMP_SIZE,
            rounded: 0,
            // ADR 0013: `curved: 1` (no edgeStyle) — draw.io splines
            // through the ELK waypoints, the Graphviz-`dot`-spline
            // analogue PlantUML actually uses. The prior
            // `orthogonalEdgeStyle` made draw.io re-route every edge as
            // Manhattan right-angles (discarding ELK's waypoints — the
            // #107/B1 finding) → the `rel-bidirectional` connector
            // tangle. Proven (ADR 0013) by the since-retired
            // `routefidelity` harness (route-shape L1 to the PlantUML
            // target: orthogonal 1.017 → curved 0.294,
            // ~3.5× closer; ordering robust on both detour AND turn).
            // arrowskew stays CLEAN 20/20; factcheck is edge-style-
            // invariant; golden is style-agnostic.
            curved: 1,
            // NO hardcoded entryX/entryY/exitX/exitY. catalyst supports
            // TB/BT/LR/RL layouts; a fixed entry point (the old
            // entryY=1 = "enter the target's bottom") forced a
            // left-side dog-leg. Letting draw.io pick the attach side
            // from geometry — and spline through the ELK-computed
            // waypoints — is direction-agnostic. `elbow` was also
            // dropped: it only applies to elbowEdgeStyle, a no-op here.
        }

        return Object.entries(styles).map(([key, value]) => `${key}=${value}`).join(';');
    }
}

export { Relastionship }
