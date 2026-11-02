// WextraUI — WRatio: the ratio of a size, its two numbers out (Sick, 22/10/2026: the Ratio Finding of WReso in a node of
// its own, so the ratio can go on by cable). A width and a height, typed or by cable; the line at the foot reads their
// ratio: the known ratio when it is exact (`16:9`), `≈ 16:9` when it is within 1%, the reduced fraction otherwise; small
// under it the fraction and the decimal (`185:104 | 1.78:1`), and what goes out when it reads otherwise (`out 37 : 20` for
// 1.85:1); on the right, when the ratio is a known one, the two sizes nearest to w × h that are that ratio exactly with
// both sides multiples of 8, one bigger (↑ 1536 × 864) and one smaller (↓ 1408 × 792). The outputs `ratio_width` /
// `ratio_height` are the two numbers of the ratio written large, whole (src/wratio.py does the same sum). A cable on a box
// is read up the cable as WReso reads its own (upstreamInt); what the graph cannot tell reads `?` until the run, then the
// run's numbers (`wx_ratio`) while the cables are the same ones. Another WReso reading this node's cable reads the ratio
// live (__wxResoNow), and its menu the name that goes out of `aspect_ratio` (__wxValueOut).
// The ratio is drawn (Sick 28/10, variant D of the restyle): a rectangle of that ratio, as wide as the rows (no taller than
// MAX_H: an upright one gets narrow), the number inside with its small line, and on its right, in a second column, the two
// sizes ↑ ↓; with no sizes the number alone, in the middle. What does not fit: the small line goes inside in pieces
// (`17:30` / `0.57:1`), the sizes beside the rectangle on its right, or under it; the number always stays inside. The node
// takes the height of the rectangle.
// `aspect_ratio` (Sick 28/10) goes out for the menu of WReso: the name of the known ratio turned as the picture is
// (`16:9`, `9:16`), else `custom` (src/wratio.py aspect_name does the same sum).
import { app } from "../../scripts/app.js";
import { WX, ensureWxStyle, wxOnRedraw, wxCompactWidgets, wxCollapsedValue } from "./wxStyle.js";
import { upstreamInt, resoStop, resoDom, AT_RUN } from "./wxReso.js";

const MULTIPLE = 8;
// the ratios of WReso's menu (src/wreso.py RATIOS), tried either way round, in this order (the backend's)
const KNOWN = [[1, 1], [5, 4], [4, 3], [1.37, 1], [7, 5], [1.414, 1], [1.43, 1], [3, 2], [16, 10], [1.66, 1], [16, 9], [1.85, 1],
    [1.9, 1], [1.91, 1], [2, 1], [19.5, 9], [2.2, 1], [21, 9], [2.35, 1], [64, 27], [2.39, 1], [2.4, 1], [2.76, 1], [32, 9]];
const NEAR = 0.01;   // within 1%: `≈ 16:9` (src/wratio.py NEAR)
// the names of WReso's menu, in the order of KNOWN (src/wreso.py RATIOS)
const NAMES = ["1:1", "5:4", "4:3", "1.37:1", "7:5", "1.414:1", "1.43:1", "3:2", "16:10", "1.66:1", "16:9", "1.85:1", "1.9:1",
    "1.91:1", "2:1", "19.5:9", "2.2:1", "21:9", "2.35:1", "64:27", "2.39:1", "2.4:1", "2.76:1", "32:9"];

const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
const num = (x) => String(Number(x.toFixed(2)));
/** a:b made whole and reduced: 1.85:1 -> [37, 20], 19.5:9 -> [13, 6], 16:9 -> [16, 9]. */
export function whole(a, b) {
    const dec = (x) => (String(x).split(".")[1] || "").length;
    const k = 10 ** Math.max(dec(a), dec(b));
    const x = Math.round(a * k), y = Math.round(b * k), g = gcd(x, y) || 1;
    return [x / g, y / g];
}

/** The sizes of ratio a:b exactly, both sides multiples of 8, nearest to w × h: { up, down } ([w, h] or null). The ratio
 *  is made whole (1.85:1 -> 37:20); the sizes are a·k × b·k with k a multiple of the step that makes both sides
 *  multiples of 8; bigger / smaller is judged on the area, a size that is w × h exactly is neither. */
