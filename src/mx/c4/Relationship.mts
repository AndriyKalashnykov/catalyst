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
            edgeStyle: 'orthogonalEdgeStyle',
            // NO hardcoded entryX/entryY/exitX/exitY. catalyst supports TB/BT/
            // LR/RL layouts; a fixed entry point (the old entryY=1 = "enter the
            // target's bottom") forced a left-side dog-leg with an upward
            // arrowhead for ELK's default top-down placement. Letting drawio's
            // orthogonal router pick the attach side from geometry — and follow
            // the ELK-computed waypoints when present — is direction-agnostic
            // and matches the source PlantUML routing. `elbow` was also dropped:
            // it only applies to elbowEdgeStyle, a no-op here.
        }

        return Object.entries(styles).map(([key, value]) => `${key}=${value}`).join(';');
    }
}

export { Relastionship }
