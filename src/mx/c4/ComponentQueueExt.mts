import { ELEMENT_TITLE_PX, ELEMENT_BODY_PX, PALETTE, MX } from './theme.mjs';

// External component queue. C4-PlantUML:
// ComponentQueue_Ext → $getElementLine("queue", "external_component", …)
// — queue shape KEPT, colour external grey. Shape == ComponentQueue;
// colour == COMPONENT_EXT (was flattened to the grey *Ext rectangle).
class ComponentQueueExt {
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
            html: MX.ON,
            labelBackgroundColor: 'none',
            fillColor: PALETTE.COMPONENT_EXT_FILL,
            fontColor: PALETTE.ELEMENT_FONT,
            strokeColor: PALETTE.COMPONENT_EXT_STROKE,
            align: 'center',
            verticalAlign: 'middle',
            metaEdit: MX.ON,
            resizable: MX.ON,
        }
        return Object.entries(styles).map(([key, value]) => `${key}=${value}`).join(';');
    }
}

export { ComponentQueueExt }
