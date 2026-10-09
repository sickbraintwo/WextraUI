// WextraUI — `carry`: the odometer cable between the nodes that walk (WSampler, WScheduler, WCheckpoint,
// WLoRA, WFloat, WInt🌱, WSwitch). A node on `increment-wrap` turns by itself; each time it comes back from the
// last name to the first it sends one beat down its `carry` output, and the node at the other end of the cable moves
// one step of its own (the next name of its menu; for WFloat / WInt🌱, `value` + `step`). Chain as many as you like:
// scheduler → sampler → checkpoint = every checkpoint × every sampler × every scheduler. The backend is not in it: the
// cable passes a string, the beats happen in the interface between one queued run and the next, where the walk already lives.
//
// A node with a cable in its `carry` input is driven: it does not move by itself any more, it moves on the beat, and
// its control says how — `fixed` / `increment` / `increment-wrap` one step forward, `decrement` one step back,
// `randomize` a random name (both ends of a menu wrap, so the beat goes on down the chain). The label of the input
// counts the runs: `carry · 3 × 4 = 12 runs` (the sizes along the chain, multiplied) = what to put in the queue.
// The cable may pass through Set / Get (KJNodes) and Reroute: the beat and the count follow it to the real node.
//
// Two chips on the row of the `carry` output (Sick, 09/10), on every node that walks, alone or in a chain:
// `⟲` puts every wheel of the chain back to its first place (a grid interrupted half way, or a new one from the
// start: nothing to set by hand); `▶ 12` does the same and then queues the runs of the whole grid, 12 = the sizes of
// the chain multiplied (a node alone: its own size — the seeds picked, the wheel to `until`, the folder or the
// selection, the slots in use). No number when a size is unknown (a free walk by step): then only `⟲`.
import { app } from "../../scripts/app.js";
import { WX, wxVueOutputRows, wxVueDecor, wxVueChip } from "./wxStyle.js";

const NAME = "carry";
const MAX_HOPS = 12;
const CHIP = { h: 16, pad: 6, gap: 4 };
const ruler = document.createElement("canvas").getContext("2d");
const isCtl = (w) => Array.isArray(w?.options?.values) && w.options.values.includes("randomize");

/** Wires `carry` on `node`. control(): the control-after-generate widget (looked up lazily); at(): where the walk is
 *  now (an index, or null when the node cannot come round); size(): the length of the walk, or null; move(dir): one
 *  step, "+" / "-" / "rand", returns true when the walk came round (last → first, or first → last); first(): the walk
 *  back to its first place (the chips `⟲` / `▶`; none = the node cannot be rewound); labelControl: false when the
 *  node writes the label of its control itself (WFloat). Returns { driven, linked }. */
