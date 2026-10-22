// WextraUI — WRatio: the ratio of a size, its two numbers out (Sick, 22/10/2026: the Ratio Finding of WReso in a node of
// its own, so the ratio can go on by cable). A width and a height, typed or by cable; the line at the foot reads their
// ratio: the known ratio when it is exact (`16:9`), `≈ 16:9` when it is within 1%, the reduced fraction otherwise; small
// under it the fraction and the decimal (`185:104 | 1.78:1`), and what goes out when it reads otherwise (`out 37 : 20` for
// 1.85:1); on the right, when the ratio is a known one, the two sizes nearest to w × h that are that ratio exactly with
// both sides multiples of 8, one bigger (↑ 1536 × 864) and one smaller (↓ 1408 × 792). The outputs `ratio_width` /
// `ratio_height` are the two numbers of the ratio written large, whole (src/wratio.py does the same sum). A cable on a box
// is read up the cable as WReso reads its own (upstreamInt); what the graph cannot tell reads `?` until the run, then the
// run's numbers (`wx_ratio`) while the cables are the same ones. Another WReso reading this node's cable reads the ratio
// live (__wxResoNow).
import { app } from "../../scripts/app.js";
import { ensureWxStyle, wxOnRedraw, wxCompactWidgets } from "./wxStyle.js";
import { upstreamInt, resoLine, resoPaint, BAND, AT_RUN } from "./wxReso.js";

const MULTIPLE = 8;
// the ratios of WReso's menu (src/wreso.py RATIOS), tried either way round, in this order (the backend's)
const KNOWN = [[1, 1], [5, 4], [4, 3], [1.37, 1], [7, 5], [1.414, 1], [1.43, 1], [3, 2], [16, 10], [1.66, 1], [16, 9], [1.85, 1],
    [1.9, 1], [1.91, 1], [2, 1], [19.5, 9], [2.2, 1], [21, 9], [2.35, 1], [64, 27], [2.39, 1], [2.4, 1], [2.76, 1], [32, 9]];
const NEAR = 0.01;   // within 1%: `≈ 16:9` (src/wratio.py NEAR)

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
            const lOut = resoLine(node, "wx_ratio", BAND);
            lOut.right.title = "The ratio on the left exactly, both sides multiples of 8: the nearest size bigger (↑) and smaller (↓).";

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

            let last = "";
            const refresh = () => {
                const v = now(), unknown = v.w == null || v.h == null;
                const t = ratioText(v.w, v.h);
                const around = t.ratio ? perfectAround(t.ratio[0], t.ratio[1], v.w, v.h) : null;
                const small = unknown ? AT_RUN : t.small;
                const key = [t.big, small, around?.up, around?.down, lOut.el.clientWidth].join("@");
                if (key === last) return;
                last = key;
                resoPaint(lOut, t.big, small, t.known, around);
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
            const sz = node.computeSize();
            node.setSize([Math.max(node.size[0], sz[0]), sz[1]]);
            refresh();
            return r;
        };
    },
});
