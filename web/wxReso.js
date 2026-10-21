// WextraUI — WReso: every question about a size, three sections with a ▸ / ▾ head, one open at a time (opening one
// closes the other); a new node and a WReso saved by 0.8.0 open with Resolution Reading. A closed section shows its name
// only, the open one has a blue head. The outputs are the numbers of the section open, or of the last one opened (the
// hidden `section` widget, read by the backend); the line at the foot of the node, always there, shows those numbers.
// - Resolution Reading: no box of its own, the node's three first sockets (`image`, `width`, `height`), one row each
//   under its head, shown and hidden with it (as a box's socket): the size of the picture on the cable, else of the two INT cables. Before the run the numbers come from the graph: a
//   picture shown up the cable (a Load Image, a node with a preview), the widget of the node at the far end of an INT
//   cable (through Reroute and Set / Get; a combo that reads `1024 x 1024` is split in two), or another WReso.
// - Resolution Defining: width or height typed (`define_width` / `define_height`, shown as width / height; the box of the
//   other greys out while the first is above 0), the ratio menu, two boxes of a `custom` ratio under it when it is
//   picked, `invert`; the line reads the result, worked out here with the backend's sum (src/wreso.py: the side worked
//   out to the nearest `multiple`, then turned round).
// - Ratio Finding: a width and a height, given back as they are; the line reads their ratio: the known ratio when it is
//   exact (`16:9`), `≈ 16:9` when it is within 1%, the reduced fraction otherwise; small under it the fraction and the
//   decimal (`185:104 | 1.78:1`); on the right, when the ratio is a known one, the two sizes nearest to w × h that are
//   that ratio exactly with both sides multiples of 8, one bigger (↑ 1536 × 864) and one smaller (↓ 1408 × 792).
// A cable on a box counts as typed, read up the cable as the reading reads its own; what the graph cannot tell (a Video
// Info, a sum) reads `?` with a word under it, and after the run what the backend used (`wx_reso`) fills it, while the
// cables are the same ones: the node runs with nothing on its outputs, like a Preview. Which section is open is kept in
// the node's properties (wxOpen). One DOM widget per head and one for the line, so the classic canvas and Nodes 2.0 show
// the same node. (Sick, 09/10/2026 the reading; 16/10 the defining and the ratio, then WResoDefine; 19/10 one node.)
import { app } from "../../scripts/app.js";
import { WX, ensureWxStyle, wxOnRedraw, wxHideWidget, wxSlotHidden, wxCompactWidgets } from "./wxStyle.js";
import { upstreamPicture } from "./wxFrame.js";

const BAND = 48, FONT = 22, HEAD = 20, MULTIPLE = 8, MAX_HOPS = 8;
// a DOM widget sits 10 px under the top of its slot (measured 16/10 on the classic canvas, as wxSelection.js): the head is
// lifted by 6 in a slot of 24, so it keeps 4 px from the box above and from the one under it
const HEAD_SLOT = 24, HEAD_LIFT = 6;
const SECTIONS = { reading: "Resolution Reading", defining: "Resolution Defining", ratio: "Ratio Finding" };
// the ratios of the menu (src/wreso.py RATIOS), read either way round
const KNOWN = [[1, 1], [5, 4], [4, 3], [1.37, 1], [7, 5], [1.414, 1], [1.43, 1], [3, 2], [16, 10], [1.66, 1], [16, 9], [1.85, 1],
    [1.9, 1], [1.91, 1], [2, 1], [19.5, 9], [2.2, 1], [21, 9], [2.35, 1], [64, 27], [2.39, 1], [2.4, 1], [2.76, 1], [32, 9]];
