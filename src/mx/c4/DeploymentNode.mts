import { DEPLOYMENT_TITLE_PX, ELEMENT_BODY_PX, PALETTE, MX } from './theme.mjs';
class DeploymentNode {
    static async label() {
        // Deployment nodes show the $type (e.g. "Linux VM", "K8s cluster") in the
        // header, not $technology like Containers do.
        const html = `<div style="font-size:${ELEMENT_BODY_PX}px;font-style:italic;color:#666666;">«%c4Type%»</div><div style="font-size:${DEPLOYMENT_TITLE_PX}px;font-weight:bold;">%c4Name%</div><div style="font-size:${ELEMENT_BODY_PX}px;color:#666666;">%c4Description%</div>`;
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
            labelBackgroundColor: 'none',
            fillColor: PALETTE.DEPLOYMENT_NODE_FILL,
            strokeColor: PALETTE.DEPLOYMENT_NODE_STROKE,
            fontColor: PALETTE.DEPLOYMENT_NODE_FONT,
            align: 'center',
            verticalAlign: 'middle',
            fontStyle: MX.FONT_NORMAL,
            fontSize: 12,
            metaEdit: MX.ON,
            resizable: MX.ON,
            container: MX.ON,
            collapsible: MX.OFF,
        }
        return Object.entries(styles).map(([key, value]) => `${key}=${value}`).join(';');
    }
}

export { DeploymentNode }
