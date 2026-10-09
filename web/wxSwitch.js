// WextraUI — WSwitch: the switch with slots. A slot = `inputs_per_slot` cables; one on/off pill per slot, drawn next to
// the slot's first cable; only one slot on (click one, the others go off). The slots shown are the ones in use plus one
// empty (never fewer than 2). The type of a position is learned from the first cable found there and set on the same
// position of every slot and on the output: the socket takes the colour of the type and refuses another type.
// The first output, `index` (INT), is the slot that is on, counted from 0; out_1..out_K follow it.
// State lives in the schema's widgets (inputs_per_slot, on_1..on_20, the on_i buried, control): widgets_values stays fixed.
// `control` + the `carry` cable (wxCarry.js): the slot that is on walks over the slots in use after every queued run, or on
// the beat of the cable; coming round from the last slot to the first it beats the next node. `carry` is the last output.
// Every slot is a box around its rows (the one that is on in the accent), and the slots have names (Sick, 09/10): the
// pencil `✎` after the pill opens a little box to type one (double-click on the pill does too); a slot fed by a
// checkpoint / LoRA / UNet loader gets the bare file name by itself. The row reads `0 · krea`, and WSave Image's {#id}
// of the switch is the name of the slot that is on (the hidden `labels` box carries them to the backend; a found name
// is marked `~`). The handle `≡` after the pencil moves the slot: drop it on another one and it takes that place, with
// its cables, pill and name (the sockets are renamed, wxSlots.js moves them with their cables); `index` counts the new order.
// Backend: src/wswitch.py.
import { app } from "../../scripts/app.js";
import { WX, wxVueInputRows, wxVueDecor, wxVueChip, wxHideWidget, ensureWxStyle } from "./wxStyle.js";
import { wxCarry } from "./wxCarry.js";
import { wxReorderInputs, wxReorderOutputs } from "./wxSlots.js";

const MAXS = 20, MAXK = 4, MIN_SLOTS = 2;
const RX = /^in(\d+)_(\d+)$/;
const IN = (i, k) => "in" + i + "_" + k;
const PILL = { w: 34, h: 15, gap: 8 }, PEN = { w: 16, gap: 4 }, GRIP = { w: 14, gap: 2 };   // the on/off pill, the pencil, the handle ≡
const BOX = { x: 3, pad: 5, r: 5, fill: "rgba(20,100,179,0.12)", off: "#4a4a4a" };   // the frame around a slot's rows
const SLOT_H = () => Number(globalThis.LiteGraph?.NODE_SLOT_HEIGHT) || 20;
const ORDER = (a, b) => {   // slot, then position; `carry` (and anything else) after
    const A = RX.exec(a.name), B = RX.exec(b.name);
    if (A && B) return (Number(A[1]) - Number(B[1])) || (Number(A[2]) - Number(B[2]));
    return (A ? 0 : 1) - (B ? 0 : 1);
};

function bury(w, node) {   // a canvas widget that must not show (on_i) but stays in the workflow and in the prompt; its socket neither
    if (w) wxHideWidget(w, node);
}

