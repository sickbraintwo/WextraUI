// WextraUI — the wire of WRoute and WRoute Index (Sick 27/10, variant D of the restyle): a line inside the node from
// `value` to the output the value goes out of, straight along the row of `value` and curving down from the middle of the
// node, so the road reads at a glance even with twenty outputs. On an output with no cable the line is red and dashed,
// and under `value` the node says «nothing runs» (every branch is skipped); an index past the outputs shown says
// «out 7: nothing runs». No line when the choice comes from a cable the graph cannot read before the run.
// The mirror, for Wif and WIndex (29/10): from the input chosen to its output, curving from the input row up to the
// row of the output in the middle of the node; red and dashed from an input with no cable, «nothing runs» under the
// last output (Wif with more pairs: one wire per pair, the note names the outputs that get nothing).
// Classic canvas: drawn in onDrawForeground. Nodes 2.0: an SVG inside the node's DOM box, kept up by a timer.
import { app } from "../../scripts/app.js";
import { WX, wxVueNodeEl, wxVueInputRows, wxVueOutputRows, wxVueDecor } from "./wxStyle.js";
import { upstreamInt, upstreamValue } from "./wxReso.js";

const ERR = "#e08080";
const ruler = document.createElement("canvas").getContext("2d");
/** The width of a slot label on the classic canvas. */
export const wxLabelWidth = (t) => { ruler.font = "14px Arial"; return ruler.measureText(t).width; };

/** live(): the index of the output the value goes out of, or null when it cannot be told.
 *  With `picks`, the mirror: picks() gives, for each output, the indexes in node.inputs of the inputs it chooses among
 *  (WIndex: one output, its twenty inputs; Wif: one output per pair, [true k, false k]), and live() is the position
 *  in those lists of the input that goes out. */
