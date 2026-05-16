import { BOUNDARY_TITLE_PX, BOUNDARY_BODY_PX } from './theme.mjs';
import { spaceAdvance } from '../../text/TextMetrics.mjs';

class Boundary {
    static async label() {
        const html = `<div style="font-weight:bold;">%c4Name%</div><div style="font-size:${BOUNDARY_BODY_PX}px;">[%c4Type%]</div>`;
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
            html: 1,
            dashed: 1,
            labelBackgroundColor: 'none',
            strokeColor: '#666666',
            fillColor: 'none',
            fontColor: '#333333',
            align: 'center',
            verticalAlign: 'top',
            // Inset the title below the dashed top stroke so it does not
            // render ON the border line. The inset is the font's own
            // space-advance at the title size (12px bold) — a real font
            // metric, the same derivation titlePadding uses; not a
            // magic px constant.
            spacingTop: Math.ceil(spaceAdvance(BOUNDARY_TITLE_PX, true)),
            fontStyle: 0,
            fontSize: BOUNDARY_TITLE_PX,
            metaEdit: 1,
            resizable: 1,
            container: 1,
            collapsible: 0,
        }
        return Object.entries(styles).map(([key, value]) => `${key}=${value}`).join(';');
    }
}

export { Boundary }
