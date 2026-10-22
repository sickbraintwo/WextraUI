// WextraUI — WReso: the size of a picture, read or defined, two sections with a ▸ / ▾ head, one open at a time (opening one
// closes the other); a new node and a WReso saved by 0.8.0 open with Read. A closed section shows its name
// only, the open one has a blue head. The outputs are the numbers of the section open, or of the last one opened (the
// hidden `section` widget, read by the backend); the line at the foot of the node, always there, shows those numbers.
// - Read: no box of its own, the node's three first sockets (`image`, `width`, `height`), one row each
//   under its head, shown and hidden with it (as a box's socket): the size of the picture on the cable, else of the two INT cables. Before the run the numbers come from the graph: a
//   picture shown up the cable (a Load Image, a node with a preview), the widget of the node at the far end of an INT
//   cable (through Reroute and Set / Get; a combo that reads `1024 x 1024` is split in two), or another WReso.
// - Define: width or height typed (`define_width` / `define_height`, shown as width / height; the box of the
//   other greys out while the first is above 0), the ratio menu, two boxes of a `custom` ratio under it when it is
//   picked, `multiple` (1, 2, 4, 8, 16, 32 or 64 in a number box since 22/10, a menu before: the arrows step from one to
//   the next, a number typed or from a cable goes to the nearest, multipleOf), `invert`; the line reads the result, worked out here
//   with the backend's sum (src/wreso.py: the side worked out to the nearest `multiple`, then turned round).
// - Multiply (Sick 22/10): a width and a height (`multiply_width` / `multiply_height`, shown as width / height) times
//   `multiply_by`, one decimal, 1.0 to start; each side to the nearest pixel (pyRound, as the backend); the line reads the
//   result, small under it what was multiplied (`1024 × 1024 × 1.5`).
// The ratio of a size was a third section, Ratio Finding, until 22/10: it is WRatio now (wxRatio.js, its two numbers go
// out); a WReso saved on it opens with Read. Every number of the node takes a cable (Sick, 22/10).
// A cable on a box counts as typed, read up the cable as the reading reads its own; what the graph cannot tell (a Video
// Info, a sum) reads `?` with a word under it, and after the run what the backend used (`wx_reso`) fills it, while the
// cables are the same ones: the node runs with nothing on its outputs, like a Preview. Which section is open is kept in
// the node's properties (wxOpen). One DOM widget per head and one for the line, so the classic canvas and Nodes 2.0 show
// the same node. (Sick, 09/10/2026 the reading; 16/10 the defining and the ratio, then WResoDefine; 19/10 one node;
// 22/10 the ratio to WRatio.) The line at the foot (resoLine, resoPaint) and upstreamInt serve WRatio too.
import { app } from "../../scripts/app.js";
import { WX, ensureWxStyle, wxOnRedraw, wxHideWidget, wxSlotHidden, wxCompactWidgets } from "./wxStyle.js";
import { upstreamPicture } from "./wxFrame.js";

export const BAND = 48;
const FONT = 22, HEAD = 20, MAX_HOPS = 8;
// a DOM widget sits 10 px under the top of its slot (measured 16/10 on the classic canvas, as wxSelection.js): the head is
// lifted by 6 in a slot of 24, so it keeps 4 px from the box above and from the one under it
const HEAD_SLOT = 24, HEAD_LIFT = 6;
const SECTIONS = { reading: "Read", defining: "Define", multiply: "Multiply" };   // the heads (Sick 22/10: «Read e Define nelle tendine»)
export const MULTIPLES = [1, 2, 4, 8, 16, 32, 64];
/** The one of MULTIPLES nearest to m, on a doubling scale (12 -> 16, 6 -> 8, 100 -> 64), as src/wreso.py multiple_of. */
export function multipleOf(m) {
    m = Number(m);
    if (!(m > 0)) return 8;
    let best = 8, d = Infinity;
    for (const x of MULTIPLES) { const e = Math.abs(Math.log2(m / x)); if (e < d) { d = e; best = x; } }
    return best;
}
export const AT_RUN = "the cable's number comes with the Run";