export function wxRouteWire(node, live, picks = null) {
    const valueIdx = () => (node.inputs || []).findIndex((i) => i.name === "value");
    const states = () => {   // [{ L, plugged, shown, a: index in node.inputs, b: index in node.outputs }], one per wire, or null
        const L = live();
        if (L == null || !Number.isFinite(L)) return null;
        if (picks) {
            const ss = picks().map((ps, b) => {
                const shown = L < ps.length && ps[L] >= 0;
                return { L, shown, plugged: shown && node.inputs[ps[L]].link != null, a: shown ? ps[L] : -1, b };
            }).filter(Boolean);
            return ss.length ? ss : null;
        }
        const outs = node.outputs || [], vi = valueIdx();
        if (vi < 0) return null;
        return [{ L, shown: L < outs.length, plugged: L < outs.length && (outs[L].links?.length || 0) > 0, a: vi, b: L }];
    };
    // the path from (x1, y1) to (x2, y2): along the row of value up to the middle of the node, then a soft curve down;
    // mirrored, a soft curve from the input up to the row of the output, then along it
    const pathOf = (x1, y1, x2, y2, mid) => {
        if (Math.abs(y1 - y2) < 1) return [["M", x1, y1], ["L", x2, y2]];
        if (picks) {
            const xm = Math.min(x2 - 4, Math.max(mid, x1 + 12)), k = (xm - x1) * 0.55;
            return [["M", x1, y1], ["C", x1 + k, y1, xm - k, y2, xm, y2], ["L", x2, y2]];
        }
        const xm = Math.max(x1 + 4, Math.min(mid, x2 - 12)), k = (x2 - xm) * 0.55;
        return [["M", x1, y1], ["L", xm, y1], ["C", xm + k, y1, x2 - k, y2, x2, y2]];
    };
    const slotLabel = (sl) => String(sl.label || sl.name);
    // the note: «nothing runs» for one wire; with more (Wif), the outputs that get nothing, «2, 4: nothing runs»
    const noteOf = (ss) => {
        const off = ss.filter((s) => !s.plugged);
        if (!off.length) return "";
        if (ss.length === 1) return off[0].shown ? "nothing runs" : `${picks ? "in" : "out"} ${off[0].L}: nothing runs`;
        return off.map((s) => slotLabel(node.outputs[s.b])).join(", ") + ": nothing runs";
    };
    // where the note goes: under value (WRoute), under the last output (mirrored)
    const noteSlot = (ss) => (picks ? ss[ss.length - 1].b : ss[0].a);

    // ---- classic canvas ----
    const fg = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
        const r = fg?.apply(this, arguments);
        if (LiteGraph.vueNodesMode || node.flags?.collapsed) return r;
        const ss = states();
        if (!ss) return r;
        const H = LiteGraph.NODE_SLOT_HEIGHT || 20;
        ctx.save();
        for (const s of ss) {
            if (!s.shown) continue;
            const op = node.getConnectionPos(false, s.b), xo = op[0] - node.pos[0] - 10, yo = op[1] - node.pos[1];
            const ip = node.getConnectionPos(true, s.a);
            const x1 = ip[0] - node.pos[0] + 10 + wxLabelWidth(slotLabel(node.inputs[s.a])) + 8, y1 = ip[1] - node.pos[1];
            const x2 = xo - wxLabelWidth(slotLabel(node.outputs[s.b])) - 8;
            if (x2 <= x1 + 8) continue;
            ctx.beginPath();
            for (const [c, ...a] of pathOf(x1, y1, x2, yo, node.size[0] / 2)) c === "M" ? ctx.moveTo(...a) : c === "L" ? ctx.lineTo(...a) : ctx.bezierCurveTo(...a);
            ctx.lineWidth = 1.6; ctx.lineCap = "round"; ctx.strokeStyle = s.plugged ? WX.light : ERR;
            ctx.setLineDash(s.plugged ? [] : [3, 4]); ctx.stroke(); ctx.setLineDash([]);
            const [dx, dy] = picks ? [x1, y1] : [x2, yo];   // the dot on the end that has (or lacks) the cable
            ctx.beginPath(); ctx.arc(dx, dy, 2.2, 0, Math.PI * 2); ctx.fillStyle = s.plugged ? WX.light : ERR; ctx.fill();
        }
        const txt = noteOf(ss);
        if (txt) {   // in the free cell under value (mirrored: under the last output)
            ctx.font = "11px Arial"; ctx.textBaseline = "middle"; ctx.fillStyle = ERR;
            const p = node.getConnectionPos(!picks, noteSlot(ss));
            if (picks) { ctx.textAlign = "right"; ctx.fillText(txt, p[0] - node.pos[0] - 10, p[1] - node.pos[1] + H); }
            else { ctx.textAlign = "left"; ctx.fillText(txt, p[0] - node.pos[0] + 10, p[1] - node.pos[1] + H); }
        }
        ctx.restore();
        return r;
    };

    // ---- Nodes 2.0: an SVG and a note inside the node's box ----
    const NS = "http://www.w3.org/2000/svg";
    const textRect = (el, label) => {   // the box of the label's text inside a slot row (the row itself is wider)
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let t = tw.nextNode(); t; t = tw.nextNode()) {
            if (t.textContent.trim() !== label) continue;
            const rg = document.createRange(); rg.selectNodeContents(t);
            const b = rg.getBoundingClientRect(); if (b.width) return b;
        }
        return null;
    };
    wxVueDecor(node, () => {
        const root = wxVueNodeEl(node); if (!root) return;
        let svg = root.querySelector(":scope > svg.wx-route-wire"), note = root.querySelector(":scope > .wx-route-note");
        if (!svg) {
            svg = document.createElementNS(NS, "svg"); svg.classList.add("wx-route-wire");
            svg.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;overflow:visible;z-index:2";
            root.appendChild(svg);
        }
        if (!note) {
            note = document.createElement("div"); note.className = "wx-route-note";
            note.style.cssText = `position:absolute;pointer-events:none;font:11px sans-serif;color:${ERR};white-space:nowrap;z-index:2`;
            note.title = picks ? "The input chosen has no cable: nothing downstream of that output runs"
                               : "The value goes out of an output with no cable: every branch is skipped, nothing downstream runs";
            root.appendChild(note);
        }
        const ss = states();
        const hide = () => { svg.style.display = "none"; note.style.display = "none"; };
        if (!ss) return hide();
        const rb = root.getBoundingClientRect(), z = rb.width / (root.offsetWidth || rb.width) || 1;
        const loc = (x, y) => [(x - rb.left) / z, (y - rb.top) / z];
        const rowsIn = wxVueInputRows(node) || [], rowsOut = wxVueOutputRows(node) || [];
        const rowOf = (rows, idx) => rows.find((x) => x.idx === idx)?.el;
        const box = (el, slot) => textRect(el, slotLabel(slot)) || el.getBoundingClientRect();
        // the note, on the row that always exists: value (WRoute), the last output (mirrored)
        const ni = noteSlot(ss), nRow = picks ? rowOf(rowsOut, ni) : rowOf(rowsIn, ni);
        if (!nRow) return hide();
        const txt = noteOf(ss);
        note.style.display = txt ? "" : "none";
        if (txt) {
            note.textContent = txt;
            const fb = box(nRow, picks ? node.outputs[ni] : node.inputs[ni]);
            const [xl, yt] = loc(picks ? fb.right : fb.left, fb.bottom);
            note.style.top = (yt + 1) + "px";
            if (picks) { note.style.left = ""; note.style.right = (root.offsetWidth - xl) + "px"; }
            else { note.style.right = ""; note.style.left = xl + "px"; }
        }
        let html = "";
        for (const s of ss) {
            const ie = s.shown && rowOf(rowsIn, s.a), oe = s.shown && rowOf(rowsOut, s.b);
            if (!ie || !oe) continue;
            const ib = box(ie, node.inputs[s.a]), oB = box(oe, node.outputs[s.b]);
            const [xv, y1] = loc(ib.right, ib.top + ib.height / 2), [x2, y2] = loc(oB.left, oB.top + oB.height / 2);
            const x1 = xv + 8, xe = x2 - 8;
            if (xe <= x1 + 8) continue;
            const d = pathOf(x1, y1, xe, y2, root.offsetWidth / 2).map(([c, ...a]) => c + " " + a.map((v) => v.toFixed(1)).join(" ")).join(" ");
            const col = s.plugged ? WX.light : ERR, [cx, cy] = picks ? [x1, y1] : [xe, y2];
            html += `<path fill="none" stroke-width="1.6" stroke-linecap="round" d="${d}" stroke="${col}"${s.plugged ? "" : ' stroke-dasharray="3 4"'}/>`
                  + `<circle r="2.2" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" fill="${col}"/>`;
        }
        if (!html) { svg.style.display = "none"; return; }
        svg.style.display = "";
        svg.setAttribute("width", root.offsetWidth); svg.setAttribute("height", root.offsetHeight);
        if (svg._wxHtml !== html) { svg.innerHTML = html; svg._wxHtml = html; }
    }, 250);
}

