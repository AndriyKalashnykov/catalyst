import { ENTERPRISE_BOUNDARY_TITLE_PX, BOUNDARY_BODY_PX, PALETTE, MX, SHAPE } from './theme.mjs';
import { spaceAdvance } from '../../text/TextMetrics.mjs';

class EnterpriseBoundary {
    // See Boundary.label() — `legend` is the fact-checked C4-PlantUML
    // subtitle word, baked in literally so c4Type stays structural.
    static async label(legend: string) {
        const html = `<div style="font-weight:bold;font-size:${ENTERPRISE_BOUNDARY_TITLE_PX}px;">%c4Name%</div><div style="font-size:${BOUNDARY_BODY_PX}px;">[${legend}]</div>`;
        const minifiedHtml = html.replace(/>\s+</g, '><');
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
            rounded: 0,
            whiteSpace: 'wrap',
            html: MX.ON,
            dashed: MX.ON,
            dashPattern: '8 4',
            labelBackgroundColor: 'none',
            strokeColor: PALETTE.ENTERPRISE_BOUNDARY_STROKE,
            strokeWidth: SHAPE.STROKE_WIDTH_EMPHASIS,
            fillColor: 'none',
            fontColor: PALETTE.ENTERPRISE_BOUNDARY_FONT,
            align: 'center',
            verticalAlign: 'top',
            // Inset the title below the dashed top stroke (font-derived;
            // 13px bold Name) — see Boundary.style().
            spacingTop: Math.ceil(spaceAdvance(ENTERPRISE_BOUNDARY_TITLE_PX, true)),
            fontSize: ENTERPRISE_BOUNDARY_TITLE_PX,
            metaEdit: MX.ON,
            resizable: MX.ON,
            container: MX.ON,
            collapsible: MX.OFF,
        }
        return Object.entries(styles).map(([key, value]) => `${key}=${value}`).join(';');
    }
}

export { EnterpriseBoundary }