app.registerExtension({
    name: "WextraUI.switch",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxSwitch") return;
        // The frontend's configure matches the saved sockets to the node's by NAME but keeps the ORDER the node has
        // now (the two sockets it is born with first, the saved rest after), and a cable lives at the index of its
        // socket (wxSlots.js): the saved sockets go in place here, in their order, and the outputs become `index`,
        // out_1..K, `carry`, while the node has no cable yet. Then every cable of the file lands on its own socket.
        const origConfigure = nodeType.prototype.configure;
        nodeType.prototype.configure = function (info) {
            const ins = Array.isArray(info?.inputs) ? info.inputs : [], outs = Array.isArray(info?.outputs) ? info.outputs : [];
            const bare = !(this.inputs || []).some((s) => s.link != null) && !(this.outputs || []).some((o) => (o.links || []).length);
            if (bare && ins.length) {
                for (const s of ins) if (s && RX.test(s.name || "") && !this.inputs.some((x) => x.name === s.name)) this.addInput(s.name, "*");
                this.inputs.sort(ORDER);
            }
            const K0 = Math.max(1, Math.min(MAXK, Number(info?.widgets_values?.[0]) || 1));
            if (bare && outs.length > K0) {   // a file with `index` (0.6 and after): index, out_1..K, carry
                const body = this.outputs.filter((o) => o.name !== "index" && o.name !== "carry");
                while (body.length < K0) { this.addOutput("out_" + (body.length + 1), "*"); body.push(this.outputs[this.outputs.length - 1]); }
                const idx = this.outputs.find((o) => o.name === "index"), carry = this.outputs.find((o) => o.name === "carry");
                this.outputs.splice(0, this.outputs.length, ...(idx ? [idx] : []), ...body, ...(carry ? [carry] : []));
            }
            return origConfigure.apply(this, arguments);
        };
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            const W = (nm) => (node.widgets || []).find((w) => w.name === nm);
            const wN = W("inputs_per_slot"), wCtl = W("control"), wLab = W("labels");
            for (let i = 1; i <= MAXS; i++) bury(W("on_" + i), node);
            if (wLab) bury(wLab, node);

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
            const used = () => Math.max(1, shown() - 1);   // the slots in use: up to the last one with a cable
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
            const stray = (s) => { if (s.name === "carry") return false; const m = RX.exec(s.name); return !(m && Number(m[1]) <= shown() && Number(m[2]) <= per()); };

            // ---- the names of the slots: typed (double-click a pill), else the bare file name of the loader on the slot's first cable ----
            const LOADER_NAMES = ["ckpt_name", "lora_name", "unet_name", "model_name"];
            const labels = () => { try { const d = JSON.parse(wLab?.value || "{}"); return d && typeof d === "object" && !Array.isArray(d) ? d : {}; } catch (e) { return {}; } };
            const typedLabel = (i) => { const v = labels()[String(i)]; return typeof v === "string" && !v.startsWith("~") ? v.trim() : ""; };
            const autoLabel = (i) => {
                const idx = inputIdx(IN(i, 1)), s = idx >= 0 ? node.inputs[idx] : null;
                const l = s && s.link != null ? getLink(s.link) : null, src = l && node.graph?.getNodeById(l.origin_id);
                const v = (src?.widgets || []).find((x) => LOADER_NAMES.includes(x.name))?.value;
                return typeof v === "string" && v ? v.replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "") : "";
            };
            const labelOf = (i) => typedLabel(i) || autoLabel(i);
            node.__wxLabel = () => labelOf(active());   // WSave Image's {#id} of this node, in the preview (web/saveWimage.js)
            const setLabel = (i, text) => {
                if (!wLab) return;
                const d = labels(), t = String(text || "").trim();
                for (const k of Object.keys(d)) if (String(d[k]).startsWith("~")) delete d[k];
                if (t) d[String(i)] = t; else delete d[String(i)];
                wLab.value = Object.keys(d).length ? JSON.stringify(d) : "";
                layout();
            };
            // what the backend reads at the run: the typed names, and the found ones marked `~` (src/saveWimage.py strips it);
            // written when the prompt is built, so a loader that walked a moment ago is read as it is now
            const syncLabels = () => {
                if (!wLab) return;
                const d = {}, n = Math.max(1, shown() - 1);
                for (let i = 1; i <= n; i++) { const t = typedLabel(i); if (t) d[String(i)] = t; else { const a = autoLabel(i); if (a) d[String(i)] = "~" + a; } }
                const v = Object.keys(d).length ? JSON.stringify(d) : "";
                if (wLab.value !== v) wLab.value = v;
            };
            if (wLab) wLab.serializeValue = () => { syncLabels(); return wLab.value; };
            const namePop = (i, x, y) => {   // the little box to name slot i, at the pointer (the pencil, or a double-click on the pill): Enter keeps, Esc or a click outside leaves
                ensureWxStyle();
                document.querySelector(".wx-slotname")?.remove();
                const pop = document.createElement("div"); pop.className = "wx wx-slotname";
                pop.style.cssText = `position:fixed;left:${Math.min(x, window.innerWidth - 260)}px;top:${Math.min(y, window.innerHeight - 40)}px;z-index:10000;background:#1e1e1e;border:1px solid ${WX.accent};border-radius:6px;padding:6px 8px;box-shadow:0 4px 16px rgba(0,0,0,.6);display:flex;gap:6px;align-items:center`;
                const lab = document.createElement("span"); lab.className = "wx-hint"; lab.textContent = `slot ${i - 1} · name`;
                const inp = document.createElement("input"); inp.className = "wx-input"; inp.value = typedLabel(i); inp.placeholder = autoLabel(i) || "for the file name"; inp.style.width = "170px";
                inp.title = "The name of this slot in a WSave Image name ({#id} of the switch). Empty = the loader's file name on its first cable, else the slot's number.";
                const off = (e) => { if (!pop.contains(e.target)) close(); };
                const close = () => { pop.remove(); document.removeEventListener("pointerdown", off, true); };
                inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { setLabel(i, inp.value); close(); } else if (e.key === "Escape") close(); });
                for (const t of ["pointerdown", "pointerup", "mousedown", "mouseup", "wheel", "dblclick"]) pop.addEventListener(t, (e) => e.stopPropagation());
                pop.append(lab, inp); document.body.appendChild(pop);
                setTimeout(() => { inp.focus(); inp.select(); document.addEventListener("pointerdown", off, true); }, 0);
            };

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
                // 2. add the missing sockets, then slot / position order, `carry` last (the cables go with their sockets: wxSlots.js)
                for (let i = 1; i <= n; i++) for (let k = 1; k <= K; k++) if (inputIdx(IN(i, k)) < 0) node.addInput(IN(i, k), "*");
                wxReorderInputs(node, [...node.inputs].sort(ORDER));
                // 3. types and labels, position by position
                for (let k = 1; k <= K; k++) {
                    const t = typeAt(k);
                    for (const s of node.inputs) {
                        const m = RX.exec(s.name);
                        if (!m || Number(m[2]) !== k) continue;
                        const i = Number(m[1]), lab = k === 1 ? labelOf(i) : "";   // the slot as `index` counts it: from 0; its name on its first row
                        s.type = t; s.label = (i - 1) + " · " + (lab || (t === "*" ? k : t));
                    }
                }
                syncLabels();
                // 4. `index` first, then K outputs typed like their position, `carry` last (the cables go with their outputs)
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
                wxReorderOutputs(node, [node.outputs.find((o) => o.name === "index"), ...node.outputs.filter(isOut), node.outputs.find((o) => o.name === "carry")]);
                node.outputs.forEach((o, j) => {
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
            // the narrowest the node can be: what LiteGraph asks, and a row = socket + label + pill + pencil + box edge + output label
            const ruler = document.createElement("canvas").getContext("2d");
            const widest = (c, slots) => { c.save(); c.font = "14px Arial"; const w = Math.max(0, ...(slots || []).map((s) => c.measureText(s.label || s.name || "").width)); c.restore(); return w; };
            function minWidth(sz) {
                const row = 24 + widest(ruler, node.inputs) + PILL.gap + PILL.w + PEN.gap + PEN.w + GRIP.gap + GRIP.w + BOX.pad + 10 + widest(ruler, node.outputs) + 24;
                return Math.ceil(Math.max((sz || node.computeSize())[0], row));
            }

            // the pill of slot i sits on the row of its first cable, after the widest label (every pill at the same x; the
            // outputs own the right edge); the pencil after the pill; the box of the slot around its K rows, socket to pencil
            let measure = null;   // canvas context of the last draw, to measure the labels
            const hit = (q, pos) => !!q && pos[0] >= q.x && pos[0] <= q.x + q.w && pos[1] >= q.y && pos[1] <= q.y + q.h;
            function pillRect(i) {
                const idx = inputIdx(IN(i, 1));
                if (idx < 0) return null;
                const p = node.getConnectionPos(true, idx);
                return { x: p[0] - node.pos[0] + 14 + widest(measure || ruler, node.inputs) + PILL.gap, y: p[1] - node.pos[1] - PILL.h / 2, w: PILL.w, h: PILL.h };
            }
            const penRect = (i) => { const q = pillRect(i); return q ? { x: q.x + q.w + PEN.gap, y: q.y, w: PEN.w, h: q.h } : null; };
            const gripRect = (i) => { const q = penRect(i); return q ? { x: q.x + q.w + GRIP.gap, y: q.y, w: GRIP.w, h: q.h } : null; };
            function boxRect(i) {
                const a = inputIdx(IN(i, 1)), b = inputIdx(IN(i, per())), grip = gripRect(i);
                if (a < 0 || b < 0 || !grip) return null;
                const h = SLOT_H() / 2, y = node.getConnectionPos(true, a)[1] - node.pos[1] - h + 1.5;
                return { x: BOX.x, y, w: grip.x + grip.w + BOX.pad - BOX.x, h: node.getConnectionPos(true, b)[1] - node.pos[1] + h - 1.5 - y };
            }

            // ---- the order of the slots: drag a slot by its handle ≡ and drop it on another, it takes that place and the ones
            // between move up or down (Sick, 09/10). Cables, pill and name go with their slot: the sockets are renamed and
            // layout() puts them in order with their cables (wxSlots.js). `index` counts the new order.
            const moveSlot = (a, b) => {
                const n = used(), K = per();
                if (a === b || a < 1 || b < 1 || a > n || b > n) return;
                const order = []; for (let i = 1; i <= n; i++) if (i !== a) order.push(i); order.splice(b - 1, 0, a);   // order[p-1] = the slot that lands at p
                const on = order.map((o) => isOn(o)), lab = labels(), newLab = {};
                order.forEach((o, p) => { if (lab[String(o)] != null) newLab[String(p + 1)] = lab[String(o)]; });
                for (const s of node.inputs || []) { const m = RX.exec(s.name); if (m && Number(m[1]) <= n) s.name = "tmp_" + s.name; }
                order.forEach((o, p) => { for (let k = 1; k <= K; k++) { const s = (node.inputs || []).find((x) => x.name === "tmp_" + IN(o, k)); if (s) s.name = IN(p + 1, k); } });
                for (const s of node.inputs || []) if (s.name.startsWith("tmp_")) s.name = s.name.slice(4);
                for (let p = 1; p <= n; p++) { const w = W("on_" + p); if (w) w.value = on[p - 1]; }
                if (wLab) wLab.value = Object.keys(newLab).length ? JSON.stringify(newLab) : "";
                layout();
            };
            let drag = null;   // { from, to } while a slot is dragged by its handle; `to` lights up
            const startDrag = (from, target) => {   // target(e): the slot in use under the pointer, or 0
                if (from < 1 || from > used()) return;
                drag = { from, to: from };
                const move = (e) => { const t = target(e); if (t && t !== drag.to) { drag.to = t; node.setDirtyCanvas(true, false); vuePills(); } };
                const up = () => {
                    document.removeEventListener("pointermove", move, true); document.removeEventListener("pointerup", up, true);
                    const d = drag; drag = null;
                    if (d && d.to && d.to !== d.from) moveSlot(d.from, d.to);
                    node.setDirtyCanvas(true, true); vuePills();
                };
                document.addEventListener("pointermove", move, true); document.addEventListener("pointerup", up, true);
            };
            const slotAtY = (y) => { const n = used(); for (let i = 1; i <= n; i++) { const b = boxRect(i); if (b && y >= b.y && y <= b.y + b.h) return i; } return 0; };
            const canvasTarget = (e) => { const c = app.canvas; if (!c?.convertEventToCanvasOffset) return 0; const p = c.convertEventToCanvasOffset(e); return slotAtY(p[1] - node.pos[1]); };
            const origDraw = node.onDrawForeground;
            node.onDrawForeground = function (ctx) {
                const rr = origDraw?.apply(this, arguments);
                if (this.flags?.collapsed) return rr;
                measure = ctx;
                const n = shown(), a = active();
                ctx.save();
                ctx.lineWidth = 1;
                for (let i = 1; i <= n; i++) {   // the box of every slot, the one that is on in the accent; the one a drag is over lights up
                    const b = boxRect(i);
                    if (!b) continue;
                    const on = i === a, over = drag && i === drag.to && i !== drag.from;
                    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, BOX.r);
                    if (on || over) { ctx.fillStyle = BOX.fill; ctx.fill(); }
                    ctx.strokeStyle = over ? WX.light : on ? WX.accent : BOX.off; ctx.lineWidth = over ? 2 : 1; ctx.stroke();
                }
                ctx.lineWidth = 1;
                ctx.font = "11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                for (let i = 1; i <= n; i++) {   // the pills
                    const q = pillRect(i);
                    if (!q) continue;
                    const on = i === a;
                    ctx.beginPath(); ctx.roundRect(q.x, q.y, q.w, q.h, q.h / 2);
                    ctx.fillStyle = on ? WX.deep : "#2b2b2b"; ctx.fill();
                    ctx.strokeStyle = on ? WX.accent : "#555"; ctx.stroke();
                    ctx.fillStyle = on ? WX.light : "#999";
                    ctx.fillText(on ? "on" : "off", q.x + q.w / 2, q.y + q.h / 2 + 0.5);
                }
                ctx.font = "12px sans-serif";
                const u = used();
                for (let i = 1; i <= n; i++) {   // the pencils: the name of the slot; the handles ≡ on the slots in use: their order
                    const q = penRect(i);
                    if (!q) continue;
                    ctx.fillStyle = i === a ? WX.light : "#8a8a8a";
                    ctx.fillText("✎", q.x + q.w / 2, q.y + q.h / 2 + 0.5);
                    if (i > u || u < 2) continue;
                    const gq = gripRect(i);
                    ctx.fillStyle = drag && i === drag.from ? WX.light : "#777";
                    ctx.fillText("≡", gq.x + gq.w / 2, gq.y + gq.h / 2 + 0.5);
                }
                ctx.restore();
                return rr;
            };
            const origDown = node.onMouseDown;
            node.onMouseDown = function (e, pos) {   // a pill turns its slot on; the pencil opens the box to name it
                if (!this.flags?.collapsed && pos) {
                    const n = shown();
                    for (let i = 1; i <= n; i++) {
                        if (hit(pillRect(i), pos)) { setActive(i); return true; }
                        if (hit(penRect(i), pos)) { namePop(i, e?.clientX ?? 100, e?.clientY ?? 100); return true; }
                        if (i <= used() && used() > 1 && hit(gripRect(i), pos)) { startDrag(i, canvasTarget); return true; }
                    }
                }
                return origDown?.apply(this, arguments);
            };
            const origDbl = node.onDblClick;
            node.onDblClick = function (e, pos) {   // on a pill too: the box to name that slot
                if (!this.flags?.collapsed && pos) {
                    const n = shown();
                    for (let i = 1; i <= n; i++) if (hit(pillRect(i), pos)) { namePop(i, e?.clientX ?? 100, e?.clientY ?? 100); return true; }
                }
                return origDbl?.apply(this, arguments);
            };

            if (wN) { const cb = wN.callback; wN.callback = function () { const rr = cb?.apply(this, arguments); layout(); return rr; }; }
            // the walk of the slot that is on, over the slots in use (up to the last one with a cable): after every queued
            // run by `control`, or on the beat of the carry cable; coming round beats the next node (wxCarry.js)
            const at =() => (used() > 1 ? active() - 1 : null);
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
                wxCarry(node, { control: () => wCtl, at, size, move, first: () => setActive(1) });
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
            // Nodes 2.0 paints nothing of onDrawForeground: the boxes, the pills and the pencils as HTML, in the slot rows of
            // the node's DOM (wxStyle.js). The box is inset shadows on the rows of the slot (nothing moves), the accent when on.
            const vueSlotOf = (el) => {   // the slot of a DOM row (or 0): the index in its slot key, then the socket's name
                const m = /-in-(\d+)$/.exec(el?.querySelector?.("[data-slot-key]")?.dataset.slotKey || "");
                const s = m && RX.exec(node.inputs[Number(m[1])]?.name || "");
                return s ? Number(s[1]) : 0;
            };
            const vueTarget = (e) => { const i = vueSlotOf(document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".lg-slot--input")); return i && i <= used() ? i : 0; };
            function vuePills() {
                const rows = wxVueInputRows(node); if (!rows) return;
                const n = shown(), K = per(), a = active(), u = used();
                const strip = (el) => { for (const c of [".wx-pill", ".wx-pen", ".wx-grip"]) el.querySelector(":scope > " + c)?.remove(); };
                for (const r of rows) {
                    const m = RX.exec(node.inputs[r.idx]?.name || ""), st = r.el.style;
                    const slot = m && Number(m[1]) <= n ? Number(m[1]) : 0, k = m ? Number(m[2]) : 0;
                    if (!slot) { st.boxShadow = ""; st.borderRadius = ""; st.background = ""; strip(r.el); continue; }
                    const on = slot === a, over = drag && slot === drag.to && slot !== drag.from, c = over ? WX.light : on ? WX.accent : BOX.off, sh = [`inset 1px 0 0 ${c}`, `inset -1px 0 0 ${c}`];
                    if (k === 1) sh.push(`inset 0 1px 0 ${c}`);
                    if (k === K) sh.push(`inset 0 -1px 0 ${c}`);
                    st.boxShadow = sh.join(","); st.borderRadius = (k === 1 ? "6px 6px " : "0 0 ") + (k === K ? "6px 6px" : "0 0"); st.background = on || over ? BOX.fill : "";
                    if (k !== 1) { strip(r.el); continue; }
                    const pill = wxVueChip(r.el, "wx-pill", () => { setActive(Number(pill.dataset.slot)); vuePills(); });
                    pill.dataset.slot = String(slot);
                    if (!pill.__wxDbl) { pill.__wxDbl = true; pill.addEventListener("dblclick", (e) => { e.stopPropagation(); e.preventDefault(); namePop(Number(pill.dataset.slot), e.clientX, e.clientY); }); }
                    pill.textContent = on ? "on" : "off"; pill.classList.toggle("on", on);
                    const pen = wxVueChip(r.el, "wx-pen", () => { const b = pen.getBoundingClientRect(); namePop(Number(pen.dataset.slot), b.left, b.bottom + 4); });
                    pen.dataset.slot = String(slot); pen.textContent = "✎"; pen.title = "Name this slot (the name goes in a WSave Image file name)"; pen.classList.toggle("on", on);
                    if (slot > u || u < 2) { r.el.querySelector(":scope > .wx-grip")?.remove(); continue; }
                    const grip = wxVueChip(r.el, "wx-grip", () => {});
                    grip.dataset.slot = String(slot); grip.textContent = "≡"; grip.title = "Drag the slot on another one: it takes that place, cables and name with it";
                    if (!grip.__wxDrag) { grip.__wxDrag = true; grip.addEventListener("pointerdown", (e) => { if (e.button === 0) { e.preventDefault(); startDrag(Number(grip.dataset.slot), vueTarget); } }); }
                }
            }
            wxVueDecor(node, vuePills);
            // the frontend puts the widget sockets back when a cable is dragged around: swept at intervals
            const timer = setInterval(() => {
                if ((node.inputs || []).some(stray)) layout();
                else {   // a loader on a slot walked, or was renamed: the row follows
                    const n = shown();
                    for (let i = 1; i <= n; i++) { const idx = inputIdx(IN(i, 1)); const s = idx >= 0 ? node.inputs[idx] : null; if (!s) continue; const want = (i - 1) + " · " + (labelOf(i) || (s.type === "*" ? 1 : s.type)); if (s.label !== want) { s.label = want; node.setDirtyCanvas(true, false); } }
                }
            }, 400);
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
