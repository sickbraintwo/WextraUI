// WextraUI — WFrame: a stack of actions (crop · pad · resize) under the node, in the order you put them. Each one is a
// coloured rectangle in the preview, the same colour as its row: click a rectangle (or its row) to open its settings,
// drag it to move it, pull a corner or a side to size it. The final frame is red. The `ops` box holds the stack as JSON.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureWxStyle, wxHideWidget, wxCompactWidgets, wxOnRedraw } from "./wxStyle.js";

const RED = "#e85050", MASK = "#ff2bd6";   // the final frame; the pad mask in the `mask` view (fuchsia on black)
const PALETTE = ["#5aaaff", "#ffb347", "#7ed957", "#d98cff", "#4dd9d9", "#ffe14d", "#ff8ac2", "#c0c0c0"];
const ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"];
const ANCHORS = ["center", "top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"];
const RESIZE_MODES = ["width", "height", "long side", "short side", "scale %", "fit in box", "cover box"];
const MAX_OPS = 8, PREVIEW_H = 230, MIN_BOX = 8;

// ---- the geometry: the same actions as src/frame.py, with the same rounding, so the preview says what the run does
const rnd = (x) => { const f = Math.floor(x), d = x - f; return d < 0.5 ? f : d > 0.5 ? f + 1 : (f % 2 === 0 ? f : f + 1); };   // Python's round: half to even
const anchorAt = (a, rx, ry) => { a = String(a || "center"); return [a.includes("left") ? 0 : a.includes("right") ? rx : Math.floor(rx / 2), a.includes("top") ? 0 : a.includes("bottom") ? ry : Math.floor(ry / 2)]; };
const ratio = (s) => { const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(s || "")); const r = m ? Number(m[1]) / Number(m[2]) : 0; return r > 0 ? r : 0; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : d; };

function boxOf(W, H, w, h, r, grow) {   // src/frame.py _box
    const rr = ratio(r);
    if (rr && !w && !h) {
        if (grow) [w, h] = W / H >= rr ? [W, rnd(W / rr)] : [rnd(H * rr), H];
        else [w, h] = W / H <= rr ? [W, rnd(W / rr)] : [rnd(H * rr), H];
    } else if (rr && !w) w = rnd(h * rr);
    else if (rr && !h) h = rnd(w / rr);
    w = w || W; h = h || H;
    if (!grow) { w = Math.min(W, w); h = Math.min(H, h); }
    return [Math.max(1, w), Math.max(1, h)];
}
function resizeSize(W, H, op) {   // src/frame.py resize_size
    const mode = String(op.mode || "width"), v = num(op.v), bw = num(op.w) || W, bh = num(op.h) || H;
    let s = 1;
    if (mode === "width") s = v / W; else if (mode === "height") s = v / H;
    else if (mode === "long side") s = v / Math.max(W, H); else if (mode === "short side") s = v / Math.min(W, H);
    else if (mode === "scale %") s = v / 100; else if (mode === "fit in box") s = Math.min(bw / W, bh / H);
    else if (mode === "cover box") s = Math.max(bw / W, bh / H);
    if (!(s > 0)) return [W, H];
    let rw = Math.max(1, rnd(W * s)), rh = Math.max(1, rnd(H * s));
    if (mode === "fit in box") { rw = Math.min(rw, bw); rh = Math.min(rh, bh); }
    if (mode === "cover box") { rw = Math.max(rw, bw); rh = Math.max(rh, bh); }
    return [rw, rh];
}
const inter = (a, b) => { const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h); return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) }; };

/** The stack on a W x H picture. Every action gets: the picture it finds (inW x inH, its origin ox / oy and its pixels
 *  per source pixel sx / sy, all in the source picture's space), its box in that picture's pixels (the crop; the pad
 *  canvas with the picture's top-left at -x / -y), its canvas = its output in source space, and the step text.
 *  vis[i] = the part of action i's output that reaches the end (cut by every canvas after it); vis0 = the same for the
 *  source picture itself. */
function chain(W, H, ops) {
    let ox = 0, oy = 0, sx = 1, sy = 1, w = W, h = H;
    const items = [];
    for (const op of ops) {
        const it = { op, inW: w, inH: h, ox, oy, sx, sy, step: "", changed: false };
        if (op.t === "crop") {
            const [cw, ch] = boxOf(w, h, num(op.w), num(op.h), op.r, false);
            const [ax, ay] = anchorAt(op.a, w - cw, h - ch);
            const x = clamp(ax + num(op.dx), 0, w - cw), y = clamp(ay + num(op.dy), 0, h - ch);
            it.box = { x, y, w: cw, h: ch }; it.changed = cw !== w || ch !== h;
            ox += x / sx; oy += y / sy; w = cw; h = ch;
            it.step = `crop ${cw}×${ch}`;
        } else if (op.t === "pad") {
            const [fw, fh] = boxOf(w, h, num(op.w), num(op.h), op.r, true);
            const [ax, ay] = anchorAt(op.a, fw - w, fh - h);
            const px = ax + num(op.dx), py = ay + num(op.dy);
            it.box = { x: -px, y: -py, w: fw, h: fh };
            it.sides = [clamp(px, 0, fw), clamp(py, 0, fh), clamp(fw - px - w, 0, fw), clamp(fh - py - h, 0, fh)];   // border added: l, t, r, b
            it.cut = [clamp(-px, 0, w), clamp(-py, 0, h), clamp(px + w - fw, 0, w), clamp(py + h - fh, 0, h)];       // picture cut: l, t, r, b
            it.signed = [px, py, fw - px - w, fh - py - h];                                                           // + = border, − = cut
            it.changed = fw !== w || fh !== h || px !== 0 || py !== 0;
            ox -= px / sx; oy -= py / sy; w = fw; h = fh;
            const S = it.sides, C = it.cut, parts = [];
            if (S.some(Boolean)) parts.push(`pad ${S.join("·")}`);
            if (C.some(Boolean)) parts.push(`cut ${C[0] + C[2]}×${C[1] + C[3]}`);
            it.step = parts.join(" ") || `pad ${fw}×${fh}`;
        } else {
            const [rw, rh] = resizeSize(w, h, op);
            it.box = { x: 0, y: 0, w, h }; it.changed = rw !== w || rh !== h;
            sx *= rw / w; sy *= rh / h; w = rw; h = rh;
            it.step = `resize ${rw}×${rh}`;
        }
        it.outW = w; it.outH = h;
        it.canvas = { x: ox, y: oy, w: w / sx, h: h / sy };
        items.push(it);
    }
    const final = items.length ? items[items.length - 1].canvas : { x: 0, y: 0, w: W, h: H };
    const vis = new Array(items.length);
    let acc = final;
    for (let i = items.length - 1; i >= 0; i--) { acc = inter(acc, items[i].canvas); vis[i] = acc; }
    return { W, H, fw: w, fh: h, items, vis, vis0: inter(acc, { x: 0, y: 0, w: W, h: H }), final };
}

