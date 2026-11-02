// WextraUI — WIndex: up to 20 inputs, one output; the input `value<index>` goes out, the others do not run (lazy). The
// mirror of WRoute Index: the inputs shown are the ones in use plus one empty (never fewer than 2), connect the last one
// and another appears. The schema declares all 20 (src/route.py); a saved workflow keeps the inputs of its file. The
// wire from the input of `index` to the output is drawn by wxRouteWire.js; the node is born as narrow as it can.
import { app } from "../../scripts/app.js";
import { wxRouteWire, wxRouteChoice, wxNarrow } from "./wxRouteWire.js";

const MAX_INS = 20, MIN_INS = 2;

app.registerExtension({
    name: "WextraUI.index",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxIndex") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            const at = (k) => (node.inputs || []).findIndex((i) => i.name === "value" + k);
            function layout() {
                let last = 0;
                for (let k = 0; k < MAX_INS; k++) { const i = at(k); if (i >= 0 && node.inputs[i].link != null) last = k + 1; }
                const n = Math.max(MIN_INS, Math.min(MAX_INS, last + 1));
                for (let k = MAX_INS - 1; k >= n; k--) { const i = at(k); if (i >= 0) node.removeInput(i); }
                for (let k = 0; k < n; k++) if (at(k) < 0) node.addInput("value" + k, "*");
                for (let k = 0; k < n; k++) node.inputs[at(k)].label = String(k);
                const sz = node.computeSize();
                node.setSize([Math.max(node.size[0], sz[0]), sz[1]]);
                node.setDirtyCanvas(true, true);
            }
            const origConn = node.onConnectionsChange;
            node.onConnectionsChange = function () { const rr = origConn?.apply(this, arguments); setTimeout(layout, 0); return rr; };
            const origConfigure = node.onConfigure;
            node.onConfigure = function () { const rr = origConfigure?.apply(this, arguments); setTimeout(layout, 0); return rr; };
            layout();
            const picks = () => { const ps = []; for (let k = 0, i; (i = at(k)) >= 0; k++) ps.push(i); return [ps]; };   // one output
            wxRouteWire(node, () => { const v = Number(wxRouteChoice(node, "index")); return Number.isFinite(v) ? Math.max(0, Math.min(MAX_INS - 1, Math.round(v))) : null; }, picks);
            wxNarrow(node, () => ["19"]);
            return r;
        };
    },
});