/** The node at the far end of input `name`, through Reroute and Set / Get (KJNodes): { node, slot } or null. */
function originOf(node, name) {
    const g = node.graph; if (!g) return null;
    const linkOf = (id) => (id == null ? null : g.links instanceof Map ? g.links.get(id) : g.getLink ? g.getLink(id) : g.links?.[id]);
    const nodes = () => g._nodes || g.nodes || [];
    const constOf = (n) => n?.widgets?.[0]?.value ?? n?.widgets_values?.[0];
    let link = linkOf((node.inputs || []).find((i) => i.name === name)?.link), hops = 0;
    while (link && hops++ < MAX_HOPS) {
        const o = g.getNodeById(link.origin_id);
        if (!o) return null;
        if (o.type === "Reroute") { link = linkOf(o.inputs?.[0]?.link); continue; }
        if (o.type === "GetNode") {
            const c = constOf(o), s = c ? nodes().find((n) => n.type === "SetNode" && constOf(n) === c) : null;
            link = linkOf(s?.inputs?.[0]?.link); continue;
        }
        return { node: o, slot: link.origin_slot };
    }
    return null;
}

/** The number behind input `name` as the graph tells it now: another WReso's line, or the widget of the source node (a
 *  number, or a `1024 x 1024` text split in two by the output's name). Undefined when the graph cannot tell. */
export function upstreamInt(node, name, raw = false) {   // raw: a FLOAT box, the number as it is
    const o = originOf(node, name); if (!o) return undefined;
    const src = o.node, out = (src.outputs || [])[o.slot];
    // which of the two the cable carries: by the output's name, else by the box's (`define_height`, `ratio_width`...)
    const key = /height/i.test(out?.name || "") ? "height" : /width/i.test(out?.name || "") ? "width" : /height/i.test(name) ? "height" : "width";
    if (src.__wxResoNow) return src.__wxResoNow()[key];
    const ws = src.widgets || [];
    const wv = (n) => ws.find((x) => x.name === n)?.value;
    if (src.type === "ResolutionSelector") {   // Comfy's own: the numbers are made in the backend, the same sum here (comfy_extras/nodes_resolution.py)
        const m = /^(\d+)\s*:\s*(\d+)/.exec(String(wv("aspect_ratio") ?? "")), mp = Number(wv("megapixels")), mult = Number(wv("multiple")) || 8;
        if (!m || !Number.isFinite(mp)) return undefined;
        const wr = Number(m[1]), hr = Number(m[2]), scale = Math.sqrt(mp * 1024 * 1024 / (wr * hr));
        return pyRound((key === "height" ? hr : wr) * scale / mult) * mult;
    }
    const w = ws.find((x) => out?.widget?.name && x.name === out.widget.name) || ws.find((x) => out?.name && x.name === out.name)
        || ws.find((x) => x.name === name) || (ws.length === 1 ? ws[0] : undefined);
    const v = w?.value;
    if (typeof v === "number" && Number.isFinite(v)) return raw ? v : Math.round(v);
    if (typeof v === "string") {
        const m = /(\d+)\s*[x×X*]\s*(\d+)/.exec(v);
        if (m) return Number(key === "height" ? m[2] : m[1]);
        if (/^\s*\d+\s*$/.test(v)) return Number(v);
    }
    return undefined;
}
/** Python's round(): half to even, so the sum above gives the backend's numbers to the pixel. */
export function pyRound(x) {
    const f = Math.floor(x), d = x - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
}

/** `16:9` -> [16, 9]; `custom` -> the two boxes; anything unreadable -> [1, 1] (as the backend). */
function ratioOf(text, cw, ch) {
    if (text === "custom") return cw > 0 && ch > 0 ? [cw, ch] : [1, 1];
    const m = /^\s*([\d.]+)\s*:\s*([\d.]+)/.exec(String(text ?? ""));
    const a = m ? Number(m[1]) : 0, b = m ? Number(m[2]) : 0;
    return a > 0 && b > 0 ? [a, b] : [1, 1];
}
const snap = (x, m) => { m = Math.max(1, Math.round(Number(m) || 1)); return x > 0 ? Math.max(m, pyRound(x / m) * m) : 0; };

