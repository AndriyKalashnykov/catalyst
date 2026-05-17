import { ELEMENT_TITLE_PX, ELEMENT_BODY_PX, PALETTE, MX, SHAPE } from './theme.mjs';
class ComponentExt {
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
            rounded: 1,
            whiteSpace: 'wrap',
            html: MX.ON,
            labelBackgroundColor: 'none',
            fillColor: PALETTE.COMPONENT_EXT_FILL,
            fontColor: PALETTE.ELEMENT_FONT,
            align: 'center',
            verticalAlign: 'middle',
            arcSize: SHAPE.ARC_SIZE_COMPONENT,
            strokeColor: PALETTE.COMPONENT_EXT_STROKE,
            metaEdit: MX.ON,
            resizable: MX.ON,
        }
        return Object.entries(styles).map(([key, value]) => `${key}=${value}`).join(';');
    }
}

export { ComponentExt }