/** The value of widget `name`, or what the cable on it brings when the graph can tell (undefined: it cannot). */
export function wxRouteChoice(node, name) {
    const w = (node.widgets || []).find((x) => x.name === name);
    const s = (node.inputs || []).find((x) => x.widget?.name === name);
    if (s?.link == null) return w?.value;
    // a cable: the number (index), or the boolean (route) of the box at the far end, through Reroute and Set / Get
    return typeof w?.value === "boolean" ? upstreamValue(node, name) : upstreamInt(node, name, true);
}

/** Wif and WIndex are born as narrow as they can: the width the frontend asks for, or the labels plus room for the
 *  wire if that is more. Only a NEW node (a loaded one keeps its size). `ins()`: the input labels that can be on a row. */
export function wxNarrow(node, ins) {
    setTimeout(() => {
        if (!node.graph || node._wxConfigured) return;
        const out = (node.outputs || []).map((o) => wxLabelWidth(String(o.label || o.name)));
        const need = 10 + Math.max(0, ...ins().map(wxLabelWidth)) + 30 + Math.max(0, ...out) + 10;
        node.setSize([Math.ceil(Math.max(node.computeSize()[0], need)), node.computeSize()[1]]);
        node.setDirtyCanvas(true, true);
    }, 0);
}

// WRoute: true goes out of the first output, false of the second
app.registerExtension({
    name: "WextraUI.route",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "wxRoute") {
            const onCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onCreated?.apply(this, arguments);
                const node = this;
                wxRouteWire(node, () => { const v = wxRouteChoice(node, "route"); return typeof v === "boolean" ? (v ? 0 : 1) : null; });
                return r;
            };
        }
    },
});
