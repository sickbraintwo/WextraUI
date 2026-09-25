import { app } from "../../scripts/app.js";
import { ensureWxStyle, wxAddButton, wxCompactWidgets, wxFits, WX } from "./wxStyle.js";
import { wxCleanName } from "./wxFolder.js";

// WSave Image (frontend 1.49+): parti dinamiche e anteprima live del nome. Sopra ogni parte una barretta "part i" con due
// chip (azzurri sotto il mouse) come le righe di WPrompt Rows: - toglie QUELLA parte (le dopo salgono), + ne apre una vuota subito sotto (le dopo
// scendono); valori e cavi seguono. "+" c'e' solo finche' non ci sono parti.
// folder / subject / text{i} / value{i} collegati a un link: la preview legge il valore a monte quando il nodo sorgente
// lo tiene in un widget (Primitive, String, Int...), altrimenti mostra {folder} / {subject} / {int}.
// write_batch (interruttore sotto i tasti) aggiunge _B{batch}{index} in coda: i segnaposto li risolve il backend a run.
// image_preview (ultimo): miniature nel nodo dopo il run, off di default.
// Backend (src/saveWimage.py): per ogni parte i = text{i}, type{i}, value{i} (widget di testo il cui
// puntino accetta qualsiasi link: qui il suo slot viene messo a tipo "*").
// Il numero di parti vive nel widget nascosto "parts" (cosi' si salva e si ricarica col workflow).
const MAX_PARTS = 8;
// ---- the placeholder {#id} = the value of that WextraUI node at this run (src/saveWimage.py resolves it from the
// PROMPT; here the preview resolves it from the graph, and `from Wnodes on graph` proposes the nodes found) ----
const NODE_VALUE = { wxSampler: "sampler_name", wxScheduler: "scheduler", wxCheckpointLoader: "ckpt_name", wxLoraLoaderTrigger: "lora_name", wxFloat: "value", wxSeed: "value", wxSwitch: "on_" };
const NODE_KIND = { wxFloat: "float", wxSeed: "int" };
const BARE = ["wxCheckpointLoader", "wxLoraLoaderTrigger"];
const IDREF = /\{#([\d:]+)\}/g, ONE_IDREF = /^\{#([\d:]+)\}$/;
const isCtlW = (w) => w.name === "control" || w.name === "control_after_generate" || (Array.isArray(w.options?.values) && w.options.values.includes("randomize"));
function ensureFgStyle() {
    if (document.getElementById("wx-fg-style")) return;
    ensureWxStyle();
    const st = document.createElement("style"); st.id = "wx-fg-style";
    st.textContent = `
      .wx-fg-pop { position: fixed; z-index: 10000; width: max-content; max-width: 90vw; max-height: 60vh; overflow: auto; background: #1e1e1e;
        border: 1px solid #1464b3; border-radius: 6px; padding: 4px 0; box-shadow: 0 4px 16px rgba(0,0,0,.6); font: 12px/1.3 sans-serif; color: #ddd; }
      .wx-fg-pop .tools { display: flex; gap: 6px; padding: 2px 8px 4px; border-bottom: 1px solid #333; margin-bottom: 3px; }
      .wx-fg-pop h5 { margin: 4px 10px 2px; font-size: 10px; font-weight: 600; color: #1464b3; text-transform: uppercase; letter-spacing: .04em; }
      .wx-fg-pop label { display: flex; align-items: center; gap: 8px; padding: 2px 20px 2px 10px; cursor: pointer; white-space: nowrap; }
      .wx-fg-pop label:hover { background: #2b2b2b; }
      .wx-fg-pop label.on { color: #a8cdf5; cursor: grab; }
      .wx-fg-pop label.off { color: #777; cursor: default; }
      .wx-fg-pop label.drag { opacity: .4; }
      .wx-fg-pop label.over { border-top: 2px solid #1464b3; }
      .wx-fg-pop label .h { color: #666; font-size: 11px; margin-left: auto; padding-left: 14px; } .wx-fg-pop label .i { color: #666; font-size: 10px; min-width: 14px; text-align: right; }
      .wx-fg-pop input { margin: 0; accent-color: #1464b3; }
      .wx-fg-pop .wx-muted { padding: 2px 10px; display: block; color: #777; }`;
    document.head.appendChild(st);
}

// Meccanismo del frontend 1.49: widget.hidden + widget.options.hidden (vedi setWidgetHidden nel core).
function setHidden(w, hidden) {
    if (!w) return;
    w.hidden = hidden;
    w.options = w.options || {};
    w.options.hidden = hidden;
    if (w.element) w.element.style.display = hidden ? "none" : "";
}
function fmt(v, kind) {
    if (v === undefined || v === null || v === "") return "";
    if (kind === "int") return String(Math.round(Number(v)));
    if (kind === "float") return Number(v).toFixed(2); // due decimali fissi
    if (kind === "bool") return (v === true || String(v).toLowerCase() === "true" || v === 1 || v === "1") ? "true" : "false";
    return String(v);
}

app.registerExtension({
    name: "WextraUI.SaveWimage",
    beforeConfigureGraph(graphData) {   // a workflow saved with the twin of the test days loads as WSave Image
        for (const n of graphData?.nodes || []) if (n.type === "saveWimageTest") n.type = "saveWimage";
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "saveWimage") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const ret = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;
            const W = (name) => node.widgets ? node.widgets.find((w) => w.name === name) : undefined;
            const val = (name, d) => { const w = W(name); return w ? w.value : d; };
            const slot = (name) => (node.inputs || []).find((i) => i.name === name);
            const linked = (name) => { const s = slot(name); return !!(s && s.link != null); };
            // valore a monte di un puntino collegato, se il nodo sorgente lo tiene in un widget (Primitive, String, Int...):
            // altrimenti undefined e la preview mostra un segnaposto {nome}.
            function upstream(name) {
                try {
                    const s = slot(name);
                    if (!s || s.link == null || !node.graph) return undefined;
                    const links = node.graph.links;
                    const link = links instanceof Map ? links.get(s.link) : (node.graph.getLink ? node.graph.getLink(s.link) : links?.[s.link]);
                    if (!link) return undefined;
                    const src = node.graph.getNodeById(link.origin_id);
                    if (!src || !src.widgets || !src.widgets.length) return undefined;
                    const out = (src.outputs || [])[link.origin_slot];
                    const w = src.widgets.find((w) => out?.widget?.name && w.name === out.widget.name)
                        || src.widgets.find((w) => out?.name && w.name === out.name)
                        || (src.widgets.length === 1 ? src.widgets[0] : undefined)
                        || src.widgets.find((w) => w.name === "value");
                    return w ? w.value : undefined;
                } catch (e) { return undefined; }
            }
            // testo di un campo: widget, oppure il valore a monte se collegato, oppure {segnaposto}
            function field(name, holder) {
                if (!linked(name)) return String(val(name, "") || "");
                const u = upstream(name);
                return (u === undefined || u === null) ? "{" + holder + "}" : String(u);
            }

            // ---- {#id} from the graph: the node, its value now, its name for the bars ----
            const graphNode = (id) => { const n = Number(id); return Number.isFinite(n) && node.graph ? node.graph.getNodeById(n) : undefined; };
            const nodeValue = (n) => {
                if (!n) return undefined;
                const key = NODE_VALUE[n.type];
                if (n.type === "wxSwitch") { const i = (n.widgets || []).findIndex((x) => /^on_\d+$/.test(x.name) && x.value === true); return String(Math.max(0, i)); }
                const w = key ? (n.widgets || []).find((x) => x.name === key) : (n.widgets || []).find((x) => x.serialize !== false && !isCtlW(x));
                if (!w || w.value === undefined || w.value === null) return undefined;
                let s = String(w.value);
                if (BARE.includes(n.type)) s = s.replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "");
                return s;
            };
            const resolveNodes = (s) => s.includes("{#") ? s.replace(IDREF, (m, id) => { const v = nodeValue(graphNode(id)); return v === undefined ? "{#" + id + "?}" : v; }) : s;
            const boundId = (i) => { const m = ONE_IDREF.exec(String(val("value" + i, ""))); return m ? m[1] : null; };
            // The name of a node for the bars and the list: the title the user gave it, else the name of the type (WSampler,
            // WCheckpoint…) — never the title the node writes by itself (the sampler / checkpoint name once collapsed).
            const typeTitle = (n) => LiteGraph.registered_node_types?.[n.type]?.title || n.type;
            const autoTitled = (n) => !!n.__wxTitleOf && n.title === wxCleanName(n.__wxTitleOf.value);
            const nodeName = (n) => !n ? "" : (n.title && n.title !== typeTitle(n) && !autoTitled(n)) ? n.title : typeTitle(n);

            const preview = W("preview");
            if (preview) {
                setHidden(preview, false);
                preview.options = preview.options || {};
                preview.options.read_only = true;
                if (preview.element) { ensureWxStyle(); preview.element.readOnly = true; preview.element.classList.add("wx-preview"); preview.element.placeholder = "file name"; }
            }
            setHidden(W("parts"), true);

            function count() { return Math.max(0, Math.min(MAX_PARTS, Number(val("parts", 0)) || 0)); }

            // lo slot del widget value{i} accetta qualsiasi tipo; se il frontend lo ha tolto, lo ricrea
            function anySlot(i) {
                const name = "value" + i;
                let s = slot(name);
                if (!s) {
                    node.addInput(name, "*");
                    s = slot(name);
                    if (s) s.widget = { name };
                }
                if (s) s.type = "*";
            }

            function compose() {
                let folder = resolveNodes(field("folder", "folder")).trim().replace(/\\/g, "/");
                if (folder && !folder.endsWith("/")) folder += "/";
                let name = resolveNodes(field("subject", "subject"));
                const n = count();
                for (let i = 1; i <= n; i++) {
                    const k = String(val("type" + i, "int"));
                    let v;
                    if (linked("value" + i)) { const u = upstream("value" + i); v = (u === undefined || u === null) ? "{" + k + "}" : fmt(u, k); }
                    else { const s = resolveNodes(String(val("value" + i, "") ?? "")); v = /\{#[\d:]+\?\}/.test(s) ? s : fmt(s, k); }
                    name += resolveNodes(field("text" + i, "text")) + v;
                }
                if (val("write_batch", false)) name += "_B{batch}{index}";
                return folder + name;
            }
            let lastComposed = null;
            function refresh() {
                lastComposed = compose();
                if (preview) preview.value = lastComposed;
                node.setDirtyCanvas(true, true);
            }
            // Il callback dei widget non scatta sempre (testo a riga singola, Nodes 2.0, valori che cambiano a monte):
            // a ogni ridisegno, e a intervalli, si ricompone il nome e si aggiorna solo se e' cambiato.
            // Dopo un run la preview mostra il nome vero dal backend (onExecuted) finche' un campo non cambia.
            // a part bound to a node ({#id}) keeps its value: the box is locked, so the link cannot be lost by a slip (remove the
            // part with − to let it go)
            const lock = () => { for (let i = 1, n = count(); i <= n; i++) { const w = W("value" + i); if (w) w.disabled = !!boundId(i); } };
            function watch() { lock(); if (lastComposed !== null && compose() !== lastComposed) refresh(); }

            function layout() {
                const n = count();
                for (let i = 1; i <= MAX_PARTS; i++) {
                    const on = i <= n;
                    setHidden(W("text" + i), !on);
                    setHidden(W("type" + i), !on);
                    setHidden(W("value" + i), !on);
                    setHidden(bars[i], !on);
                    if (on) anySlot(i);
                    else if (linked("value" + i)) {      // parte tolta: stacca il cavo, niente link nel vuoto
                        const idx = node.inputs.findIndex((s) => s.name === "value" + i);
                        if (idx >= 0) node.disconnectInput(idx);
                    }
                }
                setHidden(wAdd, n > 0);
                refresh();
                node.setSize(node.computeSize());
            }

            function setCount(n) {
                const w = W("parts");
                if (w) w.value = Math.max(0, Math.min(MAX_PARTS, n));
                layout();
            }

            for (const w of node.widgets || []) {
                if (w.name === "preview" || w.name === "parts") continue;
                const orig = w.callback;
                w.callback = function () {
                    const r = orig ? orig.apply(this, arguments) : undefined;
                    refresh();
                    return r;
                };
            }

            // One slim bar above each part, like the rows of WPrompt Rows: "part i" and two chips, − (this part goes, the
            // parts after it move up) and + (a new part right below, the parts after it move down). Values and cables follow.
            const FIELDS = ["text", "type", "value"];
            const DEFAULTS = { text: "_", type: "int", value: "" };   // a part as it is born (the defaults of src/saveWimage.py)
            const inputIdx = (name) => (node.inputs || []).findIndex((x) => x.name === name);
            const getLink = (id) => { const L = node.graph?.links; return id == null || !L ? null : (L instanceof Map ? L.get(id) : (node.graph.getLink ? node.graph.getLink(id) : L[id])); };
            const unplug = (name) => { const k = inputIdx(name); if (k >= 0 && node.inputs[k].link != null) node.disconnectInput(k); };
            function movePart(from, to) {   // part `from` takes the place of part `to`: values and cables
                for (const f of FIELDS) {
                    const a = W(f + from), b = W(f + to);
                    if (a && b) b.value = a.value;
                    unplug(f + to);
                    const kf = inputIdx(f + from), l = kf >= 0 ? getLink(node.inputs[kf].link) : null;
                    if (!l) continue;
                    const src = node.graph.getNodeById(l.origin_id), oslot = l.origin_slot;
                    node.disconnectInput(kf);
                    if (f === "value") anySlot(to);
                    const kt = inputIdx(f + to);
                    // LiteGraph's node-to-node cable, called from the prototype: the registry scanner reads the bare method call as a network socket
                    if (src && kt >= 0) LiteGraph.LGraphNode.prototype.connect.call(src, oslot, node, kt);
                }
            }
            function clearPart(i) { for (const f of FIELDS) { unplug(f + i); const w = W(f + i); if (w) w.value = DEFAULTS[f]; } }
            function removePart(i) {
                const n = count();
                if (i < 1 || i > n) return;
                for (let j = i; j < n; j++) movePart(j + 1, j);
                clearPart(n);
                setCount(n - 1);
            }
            function insertPart(i) {   // a new empty part right below part i
                const n = count();
                if (n >= MAX_PARTS) return;
                setCount(n + 1);
                for (let j = n; j > i; j--) movePart(j, j + 1);
                clearPart(i + 1);
                layout();
            }
            const BAR_H = 18, CHIP = 22, M = 12;
            const bars = {};
            let hover = null;   // "3:minus" = the mouse is on the - chip of part 3 (the chip turns blue, like the chips of WPrompt Rows)
            for (let i = 1; i <= MAX_PARTS; i++) {
                const first = W("text" + i);
                if (!first) continue;
                const b = node.addWidget("wxpartbar", "part" + i + "_bar", null, () => {}, { serialize: false });
                b.serialize = false;   // no slot in widgets_values (see wxCompactWidgets)
                const chips = (width) => [{ what: "minus", x: width - M - 2 * CHIP - 6 }, { what: "plus", x: width - M - CHIP }];
                b.draw = function (ctx, nd, width, y, H) {
                    if (i > count()) return;
                    b.__y = y; b.__h = H;
                    ctx.save();
                    ctx.font = "11px sans-serif"; ctx.textBaseline = "middle"; ctx.lineWidth = 1;
                    const bid = boundId(i), bn = bid ? graphNode(bid) : null;
                    const label = "part " + i + (bid ? " · " + (bn ? nodeName(bn) : "#" + bid + "?") : "");
                    ctx.textAlign = "left"; ctx.fillStyle = WX.accent; ctx.fillText(label, M + 2, y + H / 2 + 1);
                    const lx = M + 2 + ctx.measureText(label).width + 8;
                    ctx.strokeStyle = "#444"; ctx.beginPath(); ctx.moveTo(lx, y + H / 2 + 0.5); ctx.lineTo(width - M - 2 * CHIP - 14, y + H / 2 + 0.5); ctx.stroke();
                    ctx.textAlign = "center";
                    for (const c of chips(width)) {
                        ctx.beginPath(); ctx.roundRect(c.x, y + 2, CHIP, H - 4, (H - 4) / 2);
                        const hot = hover === i + ":" + c.what;
                        ctx.fillStyle = "#2b2b2b"; ctx.fill(); ctx.strokeStyle = hot ? WX.accent : "#555"; ctx.stroke();
                        ctx.fillStyle = hot ? WX.light : "#ddd"; ctx.fillText(c.what === "minus" ? "−" : "+", c.x + CHIP / 2, y + H / 2 + 0.5);
                    }
                    ctx.restore();
                };
                let last = 0;
                b.mouse = function (event, pos, nd) {
                    const t = String(event?.type || "");
                    if (t.includes("move") || i > count()) return false;
                    const c = chips(nd.size[0]).find((c) => pos[0] >= c.x && pos[0] <= c.x + CHIP);
                    if (!c) return false;
                    const now = Date.now(); if (now - last < 250) return true;   // down + up = one click
                    last = now;
                    if (c.what === "minus") removePart(i); else insertPart(i);
                    return true;
                };
                b.computeSize = (width) => [width, i <= count() ? BAR_H : -4];
                b.__chips = chips;
                node.widgets.splice(node.widgets.indexOf(b), 1);
                node.widgets.splice(node.widgets.indexOf(first), 0, b);
                bars[i] = b;
            }

            const origMove = node.onMouseMove;
            node.onMouseMove = function (e, pos) {
                let now = null;
                if (!this.flags?.collapsed) for (let i = 1, n = count(); i <= n && !now; i++) {
                    const b = bars[i];
                    if (!b || b.__y === undefined || pos[1] < b.__y || pos[1] > b.__y + b.__h) continue;
                    const c = b.__chips(this.size[0]).find((c) => pos[0] >= c.x && pos[0] <= c.x + CHIP);
                    if (c) now = i + ":" + c.what;
                }
                if (now !== hover) { hover = now; this.setDirtyCanvas(true, false); }
                return origMove?.apply(this, arguments);
            };
            const origLeave = node.onMouseLeave;
            node.onMouseLeave = function () { if (hover) { hover = null; this.setDirtyCanvas(true, false); } return origLeave?.apply(this, arguments); };

            // "+" is there only while there are no parts: from the first part on, the + of the bars does the job
            const wAdd = wxAddButton(node, "+", () => setCount(count() + 1));
            const addSize = wAdd.computeSize, addDraw = wAdd.draw, addMouse = wAdd.mouse;
            wAdd.computeSize = function (width) { return count() ? [width, -4] : addSize.call(this, width); };
            wAdd.draw = function () { if (!count()) return addDraw.apply(this, arguments); };
            wAdd.mouse = function () { return count() ? false : addMouse.apply(this, arguments); };
            // ---- `from Wnodes on graph`: the WextraUI nodes of the graph, ticked = a part each, bound with {#id} ----
            let fgPop = null;
            const closeFg = () => { if (fgPop) { fgPop.remove(); fgPop = null; } };
            const ctlOf = (n) => (n.widgets || []).find(isCtlW);
            const walks = (n) => { if (n.__wxCarry?.driven?.()) return "on carry"; const c = ctlOf(n); return c && c.value && c.value !== "fixed" ? "walks" : "fixed"; };
            const hops = (n, d = 0) => { const ds = n.__wxCarry?.downstream?.() || []; return !ds.length || d > 12 ? 0 : 1 + Math.max(...ds.map((x) => hops(x, d + 1))); };
            const bound = () => { const b = {}; for (let i = 1, n = count(); i <= n; i++) { const id = boundId(i); if (id) b[id] = i; } return b; };
            const byName = (a, b) => nodeName(a.n).localeCompare(nodeName(b.n)) || a.n.id - b.n.id;
            const found = () => (node.graph?._nodes || node.graph?.nodes || []).filter((n) => n !== node && NODE_VALUE[n.type]).map((n) => ({ n, id: String(n.id), how: walks(n), hops: hops(n) })).sort(byName);   // by name: the nodes of a type together
            const textFor = (n) => nodeName(n).replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, "").trim() || "_";   // the node's name, no icon
            const openFg = () => {
                ensureFgStyle();
                const rows = found(), b = bound();
                let ticked = rows.filter((r) => !b[r.id] && r.how !== "fixed").sort((a, c) => a.hops - c.hops || byName(a, c)).map((r) => r.id);   // slow → fast along the carry
                const pop = document.createElement("div"); pop.className = "wx wx-fg-pop";
                const tools = document.createElement("div"); tools.className = "tools"; pop.appendChild(tools);
                const btn = (t, fn, title) => { const x = document.createElement("button"); x.textContent = t; x.title = title; x.onclick = (e) => { e.stopPropagation(); fn(); }; tools.appendChild(x); };
                const body = document.createElement("div"); pop.appendChild(body);
                const commit = () => {
                    for (const id of ticked) {
                        const r = rows.find((x) => x.id === id), n = count();
                        if (!r || n >= MAX_PARTS) break;
                        setCount(n + 1);
                        const i = n + 1;
                        W("text" + i).value = textFor(r.n); W("type" + i).value = NODE_KIND[r.n.type] || "string"; W("value" + i).value = "{#" + id + "}";
                    }
                    closeFg(); layout();
                };
                btn("add", commit, "a part for every ticked node, in this order, after the parts of now");
                btn("all", () => { ticked = rows.filter((r) => !b[r.id]).map((r) => r.id); render(); }, "tick every node found");
                btn("none", () => { ticked = []; render(); }, "no tick");
                btn("cancel", closeFg, "close without touching the parts");
                const render = () => {
                    body.innerHTML = "";
                    if (!rows.length) { const m = document.createElement("span"); m.className = "wx-muted"; m.textContent = "no WextraUI node that walks in this workflow"; body.appendChild(m); return; }
                    const rowOf = (r, on, k) => {
                        const lab = document.createElement("label"); lab.className = b[r.id] ? "off" : on ? "on" : "";
                        const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = on || !!b[r.id]; cb.disabled = !!b[r.id];
                        cb.onchange = () => { const i = ticked.indexOf(r.id); if (cb.checked && i < 0) ticked.push(r.id); else if (!cb.checked && i >= 0) ticked.splice(i, 1); render(); };
                        lab.appendChild(cb);
                        if (on) { const i = document.createElement("span"); i.className = "i"; i.textContent = String(k + 1); lab.appendChild(i); }
                        const t = document.createElement("span"); t.textContent = nodeName(r.n) + " = " + (nodeValue(r.n) ?? "?"); lab.appendChild(t);
                        const h = document.createElement("span"); h.className = "h"; h.textContent = "#" + r.id + " · " + (b[r.id] ? "part " + b[r.id] : r.how); lab.appendChild(h);
                        if (on) {   // ticked: a number (its place in the name), drag to reorder
                            lab.draggable = true;
                            lab.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", r.id); lab.classList.add("drag"); });
                            lab.addEventListener("dragend", () => lab.classList.remove("drag"));
                            lab.addEventListener("dragover", (e) => { e.preventDefault(); lab.classList.add("over"); });
                            lab.addEventListener("dragleave", () => lab.classList.remove("over"));
                            lab.addEventListener("drop", (e) => {
                                e.preventDefault(); lab.classList.remove("over");
                                const from = e.dataTransfer.getData("text/plain"), a = ticked.indexOf(from), c = ticked.indexOf(r.id);
                                if (a < 0 || c < 0 || a === c) return;
                                ticked.splice(a, 1); ticked.splice(c, 0, from); render();
                            });
                        }
                        return lab;
                    };
                    const t = ticked.map((id) => rows.find((r) => r.id === id)).filter(Boolean), rest = rows.filter((r) => !ticked.includes(r.id));
                    if (t.length) { const h = document.createElement("h5"); h.textContent = "to add — drag to order the name (slow → fast)"; body.appendChild(h); t.forEach((r, k) => body.appendChild(rowOf(r, true, k))); }
                    if (rest.length) { const h = document.createElement("h5"); h.textContent = t.length ? "others" : "found — tick to add"; body.appendChild(h); rest.forEach((r) => body.appendChild(rowOf(r, false, -1))); }
                };
                render();
                pop.addEventListener("pointerdown", (e) => e.stopPropagation());
                pop.addEventListener("wheel", (e) => e.stopPropagation());
                document.body.appendChild(pop);
                const rc = app.canvas?.canvas?.getBoundingClientRect?.() || { left: 0, top: 0 };
                const [sx, sy] = app.canvas?.ds ? [app.canvas.ds.scale, app.canvas.ds.offset] : [1, [0, 0]];
                const px = rc.left + (node.pos[0] + sy[0]) * sx, py = rc.top + (node.pos[1] + node.size[1] + sy[1]) * sx + 4;
                const w = pop.offsetWidth, h = pop.offsetHeight;   // as wide as the longest row (+ 20 px), no more
                pop.style.left = Math.max(4, Math.min(px, window.innerWidth - w - 8)) + "px";
                pop.style.top = (py + h > window.innerHeight - 8 ? Math.max(4, window.innerHeight - h - 8) : py) + "px";
                fgPop = pop;
                const off = (e) => { if (pop.contains(e.target)) return; document.removeEventListener("pointerdown", off, true); document.removeEventListener("keydown", key, true); if (fgPop === pop) closeFg(); };
                const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); off({ target: document.body }); } };
                setTimeout(() => { document.addEventListener("pointerdown", off, true); document.addEventListener("keydown", key, true); }, 0);
            };
            const wFg = wxAddButton(node, "from Wnodes on graph", () => { if (fgPop) closeFg(); else openFg(); });
            wFg.draw = function (ctx, nd, width, y, H) {   // the same button, the W in red
                const m = 12, x = m, wd = width - 2 * m;
                ctx.save();
                ctx.beginPath(); ctx.roundRect(x, y + 1, wd, H - 2, 6);
                ctx.fillStyle = "#2b2b2b"; ctx.fill();
                ctx.lineWidth = 1; ctx.strokeStyle = WX.accent; ctx.stroke();
                ctx.font = "12px sans-serif"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
                const segs = [["from ", "#ddd"], ["W", "#e61e1e"], ["nodes on graph", "#ddd"]];   // the W in the red of the wordmark
                let px = x + (wd - segs.reduce((s, [t]) => s + ctx.measureText(t).width, 0)) / 2;
                for (const [t, c] of segs) { ctx.fillStyle = c; ctx.fillText(t, px, y + H / 2); px += ctx.measureText(t).width; }
                ctx.restore();
            };
            // write_batch sotto i tasti (e' l'ultimo input del backend: spostarlo in coda non cambia l'ordine dei valori salvati)
            for (const nm of ["write_batch", "image_preview"]) {
                const w = W(nm);
                if (w) { const k = node.widgets.indexOf(w); if (k >= 0) { node.widgets.splice(k, 1); node.widgets.push(w); } }
            }
            wxCompactWidgets(node);   // the two buttons take no slot: widgets_values = the inputs of object_info, in order

            const onDrawBg = node.onDrawBackground;
            node.onDrawBackground = function () { const r = onDrawBg ? onDrawBg.apply(this, arguments) : undefined; watch(); return r; };
            const onDrawFg = node.onDrawForeground;
            node.onDrawForeground = function () { const r = onDrawFg ? onDrawFg.apply(this, arguments) : undefined; watch(); return r; };
            const timer = setInterval(watch, 400);
            const origRemoved = node.onRemoved;
            node.onRemoved = function () { clearInterval(timer); if (wFg) closeFg(); return origRemoved ? origRemoved.apply(this, arguments) : undefined; };

            const origConn = node.onConnectionsChange;
            node.onConnectionsChange = function () {
                const r = origConn ? origConn.apply(this, arguments) : undefined;
                setTimeout(refresh, 0);
                return r;
            };
            const origConfigure = node.onConfigure;
            node.onConfigure = function (info) {
                const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                // a wf saved with the holes of the two old buttons (0.3.5 and before, no names in the file): read again without them
                const wv = info?.widgets_values, S = node.widgets.filter((w) => w.serialize !== false);
                if (Array.isArray(wv) && wv.length > S.length && !(info?.widgets_values_named && typeof info.widgets_values_named === "object")) {
                    const flat = wv.filter((v) => v !== null && v !== undefined);
                    if (flat.length === S.length) S.forEach((w, k) => { if (wxFits(w, flat[k])) w.value = flat[k]; });
                }
                // a wf saved before 0.3.4 leaves the two buttons' nulls here: back to the defaults of object_info
                for (const [nm, d] of [["write_batch", true], ["image_preview", false]]) {
                    const w = node.widgets.find((x) => x.name === nm);
                    if (w && typeof w.value !== "boolean") w.value = d;
                }
                setTimeout(layout, 0);
                return r;
            };
            const origExecuted = node.onExecuted;
            node.onExecuted = function (msg) {
                // Il backend dichiara sempre le immagini (servono a /history e agli automatismi); le miniature nel nodo
                // si spengono qui: il frontend le legge da app.nodeOutputs, che e' lo stesso oggetto di msg.
                if (msg && msg.images && !val("image_preview", false)) { delete msg.images; node.images = undefined; node.imgs = undefined; }
                const r = origExecuted ? origExecuted.apply(this, arguments) : undefined;
                if (msg && msg.preview && preview) { preview.value = String(msg.preview[0]); node.setDirtyCanvas(true, true); }
                return r;
            };

            layout();
            return ret;
        };
    },
});