/** The stop on the mouse for a DOM element of a node: a click on it is not a click on the canvas. */
export function resoStop(el) { for (const t of ["pointerdown", "pointerup", "mousedown", "mouseup", "wheel"]) el.addEventListener(t, (e) => e.stopPropagation()); }

/** A DOM widget of height h that is not saved (a head, a row, the line). */
export function resoDom(node, name, el, h) {
    const w = node.addDOMWidget(name, "custom", el, { serialize: false, hideOnZoom: false, getValue: () => undefined, setValue: () => {} });
    w.serialize = false;
    w.computeSize = (width) => [width, h];
    return w;
}

/** The line at the foot of the node: the numbers large, a word small under them, and on the right a column of two
 *  rows (WRatio: the sizes around), hidden when unused. */
export function resoLine(node, name, h) {
    const el = document.createElement("div");
    el.className = "wx wx-reso";
    el.style.cssText = `display:flex;align-items:center;width:100%;height:${h}px;` +
        `position:relative;top:-${HEAD_LIFT}px;color:${WX.light};white-space:nowrap;overflow:hidden;user-select:none;cursor:default`;
    const left = document.createElement("div");
    left.style.cssText = "flex:1 1 auto;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden";
    const big = document.createElement("div"); big.style.cssText = `font:bold ${FONT}px sans-serif;letter-spacing:.02em`;
    const small = document.createElement("div"); small.style.cssText = "font:11px sans-serif;color:#999";
    left.append(big, small);
    const right = document.createElement("div");
    right.style.cssText = "flex:none;display:flex;flex-direction:column;justify-content:center;gap:2px;padding:0 6px 0 8px;" +
        "margin-left:4px;border-left:1px solid #444;font:12px sans-serif;color:#ddd";
    const up = document.createElement("div"), down = document.createElement("div");
    right.append(up, down);
    el.append(left, right);
    resoStop(el);
    return { el, left, big, small, right, up, down, w: resoDom(node, name, el, h) };
}

/** Writes the line: `around` = { up, down } ([w, h] or null) fills the right column, null hides it; the big text
 *  shrinks until it fits. */
export function resoPaint(l, big, small, ok, around) {
    l.big.textContent = big; l.small.textContent = small; l.small.style.display = small ? "" : "none";
    l.big.style.color = ok ? WX.light : "#777";
    const sz = (v) => (v ? v[0] + " × " + v[1] : "—");
    l.right.style.display = around ? "" : "none";
    if (around) { l.up.textContent = "↑ " + sz(around.up); l.down.textContent = "↓ " + sz(around.down); }
    let s = FONT; l.big.style.fontSize = s + "px";
    while (s > 11 && l.left.clientWidth && l.big.scrollWidth > l.left.clientWidth) l.big.style.fontSize = (--s) + "px";
}

