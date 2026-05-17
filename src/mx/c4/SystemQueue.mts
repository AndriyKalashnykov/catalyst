import { ELEMENT_TITLE_PX, ELEMENT_BODY_PX, PALETTE, MX } from './theme.mjs';
class SystemQueue {
    static async label() {
        const html = `<div style="font-size:${ELEMENT_BODY_PX}px;font-style:italic;color:#cccccc;">«%c4Type%»</div><div style="font-size:${ELEMENT_TITLE_PX}px;font-weight:bold;">%c4Name%</div><div style="font-size:${ELEMENT_BODY_PX}px;color:#cccccc;">%c4Description%</div>`;
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
            shape: 'mxgraph.c4.queue',
            whiteSpace: 'wrap',
            html: MX.ON,
            labelBackgroundColor: 'none',
            fillColor: PALETTE.SYSTEM_FILL,
            fontColor: PALETTE.ELEMENT_FONT,
            strokeColor: PALETTE.SYSTEM_STROKE,
            align: 'center',
            verticalAlign: 'middle',
            metaEdit: MX.ON,
            resizable: MX.ON,
        }
        return Object.entries(styles).map(([key, value]) => `${key}=${value}`).join(';');
    }
}

export { SystemQueue }