export function perfectAround(a, b, w, h) {
    const [x, y] = whole(a, b);
    const lcm = (p, q) => p * q / gcd(p, q);
    const k0 = lcm(MULTIPLE / gcd(x, MULTIPLE), MULTIPLE / gcd(y, MULTIPLE));
    const s = Math.sqrt((w * h) / (x * y)) / k0;   // where w × h sits, in steps
    const nUp = Number.isInteger(s) ? s + 1 : Math.ceil(s), nDown = Number.isInteger(s) ? s - 1 : Math.floor(s);
    const at = (n) => (n >= 1 ? [x * k0 * n, y * k0 * n] : null);
    return { up: at(nUp), down: at(nDown) };
}

/** The ratio of w × h read three ways: { big, small, known, ratio, out }: `ratio` = [a, b] of the known ratio shown, else
 *  null; `out` = the two whole numbers that go out ([0, 0] when a side is 0). */
export function ratioText(w, h) {
    if (!(w > 0 && h > 0)) return { big: "? : ?", small: "", known: false, ratio: null, out: [0, 0] };
    const g = gcd(w, h), frac = `${w / g}:${h / g}`, dec = `${num(w / h)}:1`, r = w / h;
    let best = null, dist = Infinity, pair = null;
    for (const [a, b] of KNOWN) for (const [x, y] of [[a, b], [b, a]]) {
        const d = Math.abs(Math.log(r / (x / y)));
        if (d < dist) { dist = d; best = `${x}:${y}`; pair = [x, y]; }
    }
    const big = dist < 1e-9 ? best : dist < NEAR ? "≈ " + best : frac;
    const out = dist < NEAR ? whole(pair[0], pair[1]) : [w / g, h / g];
    const said = [frac, dec].filter((s, i, all) => s !== big && s !== best && all.indexOf(s) === i);
    // the numbers that go out, when the line does not already read them as they are (1.85:1 goes out as 37 : 20)
    const outText = `${out[0]}:${out[1]}`;
    if (outText !== (dist < NEAR ? best : frac) && !said.includes(outText)) said.push("out " + out[0] + " : " + out[1]);
    return { big, small: said.join(" | "), known: true, ratio: dist < NEAR ? pair : null, out };
}

/** What goes out of `aspect_ratio`: the name of the known ratio of w × h turned as the picture is, else `custom`. */
export function aspectName(w, h) {
    const t = ratioText(w, h);
    if (!t.ratio) return "custom";
    const [a, b] = t.ratio, up = a < b, name = up ? `${b}:${a}` : `${a}:${b}`;
    if (!NAMES.includes(name)) return "custom";
    return up ? name.split(":").reverse().join(":") : name;
}

