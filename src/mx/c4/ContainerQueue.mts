import { ELEMENT_TITLE_PX, ELEMENT_BODY_PX } from './theme.mjs';
class ContainerQueue {
    static async label() {
        const html = `<div style="font-size:${ELEMENT_BODY_PX}px;font-style:italic;color:#cccccc;">«%c4Type%»</div><div style="font-size:${ELEMENT_TITLE_PX}px;font-weight:bold;">%c4Name%</div><div style="font-size:${ELEMENT_BODY_PX}px;color:#cccccc;">%c4Technology%</div><div style="font-size:${ELEMENT_BODY_PX}px;color:#cccccc;">%c4Description%</div>`;
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
            html: 1,
            labelBackgroundColor: 'none',
            fillColor: '#23A2D9',
            fontColor: '#ffffff',
            strokeColor: '#0E7DAD',
            align: 'center',
            verticalAlign: 'middle',
            metaEdit: 1,
            resizable: 1,
        }
        return Object.entries(styles).map(([key, value]) => `${key}=${value}`).join(';');
    }
}

export { ContainerQueue }
