// WextraUI — Wif: `count` pairs (1..20) driven by one boolean. The inputs `true k` and `false k` of a pair sit together
// in a frame of their own, as the slots of WSwitch (Sick 29/10: «in slot separati», to tell which is which); output k
// gives `true k` when `if` is true, `false k` when false; the others do not run (lazy). The schema declares all 20 pairs
// (src/route.py); the node shows the first `count`. A pair taken away loses its cables. The wires are drawn by
// wxRouteWire.js; the node is born as narrow as it can.
import { app } from "../../scripts/app.js";
import { wxRouteWire, wxRouteChoice, wxNarrow, wxLabelWidth } from "./wxRouteWire.js";
import { wxReorderInputs } from "./wxSlots.js";
import { wxVueInputRows, wxVueDecor } from "./wxStyle.js";

const MAX_PAIRS = 20;
const BOX = { x: 3, pad: 6, r: 5, line: "#4a4a4a" };   // the frame around a pair's two rows, as WSwitch

app.registerExtension({
    name: "WextraUI.if",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxif") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            const inAt = (n) => (node.inputs || []).findIndex((i) => i.name === n);
            const outAt = (k) => (node.outputs || []).findIndex((o) => o.name === "value" + k);
            const isPair = (n) => /^(true|false)\d+$/.test(n);
            // the number of pairs: the widget, or what its cable brings when the graph can tell (else the pairs shown)
            const count = () => {
                const v = Number(wxRouteChoice(node, "count"));
                if (!Number.isFinite(v)) return null;
                return Math.max(1, Math.min(MAX_PAIRS, Math.round(v)));
            };
            let shown = 0;
            function layout() {
                const n = count() ?? (shown || 1);
                for (let k = MAX_PAIRS; k > n; k--) {
                    for (const side of ["false", "true"]) { const i = inAt(side + k); if (i >= 0) node.removeInput(i); }
                    const o = outAt(k); if (o >= 0) node.removeOutput(o);
                }
                for (let k = 1; k <= n; k++) {
                    for (const side of ["true", "false"]) if (inAt(side + k) < 0) node.addInput(side + k, "*");
                    if (outAt(k) < 0) node.addOutput("value" + k, "*");
                }
                // the order: the other inputs (the sockets of count and if) as they are, then the pairs, true k over false k
                const ins = node.inputs || [];
                const order = [...ins.filter((s) => !isPair(s.name))];
                for (let k = 1; k <= n; k++) order.push(ins[inAt("true" + k)], ins[inAt("false" + k)]);
                if (node.graph) wxReorderInputs(node, order);   // a node just made is not in a graph yet: no cables to carry
                else ins.splice(0, ins.length, ...order);
                for (let k = 1; k <= n; k++) {
                    node.inputs[inAt("true" + k)].label = n === 1 ? "true" : "true " + k;
                    node.inputs[inAt("false" + k)].label = n === 1 ? "false" : "false " + k;
                    node.outputs[outAt(k)].label = n === 1 ? "value" : String(k);
                }
                if (n !== shown) {   // as narrow as the labels and the wire allow, never narrower than it is
                    const lab = (s) => wxLabelWidth(String(s.label || s.name));
                    const need = 10 + Math.max(0, ...node.inputs.filter((s) => isPair(s.name)).map(lab)) + 30
                               + Math.max(0, ...node.outputs.map(lab)) + 10;
                    const sz = node.computeSize();
                    node.setSize([Math.ceil(Math.max(node.size[0], sz[0], need)), sz[1]]);
                }
                shown = n;
                node.setDirtyCanvas(true, true);
            }
            const later = () => setTimeout(layout, 0);
            const w = (node.widgets || []).find((x) => x.name === "count");
            if (w) { const cb = w.callback; w.callback = function () { const rr = cb?.apply(this, arguments); later(); return rr; }; }
            const origConn = node.onConnectionsChange;
            node.onConnectionsChange = function (type, slot) {
                const rr = origConn?.apply(this, arguments);
                if (node.inputs?.[slot]?.name === "count" || node.inputs?.[slot]?.widget?.name === "count") later();
                return rr;
            };
            const origConfigure = node.onConfigure;
            node.onConfigure = function () { const rr = origConfigure?.apply(this, arguments); shown = 0; later(); return rr; };
            layout();
            // the frame of every pair: classic canvas under the wires (wxRouteWire draws after this), Nodes 2.0 on the rows
            const frameW = () => 10 + Math.max(0, ...(node.inputs || []).filter((s) => isPair(s.name)).map((s) => wxLabelWidth(String(s.label || s.name)))) + BOX.pad;
            const fg = node.onDrawForeground;
            node.onDrawForeground = function (ctx) {
                const rr = fg?.apply(this, arguments);
                if (LiteGraph.vueNodesMode || node.flags?.collapsed) return rr;
                const h = (LiteGraph.NODE_SLOT_HEIGHT || 20) / 2, w = frameW();
                ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = BOX.line;
                for (let k = 1, a, b; (a = inAt("true" + k)) >= 0 && (b = inAt("false" + k)) >= 0; k++) {
                    const y = node.getConnectionPos(true, a)[1] - node.pos[1] - h + 1.5;
                    ctx.beginPath(); ctx.roundRect(BOX.x, y, w - BOX.x, node.getConnectionPos(true, b)[1] - node.pos[1] + h - 1.5 - y, BOX.r); ctx.stroke();
                }
                ctx.restore();
                return rr;
            };
            wxVueDecor(node, () => {
                for (const r of wxVueInputRows(node) || []) {
                    const m = /^(true|false)\d+$/.exec(node.inputs[r.idx]?.name || ""), st = r.el.style;
                    if (!m) { st.boxShadow = ""; st.borderRadius = ""; continue; }
                    const top = m[1] === "true", c = BOX.line, sh = [`inset 1px 0 0 ${c}`, `inset -1px 0 0 ${c}`, `inset 0 ${top ? 1 : -1}px 0 ${c}`];
                    st.boxShadow = sh.join(","); st.borderRadius = top ? "6px 6px 0 0" : "0 0 6px 6px";
                }
            }, 250);
            // for each output, the two inputs it chooses between: [true k, false k]
            const picks = () => { const ps = []; for (let k = 1, o; (o = outAt(k)) >= 0; k++) ps[o] = [inAt("true" + k), inAt("false" + k)]; return ps; };
            wxRouteWire(node, () => { const v = wxRouteChoice(node, "if"); return typeof v === "boolean" ? (v ? 0 : 1) : null; }, picks);
            wxNarrow(node, () => ["true", "false"]);
            return r;
        };
    },
});
