// WextraUI — WScenes Collection H3: the sockets grow by themselves, like the slots of WSwitch. One empty socket after
// the last scene connected; unplug a scene in the middle and the ones after it move up (the loop's order is the socket
// order); the `+` chip on a row opens an empty socket right below it, to slip a scene in between (it stays until the
// next unplug). The labels count as the loop does: `0 · scene` is scene 0. Backend: src/h3CollectScenes.py (20 sockets).
import { app } from "../../scripts/app.js";
import { WX, wxVueInputRows, wxVueDecor, wxVueChip } from "./wxStyle.js";

const MAX_SCENES = 20;
const RX = /^scene(\d+)$/;
const CHIP = { w: 15, h: 15, gap: 8 };

app.registerExtension({
    name: "WextraUI.H3CollectScenes.DynamicInputs",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "h3CollectScenes") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const ret = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;
            const getLink = (id) => {
                const L = node.graph?.links;
                if (id == null || !L) return null;
                return L instanceof Map ? L.get(id) : (node.graph.getLink ? node.graph.getLink(id) : L[id]);
            };
            const isScene = (s) => RX.test(s.name) || s.type === "H3_SCENE";   // by name, or by type (a socket a file saved under another name)
            const scenes = () => (node.inputs || []).filter(isScene);

            // sweep: drop every empty socket (an unplug: the ones after move up); otherwise only the trailing empties
            // beyond the one that must be there. Then names, labels and the cables' target_slot follow the order.
            function layout(sweep) {
                for (let idx = (node.inputs || []).length - 1; idx >= 0; idx--) {
                    const s = node.inputs[idx];
                    if (!isScene(s) || s.link != null) continue;
                    const trailing = !node.inputs.slice(idx + 1).some((t) => isScene(t) && t.link != null);
                    const lastEmpty = trailing && idx === node.inputs.length - 1 && scenes().length <= MAX_SCENES;
                    if (sweep || (trailing && !lastEmpty)) node.removeInput(idx);
                }
                const list = scenes();
                if (!list.length || (list[list.length - 1].link != null && list.length < MAX_SCENES)) node.addInput("scene" + (list.length + 1), "H3_SCENE");
                scenes().forEach((s, i) => { s.name = "scene" + (i + 1); s.label = i + " · scene"; });
                node.inputs.forEach((s, idx) => { const l = getLink(s.link); if (l) l.target_slot = idx; });
                const w = node.size[0], h = node.computeSize()[1];
                node.setSize([w, h]);
                node.setDirtyCanvas(true, true);
            }
            // `+` after the label of a connected row: an empty socket right below it
            let lastInsert = 0;   // the frontend fires the press more than once (pointer and mouse): one insert per press
            function insertAfter(idx) {
                if (scenes().length >= MAX_SCENES || Date.now() - lastInsert < 400) return;
                lastInsert = Date.now();
                node.addInput("scene0", "H3_SCENE");   // renamed in order by layout
                const s = node.inputs.pop();
                node.inputs.splice(idx + 1, 0, s);
                layout(false);
            }
            let measure = null;
            function chipRect(idx) {
                const s = node.inputs[idx];
                const list = scenes();
                if (!s || !isScene(s) || list.length >= MAX_SCENES || (s.link == null && s === list[list.length - 1])) return null;   // every row but the trailing empty one
                const p = node.getConnectionPos(true, idx);
                let tw = 60;
                if (measure) { measure.save(); measure.font = "14px Arial"; tw = measure.measureText(s.label || s.name).width; measure.restore(); }
                return { x: p[0] - node.pos[0] + 14 + tw + CHIP.gap, y: p[1] - node.pos[1] - CHIP.h / 2, w: CHIP.w, h: CHIP.h };
            }
            const origDraw = node.onDrawForeground;
            node.onDrawForeground = function (ctx) {
                const rr = origDraw?.apply(this, arguments);
                if (this.flags?.collapsed) return rr;
                measure = ctx;
                ctx.save();
                ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 1;
                (node.inputs || []).forEach((s, idx) => {
                    const q = chipRect(idx);
                    if (!q) return;
                    ctx.beginPath(); ctx.roundRect(q.x, q.y, q.w, q.h, 4);
                    ctx.fillStyle = "#2b2b2b"; ctx.fill(); ctx.strokeStyle = WX.accent; ctx.stroke();
                    ctx.fillStyle = WX.light; ctx.fillText("+", q.x + q.w / 2, q.y + q.h / 2 + 0.5);
                });
                ctx.restore();
                return rr;
            };
            const origDown = node.onMouseDown;
            node.onMouseDown = function (e, pos) {
                if (!this.flags?.collapsed) {
                    for (let idx = 0; idx < (node.inputs || []).length; idx++) {
                        const q = chipRect(idx);
                        if (q && pos[0] >= q.x && pos[0] <= q.x + q.w && pos[1] >= q.y && pos[1] <= q.y + q.h) { insertAfter(idx); return true; }
                    }
                }
                return origDown?.apply(this, arguments);
            };
            const origConn = node.onConnectionsChange;
            node.onConnectionsChange = function (type, index, connected) {
                const rr = origConn?.apply(this, arguments);
                if (type === 1) setTimeout(() => layout(!connected), 0);   // 1 = LiteGraph.INPUT
                return rr;
            };
            const origConfigure = node.onConfigure;
            node.onConfigure = function () { const rr = origConfigure?.apply(this, arguments); setTimeout(() => layout(false), 0); return rr; };

            // Nodes 2.0 paints nothing of onDrawForeground: the + chip as HTML, in the slot rows of the node's DOM (wxStyle.js)
            function vueChips() {
                const rows = wxVueInputRows(node); if (!rows) return;
                for (const r of rows) {
                    if (!chipRect(r.idx)) { r.el.querySelector(":scope > .wx-vue-chip")?.remove(); continue; }
                    const c = wxVueChip(r.el, "wx-vue-chip", () => insertAfter(Number(c.dataset.idx)));
                    c.dataset.idx = String(r.idx); c.textContent = "+";
                }
            }
            wxVueDecor(node, vueChips);

            layout(false);   // a new node: the 20 sockets of the schema down to one
            setTimeout(() => layout(false), 0);
            return ret;
        };
    },
});