// ---- the actions: new ones, a saved one made whole, the box of a dragged one written back as anchor + shift
const newOp = (t, inW, inH) => {
    if (t === "crop") { const s = inW && inH ? Math.min(inW, inH) : 0; return { t: "crop", w: s, h: s, r: "", a: "center", dx: 0, dy: 0 }; }
    if (t === "pad") { const s = inW && inH ? Math.max(inW, inH) : 1024; return { t: "pad", w: s, h: s, r: "", a: "center", dx: 0, dy: 0, color: "#000000", feather: 0, fill: "colour" }; }
    return { t: "resize", mode: "width", v: 1024, w: 1024, h: 1024 };
};
const normColor = (v) => { let c = String(v || "").trim().replace(/^#/, ""); if (c.length === 3) c = c.split("").map((x) => x + x).join(""); return /^[0-9a-f]{6}$/i.test(c) ? "#" + c.toLowerCase() : "#000000"; };
function normOp(o) {
    if (!o || typeof o !== "object") return null;
    const t = o.t === "crop" || o.t === "pad" || o.t === "resize" ? o.t : null;
    if (!t) return null;
    const d = newOp(t, 0, 0), op = { t };
    if (t === "pad") d.w = d.h = 0;   // a side missing from a hand-written action = keep it, not 1024
    for (const k of Object.keys(d)) {
        if (k === "t") continue;
        const v = o[k];
        if (k === "a") op.a = ANCHORS.includes(v) ? v : "center";
        else if (k === "r") op.r = ASPECTS.includes(v) ? v : "";
        else if (k === "mode") op.mode = RESIZE_MODES.includes(v) ? v : "width";
        else if (k === "color") op.color = normColor(v);
        else if (k === "fill") op.fill = v === "edge" ? "edge" : "colour";   // the added area: the colour, or the picture's border carried on
        else op[k] = num(v, d[k]);
    }
    return op;
}
/** Writes the box (in the action's input pixels) back into the action: size, and the shift from its anchor. */
function setBox(op, inW, inH, b) {
    const w = Math.max(1, Math.round(b.w)), h = Math.max(1, Math.round(b.h)), x = Math.round(b.x), y = Math.round(b.y);
    op.w = w; op.h = h;
    if (op.t === "crop") { const [ax, ay] = anchorAt(op.a, inW - w, inH - h); op.dx = x - ax; op.dy = y - ay; }
    else { const [ax, ay] = anchorAt(op.a, w - inW, h - inH); op.dx = -x - ax; op.dy = -y - ay; }
}

/** The workflow of a WFrame saved before the stack (0.6.x: new size · crop · resize · place as fixed boxes), as a stack. */
function legacyOps(info) {
    const nm = info?.widgets_values_named, wv = info?.widgets_values;
    let v = null;
    if (nm && typeof nm === "object" && nm.new_width !== undefined) v = nm;
    else if (Array.isArray(wv) && wv.length >= 14 && typeof wv[2] === "string" && !String(wv[0]).startsWith("[")) {
        const holed = wv.length > 14 && typeof wv[13] === "string";   // 0.3.5 files: the colour pad took a slot after pad_color
        v = { new_width: wv[0], new_height: wv[1], crop_to: wv[2], crop_width: wv[3], crop_height: wv[4], crop_anchor: wv[5], resize_to: wv[6],
              resize_value: wv[7], method: wv[8], pad_anchor: wv[9], offset_x: wv[10], offset_y: wv[11], pad_color: wv[12], feathering: wv[holed ? 14 : 13] };
    }
    if (!v) return null;
    const ops = [], nw = num(v.new_width), nh = num(v.new_height), crop = String(v.crop_to || "none"), rs = String(v.resize_to || "none");
    if (crop === "custom") ops.push({ t: "crop", w: num(v.crop_width), h: num(v.crop_height), r: "", a: v.crop_anchor, dx: 0, dy: 0 });
    else if (crop !== "none") ops.push({ t: "crop", w: 0, h: 0, r: crop, a: v.crop_anchor, dx: 0, dy: 0 });
    if (rs === "fit new size") ops.push({ t: "resize", mode: "fit in box", v: 0, w: nw, h: nh });
    else if (rs === "cover new size") ops.push({ t: "resize", mode: "cover box", v: 0, w: nw, h: nh });
    else if (rs === "long side") ops.push({ t: "resize", mode: "long side", v: Math.max(nw, nh), w: 0, h: 0 });
    else if (rs === "short side") ops.push({ t: "resize", mode: "short side", v: Math.min(nw || nh, nh || nw), w: 0, h: 0 });
    else if (rs !== "none") ops.push({ t: "resize", mode: rs, v: num(v.resize_value), w: 0, h: 0 });
    ops.push({ t: "pad", w: nw, h: nh, r: "", a: v.pad_anchor, dx: num(v.offset_x), dy: num(v.offset_y), color: v.pad_color, feather: num(v.feathering) });
    return { ops: ops.map(normOp).filter(Boolean), method: v.method };
}

/** The picture that feeds the node, read from the graph: the first node up the IMAGE cable that shows one (a Load Image,
 *  a node with a preview after a run). Null when none shows a picture. */
export function upstreamPicture(node) {   // WReso (wxReso.js) reads the picture the same way
    let n = node, guard = 8;
    while (n && n.graph && guard--) {
        const s = (n.inputs || []).find((i) => i.type === "IMAGE" && i.link != null);
        if (!s) return null;
        const L = n.graph.links;
        const link = L instanceof Map ? L.get(s.link) : (n.graph.getLink ? n.graph.getLink(s.link) : L?.[s.link]);
        if (!link) return null;
        n = n.graph.getNodeById(link.origin_id);
        const im = n?.imgs?.[n.imageIndex || 0];
        if (im && im.naturalWidth) return { w: im.naturalWidth, h: im.naturalHeight, img: im, from: "graph" };
    }
    return null;
}

const stop = (el) => { for (const t of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "keydown", "keyup", "wheel"]) el.addEventListener(t, (e) => e.stopPropagation()); };
const INPUT_CSS = "background:#222;border:1px solid #444;color:#ddd;border-radius:4px;padding:1px 4px;font:11px sans-serif;min-width:0;width:100%";
const PIPETTE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l1-4 9-9 3 3-9 9-4 1z"/><path d="M13 8l3-3a2.1 2.1 0 0 1 3 3l-3 3"/></svg>';
const hex2 = (n) => n.toString(16).padStart(2, "0");

app.registerExtension({
    name: "WextraUI.frame",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxFrame") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            ensureWxStyle();
            const W = (n) => node.widgets.find((w) => w.name === n);
            const wOps = W("ops"), wMethod = W("method");
            if (wOps) wxHideWidget(wOps, node);   // the stack's JSON: kept in the file, not shown

            // ---- the state: the stack, read from / written to the ops box ----------------------------------------
            let ops = [], lastJSON = null, sel = -1;
            const read = () => {
                let lst = [];
                try { lst = JSON.parse(String(wOps?.value ?? "[]")); } catch (e) { lst = []; }
                ops = (Array.isArray(lst) ? lst : []).map(normOp).filter(Boolean).slice(0, MAX_OPS);
                lastJSON = wOps ? wOps.value : null;
                if (sel >= ops.length) sel = ops.length - 1;
            };
            const commit = () => { const j = JSON.stringify(ops); if (wOps) wOps.value = j; lastJSON = j; node.setDirtyCanvas(true, true); };
            read();
            if (ops.length) sel = 0;

            // ---- the picture: the last run's (its true input, a small copy from the temp folder) while the cable is the
            //      same one, else what the graph shows up the cable
            const curLink = () => (node.inputs || []).find((i) => i.name === "image")?.link ?? null;
            const source = () => {
                const run = node._wxRun, up = upstreamPicture(node);
                if (run && run.link === curLink()) return run;
                return up || run || null;
            };
            const onExec = node.onExecuted;
            node.onExecuted = function (msg) {
                const rr = onExec?.apply(this, arguments);
                const m = msg?.wx_frame?.[0];
                if (m && m.w && m.h) {
                    const src = { w: Number(m.w), h: Number(m.h), img: null, from: "run", link: curLink() };
                    if (m.thumb?.filename) {
                        const im = new Image();
                        im.onload = () => { src.img = im; node._wxPrevSig = null; node.setDirtyCanvas(true, true); };
                        im.src = api.apiURL(`/view?filename=${encodeURIComponent(m.thumb.filename)}&type=${encodeURIComponent(m.thumb.type || "temp")}&subfolder=${encodeURIComponent(m.thumb.subfolder || "")}&rand=${Math.random()}`);
                    }
                    node._wxRun = src;
                    node._wxPrevSig = null;
                }
                return rr;
            };
            const geo = () => { const s = source(); return s ? chain(s.w, s.h, ops) : null; };
            // the info text as the run writes it for WSave Image (src/frame.py: c800x1000_p100x0 — c = crop, p = pad, r = resize,
            // a leading − = cut); with no picture, the stack's numbers (frame_text there). Read for a part bound with {#id}
            // and for the line above the stack.
            const padText = ([l, t, r, b]) => (l === t && t === r && r === b) ? `p${l}` : (l === r && t === b) ? `p${l}x${t}` : `p${l}-${t}-${r}-${b}`;
            const infoText = () => {
                const g = geo();
                if (!g) return ops.map((op) => {
                    const w = num(op.w), h = num(op.h), r = String(op.r || "").replace(":", "-");
                    if (op.t === "resize") return String(op.mode).includes("box") ? `r${w}x${h}` : String(op.mode) === "scale %" ? `r${num(op.v)}pct` : `r${num(op.v)}`;
                    return op.t[0] + (w && h ? `${w}x${h}` : r);
                }).join("_");
                const steps = [];
                for (const it of g.items) {
                    if (!it.changed) continue;
                    if (it.op.t === "crop") steps.push(`c${it.outW}x${it.outH}`);
                    else if (it.op.t === "pad") { const S = it.sides, C = it.cut; if (S.some(Boolean)) steps.push(padText(S)); if (C.some(Boolean)) steps.push(`-${C[0] + C[2]}x${C[1] + C[3]}`); }
                    else steps.push(`r${it.outW}x${it.outH}`);
                }
                return steps.join("_");
            };
            node.__wxInfo = infoText;

            // ---- the DOM: the stack (toolbar, rows, the open action's settings) and the preview under it ----------
            const wrap = document.createElement("div"); wrap.className = "wx";
            wrap.style.cssText = "padding:2px 8px 4px;display:flex;flex-direction:column;gap:4px";
            const stack = document.createElement("div"); stack.style.cssText = "display:flex;flex-direction:column;gap:3px";
            const nameLine = document.createElement("div");   // above everything: what `info` says, the text a WSave Image part gets
            nameLine.style.cssText = "font:11px/1.3 monospace;color:#bbb;padding:1px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:text;user-select:text";
            nameLine.title = "what a WSave Image part bound to this node says: the steps as the run will do them";
            const bar = document.createElement("div"); bar.style.cssText = "display:flex;gap:4px;align-items:center";
            const kind = document.createElement("select"); kind.style.cssText = INPUT_CSS + ";width:auto;flex:1";
            for (const [v, t] of [["crop", "the box that stays"], ["pad", "a bigger (or smaller) canvas"], ["resize", "aspect kept"]]) { const o = document.createElement("option"); o.value = v; o.textContent = v; o.title = t; kind.appendChild(o); }
            kind.title = "the action that + adds: crop = the box that stays · pad = a bigger (or smaller) canvas · resize = aspect kept";
            kind.value = "crop";   // the menu opens on crop (Sick, 09/10); a new node has no action until + is pressed
            const btn = (t, title, fn) => { const b = document.createElement("button"); b.className = "wx-btn"; b.textContent = t; b.title = title; b.style.cssText = "padding:1px 7px;min-width:24px"; b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; };
            const bAdd = btn("+", "add the action of the menu after the open one", () => add(kind.value));
            const bDel = btn("−", "remove the open action", () => { if (sel < 0) return; ops.splice(sel, 1); sel = Math.min(sel, ops.length - 1); commit(); rebuild(); });
            bar.append(kind, bAdd, bDel);
            const rows = document.createElement("div"); rows.style.cssText = "display:flex;flex-direction:column;gap:2px";
            stack.append(nameLine, bar, rows);
            const cv = document.createElement("canvas");
            cv.tabIndex = 0;   // the arrow keys move the open rectangle: the drawing takes the focus on a click
            cv.style.cssText = `display:block;width:100%;height:${PREVIEW_H}px;border-radius:6px;background:#161616;cursor:default;flex:none;outline:none`;
            cv.title = "Every action is a rectangle in its colour, the final frame is red. Click one to open it, drag it to move it, pull a corner or a side to size it; arrow keys move it 1 px, with Shift 10 px. Top right: the mask of the pads (fuchsia = added pixels, on black), and the zoom on the open action (again = the whole).";
            wrap.append(stack, cv);
            stop(stack);
            const widget = node.addDOMWidget("wx_stack", "custom", wrap, { serialize: false, hideOnZoom: false, getValue: () => undefined, setValue: () => {} });
            widget.serialize = false;   // the state lives in the ops box: no slot of its own in widgets_values
            widget.computeSize = (w) => [w, node._wxH || PREVIEW_H + 70];
            const fit = () => {   // the height follows the rows and the open panel; the frontend sets a DOM widget's width, not its height
                const sh = stack.offsetHeight; if (!sh) return;
                const hh = sh + PREVIEW_H + 12;
                if (hh !== node._wxH) { node._wxH = hh; wrap.style.height = hh + "px"; node.setSize([node.size[0], node.computeSize()[1]]); node.setDirtyCanvas(true, true); }
            };

            const inAt = (i) => { const g = geo(); return g && g.items[i] ? [g.items[i].inW, g.items[i].inH] : [0, 0]; };
            const add = (t) => {
                if (ops.length >= MAX_OPS) return;
                const at = sel < 0 ? ops.length : sel + 1;
                const [iw, ih] = at > 0 ? (() => { const g = geo(); return g && g.items[at - 1] ? [g.items[at - 1].outW, g.items[at - 1].outH] : [0, 0]; })() : (() => { const s = source(); return s ? [s.w, s.h] : [0, 0]; })();
                ops.splice(at, 0, newOp(t, iw, ih)); sel = at; commit(); rebuild();
            };
            const moveTo = (a, b) => { if (a < 0 || b < 0 || a === b || a >= ops.length || b >= ops.length) return; const [op] = ops.splice(a, 1); ops.splice(b, 0, op); sel = sel === a ? b : sel; commit(); rebuild(); };

            // the settings of one action: small labelled inputs, each one writes its field and commits
            const live = [];   // [input, read()] pairs: refreshed after a drag, unless the input has the focus
            const field = (label, el, title) => { const d = document.createElement("label"); d.style.cssText = "display:flex;flex-direction:column;gap:1px;min-width:0"; const s = document.createElement("span"); s.className = "wx-hint"; s.textContent = label; if (title) d.title = title; d.append(s, el); return d; };
            // a number box slides too: press and drag sideways, 1 per px (10 with Shift); the box fires its own change
            const floorOf = (inp, v) => (inp.min !== "" ? Math.max(Number(inp.min), v) : v);
            const slidable = (inp) => {
                inp.style.cursor = "ew-resize";
                let st = null;
                inp.addEventListener("pointerdown", (e) => { if (e.button !== 0 || inp.disabled) return; st = { x: e.clientX, v: num(inp.value), on: false, id: e.pointerId }; });
                inp.addEventListener("pointermove", (e) => {
                    if (!st) return;
                    const dx = e.clientX - st.x;
                    if (!st.on) { if (Math.abs(dx) < 3) return; st.on = true; inp.blur(); inp.setPointerCapture(st.id); }
                    e.preventDefault();
                    const v = String(floorOf(inp, st.v + Math.round(dx) * (e.shiftKey ? 10 : 1)));   // a size stops at 0; a shift and a side go below
                    if (inp.value !== v) { inp.value = v; inp.dispatchEvent(new Event("change")); }
                });
                const end = (e) => { if (!st) return; if (st.on) { e.preventDefault(); inp.releasePointerCapture?.(st.id); } st = null; };
                inp.addEventListener("pointerup", end); inp.addEventListener("pointercancel", end);
                return inp;
            };
            const numIn = (op, k, label, title, after) => {
                const i = slidable(document.createElement("input")); i.type = "number"; i.style.cssText = INPUT_CSS; i.value = num(op[k]);
                if (k !== "dx" && k !== "dy") i.min = "0";   // a size, a percent, a feather: never below 0 (the shift can be)
                i.onchange = () => { op[k] = floorOf(i, num(i.value, op[k])); if (String(op[k]) !== i.value) i.value = op[k]; after?.(); commit(); syncRows(); };
                live.push([i, () => num(op[k])]);
                return field(label, i, title);
            };
            const selIn = (op, k, label, values, names, title, after) => {
                const s = document.createElement("select"); s.style.cssText = INPUT_CSS;
                values.forEach((v, j) => { const o = document.createElement("option"); o.value = v; o.textContent = names ? names[j] : v; s.appendChild(o); });
                s.value = op[k] ?? values[0]; s.onchange = () => { op[k] = s.value; after?.(); commit(); syncRows(); };
                live.push([s, () => op[k] ?? values[0]]);
                return field(label, s, title);
            };
            const grid = (cols) => { const g = document.createElement("div"); g.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:3px 6px`; return g; };
            const panelFor = (op, i) => {
                const p = document.createElement("div"); p.style.cssText = `border-left:3px solid ${PALETTE[i % PALETTE.length]};padding:3px 0 3px 8px;margin-left:5px`;
                const [iw, ih] = inAt(i);
                if (op.t === "resize") {
                    const g = grid(3), box = String(op.mode).includes("box");
                    const vF = numIn(op, "v", String(op.mode) === "scale %" ? "percent" : "px", "the side in px, or the percent"), wF = numIn(op, "w", "box width", "0 = the picture's"), hF = numIn(op, "h", "box height", "0 = the picture's");
                    const show = () => { const b = String(op.mode).includes("box"); vF.style.display = b ? "none" : ""; wF.style.display = hF.style.display = b ? "" : "none"; vF.firstChild.textContent = String(op.mode) === "scale %" ? "percent" : "px"; };
                    g.append(selIn(op, "mode", "mode", RESIZE_MODES, null, "width / height / long side / short side = that side to the px; scale % = the percent; fit in box / cover box = the box", show), vF, wF, hF);
                    show(); p.appendChild(g); return p;
                }
                const crop = op.t === "crop", g = grid(3);
                const sizeChanged = (k) => () => { const rr = ratio(op.r); if (!rr) return; if (k === "w" && op.w) op.h = rnd(op.w / rr); if (k === "h" && op.h) op.w = rnd(op.h * rr); };
                const aspectChanged = () => {
                    const rr = ratio(op.r); if (!rr) return;
                    if (iw && ih) [op.w, op.h] = boxOf(iw, ih, 0, 0, op.r, !crop);
                    else if (op.w) op.h = rnd(op.w / rr);
                };
                g.append(numIn(op, "w", "width", crop ? "0 = the whole width" : "0 = keep the width", sizeChanged("w")),
                         numIn(op, "h", "height", crop ? "0 = the whole height" : "0 = keep the height", sizeChanged("h")),
                         selIn(op, "r", "aspect", [""].concat(ASPECTS), ["free"].concat(ASPECTS), crop ? "locks width : height; picked, the biggest box of that aspect inside the picture" : "locks width : height; picked, the smallest canvas of that aspect around the picture", aspectChanged),
                         selIn(op, "a", "anchor", ANCHORS, null, crop ? "which part of the picture stays" : "where the picture sits on the canvas"),
                         numIn(op, "dx", "shift x", "from the anchor, in px (+ = right)"), numIn(op, "dy", "shift y", "from the anchor, in px (+ = down)"));
                p.appendChild(g);
                if (!crop) {
                    const g2 = grid(3);
                    const cRow = document.createElement("div"); cRow.style.cssText = "display:flex;gap:3px;align-items:center;min-width:0";
                    const c = document.createElement("input"); c.type = "color"; c.value = normColor(op.color);
                    c.style.cssText = "flex:1;min-width:0;height:20px;padding:0;border:1px solid #555;border-radius:4px;background:#222;cursor:pointer";
                    c.oninput = () => { op.color = c.value; commit(); };
                    live.push([c, () => normColor(op.color)]);
                    // the pipette (Sick, 08/10): the colour from the screen (the browser's EyeDropper: the picture up the cable, a
                    // node's preview, anything on it); where the browser has none, from the picture in the drawing, at a click
                    const pipette = document.createElement("button"); pipette.className = "wx-btn"; pipette.innerHTML = PIPETTE;
                    pipette.style.cssText = "flex:none;height:20px;min-width:22px;padding:0 4px;display:flex;align-items:center;justify-content:center";
                    pipette.title = window.EyeDropper ? "pick the colour from the screen: the picture up the cable, a node's preview, anything on it (Esc to leave)" : "pick the colour from the picture in the drawing: click a point of it (Esc to leave)";
                    pipette.onclick = async (e) => {
                        e.stopPropagation(); e.preventDefault();
                        if (!window.EyeDropper) { armPick(op); return; }
                        try { const got = await new window.EyeDropper().open(); setColor(op, got?.sRGBHex); } catch (_) { /* Esc: nothing picked */ }
                    };
                    cRow.append(c, pipette);
                    // fill (Sick, 09/10): the colour, or the picture's own border pixels going on outward (a gradient continues)
                    const fillF = selIn(op, "fill", "fill", ["colour", "edge"], ["colour", "edge: the border goes on"], "what fills the added area: the colour, or the picture's border pixels carried on outward, row by row and column by column (a gradient continues, a blue side stays blue)", () => { cRow.style.opacity = op.fill === "edge" ? ".45" : ""; });
                    cRow.style.opacity = op.fill === "edge" ? ".45" : "";
                    g2.append(fillF, field("colour", cRow, "the added area"), numIn(op, "feather", "feather", "soft edge of the pad mask, in px inward (ImagePadForOutpaint). 0 = hard"));
                    const g3 = grid(4);
                    const sideIn = (k, label) => {
                        const inp = slidable(document.createElement("input")); inp.type = "number"; inp.style.cssText = INPUT_CSS;
                        const cur = () => { const g = geo(); const it = g?.items[i]; return it?.signed ? it.signed[k] : 0; };
                        inp.value = cur(); inp.disabled = !(iw && ih);
                        inp.onchange = () => {
                            const g = geo(); const it = g?.items[i]; if (!it?.signed) return;
                            const s = it.signed.slice(); s[k] = num(inp.value, s[k]);
                            setBox(op, it.inW, it.inH, { x: -s[0], y: -s[1], w: it.inW + s[0] + s[2], h: it.inH + s[1] + s[3] });
                            if (ratio(op.r)) op.r = "";   // sides typed by hand: the aspect lock would fight them
                            commit(); syncRows();
                        };
                        live.push([inp, cur]);
                        return field(label, inp, "border on this side in px (− = cut); needs the picture");
                    };
                    g3.append(sideIn(0, "left"), sideIn(1, "top"), sideIn(2, "right"), sideIn(3, "bottom"));
                    p.append(g2, g3);
                }
                return p;
            };

            const rowEls = [];
            const rebuild = () => {
                rows.replaceChildren(); rowEls.length = 0; live.length = 0;
                if (!ops.length) {
                    const e = document.createElement("div"); e.className = "wx-hint"; e.style.padding = "2px 4px";
                    e.textContent = "no action: the picture passes through. Pick one in the menu and press +";
                    rows.appendChild(e);
                }
                ops.forEach((op, i) => {
                    const row = document.createElement("div");
                    row.style.cssText = `display:flex;align-items:center;gap:6px;padding:2px 6px;border-radius:4px;cursor:pointer;background:${i === sel ? "#2a2f36" : "transparent"}`;
                    const dot = document.createElement("span"); dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${PALETTE[i % PALETTE.length]};flex:none`;
                    const txt = document.createElement("span"); txt.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
                    const chev = document.createElement("span"); chev.className = "wx-hint"; chev.textContent = i === sel ? "⌃" : "⌄";
                    const grip = document.createElement("span"); grip.className = "wx-hint"; grip.textContent = "≡"; grip.style.cssText = "cursor:grab;font-size:12px;padding:0 2px"; grip.title = "drag to move the action in the stack";
                    row.append(dot, txt, chev, grip);
                    row.onclick = (e) => { e.stopPropagation(); sel = i === sel ? -1 : i; rebuild(); };
                    row.draggable = true;   // the handle: drag the row to another place of the stack
                    row.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", String(i)); row.style.opacity = ".4"; });
                    row.addEventListener("dragend", () => { row.style.opacity = ""; });
                    row.addEventListener("dragover", (e) => { e.preventDefault(); row.style.boxShadow = "0 -2px 0 #1464b3"; });
                    row.addEventListener("dragleave", () => { row.style.boxShadow = ""; });
                    row.addEventListener("drop", (e) => { e.preventDefault(); row.style.boxShadow = ""; moveTo(Number(e.dataTransfer.getData("text/plain")), i); });
                    rows.appendChild(row); rowEls.push(txt);
                    if (i === sel) rows.appendChild(panelFor(op, i));
                });
                bDel.disabled = sel < 0; bAdd.disabled = ops.length >= MAX_OPS;
                syncRows(); node._wxPrevSig = null; fit();
            };
            const syncRows = () => {   // the row texts and the inputs follow the values (after a drag, a typed number, a new picture)
                const g = geo();
                ops.forEach((op, i) => {
                    const it = g?.items[i];
                    const t = it ? it.step : op.t === "resize" ? `resize ${op.mode} ${String(op.mode).includes("box") ? `${op.w}×${op.h}` : op.v}` : `${op.t} ${op.w || "·"}×${op.h || "·"}`;
                    if (rowEls[i]) rowEls[i].textContent = `${i + 1} · ${t}` + (it && it.changed === false ? "  (no change)" : "");
                });
                for (const [inp, get] of live) { if (document.activeElement === inp) continue; const v = String(get()); if (inp.value !== v) inp.value = v; }
                const t = infoText() || "(no change)"; if (nameLine.textContent !== t) nameLine.textContent = t;
            };

            // ---- the preview -----------------------------------------------------------------------------------------
            let lastG = null, map = null;   // the last chain and the source → screen map (the pointer reads them)
            const paint = () => {
                const cw = cv.clientWidth, chh = cv.clientHeight;
                if (!cw || !chh) return;
                const zoom = clamp(app.canvas?.ds?.scale || 1, 1, 2), dpr = (window.devicePixelRatio || 1) * zoom;
                const pw = Math.round(cw * dpr), ph = Math.round(chh * dpr);
                if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
                const ctx = cv.getContext("2d");
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                ctx.clearRect(0, 0, cw, chh);
                const src = source();
                ctx.font = "10px sans-serif"; ctx.textBaseline = "middle";
                if (!src) {
                    lastG = null; map = null;
                    ctx.fillStyle = "#888"; ctx.textAlign = "center";
                    ctx.fillText("connect a picture, or run once:", cw / 2, chh / 2 - 7);
                    ctx.fillText("the preview needs its size", cw / 2, chh / 2 + 7);
                    return;
                }
                const g = chain(src.w, src.h, ops);
                lastG = g;
                // the world: the picture and every canvas, in source space; zoomed, only the open action (or the final frame)
                let x0 = 0, y0 = 0, x1 = g.W, y1 = g.H;
                for (const it of g.items) { const c = it.canvas; x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x + c.w); y1 = Math.max(y1, c.y + c.h); }
                if (node._wxZoom) {
                    const f = g.items[sel] && g.items[sel].op.t !== "resize" ? g.items[sel].canvas : g.final, mx = f.w * 0.04, my = f.h * 0.04;
                    x0 = f.x - mx; y0 = f.y - my; x1 = f.x + f.w + mx; y1 = f.y + f.h + my;
                }
                const M = 14, FOOT = 0, aw = cw - 2 * M, ah = chh - 2 * M - FOOT, maskOn = !!node._wxMask;
                const k = Math.min(aw / (x1 - x0), ah / (y1 - y0));
                const offx = M + (aw - (x1 - x0) * k) / 2, offy = M + (ah - (y1 - y0) * k) / 2;
                const X = (x) => offx + (x - x0) * k, Y = (y) => offy + (y - y0) * k;
                const R = (b) => [X(b.x), Y(b.y), b.w * k, b.h * k];
                map = { k, x0, y0, offx, offy, X, Y, R };
                const color = (i) => PALETTE[i % PALETTE.length];
                const prevOf = (i) => (i > 0 ? g.items[i - 1].canvas : { x: 0, y: 0, w: g.W, h: g.H });   // what action i found
                // 2. the picture: faint everywhere (what is cropped, cut or covered), full where it comes out
                const pic = (alpha, clip) => {
                    ctx.save();
                    if (clip) { ctx.beginPath(); ctx.rect(...R(clip)); ctx.clip(); }
                    ctx.globalAlpha = alpha;
                    if (src.img) ctx.drawImage(src.img, X(0), Y(0), g.W * k, g.H * k);
                    else { ctx.fillStyle = "#8a8a8a"; ctx.fillRect(X(0), Y(0), g.W * k, g.H * k); }
                    ctx.restore();
                };
                // a pad on `edge`: the picture's border pixels carried on over the border, as the run does it (a one-pixel row or
                // column of the picture stretched; the corners from the corner pixel). Only what the source picture has: the
                // border an earlier pad added stays in the colour here.
                const edgeFill = (vis, inner) => {
                    const im = src.img; if (!im || !im.naturalWidth) return;
                    const pix = inter(inner, { x: 0, y: 0, w: g.W, h: g.H }); if (pix.w <= 0 || pix.h <= 0) return;
                    const sx = im.naturalWidth / g.W, sy = im.naturalHeight / g.H;
                    const S = (x, y, w, h) => [Math.min(im.naturalWidth - 1, Math.floor(x * sx)), Math.min(im.naturalHeight - 1, Math.floor(y * sy)), Math.max(1, Math.round(w * sx)), Math.max(1, Math.round(h * sy))];
                    const px0 = pix.x, py0 = pix.y, px1 = pix.x + pix.w, py1 = pix.y + pix.h, vx0 = vis.x, vy0 = vis.y, vx1 = vis.x + vis.w, vy1 = vis.y + vis.h;
                    const draw = (ax, ay, aw, ah, dx0, dy0, dx1, dy1) => { if (dx1 > dx0 && dy1 > dy0) ctx.drawImage(im, ...S(ax, ay, aw, ah), X(dx0), Y(dy0), (dx1 - dx0) * k, (dy1 - dy0) * k); };
                    ctx.save(); ctx.beginPath(); ctx.rect(...R(vis)); ctx.clip(); ctx.imageSmoothingEnabled = false;
                    draw(px0, py0, 1, pix.h, vx0, py0, px0, py1); draw(px1 - 1, py0, 1, pix.h, px1, py0, vx1, py1);   // left, right
                    draw(px0, py0, pix.w, 1, px0, vy0, px1, py0); draw(px0, py1 - 1, pix.w, 1, px0, py1, px1, vy1);   // top, bottom
                    draw(px0, py0, 1, 1, vx0, vy0, px0, py0); draw(px1 - 1, py0, 1, 1, px1, vy0, vx1, py0);           // the corners
                    draw(px0, py1 - 1, 1, 1, vx0, py1, px0, vy1); draw(px1 - 1, py1 - 1, 1, 1, px1, py1, vx1, vy1);
                    ctx.restore();
                };
                // 3. the feather of each pad: a band fading inward from the sides that get a border (its colour; white in the mask)
                const feathers = (colOf, a0 = "b0") => g.items.forEach((it, i) => {
                    const f = num(it.op.feather); if (it.op.t !== "pad" || f <= 0) return;
                    const reg = inter(prevOf(i), g.vis[i]); if (reg.w <= 0 || reg.h <= 0) return;
                    const [bx, by, bw, bh] = R(reg), fpx = Math.min(f / it.sx * k, bw, bh), col = colOf(it);
                    const band = (x, y, w, h, gx0, gy0, gx1, gy1) => { const gr = ctx.createLinearGradient(gx0, gy0, gx1, gy1); gr.addColorStop(0, col + a0); gr.addColorStop(1, col + "00"); ctx.fillStyle = gr; ctx.fillRect(x, y, w, h); };
                    ctx.save(); ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
                    if (it.sides[0] > 0) band(bx, by, fpx, bh, bx, 0, bx + fpx, 0);
                    if (it.sides[2] > 0) band(bx + bw - fpx, by, fpx, bh, bx + bw, 0, bx + bw - fpx, 0);
                    if (it.sides[1] > 0) band(bx, by, bw, fpx, 0, by, 0, by + fpx);
                    if (it.sides[3] > 0) band(bx, by + bh - fpx, bw, fpx, 0, by + bh, 0, by + bh - fpx);
                    ctx.restore();
                });
                if (maskOn) {   // the pad mask as the run makes it: black around, the picture where it comes out, fuchsia = added pixels (every pad, as far as it reaches the end), the feather fading in
                    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cw, chh);
                    if (g.vis0.w > 0 && g.vis0.h > 0) pic(1, g.vis0);
                    ctx.fillStyle = MASK;
                    g.items.forEach((it, i) => {
                        if (it.op.t !== "pad" || g.vis[i].w <= 0 || g.vis[i].h <= 0) return;
                        const inner = inter(prevOf(i), g.vis[i]);
                        ctx.beginPath(); ctx.rect(...R(g.vis[i])); if (inner.w > 0 && inner.h > 0) ctx.rect(...R(inner)); ctx.fill("evenodd");
                    });
                    feathers(() => MASK, "ff");
                } else {
                    // 1. the pads, last first: each one colours what of its canvas reaches the end, the earlier ones sit inside
                    for (let i = g.items.length - 1; i >= 0; i--) {
                        const it = g.items[i]; if (it.op.t !== "pad" || g.vis[i].w <= 0 || g.vis[i].h <= 0) continue;
                        ctx.fillStyle = normColor(it.op.color); ctx.fillRect(...R(g.vis[i]));
                        if (it.op.fill === "edge") edgeFill(g.vis[i], inter(prevOf(i), g.vis[i]));
                    }
                    pic(0.22);
                    if (g.vis0.w > 0 && g.vis0.h > 0) pic(1, g.vis0);
                    feathers((it) => normColor(it.op.color));
                }
                // 4. the rectangles: one per crop / pad in its colour, the open one thicker with its handles; the final frame red
                const selIt = g.items[sel];
                if (selIt && selIt.op.t === "pad") {   // a thread from each corner of the open pad to the corner of what it wraps: inward = border, outward = cut
                    const prev = sel > 0 ? g.items[sel - 1].canvas : { x: 0, y: 0, w: g.W, h: g.H }, c = selIt.canvas;
                    ctx.strokeStyle = color(sel) + "80"; ctx.lineWidth = 1;
                    for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { ctx.beginPath(); ctx.moveTo(X(c.x + fx * c.w), Y(c.y + fy * c.h)); ctx.lineTo(X(prev.x + fx * prev.w), Y(prev.y + fy * prev.h)); ctx.stroke(); }
                }
                g.items.forEach((it, i) => {
                    if (it.op.t === "resize" || i === sel) return;
                    ctx.strokeStyle = color(i); ctx.lineWidth = 1.2; ctx.strokeRect(...R(it.canvas));
                });
                ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.strokeRect(...R(g.final));
                if (selIt && selIt.op.t !== "resize") {
                    const [bx, by, bw, bh] = R(selIt.canvas);
                    ctx.strokeStyle = color(sel); ctx.lineWidth = 2.2; ctx.strokeRect(bx, by, bw, bh);
                    ctx.fillStyle = color(sel);
                    for (const [fx, fy] of [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]]) ctx.fillRect(bx + fx * bw - 3, by + fy * bh - 3, 6, 6);
                }
                // 5. the numbers: the final size (red), the open action's size, its borders (white) and cuts (its colour)
                const label = (t, x, y, col, align = "center") => {
                    ctx.font = "bold 10px sans-serif"; ctx.textAlign = align;
                    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.75)"; ctx.strokeText(t, x, y);
                    ctx.fillStyle = col; ctx.fillText(t, x, y);
                };
                label(`${g.fw}×${g.fh}`, X(g.final.x + g.final.w) - 3, Y(g.final.y + g.final.h) - 8, RED, "right");
                if (selIt && selIt.op.t !== "resize") {
                    const c = selIt.canvas;
                    label(`${selIt.outW}×${selIt.outH}`, X(c.x) + 3, Y(c.y) + 8, color(sel), "left");
                    if (selIt.op.t === "pad") {
                        const prev = sel > 0 ? g.items[sel - 1].canvas : { x: 0, y: 0, w: g.W, h: g.H }, S = selIt.sides, C = selIt.cut, s = selIt.sx, sy = selIt.sy;
                        if (S[0] > 0) label(String(S[0]), X(c.x + S[0] / s / 2), Y(c.y + c.h / 2), "#fff");
                        if (S[2] > 0) label(String(S[2]), X(c.x + c.w - S[2] / s / 2), Y(c.y + c.h / 2), "#fff");
                        if (S[1] > 0) label(String(S[1]), X(c.x + c.w / 2), Y(c.y + S[1] / sy / 2), "#fff");
                        if (S[3] > 0) label(String(S[3]), X(c.x + c.w / 2), Y(c.y + c.h - S[3] / sy / 2), "#fff");
                        if (C[0] > 0) label(`−${C[0]}`, X(prev.x + C[0] / s / 2), Y(prev.y + prev.h / 2), color(sel));
                        if (C[2] > 0) label(`−${C[2]}`, X(prev.x + prev.w - C[2] / s / 2), Y(prev.y + prev.h / 2), color(sel));
                        if (C[1] > 0) label(`−${C[1]}`, X(prev.x + prev.w / 2), Y(prev.y + C[1] / sy / 2), color(sel));
                        if (C[3] > 0) label(`−${C[3]}`, X(prev.x + prev.w / 2), Y(prev.y + prev.h - C[3] / sy / 2), color(sel));
                    }
                }
                if (g.vis0.w < g.W || g.vis0.h < g.H) label(`${g.W}×${g.H}`, X(0) + 3, Y(0) - 7 < 4 ? Y(0) + 8 : Y(0) - 7, "#9a9a9a", "left");
                // 6. the buttons top right: the mask (fuchsia = the pixels the pads add), and the zoom (on = only the open action,
                //    or the final frame, fills the drawing)
                const button = (z, on, t) => {
                    ctx.beginPath(); ctx.roundRect(z.x, z.y, z.w, z.h, 4);
                    ctx.fillStyle = on ? "#1464b3" : "rgba(40,40,40,0.85)"; ctx.fill();
                    ctx.lineWidth = 1; ctx.strokeStyle = on ? "#a8cdf5" : "#666"; ctx.stroke();
                    ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = on ? "#fff" : "#bbb";
                    ctx.fillText(t, z.x + z.w / 2, z.y + z.h / 2 + 1);
                };
                button(maskBtn(cw), maskOn, "mask");
                button(zoomBtn(cw), !!node._wxZoom, node._wxZoom ? "⤡" : "⤢");
            };
            const zoomBtn = (cw) => ({ x: cw - 24, y: 4, w: 20, h: 18 });
            const maskBtn = (cw) => ({ x: cw - 66, y: 4, w: 38, h: 18 });
            const hitBtn = (z, mx, my) => mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h;
            const onZoomBtn = (mx, my) => hitBtn(zoomBtn(cv.clientWidth), mx, my);
            const onMaskBtn = (mx, my) => hitBtn(maskBtn(cv.clientWidth), mx, my);

            // ---- the pointer: a handle of the open rectangle sizes it, inside it moves it, another rectangle opens it ----
            const HANDLES = [["nw", 0, 0], ["n", 0.5, 0], ["ne", 1, 0], ["w", 0, 0.5], ["e", 1, 0.5], ["sw", 0, 1], ["s", 0.5, 1], ["se", 1, 1]];
            const inside = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
            const hitAt = (mx, my) => {
                if (!lastG || !map) return null;
                const selIt = lastG.items[sel];
                if (selIt && selIt.op.t !== "resize") {
                    const [bx, by, bw, bh] = map.R(selIt.canvas);
                    for (const [h, fx, fy] of HANDLES) if (Math.abs(mx - (bx + fx * bw)) <= 6 && Math.abs(my - (by + fy * bh)) <= 6) return { kind: "size", i: sel, h };
                    if (inside({ x: bx, y: by, w: bw, h: bh }, mx, my)) return { kind: "move", i: sel };
                }
                for (let i = lastG.items.length - 1; i >= 0; i--) {
                    const it = lastG.items[i]; if (it.op.t === "resize") continue;
                    const [bx, by, bw, bh] = map.R(it.canvas);
                    if (inside({ x: bx, y: by, w: bw, h: bh }, mx, my)) return { kind: "move", i };
                }
                return null;
            };
            const cursorFor = (h) => h ? ({ n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize" })[h.h] || "move" : "default";
            let drag = null;
            const local = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * cv.clientWidth, (e.clientY - r.top) / r.height * cv.clientHeight]; };
            // ---- the pipette: a colour for a pad. setColor writes it; armPick waits for a click on the picture in the drawing
            //      (the browsers with no EyeDropper), colourAt reads that pixel from the picture itself, not from the dimmed drawing
            let pick = null;   // the pad waiting for a click on the drawing
            const setColor = (op, hex) => { if (!hex || !ops.includes(op)) return; op.color = normColor(hex); commit(); syncRows(); };
            const armPick = (op) => { pick = op; cv.style.cursor = "crosshair"; cv.focus({ preventScroll: true }); };
            const disarmPick = () => { pick = null; cv.style.cursor = "default"; };
            const colourAt = (mx, my) => {
                const s = source(), img = s?.img;
                if (!img || !map || !lastG || !img.naturalWidth) return null;
                const x = (mx - map.offx) / map.k + map.x0, y = (my - map.offy) / map.k + map.y0;
                if (x < 0 || y < 0 || x >= lastG.W || y >= lastG.H) return null;
                try {
                    const one = document.createElement("canvas"); one.width = one.height = 1;
                    const cx = one.getContext("2d", { willReadFrequently: true });
                    cx.drawImage(img, Math.floor(x * img.naturalWidth / lastG.W), Math.floor(y * img.naturalHeight / lastG.H), 1, 1, 0, 0, 1, 1);
                    const [r, g, b] = cx.getImageData(0, 0, 1, 1).data;
                    return "#" + hex2(r) + hex2(g) + hex2(b);
                } catch (_) { return null; }   // a picture the canvas may not read
            };
            cv.addEventListener("pointerdown", (e) => {
                e.stopPropagation();
                if (e.button !== 0) return;
                const [mx, my] = local(e);
                cv.focus({ preventScroll: true });
                if (pick) { const op = pick; disarmPick(); setColor(op, colourAt(mx, my)); return; }
                if (onZoomBtn(mx, my)) { node._wxZoom = !node._wxZoom; node._wxPrevSig = null; paint(); return; }
                if (onMaskBtn(mx, my)) { node._wxMask = !node._wxMask; node._wxPrevSig = null; paint(); return; }
                const h = hitAt(mx, my);
                if (!h) return;
                if (h.i !== sel) { sel = h.i; rebuild(); }
                const it = lastG.items[h.i];
                drag = { ...h, x: e.clientX, y: e.clientY, box: { ...it.box }, inW: it.inW, inH: it.inH, sx: it.sx, sy: it.sy, moved: false };
                cv.setPointerCapture(e.pointerId);
            });
            cv.addEventListener("pointermove", (e) => {
                if (pick) return;   // the pipette is on: the crosshair stays
                if (!drag) { const [mx, my] = local(e); cv.style.cursor = onZoomBtn(mx, my) || onMaskBtn(mx, my) ? "pointer" : cursorFor(hitAt(mx, my)); return; }
                e.stopPropagation();
                const z = app.canvas?.ds?.scale || 1, k = map ? map.k : 1;
                const dx = (e.clientX - drag.x) / (z * k) * drag.sx, dy = (e.clientY - drag.y) / (z * k) * drag.sy;   // in the action's input pixels
                if (!drag.moved && Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
                drag.moved = true;
                const op = ops[drag.i]; if (!op) return;
                const b = drag.box, crop = op.t === "crop";
                let L = b.x, T = b.y, Rr = b.x + b.w, B = b.y + b.h;
                if (drag.kind === "move") { L += dx; T += dy; Rr += dx; B += dy; }
                else {
                    const h = drag.h;
                    if (h.includes("w")) L = Math.min(L + dx, Rr - MIN_BOX); if (h.includes("e")) Rr = Math.max(Rr + dx, L + MIN_BOX);
                    if (h.includes("n")) T = Math.min(T + dy, B - MIN_BOX); if (h.includes("s")) B = Math.max(B + dy, T + MIN_BOX);
                    const rr = ratio(op.r);
                    if (rr) {
                        if (h === "n" || h === "s") { const w = (B - T) * rr; if (h.includes("w")) L = Rr - w; else Rr = L + w; }
                        else { const hh = (Rr - L) / rr; if (h.includes("n")) T = B - hh; else B = T + hh; }
                    }
                }
                if (crop) {   // a crop stays inside its picture
                    const w = Math.min(Rr - L, drag.inW), hh = Math.min(B - T, drag.inH);
                    L = clamp(L, 0, drag.inW - w); T = clamp(T, 0, drag.inH - hh); Rr = L + w; B = T + hh;
                }
                setBox(op, drag.inW, drag.inH, { x: L, y: T, w: Rr - L, h: B - T });
                commit(); syncRows();
            });
            const endDrag = (e) => { if (!drag) return; e.stopPropagation(); drag = null; node.graph?.setDirtyCanvas?.(true, true); };
            cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
            cv.addEventListener("dblclick", (e) => { e.stopPropagation(); const op = ops[sel]; if (op && op.t !== "resize") { op.dx = 0; op.dy = 0; commit(); syncRows(); } });
            cv.addEventListener("keydown", (e) => {   // the arrow keys nudge the open rectangle: 1 px of its picture, 10 with Shift
                if (e.key === "Escape" && pick) { e.preventDefault(); e.stopPropagation(); disarmPick(); return; }
                const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
                if (!d) return;
                e.preventDefault(); e.stopPropagation();
                const it = lastG?.items[sel], op = ops[sel]; if (!it || !op || op.t === "resize") return;
                const s = e.shiftKey ? 10 : 1, b = { ...it.box, x: it.box.x + d[0] * s, y: it.box.y + d[1] * s };
                if (op.t === "crop") { b.x = clamp(b.x, 0, it.inW - b.w); b.y = clamp(b.y, 0, it.inH - b.h); }
                setBox(op, it.inW, it.inH, b); commit(); syncRows();
            });
            cv.addEventListener("keyup", (e) => e.stopPropagation());
            if (window.ResizeObserver) { new ResizeObserver(() => { node._wxPrevSig = null; paint(); }).observe(cv); new ResizeObserver(fit).observe(stack); }

            // ---- repaint only when something it draws from changed: the stack, the open action, the picture, the box, the zoom
            const sig = () => { const s = source(); return JSON.stringify([lastJSON, sel, !!node._wxZoom, !!node._wxMask, s?.w, s?.h, s?.img?.src, s?.from, cv.clientWidth, cv.clientHeight, Math.round((app.canvas?.ds?.scale || 1) * 8)]); };
            const refresh = () => {
                if (wOps && wOps.value !== lastJSON) { read(); rebuild(); }   // the box changed from outside (a load, a paste, a value sent in)
                if (!node._wxSized) {   // a node born on the canvas opens wide enough for the drawing: once, at its first draw, after
                    node._wxSized = true;   // the frontend has sized it; a node read from a file keeps the width it was saved with
                    if (!node._wxFromFile && node.size[0] < 340) node.setSize([340, node.size[1]]);
                }
                fit();
                const s = sig(); if (s !== node._wxPrevSig) { node._wxPrevSig = s; syncRows(); paint(); }
            };
            wxOnRedraw(node, refresh);
            const onConf = node.onConfigure;
            node.onConfigure = function (info) {
                node._wxFromFile = true;
                const rr = onConf?.apply(this, arguments);
                const old = legacyOps(info);   // a workflow saved with the WFrame of before: its boxes become a stack
                if (old) { if (wOps) wOps.value = JSON.stringify(old.ops); if (wMethod && old.method) wMethod.value = old.method; }
                read(); sel = -1; rebuild();   // a node from a file opens folded: click a row or a rectangle to open an action
                return rr;
            };
            wxCompactWidgets(node);
            rebuild();
            return r;
        };
    },
});
