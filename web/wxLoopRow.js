// La riga del giro sui sei nodi loop (Foley e H3): dove siamo durante il Run, e i chip v1 v2 v3 dei valori del For Loop.
// WextraUI — the row of the loop (Sick 02/11/2026, from the simulation in the mockup WLoopRun). At the bottom of the six
// nodes, `start`, the step in the middle and `end` on a thread, with the way back as an arc of one dash per round. At rest
// it says which step this node is; in a Run the three nodes of a loop draw the same moment: the step at work, the thread
// that lights up while the body generates, the dash of the round filling with the sampler's steps, `3/9` under the arc.
// The result stays until the next Run; Interrupt stops it where it is, in orange, an error in red. The node never changes
// size in a Run, so no cable moves.
// Everything comes from what Comfy already sends: `executing` for the step, `progress` for the dash, and what WLoop Start
// and WLoop End say at the end of their work (`wx_loop` in their `ui`): how many rounds, and which one is finished. That
// way a node served from the cache says it too, and an identical second Run, where nothing runs, leaves the last result.
// The three nodes of a loop are found by their cables (the `plan` of WLoop Start Foley, the `scenes` of the H3 nodes),
// through Set/Get and Reroute. The chips mark the sockets a value of the For Loop passes through: the same number on the
// three nodes and on the For Loop. WLoop Window Foley has none, it carries no value of the loop.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { WX, wxVueInputRows, wxVueOutputRows, wxVueDecor, wxVueChip } from "./wxStyle.js";

const NODES = {
    wxFoleyLoopStart: { mid: "window", step: 0, out: { mix: 1 } },
    wxFoleyLoopWindow: { mid: "window", step: 1 },
    wxFoleyLoopEnd: { mid: "window", step: 2, in: { mix: 1 }, out: { mix: 1 } },
    h3LoopRange: { mid: "scene", step: 0, out: { start_frame: 1, start_clip: 2, start_audio: 3 } },
    h3SceneConditioning: { mid: "scene", step: 1, in: { previous_frame: 1, previous_clip: 2, previous_audio: 3 } },
    h3HandoffTail: { mid: "scene", step: 2, out: { last_frame: 1, tail_clip: 2, tail_audio: 3 }, minW: 200 },   // narrower, `v2` touches `scene_index`
};
const H = 40, YT = 31, DOT = 3.5;   // the row's height, the thread's height in it, a dot
const MANY = 30;                    // past this many rounds the arc is one line: dashes would be dust
const FONT = '11px Inter, "Segoe UI", Arial, sans-serif';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rows = new Set();    // the nodes that draw a row
export const runs = new Map();   // the group of a loop -> what its row shows
let serial = 0;            // one per Run
let active = null;         // the loop at work

// ---- which loop a node belongs to ----
/** The node at the other end of an input, through Set/Get and Reroute (they answer getInputLink, as for graphToPrompt). */
function source(node, name) {
    const i = (node.inputs || []).findIndex((s) => s.name === name);
    if (i < 0) return null;
    try {
        let link = node.getInputLink(i), n = null;
        for (let hop = 0; link && hop < 32; hop++) {
            n = node.graph?.getNodeById(link.origin_id);
            if (!n?.isVirtualNode) return n || null;
            link = n.getInputLink(link.origin_slot);
        }
    } catch (e) {}
    return null;
}
function groupOf(node) {
    const foley = NODES[node.type].mid === "window";
    const top = node.type === "wxFoleyLoopStart" ? node : source(node, foley ? "plan" : "scenes");
    return `${node.graph?.id}/${foley ? "f" : "h"}${top?.id ?? ""}`;
}
function runOf(node) {
    const key = groupOf(node);
    if (!runs.has(key)) runs.set(key, { n: 0, first: 0, done: 0, open: false, at: -1, frac: 0, state: "rest", serial: 0 });
    return runs.get(key);
}
/** The run of this node, begun if this Run has not touched it yet; how many rounds stays, a Start from the cache may not speak. */
function begun(node) {
    const r = runOf(node);
    if (r.serial !== serial) Object.assign(r, { serial, done: 0, open: false, at: -1, frac: 0, state: "run" });
    return r;
}
/** A node by the id Comfy sends: `12`, or `5:12` for a node inside a subgraph. */
function byExec(id) {
    let g = app.rootGraph ?? app.graph, n = null;
    for (const part of String(id ?? "").split(":")) { n = g?.getNodeById?.(part); g = n?.subgraph; }
    return n;
}
function repaint() {
    for (const n of rows) {
        n.setDirtyCanvas?.(true, true);
        n.__wxLoopRow?.triggerDraw?.();   // Nodes 2.0 draws the row on a small canvas of its own, only when asked
        if (LiteGraph.vueNodesMode) vueChips(n);
    }
}

