// WextraUI — WReso: the resolution, written large. Of the picture on the `image` cable, else of the two INT cables
// `width` and `height`; the same two numbers go out as INT. Before the run the numbers come from the graph: a picture
// shown up the cable (a Load Image, a node with a preview), the widget of the node at the far end of an INT cable
// (through Reroute and Set / Get; a combo that reads `1024 x 1024` is split in two), or another WReso. After the run,
// what the backend used (`wx_reso`) fills what the graph cannot tell, while the cables are the same ones. One DOM
// widget, so the classic canvas and Nodes 2.0 show the same line. (Sick, 09/10/2026.)
import { app } from "../../scripts/app.js";
import { WX, ensureWxStyle, wxOnRedraw } from "./wxStyle.js";
import { upstreamPicture } from "./wxFrame.js";

const BAND = 34, FONT = 22, MAX_HOPS = 8;

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

/** The number behind input `name` (width / height) as the graph tells it now: another WReso's line, or the widget of the
 *  source node (a number, or a `1024 x 1024` text split in two by the output's name). Undefined when the graph cannot tell. */
function upstreamInt(node, name) {
    const o = originOf(node, name); if (!o) return undefined;
    const src = o.node, out = (src.outputs || [])[o.slot];
    const key = /height/i.test(out?.name || "") ? "height" : /width/i.test(out?.name || "") ? "width" : name;   // which of the two the cable carries
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
function pyRound(x) {
    const f = Math.floor(x), d = x - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
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

            const el = document.createElement("div");
            el.className = "wx wx-reso";
            el.style.cssText = `display:flex;align-items:center;justify-content:center;width:100%;height:${BAND}px;font:bold ${FONT}px sans-serif;` +
                `color:${WX.light};white-space:nowrap;overflow:hidden;user-select:none;letter-spacing:.02em;cursor:default`;
            el.title = "width × height of the picture on the cable, else of the two numbers. Before the run as the graph tells it, after the run as it was.";
            for (const t of ["pointerdown", "pointerup", "mousedown", "mouseup", "wheel"]) el.addEventListener(t, (e) => e.stopPropagation());
            const widget = node.addDOMWidget("wx_reso", "custom", el, { serialize: false, hideOnZoom: false, getValue: () => undefined, setValue: () => {} });
            widget.serialize = false;   // no state of its own: no slot in widgets_values
            widget.computeSize = (w) => [w, BAND];

            const linked = (n) => (node.inputs || []).find((i) => i.name === n)?.link != null;
            const sig = () => (node.inputs || []).map((i) => i.link ?? "").join("|");
            // the two numbers now: the graph first (the picture, else the cables), the last run for what the graph cannot tell
            const now = () => {
                const run = node._wxRun && node._wxRun.sig === sig() ? node._wxRun : null;
                let w, h;
                if (linked("image")) { const p = upstreamPicture(node); if (p) { w = p.w; h = p.h; } }
                else { w = upstreamInt(node, "width"); h = upstreamInt(node, "height"); }
                return { w: w ?? run?.w, h: h ?? run?.h };
            };
            node.__wxResoNow = () => { const v = now(); return { width: v.w, height: v.h }; };

            let last = "";
            const refresh = () => {
                const v = now();
                const t = (v.w ?? "?") + " × " + (v.h ?? "?");
                const key = t + "@" + el.clientWidth;
                if (key === last) return;
                last = key;
                el.textContent = t;
                el.style.color = (v.w != null && v.h != null) ? WX.light : "#777";
                let s = FONT; el.style.fontSize = s + "px";
                while (s > 11 && el.clientWidth && el.scrollWidth > el.clientWidth) el.style.fontSize = (--s) + "px";
                node.setDirtyCanvas(true, false);
            };
            const onExec = node.onExecuted;
            node.onExecuted = function (msg) {
                const rr = onExec?.apply(this, arguments);
                const m = msg?.wx_reso?.[0];
                if (Array.isArray(m) && m.length >= 2) { node._wxRun = { w: Number(m[0]), h: Number(m[1]), sig: sig() }; last = ""; refresh(); }
                return rr;
            };
            wxOnRedraw(node, refresh, 400);
            refresh();
            return r;
        };
    },
});