app.registerExtension({
    name: "WextraUI.reso",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxReso") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            ensureWxStyle();
            wxCompactWidgets(node);   // the heads and the line take no slot in widgets_values
            const W = (n) => node.widgets?.find((w) => w.name === n);
            const wSec = W("section"), wW = W("define_width"), wH = W("define_height"), wR = W("aspect_ratio"), wCW = W("custom_width"),
                  wCH = W("custom_height"), wM = W("multiple"), wInv = W("invert"),
                  wXW = W("multiply_width"), wXH = W("multiply_height"), wXF = W("multiply_by");
            if (wSec) wxHideWidget(wSec, node);
            if (wW) wW.label = "width";
            if (wH) wH.label = "height";
            if (wXW) wXW.label = "width";
            if (wXH) wXH.label = "height";
            if (wXF) wXF.label = "multiply by";
            node.properties = node.properties || {};

            const stop = resoStop, dom = (name, el, h) => resoDom(node, name, el, h);
            // the head of a section: ▸ / ▾ and its name; blue when open
            const head = (key) => {
                const el = document.createElement("div");
                el.className = "wx wx-sec";
                el.style.cssText = `display:flex;align-items:center;gap:6px;width:100%;height:${HEAD}px;padding:0 8px;font:600 12px sans-serif;` +
                    `position:relative;top:-${HEAD_LIFT}px;cursor:pointer;user-select:none;border-radius:4px;background:#2b2b2b;border:1px solid #444`;
                el.title = "Open / close. One section open at a time; the outputs (and the line at the foot) are the numbers of the section open, or of the last one opened.";
                stop(el);
                el.addEventListener("click", (e) => { e.stopPropagation(); toggle(key); });
                return { el, w: dom("wx_head_" + key, el, HEAD_SLOT) };
            };
            // a row of Read: one of the three sockets, inside the section (Sick 19/10), looking like an ordinary
            // input: the frontend draws the dot (input.widget = the row puts it at the row's height and hides it with the row;
            // alwaysVisible keeps it drawn, as a plain socket, not only under the mouse), the row writes the name where the
            // frontend writes a plain socket's (it writes none for a socket tied to a widget), and lets the mouse through to the
            // dot. The name stays when a cable is plugged (computedDisabled always false: a box hides when its socket is fed).
            const READ_IN = ["image", "width", "height"];
            const row = (name) => {
                const el = document.createElement("div");
                el.className = "wx wx-in";
                el.style.cssText = `display:flex;align-items:center;width:100%;height:${HEAD}px;padding:0 0 0 10px;font:12px Inter, sans-serif;` +
                    `position:relative;top:-10px;color:#AAA;user-select:none;pointer-events:none`;
                el.textContent = name;
                const w = dom("wx_in_" + name, el, HEAD_SLOT);
                for (const k of ["computedDisabled", "connectionSuppressed"]) Object.defineProperty(w, k, { get: () => false, set: () => {}, configurable: true });
                return { el, w };
            };
            const hRead = head("reading"), rows = READ_IN.map(row), hDef = head("defining"), hMul = head("multiply"), lOut = resoLine(node, "wx_reso", BAND);
            const heads = [["reading", hRead], ["defining", hDef], ["multiply", hMul]];
            // a load rebuilds the inputs from the file (a WReso of 0.8.0 has three plain sockets): tie them again every time
            const tieSockets = () => {
                for (const n of READ_IN) {
                    const s = (node.inputs || []).find((i) => i.name === n);
                    if (!s) continue;
                    if (s.widget?.name !== "wx_in_" + n) s.widget = { name: "wx_in_" + n };
                    s.alwaysVisible = true;
                }
            };
            tieSockets();

            // the order on the node: each head and its rows or boxes, the line at the foot; the hidden `section` stays first
            const order = [wSec, hRead.w, ...rows.map((x) => x.w), hDef.w, wW, wH, wR, wCW, wCH, wM, wInv, hMul.w, wXW, wXH, wXF, lOut.w].filter(Boolean);
            const rest = node.widgets.filter((w) => !order.includes(w));
            node.widgets.splice(0, node.widgets.length, ...order, ...rest);

            const linked = (n) => (node.inputs || []).find((i) => i.name === n)?.link != null;
            const sig = () => (node.inputs || []).map((i) => i.link ?? "").join("|");
            const side = (n, w) => (linked(n) ? upstreamInt(node, n) : Math.max(0, Math.round(Number(w?.value) || 0)));
            const active = () => (wSec?.value === "defining" || wSec?.value === "multiply" ? wSec.value : "reading");
            const runOf = (sec) => (node._wxRun && node._wxRun.sig === sig() && node._wxRun.sec === sec ? node._wxRun : null);
            // Read: the graph first (the picture, else the cables), the last run for what the graph cannot tell
            const readNow = () => {
                const run = runOf("reading");
                let w, h;
                if (linked("image")) { const p = upstreamPicture(node); if (p) { w = p.w; h = p.h; } }
                else { w = upstreamInt(node, "width"); h = upstreamInt(node, "height"); }
                return { w: w ?? run?.w, h: h ?? run?.h };
            };
            // Define now, with the backend's rule: the width wins when both are set, 0 × 0 when neither is; a
            // number the graph cannot tell (a cable on a side, on the multiple, on a custom ratio) waits for the run's
            const defNow = () => {
                const run = runOf("defining");
                const cw = side("custom_width", wCW), ch = side("custom_height", wCH), [rw, rh] = ratioOf(wR?.value, cw, ch);
                const w = side("define_width", wW), h = side("define_height", wH), inv = !!wInv?.value, mc = side("multiple", wM), m = mc === undefined ? undefined : multipleOf(mc);
                const blind = m === undefined || (wR?.value === "custom" && (cw === undefined || ch === undefined));
                let o;
                if (w === undefined || (w === 0 && h === undefined) || (blind && (w > 0 || h > 0))) o = { w: run?.w, h: run?.h, wSet: w !== 0, hSet: h !== 0, turned: true };
                else if (w > 0) o = { w, h: snap(w * rh / rw, m), wSet: true, hSet: false };
                else if (h > 0) o = { w: snap(h * rw / rh, m), h, wSet: false, hSet: true };
                else o = { w: 0, h: 0, wSet: false, hSet: false };
                if (inv && !o.turned) [o.w, o.h] = [o.h, o.w];   // the run's numbers are already turned
                return o;
            };
            // Multiply now: both sides times the number, each to the nearest pixel (the backend's multiply)
            const mulNow = () => {
                const run = runOf("multiply");
                const w = side("multiply_width", wXW), h = side("multiply_height", wXH);
                const f = linked("multiply_by") ? upstreamInt(node, "multiply_by", true) : Number(wXF?.value ?? 1);
                if (w === undefined || h === undefined || f === undefined || !Number.isFinite(f)) return { w: run?.w, h: run?.h, src: null };
                const k = Math.max(0, f);
                return { w: Math.max(0, pyRound(w * k)), h: Math.max(0, pyRound(h * k)), src: [w, h, k] };
            };
            const nowOf = (sec) => (sec === "defining" ? defNow() : sec === "multiply" ? mulNow() : readNow());
            node.__wxResoNow = () => {
                const v = nowOf(active());
                return { width: v.w, height: v.h };
            };

            // the socket of a hidden box sits where its box last was (the frontend puts a box's socket at the box's `y`, and
            // a hidden box keeps the y it had when shown), and the canvas finds a socket under the mouse by its place, hidden
            // or not: the hidden `height` of Read sat on the dot of Multiply's width, a click there took the empty socket and
            // the cable could not be unhooked (Sick 22/10). So a hidden box is moved: with no cable far off the node (PARK),
            // with a cable onto the head of its closed section, where no socket is shown (its cable is still drawn). Done
            // at every layout and every redraw (the heads move when the node does); a shown box gets its y back from the
            // frontend.
            const PARK = -10000;
            const park = (w, on, headW) => {
                if (!w || on) return;
                const s = (node.inputs || []).find((i) => i.widget?.name === w.name);
                const hy = headW?.y ?? headW?.last_y;
                w.y = s?.link != null && hy != null ? hy : PARK;
            };
            let groups = [];   // [widget, shown, head] of the last layout
            const parkAll = () => { for (const [w, on, h] of groups) park(w, on, h); };
            const show = (w, on, headW) => {
                if (!w) return;
                w.hidden = !on; w.options = w.options || {}; w.options.hidden = !on;
                if (w.element) w.element.style.display = on ? "" : "none";
                wxSlotHidden(node, w, !on);
                groups.push([w, on, headW]);
                park(w, on, headW);
            };
            // a WReso without wxOpen (a new node, one saved by 0.8.0) has Read open; "" = all closed; one
            // saved on Ratio Finding (before 22/10, now WRatio) opens with Read too
            const opened = () => { const o = node.properties.wxOpen; return o === undefined || o === "ratio" ? "reading" : o; };
            const layout = () => {
                const open = opened();
                const custom = wR?.value === "custom";
                tieSockets();
                groups = [];
                for (const x of rows) show(x.w, open === "reading", hRead.w);
                for (const w of [wW, wH, wR, wM, wInv]) show(w, open === "defining", hDef.w);
                for (const w of [wCW, wCH]) show(w, open === "defining" && custom, hDef.w);
                for (const w of [wXW, wXH, wXF]) show(w, open === "multiply", hMul.w);
                groups.push([wSec, false, null]); park(wSec, false, null);   // the hidden `section` never shows: its socket stays off the node
                for (const [key, h] of heads) {
                    const on = open === key;
                    h.el.textContent = (on ? "▾ " : "▸ ") + SECTIONS[key];
                    h.el.style.color = on ? WX.light : "#999";
                    h.el.style.background = on ? WX.deep : "#2b2b2b";
                    h.el.style.borderColor = on ? WX.accent : "#444";
                }
                const sz = node.computeSize();
                node.setSize([Math.max(node.size[0], sz[0]), sz[1]]);
                last = ""; refresh();
                node.setDirtyCanvas(true, true);
            };
            const toggle = (key) => {
                const open = opened() === key ? "" : key;   // opening one closes the other
                node.properties.wxOpen = open;
                if (open && wSec) wSec.value = open;        // the section opened gives the outputs from now on
                layout();
            };

            let last = "";
            const refresh = () => {
                parkAll();
                const sec = active();
                const v = nowOf(sec);
                // the box of the side worked out greys out while the other one is set; a box with a cable is the frontend's
                if (sec === "defining") {
                    if (wW && !linked("define_width")) wW.disabled = !v.wSet && v.hSet;
                    if (wH && !linked("define_height")) wH.disabled = !v.hSet && v.wSet;
                }
                const unknown = v.w == null || v.h == null;
                const ok = !unknown && (v.w > 0 || v.h > 0);
                const big = ok ? v.w + " × " + v.h : (v.w ?? "?") + " × " + (v.h ?? "?");
                // the reading with no cable at all reads `? × ?` and nothing else: there is nothing to wait for
                const wired = sec !== "reading" || ["image", "width", "height"].some(linked);
                let small = unknown && wired ? AT_RUN : "";
                // Multiply: small under the result, what was multiplied
                if (sec === "multiply" && !unknown && v.src) small = `${v.src[0]} × ${v.src[1]} × ${Number(v.src[2].toFixed(1))}`;
                const key = [sec, big, small, lOut.el.clientWidth, wW?.disabled, wH?.disabled].join("@");
                if (key === last) return;
                last = key;
                resoPaint(lOut, big, small, ok, null);
                node.setDirtyCanvas(true, false);
            };
            // `multiple`: only the seven. An arrow (a step of 1 from the value before) goes to the next one up or down, a number
            // typed or dragged to the nearest one
            let mPrev = multipleOf(wM?.value);
            if (wM) {
                wM.value = mPrev;
                const cb = wM.callback;
                wM.callback = function (v, ...rest) {
                    const n = Number(wM.value);
                    let m;
                    if (Math.abs(n - mPrev) === 1) {
                        const i = MULTIPLES.indexOf(mPrev);
                        m = MULTIPLES[Math.max(0, Math.min(MULTIPLES.length - 1, i + Math.sign(n - mPrev)))];
                    } else m = multipleOf(n);
                    wM.value = m; mPrev = m;
                    return cb?.apply(this, [m, ...rest]);
                };
            }
            for (const w of [wW, wH, wCW, wCH, wM, wInv, wXW, wXH, wXF]) {
                if (!w) continue;
                const cb = w.callback;
                w.callback = function () { const rr = cb?.apply(this, arguments); refresh(); return rr; };
            }
            if (wR) { const cb = wR.callback; wR.callback = function () { const rr = cb?.apply(this, arguments); layout(); return rr; }; }
            const onExec = node.onExecuted;
            node.onExecuted = function (msg) {
                const rr = onExec?.apply(this, arguments);
                const m = msg?.wx_reso?.[0];
                if (Array.isArray(m) && m.length >= 2) { node._wxRun = { w: Number(m[0]), h: Number(m[1]), sig: sig(), sec: active() }; last = ""; refresh(); }
                return rr;
            };
            const onConf = node.onConfigure;
            node.onConfigure = function () {
                const rr = onConf?.apply(this, arguments);
                // saved before 22/10: on Ratio Finding (now WRatio) -> Read; `multiple` was a menu ("8")
                if (wSec && !(wSec.value in SECTIONS)) wSec.value = "reading";
                if (wM) { wM.value = multipleOf(wM.value); mPrev = wM.value; }   // a saved "8", or a number off the seven
                setTimeout(layout, 0);
                return rr;
            };
            wxOnRedraw(node, refresh, 400);
            layout();
            return r;
        };
    },
});