export function wxCarry(node, { control, at, size, move, first = null, labelControl = true }) {
    const g = () => node.graph;
    const nodesOf = () => { const gr = g(); return (gr?._nodes || gr?.nodes || []); };
    const linkOf = (id) => { const gr = g(); if (!gr || id == null) return null; return gr.links instanceof Map ? gr.links.get(id) : gr.getLink ? gr.getLink(id) : gr.links?.[id]; };
    const nodeOf = (id) => (id == null ? null : g()?.getNodeById(id));
    const outSlot = () => (node.outputs || []).find((o) => o.name === NAME);
    const inSlot = () => (node.inputs || []).find((i) => i.name === NAME);
    // ---- through Set / Get and Reroute, to the real nodes at the two ends of the cable ----
    const constOf = (n) => n?.widgets?.[0]?.value ?? n?.widgets_values?.[0];
    const getters = (setNode) => { const c = constOf(setNode); return c ? nodesOf().filter((n) => n.type === "GetNode" && constOf(n) === c) : []; };
    const setter = (getNode) => { const c = constOf(getNode); return c ? nodesOf().find((n) => n.type === "SetNode" && constOf(n) === c) : null; };
    const down = (t, hops) => {   // the walking nodes reached from a link's target
        if (!t || hops > MAX_HOPS) return [];
        if (t.__wxCarry) return t === node ? [] : [t];
        const follow = (links) => (links || []).flatMap((id) => down(nodeOf(linkOf(id)?.target_id), hops + 1));
        if (t.type === "Reroute") return follow(t.outputs?.[0]?.links);
        if (t.type === "SetNode") return getters(t).flatMap((gt) => follow(gt.outputs?.[0]?.links));
        return [];
    };
    const up = (o, hops) => {   // the walking node behind a link's origin
        if (!o || hops > MAX_HOPS) return null;
        if (o.__wxCarry) return o === node ? null : o;
        if (o.type === "Reroute") return up(nodeOf(linkOf(o.inputs?.[0]?.link)?.origin_id), hops + 1);
        if (o.type === "GetNode") { const s = setter(o); return s ? up(nodeOf(linkOf(s.inputs?.[0]?.link)?.origin_id), hops + 1) : null; }
        return null;
    };
    const downstream = () => { const seen = new Set(); return (outSlot()?.links || []).flatMap((id) => down(nodeOf(linkOf(id)?.target_id), 0)).filter((n) => !seen.has(n) && seen.add(n)); };
    const upstream = () => up(nodeOf(linkOf(inSlot()?.link)?.origin_id), 0);
    const driven = () => !!upstream();
    const linked = () => driven() || (outSlot()?.links || []).length > 0;   // a cable in or out: the wheel of WFloat / WInt🌱 is on
    const walking = () => { const c = control()?.value; return !!c && c !== "fixed"; };   // moves by itself after every run
    const dirOf = (c) => (c === "decrement" ? "-" : c === "randomize" ? "rand" : "+");
    const beatDown = () => { for (const d of downstream()) d.__wxCarry.beat(); };
    let depth = 0;   // a cable that comes back on itself: the beat stops here
    const beat = () => {
        if (depth > 0) return;
        depth++;
        try { if (move(dirOf(control()?.value))) beatDown(); } finally { depth--; }
        node.setDirtyCanvas(true, true);
    };
    // the runs of the chain up to and including this node: the sizes multiplied, null as soon as one is unknown
    const total = () => { const s = size(); if (s == null) return null; const u = upstream(); if (!u) return s; const t = u.__wxCarry.total(); return t == null ? null : t * s; };
    // ---- the whole chain this node is in (up to the fastest, down to the slowest), its grid, and the two chips ----
    const chain = () => {
        const seen = new Set([node]);
        const walk = (n) => { const c = n.__wxCarry; if (!c) return; for (const m of [c.upstream(), ...c.downstream()]) if (m && !seen.has(m)) { seen.add(m); walk(m); } };
        walk(node);
        return [...seen];
    };
    const grid = () => {   // nodes; total = the runs of the grid (null when a size is unknown); walks = every wheel moves; any = at least one does
        const nodes = chain();
        const moves = (n) => n.__wxCarry.driven() || n.__wxCarry.walking();
        let total = 1;
        for (const n of nodes) { const s = n.__wxCarry.size(); if (s == null) { total = null; break; } total *= s; }
        return { nodes, total, walks: nodes.every(moves), any: nodes.some(moves) && nodes.some((n) => n.__wxCarry.first) };
    };
    const rewind = () => { for (const n of chain()) n.__wxCarry.first?.(); node.graph?.setDirtyCanvas(true, true); };
    // the batch box next to Run takes the number too (Sick, 09/10): the next Run queues the grid again, with nothing to
    // type. The box lives in the frontend's queue settings; its own limit (a setting, 100 by default) is kept.
    const batchBox = (n) => {
        try {
            const m = app.extensionManager, qs = m?.queueSettings;
            if (!qs || !("batchCount" in qs)) return;
            const lim = Number(m.setting?.get?.("Comfy.QueueButton.BatchCountLimit")) || 100;
            qs.batchCount = Math.max(1, Math.min(n, lim));
        } catch (e) { /* a frontend with no such box: the queue is enough */ }
    };
    const go = () => { rewind(); const t = grid().total; if (t) { app.queuePrompt(0, t); batchBox(t); } };
    node.__wxCarry = { beat, total, size, driven, linked, downstream, upstream, walking, first, chain, grid, rewind, go };
    // the chips, on the row of the `carry` output, left of its label: `▶ n` (the grid from the start) and `⟲` (back to the start)
    const chips = (ctx) => {
        if (node.flags?.collapsed) return null;
        const idx = (node.outputs || []).findIndex((o) => o.name === NAME);
        if (idx < 0) return null;
        const gr = grid();
        if (!gr.any) return null;
        const p = node.getConnectionPos(false, idx), o = node.outputs[idx];
        const y = p[1] - node.pos[1] - CHIP.h / 2;
        ctx.font = "14px Arial";
        let right = node.size[0] - 10 - ctx.measureText(o.label || o.name).width - 8;
        ctx.font = "11px sans-serif";
        const out = [];
        if (gr.total != null && gr.walks) {
            const t = "▶ " + gr.total, w = Math.ceil(ctx.measureText(t).width) + 2 * CHIP.pad;
            out.push({ k: "go", t, x: right - w, y, w, h: CHIP.h }); right -= w + CHIP.gap;
        }
        const w = CHIP.h + 6;
        out.push({ k: "rewind", t: "⟲", x: right - w, y, w, h: CHIP.h });
        return out;
    };
    const origDraw = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
        const rr = origDraw?.apply(this, arguments);
        const cs = chips(ctx);
        if (!cs) return rr;
        ctx.save();
        ctx.font = "11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 1;
        for (const c of cs) {
            ctx.beginPath(); ctx.roundRect(c.x, c.y, c.w, c.h, c.h / 2);
            ctx.fillStyle = c.k === "go" ? WX.deep : "#2b2b2b"; ctx.fill();
            ctx.strokeStyle = WX.accent; ctx.stroke();
            ctx.fillStyle = c.k === "go" ? WX.light : "#ccc";
            ctx.fillText(c.t, c.x + c.w / 2, c.y + c.h / 2 + 0.5);
        }
        ctx.restore();
        return rr;
    };
    const origDown = node.onMouseDown;
    node.onMouseDown = function (e, pos) {
        const cs = chips(ruler);
        if (cs && pos) for (const c of cs) {
            if (pos[0] >= c.x && pos[0] <= c.x + c.w && pos[1] >= c.y && pos[1] <= c.y + c.h) { if (c.k === "go") go(); else rewind(); return true; }
        }
        return origDown?.apply(this, arguments);
    };
    // Nodes 2.0 paints nothing of onDrawForeground: the two chips as HTML, in the row of the `carry` output
    wxVueDecor(node, () => {
        const rows = wxVueOutputRows(node); if (!rows) return;
        const idx = (node.outputs || []).findIndex((o) => o.name === NAME);
        const row = rows.find((r) => r.idx === idx)?.el; if (!row) return;
        const gr = grid();
        const rew = wxVueChip(row, "wx-carry-rew", rewind); rew.classList.add("wx-vue-chip"); rew.textContent = "⟲"; rew.title = "Every wheel of the chain back to its first place";
        rew.style.display = gr.any ? "" : "none";
        const run = wxVueChip(row, "wx-carry-go", go); run.classList.add("wx-vue-chip"); run.style.width = "auto"; run.style.padding = "0 5px";
        const show = gr.any && gr.total != null && gr.walks;
        run.style.display = show ? "" : "none";
        if (show) { run.textContent = "▶ " + gr.total; run.title = "The grid from the start: every wheel back to its first place, then " + gr.total + " runs in the queue (and " + gr.total + " in the batch box next to Run)"; }
    });
    // the node's own control moves the name after (or before) every queued run: wrapped so that coming round sends a
    // beat, and so that a driven node keeps still and waits for the beat
    const cameRound = (c, before, after) => before != null && after != null && before !== after &&
        ((c === "increment" || c === "increment-wrap") ? after < before : c === "decrement" ? after > before : false);
    const hook = () => {
        const c = control();
        if (!c || c.__wxCarryHooked) return;
        c.__wxCarryHooked = true;
        c.__wxLabel0 = c.label;
        for (const k of ["beforeQueued", "afterQueued"]) {
            const orig = c[k];
            if (typeof orig !== "function") continue;
            c[k] = function () {
                if (driven()) return undefined;
                const before = at(), r = orig.apply(this, arguments);
                if (cameRound(c.value, before, at())) beatDown();
                return r;
            };
        }
    };
    const relabel = () => {
        hook();
        const c = control(), i = inSlot(), d = driven();
        if (c && labelControl) c.label = d ? "on carry" + (c.value && c.value !== "fixed" ? " · " + c.value : "") : c.__wxLabel0;
        if (i) {
            let lab = NAME;
            if (d) {
                const u = upstream().__wxCarry.total(), s = size();
                if (u != null && s != null) lab = `${NAME} · ${u} × ${s} = ${u * s} runs`;
                else if (u != null) lab = `${NAME} · a step every ${u} runs`;
            }
            if (i.label !== lab) { i.label = lab; node.setDirtyCanvas(true, false); }
        }
    };
    relabel();
    const tick = setInterval(relabel, 500);
    const onRemoved = node.onRemoved;
    node.onRemoved = function () { clearInterval(tick); return onRemoved?.apply(this, arguments); };
    const onConf = node.onConfigure;
    node.onConfigure = function () { const r = onConf?.apply(this, arguments); setTimeout(relabel, 0); return r; };
    return { driven, linked };
}

/** `carry` for a node whose walk is a menu (wName): at / size / move on the menu the widget shows now (narrowed by
 *  `folder` or `selection` when there is one), the control found among the widgets the frontend linked to the name. */
export function wxCarryMenu(node, wName, exclude = []) {
    const vals = () => wName.options?.values || [];
    const control = () => (wName.linkedWidgets || []).find(isCtl) || (node.widgets || []).find((w) => w !== wName && !exclude.includes(w) && isCtl(w));
    const at = () => { const i = vals().indexOf(wName.value); return i < 0 ? null : i; };
    const size = () => vals().length || null;
    const set = (v) => { if (v !== undefined && v !== wName.value) { wName.value = v; wName.callback?.(v); } };
    const move = (dir) => {
        const v = vals(), n = v.length;
        if (!n) return false;
        const i = v.indexOf(wName.value);
        const next = dir === "-" ? (i <= 0 ? n - 1 : i - 1) : dir === "rand" ? Math.floor(Math.random() * n) : (i + 1) % n;
        set(v[next]);
        return n > 1 && i >= 0 && (dir === "+" ? next === 0 : dir === "-" ? next === n - 1 : false);
    };
    const first = () => set(vals()[0]);
    return wxCarry(node, { control, at, size, move, first });
}
