// WextraUI — WRoute Index: one input, up to 20 outputs; the value goes out of `out<index>`. The outputs shown are the
// ones in use plus one empty (never fewer than 2), like the slots of WSwitch: connect the last one and another appears.
// The schema declares all 20 (src/route.py); a saved workflow keeps the outputs of its file.
import { app } from "../../scripts/app.js";

const MAX_OUTS = 20, MIN_OUTS = 2;

app.registerExtension({
    name: "WextraUI.routeIndex",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxRouteIndex") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            function layout() {
                let last = 0;
                (node.outputs || []).forEach((o, j) => { if (o.links?.length) last = Math.max(last, j + 1); });
                const n = Math.max(MIN_OUTS, Math.min(MAX_OUTS, last + 1));
                while (node.outputs.length > n) node.removeOutput(node.outputs.length - 1);
                while (node.outputs.length < n) node.addOutput("out" + node.outputs.length, "*");
                node.outputs.forEach((o, j) => { o.name = "out" + j; o.label = String(j); });
                const sz = node.computeSize();
                node.setSize([Math.max(node.size[0], sz[0]), sz[1]]);
                node.setDirtyCanvas(true, true);
            }
            const origConn = node.onConnectionsChange;
            node.onConnectionsChange = function () { const rr = origConn?.apply(this, arguments); setTimeout(layout, 0); return rr; };
            const origConfigure = node.onConfigure;
            node.onConfigure = function () { const rr = origConfigure?.apply(this, arguments); setTimeout(layout, 0); return rr; };
            layout();
            return r;
        };
    },
});