// ---- the drawn ratio (variant D) ----
const PAD_X = 10, PAD_Y = 7, GAP = 14, MAX_H = 140, INSET = 5;
const LINE = { big: ["600 22px Inter, Arial, sans-serif", 26], small: ["11px Inter, Arial, sans-serif", 14], sz: ["11.5px Inter, Arial, sans-serif", 15] };
const QUIET = "rgba(221,221,221,.62)", FAINT = "rgba(221,221,221,.38)";
const ruler = document.createElement("canvas").getContext("2d");
const textW = (t, font) => { ruler.font = font; return ruler.measureText(t).width; };
const colW = (ls) => (ls.length ? Math.max(...ls.map(([kd, t]) => textW(t, LINE[kd][0]))) : 0);
const colH = (ls) => ls.reduce((a, [kd]) => a + LINE[kd][1], 0);
/** Where the lines go: left = [big, small?], right = the two sizes or []; r = the ratio; avail = the room across. */
function frameOf(left, right, r, avail) {
    const W = Math.min(avail, MAX_H * r), H = W / r;
    if (right.length && colW(left) + GAP + colW(right) + PAD_X * 2 <= W && Math.max(colH(left), colH(right)) + PAD_Y * 2 <= H)
        return { W, H, inL: left, inR: right, beside: [], under: [] };
    // a narrow rectangle: the small line in pieces, one under the other; the number is always in, only the small lines are measured
    if (left[1] && colW(left.slice(1)) + PAD_X * 2 > W) left = [left[0], ...left[1][1].split(" | ").map((x) => ["small", x])];
    let k = left.length;
    while (k > 1 && (colW(left.slice(1, k)) + PAD_X * 2 > W || colH(left.slice(0, k)) + PAD_Y * 2 > H)) k--;
    const out = left.slice(k), side = right.length && W + 10 + colW(right) <= avail;
    return { W, H, inL: left.slice(0, k), inR: [], beside: side ? right : [], under: side ? out : [...out, ...right] };
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/** The DOM widget of the drawn ratio: its height follows the rectangle (computeSize reads the last one drawn). */
function ratioFrame(node) {
    const el = document.createElement("div");
    el.className = "wx wx-ratio";
    el.style.cssText = "position:relative;width:100%;height:60px;user-select:none;cursor:default;white-space:nowrap";
    resoStop(el);
    const w = resoDom(node, "wx_ratio", el, 60);
    let height = 60;
    w.computeSize = (width) => [width, height];
    const big = (t, ok) => `<div style="font:600 22px/26px Inter, Arial, sans-serif;font-variant-numeric:tabular-nums;color:${ok ? WX.light : "#777"}">`
        + esc(t).replace(/^≈ |:/g, (m) => (m === ":" ? `<span style="color:${FAINT};font-weight:400;margin:0 .04em">:</span>`
            : `<span style="color:${QUIET};font-weight:400;margin-right:.18em">≈</span>`)) + "</div>";
    const line = ([kd, t], ok) => (kd === "big" ? big(t, ok)
        : `<div style="font:${LINE[kd][0]};line-height:${LINE[kd][1]}px;color:${QUIET};font-variant-numeric:tabular-nums">${esc(t)}</div>`);
    /** Draws the ratio text t (ratioText), its small line and the sizes around ({ up, down } or null) of w0 × h0; returns
     *  the height it takes. */
    const paint = (t, small, around, w0, h0) => {
        const lift = LiteGraph.vueNodesMode ? 2 : -6;   // a DOM widget sits 10 px under its slot on the classic canvas
        const avail = Math.max(60, (el.clientWidth || node.size[0] - 20) - INSET * 2);
        const [a, b] = t.ratio ? t.ratio : t.known ? [w0, h0] : [1, 1];
        const sz = (v) => (v ? v[0] + " × " + v[1] : "—");
        const left = [["big", t.big]];
        if (small) left.push(["small", small]);
        const right = around ? [["sz", "↑ " + sz(around.up)], ["sz", "↓ " + sz(around.down)]] : [];
        const f = frameOf(left, right, a / b, avail);
        const ok = t.known, two = f.inR.length > 0;
        const col = (ls, align) => (ls.length ? `<div style="display:flex;flex-direction:column;align-items:${align}">${ls.map((x) => line(x, ok)).join("")}</div>` : "");
        const frame = `<div title="The ratio, to scale" style="position:absolute;left:${INSET}px;top:${lift}px;width:${f.W.toFixed(1)}px;height:${f.H.toFixed(1)}px;box-sizing:border-box;`
            + `display:flex;flex-direction:${two ? "row" : "column"};align-items:center;justify-content:${two ? "space-between" : "center"};padding:0 ${two ? 10 : 0}px;overflow:hidden;border-radius:3px;`
            + (ok ? `box-shadow:inset 0 0 0 1.5px ${WX.light};background:rgba(168,205,245,.10)` : `outline:1.5px dashed ${FAINT};outline-offset:-1.5px`) + `">`
            + col(f.inL, two ? "flex-start" : "center") + col(f.inR, "flex-end") + "</div>";
        const sizesTip = "The ratio exactly, both sides multiples of 8: the nearest size bigger (↑) and smaller (↓).";
        const beside = f.beside.length ? `<div title="${sizesTip}" style="position:absolute;left:${(INSET + f.W + 10).toFixed(1)}px;top:${(lift + f.H / 2).toFixed(1)}px;transform:translateY(-50%)">${f.beside.map((x) => line(x, ok)).join("")}</div>` : "";
        const under = f.under.length ? `<div style="position:absolute;left:${INSET}px;top:${(lift + f.H + 4).toFixed(1)}px">${f.under.map((x) => line(x, ok)).join("")}</div>` : "";
        el.innerHTML = frame + beside + under;
        const h = Math.ceil(lift + f.H + (f.under.length ? 4 + colH(f.under) : 0) + 8);
        el.style.height = h + "px";
        return h;
    };
    return { el, w, paint, setHeight: (h) => { const ch = h !== height; height = h; return ch; } };
}

app.registerExtension({
    name: "WextraUI.ratio",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxRatio") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            ensureWxStyle();
            wxCompactWidgets(node);   // the line takes no slot in widgets_values
            const W = (n) => node.widgets?.find((w) => w.name === n);
            const wW = W("width"), wH = W("height");
            const lOut = ratioFrame(node);

            const linked = (n) => (node.inputs || []).find((i) => i.name === n)?.link != null;
            const sig = () => (node.inputs || []).map((i) => i.link ?? "").join("|");
            const side = (n, w) => (linked(n) ? upstreamInt(node, n) : Math.max(0, Math.round(Number(w?.value) || 0)));
            const now = () => {
                const run = node._wxRun && node._wxRun.sig === sig() ? node._wxRun : null;
                const w = side("width", wW), h = side("height", wH);
                return { w: w ?? run?.w, h: h ?? run?.h };
            };
            // a WReso (or another WRatio) with a cable from here reads the two numbers that go out
            node.__wxResoNow = () => {
                const v = now();
                if (v.w == null || v.h == null) return { width: undefined, height: undefined };
                const o = ratioText(v.w, v.h).out;
                return { width: o[0], height: o[1] };
            };
            node.__wxValueOut = (name) => {   // a WReso's menu on the cable of aspect_ratio reads the name that goes out
                if (name !== "aspect_ratio") return undefined;
                const v = now();
                return v.w == null || v.h == null ? undefined : aspectName(v.w, v.h);
            };

            let last = "", bigNow = "";   // bigNow: the ratio as last painted, for the collapsed title
            const refresh = () => {
                const v = now(), unknown = v.w == null || v.h == null;
                const t = ratioText(v.w, v.h);
                bigNow = t.big;
                const around = t.ratio ? perfectAround(t.ratio[0], t.ratio[1], v.w, v.h) : null;
                const small = unknown ? AT_RUN : t.small;
                const key = [t.big, small, around?.up, around?.down, lOut.el.clientWidth, !!LiteGraph.vueNodesMode].join("@");
                if (key === last) return;
                last = key;
                const h = lOut.paint(t, small, around, v.w, v.h);
                if (lOut.setHeight(h)) node.setSize([node.size[0], node.computeSize()[1]]);   // the node takes the rectangle's height
                node.setDirtyCanvas(true, false);
            };
            for (const w of [wW, wH]) {
                if (!w) continue;
                const cb = w.callback;
                w.callback = function () { const rr = cb?.apply(this, arguments); refresh(); return rr; };
            }
            const onExec = node.onExecuted;
            node.onExecuted = function (msg) {
                const rr = onExec?.apply(this, arguments);
                const m = msg?.wx_ratio?.[0];
                if (Array.isArray(m) && m.length >= 2) { node._wxRun = { w: Number(m[0]), h: Number(m[1]), sig: sig() }; last = ""; refresh(); }
                return rr;
            };
            const onConf = node.onConfigure;
            node.onConfigure = function () { const rr = onConf?.apply(this, arguments); last = ""; setTimeout(refresh, 0); return rr; };
            wxOnRedraw(node, refresh, 400);
            wxCollapsedValue(node, () => bigNow, nodeData.display_name);   // collapsed: `WRatio · 16:9`
            const sz = node.computeSize();
            node.setSize([Math.max(node.size[0], sz[0]), sz[1]]);
            refresh();
            return r;
        };
    },
});