// ---- what Comfy says ----
function onExecuting(id) {
    const node = byExec(id);
    if (node && NODES[node.type]) {
        const r = begun(node), step = NODES[node.type].step;
        r.at = step; r.frac = 0;
        if (step === 1) r.open = true;
        active = r;
    } else if (active?.open && active.at !== 2) active.at = 1.5;   // the body between the two: text, sampler, decode
    repaint();
}
function onProgress({ value, max }) {
    if (!active?.open || !max || active.at === 2) return;
    active.at = 1.5;
    active.frac = Math.max(active.frac, clamp(value / max, 0, 1));
    repaint();
}
function onResult(node, msg) {
    if (NODES[node.type].step === 0) {
        const r = runOf(node);
        r.n = msg.n; r.first = msg.first || 0;
    } else {
        const r = begun(node);
        if (msg.n) r.n = msg.n;
        Object.assign(r, { done: Math.max(r.done, msg.i - r.first + 1), open: false, frac: 0, at: 2 });
        if (r.n && r.done >= r.n) finish(r, "done");
        else active = r;
    }
    repaint();
}
function finish(r, state) {
    if (!r) return;
    r.state = state;
    if (state === "done") { r.at = 3; r.open = false; }
    if (active === r) active = null;
    repaint();
}
function listen() {
    api.addEventListener("execution_start", () => { serial++; active = null; });
    api.addEventListener("executing", (e) => onExecuting(e.detail));
    api.addEventListener("progress", (e) => onProgress(e.detail || {}));
    api.addEventListener("executed", (e) => {
        const msg = e.detail?.output?.wx_loop?.[0], node = msg && byExec(e.detail.display_node || e.detail.node);
        if (node && NODES[node.type]) onResult(node, msg);
    });
    api.addEventListener("execution_success", () => finish(active, "done"));
    api.addEventListener("execution_interrupted", () => finish(active, "stopped"));
    api.addEventListener("execution_error", () => finish(active, "fail"));
}

