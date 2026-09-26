// WextraUI — WSwitch: the switch with slots. A slot = `inputs_per_slot` cables; one on/off pill per slot, drawn next to
// the slot's first cable; only one slot on (click one, the others go off). The slots shown are the ones in use plus one
// empty (never fewer than 2). The type of a position is learned from the first cable found there and set on the same
// position of every slot and on the output: the socket takes the colour of the type and refuses another type.
// The first output, `index` (INT), is the slot that is on, counted from 0; out_1..out_K follow it.
// State lives in the schema's widgets (inputs_per_slot, on_1..on_20, the on_i buried, control): widgets_values stays fixed.
// `control` + the `carry` cable (wxCarry.js): the slot that is on walks over the slots in use after every queued run, or on
// the beat of the cable; coming round from the last slot to the first it beats the next node. `carry` is the last output.
// Backend: src/wswitch.py.
import { app } from "../../scripts/app.js";
import { WX, wxVueInputRows, wxVueDecor, wxVueChip } from "./wxStyle.js";
import { wxCarry } from "./wxCarry.js";

const MAXS = 20, MAXK = 4, MIN_SLOTS = 2;
const RX = /^in(\d+)_(\d+)$/;
const IN = (i, k) => "in" + i + "_" + k;
const PILL = { w: 34, h: 15, gap: 8 };

function bury(w) {   // a canvas widget that must not show (on_i) but stays in the workflow and in the prompt
    if (!w) return;
    w.type = "converted-widget";
    w.computeSize = () => [0, -4];
    w.hidden = true;
    w.options = w.options || {};
    w.options.hidden = true;
}