const NEAR = 0.01;   // within 1%: `≈ 16:9`
const AT_RUN = "the cable's number comes with the Run";

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
export function upstreamInt(node, name) {
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
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
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
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
const num = (x) => String(Number(x.toFixed(2)));

/** The sizes of ratio a:b exactly, both sides multiples of 8, nearest to w × h: { up, down } ([w, h] or null). The ratio
 *  is made whole (1.85:1 -> 37:20); the sizes are a·k × b·k with k a multiple of the step that makes both sides
 *  multiples of 8; bigger / smaller is judged on the area, a size that is w × h exactly is neither. */
export function perfectAround(a, b, w, h) {
    let x = a, y = b;
    while (!(Number.isInteger(x) && Number.isInteger(y))) { x = Math.round(x * 100 * 1e6) / 1e6; y = Math.round(y * 100 * 1e6) / 1e6; }
    const g = gcd(x, y); x /= g; y /= g;
    const lcm = (p, q) => p * q / gcd(p, q);
    const k0 = lcm(MULTIPLE / gcd(x, MULTIPLE), MULTIPLE / gcd(y, MULTIPLE));
    const s = Math.sqrt((w * h) / (x * y)) / k0;   // where w × h sits, in steps
    const nUp = Number.isInteger(s) ? s + 1 : Math.ceil(s), nDown = Number.isInteger(s) ? s - 1 : Math.floor(s);
    const at = (n) => (n >= 1 ? [x * k0 * n, y * k0 * n] : null);
    return { up: at(nUp), down: at(nDown) };
}

/** The ratio of w × h read three ways: { big, small, ratio } (see the head of the file); `ratio` = [a, b] of the known
 *  ratio shown, else null. */
export function ratioText(w, h) {
    if (!(w > 0 && h > 0)) return { big: "? : ?", small: "", known: false, ratio: null };
    const g = gcd(w, h), frac = `${w / g}:${h / g}`, dec = `${num(w / h)}:1`, r = w / h;
    let best = null, dist = Infinity, pair = null;
    for (const [a, b] of KNOWN) for (const [x, y] of [[a, b], [b, a]]) {
        const d = Math.abs(Math.log(r / (x / y)));
        if (d < dist) { dist = d; best = `${x}:${y}`; pair = [x, y]; }
    }
    const big = dist < 1e-9 ? best : dist < NEAR ? "≈ " + best : frac;
    const small = [frac, dec].filter((s, i, all) => s !== big && s !== best && all.indexOf(s) === i).join(" | ");
    return { big, small, known: true, ratio: dist < NEAR ? pair : null };
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
                  wCH = W("custom_height"), wM = W("multiple"), wInv = W("invert"), wPW = W("ratio_width"), wPH = W("ratio_height");
            if (wSec) wxHideWidget(wSec, node);
            for (const w of [wW, wPW]) if (w) w.label = "width";
            for (const w of [wH, wPH]) if (w) w.label = "height";
            node.properties = node.properties || {};

            const stop = (el) => { for (const t of ["pointerdown", "pointerup", "mousedown", "mouseup", "wheel"]) el.addEventListener(t, (e) => e.stopPropagation()); };
            const dom = (name, el, h) => {
                const w = node.addDOMWidget(name, "custom", el, { serialize: false, hideOnZoom: false, getValue: () => undefined, setValue: () => {} });
                w.serialize = false;
                w.computeSize = (width) => [width, h];
                return w;
            };
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
            const line = (name, h) => {
                const el = document.createElement("div");
                el.className = "wx wx-reso";
                el.style.cssText = `display:flex;align-items:center;width:100%;height:${h}px;` +
                    `position:relative;top:-${HEAD_LIFT}px;color:${WX.light};white-space:nowrap;overflow:hidden;user-select:none;cursor:default`;
                // left: what the numbers are; right (Ratio Finding only): the two exact sizes around them
                const left = document.createElement("div");
                left.style.cssText = "flex:1 1 auto;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden";
                const big = document.createElement("div"); big.style.cssText = `font:bold ${FONT}px sans-serif;letter-spacing:.02em`;
                const small = document.createElement("div"); small.style.cssText = "font:11px sans-serif;color:#999";
                left.append(big, small);
                const right = document.createElement("div");
                right.style.cssText = "flex:none;display:flex;flex-direction:column;justify-content:center;gap:2px;padding:0 6px 0 8px;" +
                    "margin-left:4px;border-left:1px solid #444;font:12px sans-serif;color:#ddd";
                right.title = "The ratio on the left exactly, both sides multiples of 8: the nearest size bigger (↑) and smaller (↓).";
                const up = document.createElement("div"), down = document.createElement("div");
                right.append(up, down);
                el.append(left, right);
                stop(el);
                return { el, left, big, small, right, up, down, w: dom(name, el, h) };
            };
            // a row of Resolution Reading: one of the three sockets, inside the section (Sick 19/10), looking like an ordinary
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
            const hRead = head("reading"), rows = READ_IN.map(row), hDef = head("defining"), hRat = head("ratio"), lOut = line("wx_reso", BAND);
            const heads = [["reading", hRead], ["defining", hDef], ["ratio", hRat]];
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
            const order = [wSec, hRead.w, ...rows.map((x) => x.w), hDef.w, wW, wH, wR, wCW, wCH, wM, wInv, hRat.w, wPW, wPH, lOut.w].filter(Boolean);
            const rest = node.widgets.filter((w) => !order.includes(w));
            node.widgets.splice(0, node.widgets.length, ...order, ...rest);

            const linked = (n) => (node.inputs || []).find((i) => i.name === n)?.link != null;
            const sig = () => (node.inputs || []).map((i) => i.link ?? "").join("|");
            const side = (n, w) => (linked(n) ? upstreamInt(node, n) : Math.max(0, Math.round(Number(w?.value) || 0)));
            const active = () => (wSec?.value === "defining" || wSec?.value === "ratio" ? wSec.value : "reading");
            const runOf = (sec) => (node._wxRun && node._wxRun.sig === sig() && node._wxRun.sec === sec ? node._wxRun : null);
            // Resolution Reading: the graph first (the picture, else the cables), the last run for what the graph cannot tell
            const readNow = () => {
                const run = runOf("reading");
                let w, h;
                if (linked("image")) { const p = upstreamPicture(node); if (p) { w = p.w; h = p.h; } }
                else { w = upstreamInt(node, "width"); h = upstreamInt(node, "height"); }
                return { w: w ?? run?.w, h: h ?? run?.h };
            };
            // Resolution Defining now, with the backend's rule: the width wins when both are set, 0 × 0 when neither is
            const defNow = () => {
                const run = runOf("defining");
                const [rw, rh] = ratioOf(wR?.value, side("custom_width", wCW), side("custom_height", wCH));
                const w = side("define_width", wW), h = side("define_height", wH), inv = !!wInv?.value, m = wM?.value ?? 8;
                let o;
                if (w === undefined || (w === 0 && h === undefined)) o = { w: run?.w, h: run?.h, wSet: w !== 0, hSet: h !== 0, turned: true };
                else if (w > 0) o = { w, h: snap(w * rh / rw, m), wSet: true, hSet: false };
                else if (h > 0) o = { w: snap(h * rw / rh, m), h, wSet: false, hSet: true };
                else o = { w: 0, h: 0, wSet: false, hSet: false };
                if (inv && !o.turned) [o.w, o.h] = [o.h, o.w];   // the run's numbers are already turned
                return o;
            };
            const ratNow = () => {
                const run = runOf("ratio");
                const w = side("ratio_width", wPW), h = side("ratio_height", wPH);
                return { w: w ?? run?.w, h: h ?? run?.h };
            };
            node.__wxResoNow = () => {
                const s = active(), v = s === "ratio" ? ratNow() : s === "defining" ? defNow() : readNow();
                return { width: v.w, height: v.h };
            };

            const show = (w, on) => {
                if (!w) return;
                w.hidden = !on; w.options = w.options || {}; w.options.hidden = !on;
                if (w.element) w.element.style.display = on ? "" : "none";
                wxSlotHidden(node, w, !on);
            };
            // a WReso without wxOpen (a new node, one saved by 0.8.0) has Resolution Reading open; "" = all closed
            const opened = () => (node.properties.wxOpen === undefined ? "reading" : node.properties.wxOpen);
            const layout = () => {
                const open = opened();
                const custom = wR?.value === "custom";
                tieSockets();
                for (const x of rows) show(x.w, open === "reading");
                for (const w of [wW, wH, wR, wM, wInv]) show(w, open === "defining");
                for (const w of [wCW, wCH]) show(w, open === "defining" && custom);
                for (const w of [wPW, wPH]) show(w, open === "ratio");
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
            const paint = (l, big, small, ok, around) => {
                l.big.textContent = big; l.small.textContent = small; l.small.style.display = small ? "" : "none";
                l.big.style.color = ok ? WX.light : "#777";
                const sz = (v) => (v ? v[0] + " × " + v[1] : "—");
                l.right.style.display = around ? "" : "none";
                if (around) { l.up.textContent = "↑ " + sz(around.up); l.down.textContent = "↓ " + sz(around.down); }
                let s = FONT; l.big.style.fontSize = s + "px";
                while (s > 11 && l.left.clientWidth && l.big.scrollWidth > l.left.clientWidth) l.big.style.fontSize = (--s) + "px";
            };
            const refresh = () => {
                const sec = active();
                const v = sec === "defining" ? defNow() : sec === "ratio" ? ratNow() : readNow();
                // the box of the side worked out greys out while the other one is set; a box with a cable is the frontend's
                if (sec === "defining") {
                    if (wW && !linked("define_width")) wW.disabled = !v.wSet && v.hSet;
                    if (wH && !linked("define_height")) wH.disabled = !v.hSet && v.wSet;
                }
                const unknown = v.w == null || v.h == null;
                let big, small, ok, around = null;
                if (sec === "ratio") {
                    const t = ratioText(v.w, v.h);
                    big = t.big; small = unknown ? AT_RUN : t.small; ok = t.known;
                    if (t.ratio) around = perfectAround(t.ratio[0], t.ratio[1], v.w, v.h);
                } else {
                    ok = !unknown && (v.w > 0 || v.h > 0);
                    big = ok ? v.w + " × " + v.h : (v.w ?? "?") + " × " + (v.h ?? "?");
                    // the reading with no cable at all reads `? × ?` and nothing else: there is nothing to wait for
                    const wired = sec !== "reading" || ["image", "width", "height"].some(linked);
                    small = unknown && wired ? AT_RUN : "";
                }
                const key = [sec, big, small, lOut.el.clientWidth, wW?.disabled, wH?.disabled].join("@");
                if (key === last) return;
                last = key;
                paint(lOut, big, small, ok, around);
                node.setDirtyCanvas(true, false);
            };
            for (const w of [wW, wH, wCW, wCH, wM, wInv, wPW, wPH]) {
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
            node.onConfigure = function () { const rr = onConf?.apply(this, arguments); setTimeout(layout, 0); return rr; };
            wxOnRedraw(node, refresh, 400);
            layout();
            return r;
        };
    },
});