// ---- the row ----
function isDark(css) {
    const c = String(css || "#333");
    const hex = /^#([0-9a-f]{3,8})$/i.exec(c)?.[1];
    const v = hex ? (hex.length < 6 ? [...hex.slice(0, 3)].map((x) => parseInt(x + x, 16)) : [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)))
        : (c.match(/\d+/g) || [51, 51, 51]).map(Number);
    return 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2] < 140;
}
function inks(node) {
    const dark = isDark(node.bgcolor || LiteGraph.NODE_DEFAULT_BGCOLOR), vue = !!LiteGraph.vueNodesMode;
    return dark
        ? { quiet: "rgba(190,205,205,.62)", hair: "rgba(255,255,255,.2)", ink: LiteGraph.NODE_TEXT_COLOR || "#aaa", blue: WX.light, run: vue ? "#0b8ce9" : "#00ff00", stop: "#ffb454", fail: "#ff6b5e" }
        : { quiet: "rgba(30,40,40,.62)", hair: "rgba(0,0,0,.22)", ink: "#2a2a2a", blue: "#0e4f92", run: vue ? "#0b6fc2" : "#1f9d2e", stop: "#a8630a", fail: "#c7372a" };
}
function bezierLength(p) {
    let len = 0, a = p[0];
    for (let k = 1; k <= 40; k++) {
        const t = k / 40, u = 1 - t, m = [0, 1].map((i) => u * u * u * p[0][i] + 3 * u * u * t * p[1][i] + 3 * u * t * t * p[2][i] + t * t * t * p[3][i]);
        len += Math.hypot(m[0] - a[0], m[1] - a[1]);
        a = m;
    }
    return len;
}
function drawRow(node, ctx, width, y) {
    const spec = NODES[node.type], vue = !!LiteGraph.vueNodesMode, x0 = vue ? 12 : 15, c = inks(node);
    const r = runs.get(groupOf(node)), live = !!r && r.state !== "rest", running = live && r.state === "run", at = live ? r.at : -1;
    const names = ["start", spec.mid, "end"];
    ctx.save();
    ctx.translate(x0, y);
    ctx.font = FONT; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.lineCap = "butt"; ctx.setLineDash([]);
    const lw = names.map((n) => ctx.measureText(n).width);
    const gap = clamp((width - 2 * x0 - lw[0] - lw[1] - lw[2] - 36) / 2, 12, 34);
    const xs = [], ends = [];
    let x = 0;
    names.forEach((_, i) => { xs.push(x + 4); ends.push(x + 12 + lw[i]); x += 12 + lw[i] + gap; });

    // the way back: one dash per round, the rounds done filled in
    const [, xw, xe] = xs, curve = [[xe, YT - 7], [xe, YT - 37], [xw, YT - 37], [xw, YT - 7.5]];
    const arc = () => { ctx.beginPath(); ctx.moveTo(...curve[0]); ctx.bezierCurveTo(...curve[1], ...curve[2], ...curve[3]); ctx.stroke(); };
    const N = live ? r.n : 0, thin = N > MANY, unit = bezierLength(curve) / (N || 1), sg = N && !thin ? 0.84 : 1, gp = 1 - sg;
    ctx.strokeStyle = c.hair; ctx.lineWidth = 1.6;
    ctx.setLineDash(N && !thin ? [sg * unit, gp * unit] : []);
    arc();
    const fill = !N ? 0 : r.state === "done" ? r.done : r.done + (at === 1.5 ? r.frac : at === 2 && r.open ? 0.98 : 0);
    if (fill > 0) {
        const whole = Math.floor(fill), dash = [];
        for (let i = 0; i < whole; i++) dash.push(sg * unit, gp * unit);
        dash.push((fill - whole) * sg * unit, (N + 1) * unit);
        ctx.strokeStyle = c.blue; ctx.lineWidth = 2; ctx.setLineDash(dash);
        arc();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = c.quiet; ctx.lineWidth = 1.1; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(xw - 2.8, YT - 10.5); ctx.lineTo(xw, YT - 7.2); ctx.lineTo(xw + 2.8, YT - 10.5); ctx.stroke();
    ctx.lineCap = "butt";
    if (N) {
        const round = r.state === "done" ? r.done : clamp(r.done + (r.open ? 1 : 0), 0, N);
        ctx.font = `600 ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = r.state === "stopped" ? c.stop : c.ink;
        ctx.fillText(`${round}/${N}`, (xw + xe) / 2, YT - 13);
        ctx.font = FONT; ctx.textAlign = "left";
    }

    // the three steps on their thread
    names.forEach((n, i) => {
        const mine = i === spec.step, here = live && at === i, was = live && (r.state === "done" || at > i);
        const halted = live && r.state === "stopped" && (here || (at === 1.5 && i === 1));
        const failed = live && r.state === "fail" && (here || (at === 1.5 && i === 1));
        const on = running && here;
        ctx.beginPath(); ctx.arc(xs[i], YT, DOT, 0, Math.PI * 2);
        const fillDot = failed ? c.fail : on ? c.run : halted ? null : mine ? c.blue : was ? c.quiet : null;
        if (fillDot) { ctx.fillStyle = fillDot; ctx.fill(); }
        ctx.strokeStyle = failed ? c.fail : on ? c.run : halted ? c.stop : mine ? c.blue : c.quiet;
        ctx.lineWidth = halted ? 1.8 : 1.3;
        ctx.stroke();
        ctx.fillStyle = mine ? c.blue : c.quiet;
        ctx.fillText(n, xs[i] + 8, YT + 4);
        if (i < 2) {
            const glow = running && i === 1 && at === 1.5;
            ctx.strokeStyle = glow ? c.run : c.hair; ctx.lineWidth = glow ? 1.6 : 1;
            ctx.beginPath(); ctx.moveTo(ends[i] + 4, YT); ctx.lineTo(xs[i + 1] - 7, YT); ctx.stroke();
        }
    });
    ctx.restore();
}
function addRow(node) {
    const spec = NODES[node.type], names = ["start", spec.mid, "end"];
    const w = node.addWidget("wxlooprow", "loop", null, () => {}, { serialize: false });
    w.serialize = false;   // it reads the Run: no slot of its own in widgets_values
    w.draw = (ctx, n, width, y) => drawRow(n, ctx, width, y);
    w.computeSize = (width) => [width, H];
    w.tooltip = `The loop: start once, then ${spec.mid} and end once per ${spec.mid}. This node: ${names[spec.step]}.`;
    node.__wxLoopRow = w;
}

// ---- the chips ----
const isHot = (node) => !!active && runs.get(groupOf(node)) === active && active.at === NODES[node.type].step;
function drawChips(node, ctx) {
    const spec = NODES[node.type], hot = isHot(node);
    ctx.save();
    ctx.textBaseline = "middle"; ctx.textAlign = "center"; ctx.lineWidth = 1;
    const chip = (side, list, isIn) => {
        for (const [name, v] of Object.entries(side || {})) {
            const i = (list || []).findIndex((s) => s.name === name);
            if (i < 0) continue;
            const p = node.getConnectionPos(isIn, i), label = list[i].label || list[i].localized_name || name;
            ctx.font = `${LiteGraph.NODE_SUBTEXT_SIZE || 12}px Arial`;
            const lw = ctx.measureText(label).width;
            ctx.font = '10.5px Inter, "Segoe UI", Arial, sans-serif';
            const t = "v" + v, cw = ctx.measureText(t).width + 8, gap = 16;
            const x = isIn ? p[0] - node.pos[0] + gap + lw : p[0] - node.pos[0] - gap - lw - cw, y = p[1] - node.pos[1];
            ctx.beginPath(); ctx.roundRect(x, y - 7, cw, 14, 7);
            ctx.fillStyle = hot ? WX.accent : "rgba(0,80,159,.45)"; ctx.fill();
            ctx.strokeStyle = WX.accent; ctx.stroke();
            ctx.fillStyle = hot ? "#fff" : WX.light;
            ctx.fillText(t, x + cw / 2, y + 0.5);
        }
    };
    chip(spec.in, node.inputs, true);
    chip(spec.out, node.outputs, false);
    ctx.restore();
}
function vueChips(node) {
    const spec = NODES[node.type], hot = isHot(node);
    const put = (rows, side, list) => {
        for (const r of rows || []) {
            const v = side?.[list[r.idx]?.name];
            if (!v) continue;
            const c = wxVueChip(r.el, "wx-loop-v", () => {});
            c.textContent = "v" + v; c.title = `For Loop value${v}`;
            c.classList.toggle("hot", hot);
            if (list === node.outputs && r.el.firstChild !== c) r.el.prepend(c);   // an output's label is on the right: the chip goes before it
        }
    };
    put(wxVueInputRows(node), spec.in, node.inputs || []);
    put(wxVueOutputRows(node), spec.out, node.outputs || []);
}
function ensureStyle() {
    if (document.getElementById("wx-loop-style")) return;
    const st = document.createElement("style"); st.id = "wx-loop-style";
    st.textContent = `
      .wx-loop-v { display: inline-flex; align-items: center; height: 14px; margin: 0 6px; padding: 0 4px; border-radius: 4px; flex-shrink: 0; user-select: none;
        font: 10.5px Inter, "Segoe UI", Arial, sans-serif; font-variant-numeric: tabular-nums; color: ${WX.light}; background: rgba(0,80,159,.45); box-shadow: inset 0 0 0 1px ${WX.accent}; }
      .wx-loop-v.hot { background: ${WX.accent}; color: #fff; }`;
    document.head.appendChild(st);
}

app.registerExtension({
    name: "WextraUI.loopRow",
    setup: listen,
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!NODES[nodeData.name]) return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            ensureStyle();
            addRow(this);
            rows.add(this);
            wxVueDecor(this, () => vueChips(this));
            return r;
        };
        // a node saved before the row: the file's size has no room for it
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = onConfigure?.apply(this, arguments);
            setTimeout(() => {
                const h = Math.max(this.size[1], this.computeSize()[1]), w = Math.max(this.size[0], NODES[nodeData.name].minW || 0);
                if (this.graph && (h > this.size[1] || w > this.size[0])) this.setSize([w, h]);
            }, 0);
            return r;
        };
        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () { rows.delete(this); return onRemoved?.apply(this, arguments); };
        const onDraw = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            const r = onDraw?.apply(this, arguments);
            if (!this.flags?.collapsed) drawChips(this, ctx);
            return r;
        };
    },
});