app.registerExtension({
    name: "WextraUI.switch",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxSwitch") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            const W = (nm) => (node.widgets || []).find((w) => w.name === nm);
            const wN = W("inputs_per_slot"), wCtl = W("control");
            for (let i = 1; i <= MAXS; i++) bury(W("on_" + i));

            const per = () => Math.max(1, Math.min(MAXK, Number(wN?.value) || 1));
            const isOn = (i) => W("on_" + i)?.value === true;
            const active = () => { for (let i = 1; i <= MAXS; i++) if (isOn(i)) return i; return 1; };
            const setActive = (i) => {
                for (let j = 1; j <= MAXS; j++) { const w = W("on_" + j); if (w) w.value = j === i; }
                node.setDirtyCanvas(true, true);
            };
            const getLink = (id) => {
                const L = node.graph?.links;
                if (id == null || !L) return null;
                return L instanceof Map ? L.get(id) : (node.graph.getLink ? node.graph.getLink(id) : L[id]);
            };
            const inputIdx = (name) => (node.inputs || []).findIndex((s) => s.name === name);

            // slots shown: one empty after the last slot with a cable, never fewer than MIN_SLOTS
            function shown() {
                let last = 0;
                for (const s of node.inputs || []) { const m = RX.exec(s.name); if (m && s.link != null) last = Math.max(last, Number(m[1])); }
                return Math.max(MIN_SLOTS, Math.min(MAXS, last + 1));
            }
            // the type of position k: the first cable found on that position of any slot, else "*"
            function typeAt(k) {
                for (const s of node.inputs || []) {
                    const m = RX.exec(s.name);
                    if (!m || Number(m[2]) !== k || s.link == null) continue;
                    const l = getLink(s.link);
                    let t = l?.type;
                    if (!t || t === "*") { const src = l && node.graph?.getNodeById(l.origin_id); t = src?.outputs?.[l.origin_slot]?.type; }
                    if (t && t !== "*") return t;
                }
                return "*";
            }
            const stray = (s) => { const m = RX.exec(s.name); return !(m && Number(m[1]) <= shown() && Number(m[2]) <= per()); };

            let oldOuts = 0;   // how many outputs a file saved before `index` had (set while it loads, used once by layout)
            let outNames = null;   // the names the file gave its outputs (set while it loads, put back once by layout)
            function layout() {
                const n = shown(), K = per();
                // 1. drop what must not be there: widget sockets, slots beyond n, positions beyond K
                for (let idx = (node.inputs || []).length - 1; idx >= 0; idx--) {
                    const s = node.inputs[idx];
                    if (!stray(s)) continue;
                    if (s.link != null) node.disconnectInput(idx);
                    node.removeInput(idx);
                }
                // 2. add the missing sockets, then slot / position order (the cables follow: target_slot is rewritten)
                for (let i = 1; i <= n; i++) for (let k = 1; k <= K; k++) if (inputIdx(IN(i, k)) < 0) node.addInput(IN(i, k), "*");
                node.inputs.sort((a, b) => { const A = RX.exec(a.name), B = RX.exec(b.name); return (Number(A[1]) - Number(B[1])) || (Number(A[2]) - Number(B[2])); });
                node.inputs.forEach((s, idx) => { const l = getLink(s.link); if (l) l.target_slot = idx; });
                // 3. types and labels, position by position
                for (let k = 1; k <= K; k++) {
                    const t = typeAt(k);
                    for (const s of node.inputs) {
                        const m = RX.exec(s.name);
                        if (m && Number(m[2]) === k) { s.type = t; s.label = (Number(m[1]) - 1) + " · " + (t === "*" ? k : t); }   // the slot as `index` counts it: from 0
                    }
                }
                // 4. `index` first, then K outputs typed like their position (the cables follow: origin_slot is rewritten)
                // The frontend names the outputs of a file after the outputs the node has at that moment (K=1 at birth: index,
                // out_1, carry), even in the data it hands to onConfigure: a saved `out_2` comes in called `carry` and its cables
                // would end on the real carry. The names come back from the position, which is fixed.
                if (outNames) {
                    if (outNames.length === node.outputs.length) node.outputs.forEach((o, j) => { if (outNames[j]) o.name = outNames[j]; });
                    outNames = null;
                }
                if (oldOuts) {   // a file saved before `index`: its outputs are out_1.., whatever the frontend called them on the way in
                    while (node.outputs.length > oldOuts) node.removeOutput(node.outputs.length - 1);
                    node.outputs.forEach((o, j) => { o.name = "out_" + (j + 1); });
                    oldOuts = 0;
                }
                if (!node.outputs?.some((o) => o.name === "index")) node.addOutput("index", "INT");
                if (!node.outputs.some((o) => o.name === "carry")) node.addOutput("carry", "WX_CARRY");
                const isOut = (o) => o.name !== "index" && o.name !== "carry";
                while (node.outputs.filter(isOut).length > K) { const o = node.outputs.filter(isOut).pop(); node.removeOutput(node.outputs.indexOf(o)); }
                while (node.outputs.filter(isOut).length < K) node.addOutput("out_" + (node.outputs.filter(isOut).length + 1), "*");
                node.outputs.splice(0, node.outputs.length, node.outputs.find((o) => o.name === "index"), ...node.outputs.filter(isOut), node.outputs.find((o) => o.name === "carry"));
                node.outputs.forEach((o, j) => {
                    for (const id of o.links || []) { const l = getLink(id); if (l) l.origin_slot = j; }
                    if (!j) { o.type = "INT"; o.label = "index"; return; }
                    if (j === K + 1) { o.type = "WX_CARRY"; o.label = "carry"; return; }
                    const t = typeAt(j); o.name = "out_" + j; o.type = t; o.label = t === "*" ? "out_" + j : t;
                });
                // 5. one slot on, always
                if (!(node.widgets || []).some((w) => /^on_\d+$/.test(w.name) && w.value === true)) setActive(1);
                const sz = node.computeSize();
                node.setSize([Math.max(node.size[0], minWidth(sz)), sz[1]]);
                node.setDirtyCanvas(true, true);
            }
            // the narrowest the node can be: what LiteGraph asks, and a row = label + pill + output label
            const ruler = document.createElement("canvas").getContext("2d");
            function minWidth(sz) {
                ruler.font = "14px Arial";
                const widest = (slots) => Math.max(0, ...(slots || []).map((s) => ruler.measureText(s.label || s.name || "").width));
                const row = 14 + widest(node.inputs) + PILL.gap + PILL.w + PILL.gap + widest(node.outputs) + 14;
                return Math.ceil(Math.max((sz || node.computeSize())[0], row));
            }

            // the pill of slot i sits on the row of its first cable, right after the label (the outputs own the right edge)
            let measure = null;   // canvas context of the last draw, to measure the label
            function pillRect(i) {
                const idx = inputIdx(IN(i, 1));
                if (idx < 0) return null;
                const s = node.inputs[idx], p = node.getConnectionPos(true, idx);
                let tw = 60;
                if (measure) { measure.save(); measure.font = "14px Arial"; tw = measure.measureText(s.label || s.name).width; measure.restore(); }
                return { x: p[0] - node.pos[0] + 14 + tw + PILL.gap, y: p[1] - node.pos[1] - PILL.h / 2, w: PILL.w, h: PILL.h };
            }
            const origDraw = node.onDrawForeground;
            node.onDrawForeground = function (ctx) {
                const rr = origDraw?.apply(this, arguments);
                if (this.flags?.collapsed) return rr;
                measure = ctx;
                const n = shown(), a = active();
                ctx.save();
                ctx.font = "11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 1;
                for (let i = 1; i <= n; i++) {
                    const q = pillRect(i);
                    if (!q) continue;
                    const on = i === a;
                    ctx.beginPath(); ctx.roundRect(q.x, q.y, q.w, q.h, q.h / 2);
                    ctx.fillStyle = on ? WX.deep : "#2b2b2b"; ctx.fill();
                    ctx.strokeStyle = on ? WX.accent : "#555"; ctx.stroke();
                    ctx.fillStyle = on ? WX.light : "#999";
                    ctx.fillText(on ? "on" : "off", q.x + q.w / 2, q.y + q.h / 2 + 0.5);
                }
                ctx.restore();
                return rr;
            };
            const origDown = node.onMouseDown;
            node.onMouseDown = function (e, pos) {
                if (!this.flags?.collapsed) {
                    const n = shown();
                    for (let i = 1; i <= n; i++) {
                        const q = pillRect(i);
                        if (q && pos[0] >= q.x && pos[0] <= q.x + q.w && pos[1] >= q.y && pos[1] <= q.y + q.h) { setActive(i); return true; }
                    }
                }
                return origDown?.apply(this, arguments);
            };

            if (wN) { const cb = wN.callback; wN.callback = function () { const rr = cb?.apply(this, arguments); layout(); return rr; }; }
            // the walk of the slot that is on, over the slots in use (up to the last one with a cable): after every queued
            // run by `control`, or on the beat of the carry cable; coming round beats the next node (wxCarry.js)
            const used = () => Math.max(1, shown() - 1);
            const at = () => (used() > 1 ? active() - 1 : null);
            const size = () => (used() > 1 ? used() : null);
            const move = (dir) => {
                const n = used(), i = active() - 1;
                if (n < 2) return false;
                const next = dir === "-" ? (i <= 0 ? n - 1 : i - 1) : dir === "rand" ? Math.floor(Math.random() * n) : (i + 1) % n;
                setActive(next + 1);
                return dir === "+" ? next === 0 : dir === "-" ? next === n - 1 : false;
            };
            if (wCtl) {
                wCtl.afterQueued = () => { const c = wCtl.value; if (c && c !== "fixed") move(c === "decrement" ? "-" : c === "randomize" ? "rand" : "+"); };
                wxCarry(node, { control: () => wCtl, at, size, move });
            }
            const origConn = node.onConnectionsChange;
            node.onConnectionsChange = function () { const rr = origConn?.apply(this, arguments); setTimeout(layout, 0); return rr; };
            const origConfigure = node.onConfigure;
            node.onConfigure = function (info) {
                const rr = origConfigure?.apply(this, arguments);
                const saved = info?.outputs;
                // told by the count, not by the names (the frontend renames the saved outputs after today's): K outputs = no `index` yet
                const K0 = Math.max(1, Math.min(MAXK, Number(info?.widgets_values?.[0]) || 1));
                if (Array.isArray(saved) && saved.length && saved.length <= K0) oldOuts = saved.length;
                else if (Array.isArray(saved) && saved.length > 2) outNames = saved.map((o, j) => j === 0 ? "index" : j === saved.length - 1 ? "carry" : "out_" + j);   // the order is fixed: index, out_1..K, carry
                setTimeout(layout, 0); setTimeout(layout, 250); return rr; };
            // Nodes 2.0 paints nothing of onDrawForeground: the pills as HTML, in the slot rows of the node's DOM (wxStyle.js)
            function vuePills() {
                const rows = wxVueInputRows(node); if (!rows) return;
                const n = shown(), a = active();
                for (const r of rows) {
                    const m = RX.exec(node.inputs[r.idx]?.name || "");
                    const slot = m && Number(m[2]) === 1 && Number(m[1]) <= n ? Number(m[1]) : 0;
                    if (!slot) { r.el.querySelector(":scope > .wx-pill")?.remove(); continue; }
                    const pill = wxVueChip(r.el, "wx-pill", () => { setActive(Number(pill.dataset.slot)); vuePills(); });
                    pill.dataset.slot = String(slot);
                    const on = slot === a;
                    pill.textContent = on ? "on" : "off"; pill.classList.toggle("on", on);
                }
            }
            wxVueDecor(node, vuePills);
            // the frontend puts the widget sockets back when a cable is dragged around: swept at intervals
            const timer = setInterval(() => { if ((node.inputs || []).some(stray)) layout(); }, 400);
            const origRemoved = node.onRemoved;
            node.onRemoved = function () { clearInterval(timer); return origRemoved?.apply(this, arguments); };

            layout();
            // born at its minimum width (a saved node keeps the size of its file: configure comes after)
            const born = node.computeSize();
            node.setSize([minWidth(born), born[1]]);
            setTimeout(layout, 200);
            return r;
        };
    },
});
