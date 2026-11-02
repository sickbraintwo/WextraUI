import { app } from "../../scripts/app.js";
import { ensureWxStyle, wxCompactWidgets, wxFits, wxKeepSlotHidden, wxSlotHidden, wxVueRefresh, WX } from "./wxStyle.js";
import { wxCleanName } from "./wxFolder.js";
import { originOf } from "./wxReso.js";

// WSave Image (frontend 1.49+), the name you pick (variant D of the restyle, Sick 29/10): the file name is the editor.
// Under the outputs, the name as it goes on disk: the folder on its line, quiet; the subject, bright; every part as a
// piece in a dashed rounded box; the tail, faint (`_01.png` by `digits`, `_B{batch}{index}` with `write_batch`). A click
// on a part picks it (filled blue) and opens it below, one at a time; a click on the part picked shuts it. A part opens as
// a head row (≡, part N ▴, − +) over its three rows text{i} / type{i} / value{i}, with their sockets. Under the name, three
// chips for the tail: ‹ _01 › (digits 0..8, 0 = no counter), batch (write_batch), thumbnails (image_preview), their rows
// hidden; under the chips the rows `folder` and `subject` of Comfy, always there (Sick 29/10: as in variant C).
// A part shut is one row: ≡ (drag onto another part: it takes that place, values and cables follow), one box
// text · type · value (text and value typed with a click, the type turns int → float → bool → string with a click), − + .
// A field on a cable keeps its socket on the row of its part (or of the name), and says the node it comes from, in blue;
// a part bound to a node ({#id}, from `from Wnodes on graph`) says that node, in blue, locked.
// What is open lives in node.properties.wx_open (the part's number), not in the graph.
// folder / subject / text{i} / value{i} on a cable: the name reads the value upstream when the source node keeps it in a
// widget (Primitive, String, Int...), also through Reroute and Set / Get; otherwise what it brought in the last run (the
// backend sends the fields with the name), and before any run {folder} / {subject} / {int}.
// Backend (src/saveWimage.py, unchanged): for every part i = text{i}, type{i}, value{i} (text widgets whose socket takes
// any cable: here the slot of value{i} is set to type "*"). The number of parts lives in the hidden widget "parts".
const MAX_PARTS = 10;   // 8 until 0.7.1: a file saved then, without names, is read again in onConfigure (below)
const OLD_8_VALUES = 5 + 3 * 8 + 2;   // preview, folder, subject, digits, parts · 8 parts · write_batch, image_preview
// ---- the placeholder {#id} = the value of that WextraUI node at this run (src/saveWimage.py resolves it from the
// PROMPT; here the preview resolves it from the graph, and `from Wnodes on graph` proposes the nodes found) ----
const NODE_VALUE = { wxSampler: "sampler_name", wxScheduler: "scheduler", wxCheckpointLoader: "ckpt_name", wxLoraLoaderTrigger: "lora_name", wxFloat: "value", wxSeed: "value", wxSwitch: "on_", wxFrame: "ops" };
const NODE_KIND = { wxFloat: "float", wxSeed: "int" };
// the text of a part made by `from Wnodes on graph`: a short tag for the type, or for the input the node feeds (a WInt🌱 on
// a `seed`, a WFloat on a `cfg`, through Reroute and Set / Get); otherwise the node's name
const TYPE_TAG = { wxSampler: "_sa_", wxScheduler: "_sc_", wxFrame: "_fr_", wxCheckpointLoader: "_C_", wxLoraLoaderTrigger: "_L_" };   // _C_ / _L_: Sick, 08/10
const INPUT_TAG = { seed: "_S_", noise_seed: "_S_", cfg: "_cfg_", steps: "_st_" };
const BARE = ["wxCheckpointLoader", "wxLoraLoaderTrigger"];
const IDREF = /\{#([\d:]+)\}/g, ONE_IDREF = /^\{#([\d:]+)\}$/;
const TYPES = ["int", "float", "bool", "string"];   // the order the type of a shut part turns in (src/saveWimage.py TYPES)
const PARK = -10000;   // the y of the socket of a hidden widget with no cable: out of the node, where no pointer finds it
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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
      .wx-fg-pop label .g { color: #666; font-size: 11px; padding-left: 6px; }
      .wx-fg-pop h6 { margin: 5px 10px 1px; font-size: 11px; font-weight: 600; color: #999; }
      .wx-fg-pop input { margin: 0; accent-color: #1464b3; }
      .wx-fg-pop .wx-muted { padding: 2px 10px; display: block; color: #777; }`;
    document.head.appendChild(st);
}
// The DOM parts of the node (the name, the rows of the parts, + part, the button): the mockup's variant D
// (Mockup/WSaveImage, 29/10). On the canvas the colours of the rows are LiteGraph's (set on the element as --wx-*), in
// Nodes 2.0 the theme's; the tones come from the ink by transparency, so they sit on any node colour and flip with the
// theme. On the canvas a DOM widget is drawn 10 px in from the node and from its slot (margin 10): top -10 / 5 px each
// side bring it to the rows' edges (15 px), as the head rows of WLoRA Stack; its height is its own (the frontend gives the
// element h-full, the height of a slot that is 20 px short).
function ensureSvStyle() {
    if (document.getElementById("wx-sv-style")) return;
    const st = document.createElement("style"); st.id = "wx-sv-style";
    st.textContent = `
      .wx-sv { --x-ink: var(--wx-ink, #ddd); --x-blue: ${WX.light}; --x-deep: ${WX.deep}; --x-accent: ${WX.accent};
        --x-quiet: color-mix(in srgb, var(--x-ink) 58%, transparent); --x-faint: color-mix(in srgb, var(--x-ink) 36%, transparent);
        --x-well: color-mix(in srgb, var(--x-ink) 8%, transparent); --x-line: color-mix(in srgb, var(--x-ink) 22%, transparent);
        display: flow-root; box-sizing: border-box; position: relative; top: -10px; width: calc(100% - 10px) !important; height: auto !important; margin: 0 5px;
        font: 12.5px Inter, Arial, sans-serif; color: var(--x-ink); user-select: none; }
      .wx-sv.vue { --wx-ink: var(--component-node-foreground, #ddd); --wx-box: var(--component-node-widget-background, #313235);
        --wx-label: var(--node-component-slot-text, #a0a0a0); --wx-val: var(--component-node-foreground, #fff);
        top: 0; width: auto !important; margin: 0; font: 12px Inter, Arial, sans-serif; }
      .wx-sv * { box-sizing: border-box; }
      .wx-sv button { font: inherit; border: 0; padding: 0; margin: 0; background: none; color: inherit; cursor: pointer; }
      .wx-sv button:focus-visible, .wx-sv input:focus-visible { outline: 2px solid var(--x-accent); outline-offset: 1px; }
      .wx-sv input.ed { min-width: 0; width: 100%; height: 16px; border: 0; border-radius: 4px; padding: 0 4px; font: inherit; background: transparent;
        color: inherit; box-shadow: inset 0 0 0 1px var(--x-accent); outline: none; }
      /* the name: the folder on its line, quiet; the name bright; breaks only where it has to */
      .wx-sv .pv2 { margin: 10px 0 8px; padding: 4px 6px 5px; border-radius: 6px; background: var(--x-well);
        font: 10.5px/20px Consolas, ui-monospace, monospace; color: var(--x-blue); overflow-wrap: anywhere; }
      .wx-sv.vue .pv2 { margin: 6px 0 7px; border-radius: 8px; background: var(--secondary-background, #1a1a1a); }
      .wx-sv .pv2 .pn { line-height: 21px; }
      .wx-sv .pv2 .pb { color: var(--x-quiet); white-space: nowrap; }
      .wx-sv .pv2 .pt { color: var(--x-faint); white-space: nowrap; }
      .wx-sv .tok { padding: 0 2px; border-radius: 3px; line-height: inherit; text-align: left; overflow-wrap: anywhere; }
      .wx-sv .tok:hover { background: color-mix(in srgb, var(--x-accent) 22%, transparent); }
      .wx-sv .pv2 .pf { color: var(--x-quiet); }
      .wx-sv .pv2 .su { color: var(--x-ink); }
      /* the parts in the name: a rounded box with a dashed line only; the piece picked filled in blue (Sick 29/10) */
      .wx-sv .tok.pa { margin: 0 1px; padding: 0 3px; border-radius: 5px; color: var(--x-blue); background: transparent;
        outline: 1px dashed color-mix(in srgb, var(--x-blue) 55%, transparent); outline-offset: -1px; }
      .wx-sv .tok.pa:hover { outline-color: var(--x-blue); background: transparent; }
      .wx-sv .tok.pa.open { outline: 1px solid var(--x-accent); outline-offset: -1px; background: var(--x-deep); color: var(--x-blue); }
      .wx-sv .tok.over { outline: 1px solid var(--x-blue); }
      /* the tail of the name as three chips under it */
      .wx-sv .tail { display: flex; align-items: center; gap: 4px; height: 20px; margin: -2px 0 8px; font: 11.5px Inter, "Segoe UI", Arial, sans-serif; }
      .wx-sv.vue .tail { margin: -1px 0 4px; height: 22px; }   /* + the 4 px gap of the grid */
      .wx-sv .chip2 { display: inline-flex; align-items: center; height: 18px; padding: 0 8px; border-radius: 9px; color: var(--x-quiet);
        box-shadow: inset 0 0 0 1px var(--x-line); white-space: nowrap; }
      .wx-sv .chip2:hover { box-shadow: inset 0 0 0 1px var(--x-accent); }
      .wx-sv .chip2.on { background: var(--x-deep); color: var(--x-blue); box-shadow: none; }
      .wx-sv .chip2.cab { cursor: default; color: var(--x-blue); box-shadow: inset 0 0 0 1px var(--x-line); }
      .wx-sv .chip2.cnt { padding: 0 2px; gap: 1px; color: var(--x-blue); font-family: Consolas, ui-monospace, monospace; font-size: 11px; cursor: default; }
      .wx-sv .chip2.cnt button { width: 14px; height: 18px; color: var(--x-faint); font: 13px/18px Inter, Arial, sans-serif; }
      .wx-sv .chip2.cnt button:hover { color: var(--x-blue); }
      /* a part shut: the handle, one box with text · type · value, then − and + */
      .wx-sv .prow { display: flex; align-items: center; height: 20px; margin: 0; gap: 3px; position: relative; }
      .wx-sv.vue .prow { height: 24px; margin: 0; }
      .wx-sv .grip { width: 12px; flex: none; color: var(--x-faint); font: 12px sans-serif; cursor: grab; touch-action: none; }
      .wx-sv .grip:hover, .wx-sv .grip.lift { color: var(--x-blue); }
      .wx-sv .pbox { flex: 1; min-width: 0; height: 100%; display: flex; align-items: stretch; border-radius: 10px; background: var(--wx-box, #222);
        box-shadow: inset 0 0 0 1px var(--wx-boxline, #666); overflow: hidden; margin-right: 2px; }
      .wx-sv.vue .pbox { border-radius: 6px; box-shadow: none; }
      .wx-sv .prow.over .pbox { box-shadow: inset 0 0 0 2px var(--x-accent); }
      .wx-sv .seg { display: flex; align-items: center; min-width: 0; padding: 0 7px; color: var(--wx-val, #ddd); white-space: nowrap; }
      .wx-sv.vue .seg { padding: 0 9px; }
      .wx-sv .seg.t { flex: 1.15; }
      .wx-sv .seg.v { flex: 1; justify-content: flex-end; }
      .wx-sv .seg.ty { flex: none; width: 40px; justify-content: center; padding: 0; color: var(--wx-label, #999); font-size: 11.5px;
        box-shadow: -1px 0 0 color-mix(in srgb, var(--wx-boxline, #666) 60%, transparent), 1px 0 0 color-mix(in srgb, var(--wx-boxline, #666) 60%, transparent); }
      .wx-sv.vue .seg.ty { width: 44px; color: var(--x-quiet); box-shadow: -1px 0 0 var(--component-node-background, #000), 1px 0 0 var(--component-node-background, #000); }
      .wx-sv .seg.ty:hover { color: var(--x-blue); }
      .wx-sv .seg .tx { min-width: 8px; overflow: hidden; text-overflow: ellipsis; cursor: text; }
      .wx-sv .seg.t .tx { flex: 1; }
      .wx-sv .seg .cab { color: var(--x-blue); cursor: default; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .wx-sv .seg.v:has(.cab), .wx-sv .seg.t:has(.cab) { flex: 3; padding: 0 5px; }
      .wx-sv .mini { flex: none; width: 14px; height: 14px; border-radius: 50%; color: var(--x-quiet); font: 12px/14px sans-serif; text-align: center;
        box-shadow: inset 0 0 0 1px var(--x-line); }
      .wx-sv.vue .mini { width: 18px; height: 18px; line-height: 18px; }
      .wx-sv .mini:hover { color: var(--x-blue); box-shadow: inset 0 0 0 1px var(--x-accent); }
      .wx-sv .mini.off { visibility: hidden; }
      /* the part open: a head row like a shut one, its three rows of Comfy under it */
      .wx-sv .prow.phead { height: 18px; }
      .wx-sv.vue .prow.phead { height: 22px; }
      .wx-sv .plab2 { flex: none; margin-left: 2px; color: var(--x-blue); font: 11px Inter, "Segoe UI", Arial, sans-serif; }
      .wx-sv.vue .plab2 { font-size: 12px; }
      .wx-sv .hair { flex: 1; height: 1px; margin: 0 6px; background: var(--x-line); }
      .wx-sv .addp { display: block; width: 100%; height: 20px; margin: 0; border-radius: 10px; color: var(--x-quiet); box-shadow: inset 0 0 0 1px var(--x-line); }
      .wx-sv.vue .addp { width: 100%; height: 24px; margin: 0; border-radius: 7px; }
      .wx-sv .addp:hover { color: var(--x-blue); box-shadow: inset 0 0 0 1px var(--x-accent); }
      /* the button sits on the rows' margins */
      .wx-sv .fg2 { display: block; width: 100%; height: 20px; margin: 0; border-radius: 10px; background: transparent;
        box-shadow: inset 0 0 0 1px var(--x-accent); color: var(--x-ink); font: 12px/20px Inter, "Segoe UI", Arial, sans-serif; text-align: center; }
      .wx-sv.vue .fg2 { width: 100%; height: 24px; margin: 0; border-radius: 7px; line-height: 24px; font-size: 13px; }
      .wx-sv .fg2:hover { background: color-mix(in srgb, var(--x-accent) 18%, transparent); }
      .wx-sv .fg2 .w { color: #e61e1e; font-weight: 600; }
      /* Nodes 2.0: the socket of a field on a cable, on the row of its part (or of the name), at the node's edge; its
         data-slot-key is the input's, so the frontend measures the cable's end there */
      .wx-sv .wsock { position: absolute; left: -16px; top: 50%; width: 8px; height: 8px; margin-top: -4px; border-radius: 50%; pointer-events: none;
        background: #aaa; box-shadow: 0 0 0 1px rgba(0,0,0,.45); z-index: 1; }
      .wx-sv .wsock.hi { margin-top: -8px; }
      .wx-sv .wsock.lo { margin-top: 0; }
      .wx-sv.vue .pf, .wx-sv.vue .pn, .wx-sv.vue .tail { position: relative; }
      .wx-sv.vue .pv2 .wsock { left: -22px; }`;
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
    if (kind === "int") { const n = Math.round(Number(v)); return Number.isFinite(n) ? String(n) : String(v); }   // a name on `int`: as it is, like the backend
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
            // the fields of the last run (onExecuted, `fields` from the backend): what a cable brought when the graph cannot
            // read it before the run (a text built by another node); in place of {subject} until the next run
            let runFields = {};
            function upstream(name) {
                const u = upstreamNow(name);
                return u === undefined && Object.prototype.hasOwnProperty.call(runFields, name) ? runFields[name] : u;
            }
            function upstreamNow(name) {
                try {
                    // through Reroute and Set / Get (originOf of wxReso.js): a Get node holds the name of its variable, not the value
                    const o = linked(name) ? originOf(node, name) : null;
                    const src = o?.node;
                    if (!src || !src.widgets || !src.widgets.length) return undefined;
                    const out = (src.outputs || [])[o.slot];
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

            // ---- {#id} from the graph: the node, its value now, its name for the rows ----
            const graphNode = (id) => { const n = Number(id); return Number.isFinite(n) && node.graph ? node.graph.getNodeById(n) : undefined; };
            const nodeValue = (n) => {
                if (!n) return undefined;
                const key = NODE_VALUE[n.type];
                if (n.type === "wxSwitch") {   // the name of the slot that is on (web/wxSwitch.js: typed, or the loader's bare name), else its number from 0
                    const lab = n.__wxLabel?.(); if (lab) return lab;
                    const i = (n.widgets || []).findIndex((x) => /^on_\d+$/.test(x.name) && x.value === true); return String(Math.max(0, i));
                }
                if (n.type === "wxFrame") return n.__wxInfo ? n.__wxInfo() : undefined;   // its `info`, as web/wxFrame.js computes it
                const w = key ? (n.widgets || []).find((x) => x.name === key) : (n.widgets || []).find((x) => x.serialize !== false && !isCtlW(x));
                if (!w || w.value === undefined || w.value === null) return undefined;
                let s = String(w.value);
                if (BARE.includes(n.type)) s = s.replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "");
                return s;
            };
            const resolveNodes = (s) => s.includes("{#") ? s.replace(IDREF, (m, id) => { const v = nodeValue(graphNode(id)); return v === undefined ? "{#" + id + "?}" : v; }) : s;
            const boundId = (i) => { const m = ONE_IDREF.exec(String(val("value" + i, ""))); return m ? m[1] : null; };
            // The name of a node for the rows and the list: the title the user gave it, else the name of the type (WSampler,
            // WCheckpoint…) — never what the node writes by itself (the value after ` · ` once collapsed: __wxBaseTitle gives
            // the name without it; the file name as the whole title, the way it was before 0.11.0).
            const typeTitle = (n) => LiteGraph.registered_node_types?.[n.type]?.title || n.type;
            const baseTitle = (n) => (n.__wxBaseTitle ? n.__wxBaseTitle() : n.title);
            const autoTitled = (n) => !!n.__wxTitleOf && baseTitle(n) === wxCleanName(n.__wxTitleOf.value);
            const nodeName = (n) => { if (!n) return ""; const t = baseTitle(n); return (t && t !== typeTitle(n) && !autoTitled(n)) ? t : typeTitle(n); };

            // `preview` stays in the schema and in widgets_values (their first value), out of view: it keeps the name composed
            // here and, after a run, the name the backend wrote (onExecuted). The name is drawn by the DOM widget `wx_name`.
            // digits / write_batch / image_preview are the chips under the name: their rows go, their values stay.
            const preview = W("preview");
            for (const nm of ["preview", "digits", "parts", "write_batch", "image_preview"]) setHidden(W(nm), true);
            if (W("parts")) wxKeepSlotHidden(node, W("parts"));   // its socket neither (it came up as an empty pin at the top)
            ensureWxStyle(); ensureSvStyle();

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

            // the name in its pieces: the folder (with its `/`), the subject, part i (its text and its value)
            const folderOut = () => { let f = resolveNodes(field("folder", "folder")).trim().replace(/\\/g, "/"); if (f && !f.endsWith("/")) f += "/"; return f; };
            const subjectOut = () => resolveNodes(field("subject", "subject"));
            function partOut(i) {
                const k = String(val("type" + i, "int"));
                let v;
                if (linked("value" + i)) { const u = upstream("value" + i); v = (u === undefined || u === null) ? "{" + k + "}" : fmt(u, k); }
                else { const s = resolveNodes(String(val("value" + i, "") ?? "")); v = /\{#[\d:]+\?\}/.test(s) ? s : fmt(s, k); }
                return resolveNodes(field("text" + i, "text")) + v;
            }
            function compose() {
                let name = subjectOut();
                for (let i = 1, n = count(); i <= n; i++) name += partOut(i);
                if (val("write_batch", false)) name += "_B{batch}{index}";
                return folderOut() + name;
            }
            let lastComposed = null, lastRun = "";
            function refresh() {
                lastComposed = compose();
                if (preview) preview.value = lastComposed;
                render();
                node.setDirtyCanvas(true, true);
            }
            // Il callback dei widget non scatta sempre (testo a riga singola, Nodes 2.0, valori che cambiano a monte):
            // a ogni ridisegno, e a intervalli, si ricompone il nome e si aggiorna solo se e' cambiato.
            // After a run `preview` keeps the name the backend wrote (onExecuted) until a field changes; the name says it on hover.
            // a part bound to a node ({#id}) keeps its value: the box is locked, so the link cannot be lost by a slip (remove the
            // part with − to let it go)
            const lock = () => { for (let i = 1, n = count(); i <= n; i++) { const w = W("value" + i); if (w) w.disabled = !!boundId(i); } };
            function watch() {
                lock();
                if (lastComposed !== null && compose() !== lastComposed) refresh(); else render();
                sockets(); fitName();
            }

            // ---- what is open: the number of a part, or nothing; in node.properties, not in the graph. A "folder" / "subject"
            // left by the first build of D (29/10, when they opened from the name) reads as nothing open ----
            const openNow = () => {
                const o = node.properties?.wx_open;
                const k = typeof o === "number" || (typeof o === "string" && /^\d+$/.test(o)) ? Number(o) : NaN;
                return o != null && Number.isInteger(k) && k >= 1 && k <= count() ? k : null;
            };
            const setOpen = (o) => { node.properties = node.properties || {}; if (o == null) delete node.properties.wx_open; else node.properties.wx_open = o; };
            const remapOpen = (fn) => { const o = openNow(); if (typeof o === "number") setOpen(fn(o)); };
            function pick(o) { setOpen(openNow() === o ? null : o); layout(); }   // one at a time; the piece picked again shuts

            function layout() {
                const n = count(), op = openNow();
                for (let i = 1; i <= MAX_PARTS; i++) {
                    const on = i <= n;
                    for (const f of FIELDS) setHidden(W(f + i), !(on && op === i));   // the three rows of Comfy: the part open only
                    if (rows[i]) setHidden(rows[i].w, !on);
                    if (on) anySlot(i);
                    else if (linked("value" + i)) {      // parte tolta: stacca il cavo, niente link nel vuoto
                        const idx = node.inputs.findIndex((s) => s.name === "value" + i);
                        if (idx >= 0) node.disconnectInput(idx);
                    }
                }
                setHidden(wAdd, n > 0);
                sockets();
                refresh();
                fitName(true);
                if (LiteGraph.vueNodesMode) wxVueRefresh(node);   // Nodes 2.0 reads the rows shown again now, not at its next tick
                // the cables are drawn before the sockets are parked in this frame: drawn again once they are (as WLoRA Stack)
                setTimeout(() => node.setDirtyCanvas(true, true), 60);
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

            // The parts: − (this part goes, the parts after it move up) and + (a new part right below, the parts after it
            // move down) on every row, the handle ≡ to reorder. Values and cables follow.
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
                remapOpen((o) => (o === i ? null : o > i ? o - 1 : o));   // the part open goes with it, or moves up with the others
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
                setOpen(i + 1);   // the new part opens, its rows ready for a value or a cable (as in the mockup)
                layout();
            }
            // a part dragged by the handle ≡ of its bar takes the place of the part it is dropped on (the ones between
            // move one up or down); values and cables follow, as with − and +
            const stashPart = (i) => {   // the part's values and the sources of its cables, the cables unplugged
                const s = { v: {}, l: {} };
                for (const f of FIELDS) {
                    const w = W(f + i); s.v[f] = w ? w.value : DEFAULTS[f];
                    const k = inputIdx(f + i), l = k >= 0 ? getLink(node.inputs[k].link) : null;
                    if (l) { s.l[f] = { src: node.graph.getNodeById(l.origin_id), oslot: l.origin_slot }; node.disconnectInput(k); }
                }
                return s;
            };
            const restorePart = (i, s) => {
                for (const f of FIELDS) {
                    const w = W(f + i); if (w) w.value = s.v[f];
                    unplug(f + i);
                    const l = s.l[f]; if (!l?.src) continue;
                    if (f === "value") anySlot(i);
                    const kt = inputIdx(f + i);
                    if (kt >= 0) LiteGraph.LGraphNode.prototype.connect.call(l.src, l.oslot, node, kt);   // as in movePart: the scanner reads the bare call as a socket
                }
            };
            function reorderPart(from, to) {
                const n = count();
                if (from === to || from < 1 || to < 1 || from > n || to > n) return;
                const s = stashPart(from);
                if (from < to) for (let j = from; j < to; j++) movePart(j + 1, j);
                else for (let j = from; j > to; j--) movePart(j - 1, j);
                restorePart(to, s);
                // the part open stays open where it lands
                remapOpen((o) => (o === from ? to : from < to && o > from && o <= to ? o - 1 : from > to && o >= to && o < from ? o + 1 : o));
                layout();
            }
            // ---- the DOM parts: the name (with the chips of the tail), one row per part, `+ part`, the button ----
            const mkDom = (name, el, before) => {
                const w = node.addDOMWidget(name, "custom", el, { serialize: false, hideOnZoom: false, getValue: () => "", setValue: () => {} });
                w.serialize = false;   // no slot in widgets_values (see wxCompactWidgets)
                node.widgets.splice(node.widgets.indexOf(w), 1);
                const k = before ? node.widgets.indexOf(before) : -1;
                node.widgets.splice(k >= 0 ? k : node.widgets.length, 0, w);
                el.addEventListener("pointerdown", (e) => e.stopPropagation());
                return w;
            };
            const nameEl = document.createElement("div"); nameEl.className = "wx-sv wx-sv-name";
            const wName = mkDom("wx_name", nameEl, preview || W("folder"));
            let nameH = 92;   // its height, measured from the DOM (fitName): the name wraps with the width of the node
            wName.computeSize = (width) => [width, nameH];
            const rows = {};   // i -> { w, el }: the row of part i (shut: one box; open: its head over its three rows)
            for (let i = 1; i <= MAX_PARTS; i++) {
                const first = W("text" + i);
                if (!first) continue;
                const el = document.createElement("div"); el.className = "wx-sv wx-sv-row"; el.dataset.part = String(i);
                const w = mkDom("wx_part" + i, el, first);
                w.computeSize = (width) => [width, i > count() ? -4 : openNow() === i ? 18 : 20];
                el.addEventListener("pointerdown", (e) => { if (e.target.closest(".grip")) { e.preventDefault(); startDrag(i); } });
                el.addEventListener("click", (e) => {
                    const b = e.target.closest("[data-act]");
                    if (!b || !el.contains(b) || e.target.matches?.("input.ed")) return;
                    e.stopPropagation();
                    const a = b.dataset.act;
                    if (a === "type") turnType(i);
                    else if (a === "edit") startEdit(i, b.dataset.f);
                    else if (a === "rm") removePart(i);
                    else if (a === "ins") insertPart(i);
                    else if (a === "pick") pick(i);   // `part N ▴` of the part open: shut it
                    changed();
                });
                // the box typed in: Enter / leaving it keeps the text, Escape drops it; no key reaches Comfy's shortcuts
                for (const t of ["keydown", "keyup", "keypress"]) el.addEventListener(t, (e) => {
                    if (!e.target.matches?.("input.ed")) return;
                    e.stopPropagation();
                    if (t === "keydown" && e.key === "Enter") endEdit(true); else if (t === "keydown" && e.key === "Escape") endEdit(false);
                });
                el.addEventListener("focusout", (e) => { if (e.target.matches?.("input.ed")) endEdit(true); });
                rows[i] = { w, el };
            }
            // `+ part`: only while there are no parts (from the first part on, the + of the rows does the job); the part opens
            const addEl = document.createElement("div"); addEl.className = "wx-sv wx-sv-add";
            addEl.innerHTML = `<button class="addp" title="A first part: a fixed text and a value after the subject">+ part</button>`;
            const wAdd = mkDom("wx_add_part", addEl);
            wAdd.computeSize = (width) => [width, count() ? -4 : 20];
            addEl.addEventListener("click", (e) => { e.stopPropagation(); if (count()) return; setOpen(1); setCount(1); changed(); });

            // the type of a shut part turns int → float → bool → string → int; text and value are typed in the row itself
            function turnType(i) {
                const w = W("type" + i);
                if (!w || linked("type" + i)) return;
                w.value = TYPES[(TYPES.indexOf(String(w.value)) + 1) % TYPES.length];
                w.callback?.(w.value, app.canvas, node);
                refresh();
            }
            let editing = null;   // "t3" / "v3" while the text or the value of part 3 is typed in its row
            function startEdit(i, f) {
                const nm = (f === "t" ? "text" : "value") + i;
                if (!W(nm) || linked(nm) || (f === "v" && boundId(i))) return;
                if (editing) endEdit(true);
                editing = f + i;
                render(true);
                const inp = rows[i]?.el.querySelector("input.ed");
                if (inp) { inp.focus(); inp.select(); }
            }
            function endEdit(keep) {
                if (!editing) return;
                const f = editing[0], i = Number(editing.slice(1)), inp = rows[i]?.el.querySelector("input.ed"), w = W((f === "t" ? "text" : "value") + i);
                editing = null;
                if (keep && inp && w && w.value !== inp.value) { w.value = inp.value; w.callback?.(w.value, app.canvas, node); changed(); }
                refresh();
                render(true);
            }
            // a value set from here is a change of the workflow: the tracker looks now (undo, the * of the tab)
            const changed = () => { try { app.extensionManager?.workflow?.activeWorkflow?.changeTracker?.checkState?.(); } catch (e) { /* no tracker: nothing to tell */ } };
            const setVal = (nm, v) => { const w = W(nm); if (!w || linked(nm)) return; w.value = v; w.callback?.(v, app.canvas, node); refresh(); changed(); };
            const digitsNow = () => { const u = linked("digits") ? upstream("digits") : undefined; const d = Math.round(Number(u ?? val("digits", 2))); return Number.isFinite(d) ? Math.max(0, Math.min(8, d)) : 2; };
            nameEl.addEventListener("click", (e) => {
                const b = e.target.closest("[data-act]");
                if (!b || !nameEl.contains(b)) return;
                e.stopPropagation();
                const a = b.dataset.act, k = b.dataset.k;
                if (a === "pick") pick(Number(k));
                else if (a === "digits") setVal("digits", Math.max(0, Math.min(8, digitsNow() + Number(b.dataset.d))));
                else if (a === "tog") setVal(k, !val(k, false));
            });

            // ---- the order: drag a part by its ≡ onto another part (its row or its piece in the name): it takes that place ----
            let drag = null;   // { from, to } while a part is dragged
            const partAtPoint = (e) => {
                const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-part]");
                if (!el || ![nameEl, ...Object.values(rows).map((r) => r.el)].some((o) => o.contains(el))) return 0;
                const k = Number(el.dataset.part);
                return k >= 1 && k <= count() ? k : 0;
            };
            const marks = () => {
                for (const [k, r] of Object.entries(rows)) {
                    r.el.querySelector(".prow")?.classList.toggle("over", !!drag && Number(k) === drag.to && drag.to !== drag.from);
                    r.el.querySelector(".grip")?.classList.toggle("lift", !!drag && Number(k) === drag.from);
                }
                for (const t of nameEl.querySelectorAll(".tok.pa")) t.classList.toggle("over", !!drag && Number(t.dataset.part) === drag.to && drag.to !== drag.from);
            };
            function startDrag(from) {
                if (drag || count() < 2 || from > count()) return;
                if (editing) endEdit(true);
                drag = { from, to: from }; marks();
                const move = (e) => { const t = partAtPoint(e); if (t && t !== drag.to) { drag.to = t; marks(); } };
                const up = () => {
                    for (const [t, f] of [["pointermove", move], ["pointerup", up], ["pointercancel", up]]) document.removeEventListener(t, f, true);
                    const d = drag; drag = null; marks();
                    if (d.to !== d.from) { reorderPart(d.from, d.to); changed(); }
                };
                for (const [t, f] of [["pointermove", move], ["pointerup", up], ["pointercancel", up]]) document.addEventListener(t, f, true);
            }

            // ---- what the DOM says ----
            const linkOf = (nm) => { const s = slot(nm); return s?.link != null ? getLink(s.link) : null; };
            const originName = (nm) => { const l = linkOf(nm), src = l ? node.graph?.getNodeById(l.origin_id) : null; return src ? nodeName(src) : "cable"; };
            // hidden by this node (options.hidden, see setHidden): `hidden` alone also reads true for a widget on a cable
            const offView = (w) => !w || !!w.options?.hidden;
            const hiddenNow = (nm) => offView(W(nm));
            // Nodes 2.0: the socket of a hidden field on a cable, drawn in our row at the node's edge; its data-slot-key is the
            // input's, so the frontend measures the end of the cable on it (syncSlotOffsets reads every [data-slot-key])
            const vueDots = (names) => {
                const on = names.filter((nm) => linked(nm) && hiddenNow(nm));
                return on.map((nm, k) => {
                    const pos = on.length > 1 ? (k === 0 ? " hi" : k === on.length - 1 ? " lo" : "") : "";
                    return `<span class="wsock${pos}" data-slot-key="${node.id}-in-${inputIdx(nm)}"></span>`;
                }).join("");
            };
            // Nodes 2.0 draws a field hidden here as a row of its own (its name and its socket) while a cable is on it: that
            // row goes (the socket is the one drawn in our row, the frontend measures that one), and the gap of the grid it
            // leaves (4 px) is taken back under our row above it
            let hideCss = null;
            function vueRows(vue) {
                const gone = vue ? (node.widgets || []).filter((w) => offView(w) && slot(w.name) && linked(w.name)).map((w) => w.name) : [];
                const css = gone.map((nm) => `[data-node-id="${node.id}"] [data-widget-name="${nm}"] { display: none !important; }`).join("\n");
                if (css && !hideCss) { hideCss = document.createElement("style"); hideCss.dataset.wx = "saveWimage"; document.head.appendChild(hideCss); }
                if (hideCss && hideCss.textContent !== css) {
                    hideCss.textContent = css;
                    // the frontend measures the sockets again when the grid of the rows changes size: with the gap taken back it
                    // does not, and the cable would stay where the row was. One pixel more for a moment, then back.
                    nameEl.style.paddingBottom = "1px";
                    setTimeout(() => { nameEl.style.paddingBottom = ""; }, 60);
                }
                const pull = new Map();
                let last = null;
                for (const w of node.widgets || []) {
                    if (!offView(w)) last = w;
                    else if (gone.includes(w.name) && last?.element) pull.set(last.element, (pull.get(last.element) || 0) + 1);
                }
                for (const el of [nameEl, addEl, fgEl, ...Object.values(rows).map((r) => r.el)]) {
                    const m = pull.get(el) ? -4 * pull.get(el) + "px" : "";
                    if (el.style.marginBottom !== m) el.style.marginBottom = m;
                }
            }
            const tailOf = (d) => (d ? "_" + "1".padStart(d, "0") : "");
            function nameHtml(vue) {
                const op = openNow(), n = count(), f = folderOut(), su = subjectOut(), d = digitsNow();
                const dots = (names) => (vue ? vueDots(names) : "");
                let h = `<div class="pv2"${lastRun ? ` title="${esc("last saved: " + lastRun)}"` : ""}>`;
                // the folder and the subject are plain text: their rows are under the chips (variant C)
                if (f) h += `<div class="pf">${esc(f)}</div>`;
                h += `<div class="pn">${su ? `<span class="su">${esc(su)}</span>` : ""}`;
                for (let i = 1; i <= n; i++) {
                    h += `<button class="tok pa${op === i ? " open" : ""}" data-act="pick" data-k="${i}" data-part="${i}" title="part ${i}: click to ${op === i ? "shut it" : "open it below"}">${esc(partOut(i)) || "·"}</button>`;
                }
                if (val("write_batch", false)) h += `<span class="pb">_B{batch}{index}</span>`;
                h += `<span class="pt">${tailOf(d)}.png</span></div></div>`;
                const chip = (k, label, title) => `<button class="chip2${val(k, false) ? " on" : ""}${linked(k) ? " cab" : ""}" data-act="${linked(k) ? "" : "tog"}" data-k="${k}" title="${esc(title)}">${label}</button>`;
                h += `<div class="tail">${dots(["digits", "write_batch", "image_preview", "preview"])}`
                    + `<span class="chip2 cnt${linked("digits") ? " cab" : ""}" title="digits: the counter after the name (0 = none, the file is overwritten)">`
                    + `<button data-act="digits" data-d="-1" aria-label="fewer digits">‹</button><span>${d ? tailOf(d) : "no counter"}</span><button data-act="digits" data-d="1" aria-label="more digits">›</button></span>`
                    + chip("write_batch", "batch", "write_batch: _B{batch}{index} at the end of the name")
                    + chip("image_preview", "thumbnails", "image_preview: the saved images inside the node after the run") + `</div>`;
                return h;
            }
            function rowHtml(i, vue) {
                const n = count();
                const grip = `<button class="grip" data-act="grip" title="Drag onto another part: it takes that place, the ones between move">≡</button>`;
                const minis = `<button class="mini" data-act="rm" title="Remove this part (the parts after it move up)">−</button>`
                    + `<button class="mini${n >= MAX_PARTS ? " off" : ""}" data-act="ins" title="A new part right below">+</button>`;
                if (openNow() === i) return `<div class="prow phead">${grip}<button class="plab2" data-act="pick" title="Shut it: back to one row">part ${i} ▴</button><span class="hair"></span>${minis}</div>`;
                const bid = boundId(i), bn = bid ? graphNode(bid) : null;
                const cab = (nm, text, title) => `<span class="cab" title="${esc(title)}">${esc(text)}</span>`;
                const box = (f, nm, title) => (editing === f + i
                    ? `<input class="ed" value="${esc(val(nm, ""))}" spellcheck="false">`
                    : `<span class="tx">${esc(val(nm, "")) || "&nbsp;"}</span>`);
                const lt = linked("text" + i), lv = linked("value" + i);
                const t = lt ? cab("text" + i, originName("text" + i), `text${i} on a cable from that node: open the part from the name to unplug it`) : box("t", "text" + i);
                const v = lv ? cab("value" + i, originName("value" + i), `value${i} on a cable from that node: open the part from the name to unplug it`)
                    : bid ? cab("value" + i, bn ? nodeName(bn) : "#" + bid + "?", `value${i} = the value of that node at the run ({#${bid}}): − lets it go`)
                    : box("v", "value" + i);
                const segT = lt ? `<span class="seg t">` : `<span class="seg t" data-act="edit" data-f="t" title="text${i}: the fixed text in front of the value (click to type)">`;
                const segV = lv || bid ? `<span class="seg v">` : `<span class="seg v" data-act="edit" data-f="v" title="value${i}: type it, or open the part from the name and plug a cable">`;
                return `<div class="prow">${vue ? vueDots(["text" + i, "type" + i, "value" + i]) : ""}${grip}<div class="pbox">${segT}${t}</span>`
                    + `<button class="seg ty" data-act="type" title="type${i}: how the value turns into text (click: the next one)">${esc(val("type" + i, "int"))}</button>`
                    + `${segV}${v}</span></div>${minis}</div>`;
            }
            // the colours of the rows on the canvas are LiteGraph's (the theme's palette); Nodes 2.0 has its own (the CSS)
            const PALETTE = [["--wx-box", "WIDGET_BGCOLOR"], ["--wx-boxline", "WIDGET_OUTLINE_COLOR"], ["--wx-val", "WIDGET_TEXT_COLOR"], ["--wx-label", "WIDGET_SECONDARY_TEXT_COLOR"], ["--wx-ink", "WIDGET_TEXT_COLOR"]];
            const dress = (el, vue) => {
                el.classList.toggle("vue", vue);
                for (const [v, k] of PALETTE) {
                    const want = vue || !LiteGraph[k] ? "" : String(LiteGraph[k]);
                    if (el.style.getPropertyValue(v) !== want) { if (want) el.style.setProperty(v, want); else el.style.removeProperty(v); }
                }
            };
            const put = (el, html, vue) => { dress(el, vue); if (el.__wxHtml !== html) { el.__wxHtml = html; el.innerHTML = html; } };
            // everything the DOM shows, written again only where it changed; a row being typed in is left alone (force: it too)
            function render(force) {
                if (drag) return;   // the marks of the drag stay where they are
                const vue = !!LiteGraph.vueNodesMode;
                put(nameEl, nameHtml(vue), vue);
                for (const [k, r] of Object.entries(rows)) {
                    const i = Number(k);
                    if (i > count()) continue;
                    if (!force && editing && Number(editing.slice(1)) === i) continue;
                    put(r.el, rowHtml(i, vue), vue);
                }
                dress(addEl, vue); dress(fgEl, vue);
                vueRows(vue);
            }
            // the height of the name: measured when the box is laid out (in view, its width real), again when it changes
            function fitName(force) {
                const w = nameEl.offsetWidth, h = nameEl.offsetHeight;
                let grew = false;
                if (!LiteGraph.vueNodesMode && w >= 100 && h > 20 && Math.abs(h - 4 - nameH) > 0.5) { nameH = h - 4; grew = true; }
                if (!force && !grew) return;
                const sz = node.computeSize();
                node.setSize([Math.max(node.size[0], sz[0]), sz[1]]);
                node.setDirtyCanvas(true, true);
            }

            // ---- the sockets of the hidden fields: with no cable neither drawn nor a target (and out of the node, where no
            // pointer finds them); on a cable, drawn on the row of their part, or of the name (the tail's on the chips;
            // line, the tail's on the chips). On the canvas the frontend puts a socket at the height of its widget (y + half a
            // slot) at every draw, hidden widgets included: their y is moved there (as `park()` in WLoRA Stack) ----
            const SOCKETED = () => ["preview", "digits", "write_batch", "image_preview"].concat(...Array.from({ length: MAX_PARTS }, (_, k) => FIELDS.map((f) => f + (k + 1))));
            const lineY = (sel, dflt) => { const e = nameEl.querySelector(sel); return e && e.offsetHeight ? e.offsetTop + e.offsetHeight / 2 : dflt; };
            function sockets() {
                const half = (LiteGraph.NODE_SLOT_HEIGHT || 20) * 0.5;
                const parked = {};   // anchor widget name -> [[widget, centre in the anchor]]
                for (const nm of SOCKETED()) {
                    const w = W(nm);
                    if (!w) continue;
                    const m = /^(text|type|value)(\d+)$/.exec(nm), i = m ? Number(m[2]) : 0;
                    if (!offView(w)) { wxSlotHidden(node, w, false); continue; }
                    if (!linked(nm) || (i && i > count())) { wxSlotHidden(node, w, true); w.y = PARK; continue; }
                    wxSlotHidden(node, w, false);
                    const [anchor, centre] = i ? [rows[i]?.w, 10]
                        : [wName, lineY(".tail", nameH - 10)];
                    if (!anchor) { w.y = PARK; continue; }
                    (parked[anchor.name + ":" + Math.round(centre)] ??= { anchor, list: [] }).list.push([w, centre]);
                }
                for (const { anchor, list } of Object.values(parked)) {
                    // more than one on the same row: one above the other, 8 px apart (text above value)
                    list.forEach(([w, c], k) => { w.y = (anchor.y ?? PARK) + c - half + (k - (list.length - 1) / 2) * 8; });
                }
            }
            // ---- `from Wnodes on graph`: the WextraUI nodes of the graph, ticked = a part each, bound with {#id} ----
            let fgPop = null;
            const closeFg = () => { if (fgPop) { fgPop.remove(); fgPop = null; } };
            const ctlOf = (n) => (n.widgets || []).find(isCtlW);
            const walks = (n) => { if (n.__wxCarry?.driven?.()) return "on carry"; const c = ctlOf(n); return c && c.value && c.value !== "fixed" ? "walks" : "fixed"; };
            const hops = (n, d = 0) => { const ds = n.__wxCarry?.downstream?.() || []; return !ds.length || d > 12 ? 0 : 1 + Math.max(...ds.map((x) => hops(x, d + 1))); };
            const bound = () => { const b = {}; for (let i = 1, n = count(); i <= n; i++) { const id = boundId(i); if (id) b[id] = i; } return b; };
            const byName = (a, b) => nodeName(a.n).localeCompare(nodeName(b.n)) || a.n.id - b.n.id;
            const byType = (a, b) => typeTitle(a.n).localeCompare(typeTitle(b.n)) || byName(a, b);
            const found = () => (node.graph?._nodes || node.graph?.nodes || []).filter((n) => n !== node && NODE_VALUE[n.type]).map((n) => ({ n, id: String(n.id), how: walks(n), hops: hops(n) })).sort(byType);   // by type, then by name
            // the inputs a node's value reaches (`seed`, `cfg`…), through Reroute and Set / Get (KJNodes), the carry cable left out
            const feeds = (n) => {
                const g = n.graph; if (!g) return [];
                const nodes = g._nodes || g.nodes || [], seen = new Set(), out = [];
                const linkOf = (id) => g.links instanceof Map ? g.links.get(id) : g.getLink ? g.getLink(id) : g.links?.[id];
                const constOf = (x) => x?.widgets?.[0]?.value;
                const walk = (links, hops) => {
                    if (hops > 12) return;
                    for (const id of links || []) {
                        const l = linkOf(id), t = l ? g.getNodeById(l.target_id) : null;
                        if (!t || seen.has(t.id + ":" + l.target_slot)) continue;
                        seen.add(t.id + ":" + l.target_slot);
                        if (t.type === "Reroute") walk(t.outputs?.[0]?.links, hops + 1);
                        else if (t.type === "SetNode") for (const gt of nodes) { if (gt.type === "GetNode" && constOf(gt) === constOf(t)) walk(gt.outputs?.[0]?.links, hops + 1); }
                        else { const nm = t.inputs?.[l.target_slot]?.name; if (nm) out.push(String(nm)); }
                    }
                };
                for (const o of n.outputs || []) if (o.name !== "carry") walk(o.links, 0);
                return out;
            };
            const tagOf = (n) => TYPE_TAG[n.type] || (NODE_KIND[n.type] ? feeds(n).map((nm) => INPUT_TAG[nm.toLowerCase()]).find(Boolean) : undefined) || null;
            const textFor = (n) => tagOf(n) || nodeName(n).replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, "").trim() || "_";   // the tag, else the node's name, no icon
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
                        const tag = tagOf(r.n);   // the text the part will have, when it is a tag (`_sa_`, `_S_`…)
                        const h = document.createElement("span"); h.className = "h"; h.textContent = (tag ? tag + " · " : "") + "#" + r.id + " · " + (b[r.id] ? "part " + b[r.id] : r.how); lab.appendChild(h);
                        if (on) {   // ticked: a number (its place in the name), a handle, drag to reorder
                            const g = document.createElement("span"); g.className = "g"; g.textContent = "≡"; lab.appendChild(g);
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
                    if (rest.length) {   // the others by type, the type above its group
                        const h = document.createElement("h5"); h.textContent = t.length ? "others" : "found — tick to add"; body.appendChild(h);
                        let last = null;
                        for (const r of rest) {
                            if (r.n.type !== last) { last = r.n.type; const g = document.createElement("h6"); g.textContent = "— " + typeTitle(r.n); body.appendChild(g); }
                            body.appendChild(rowOf(r, false, -1));
                        }
                    }
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
                const off = (e) => { if (pop.contains(e.target) || fgEl.contains(e.target)) return; document.removeEventListener("pointerdown", off, true); document.removeEventListener("keydown", key, true); if (fgPop === pop) closeFg(); };
                const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); off({ target: document.body }); } };
                setTimeout(() => { document.addEventListener("pointerdown", off, true); document.addEventListener("keydown", key, true); }, 0);
            };
            // the button under the parts, as wide as the rows, the W in the red of the wordmark; HTML, so it is the same in
            // both renderers
            const fgEl = document.createElement("div"); fgEl.className = "wx-sv wx-sv-btn";
            fgEl.innerHTML = `<button class="fg2" title="Lists the WextraUI nodes of the graph: the ones ticked become parts, bound with {#id}">from <span class="w">W</span>nodes on graph</button>`;
            const wFg = mkDom("wx_from_wnodes", fgEl);
            wFg.computeSize = (width) => [width, 20];
            fgEl.addEventListener("click", (e) => { e.stopPropagation(); if (fgPop) closeFg(); else openFg(); });
            // write_batch sotto i tasti (e' l'ultimo input del backend: spostarlo in coda non cambia l'ordine dei valori salvati)
            for (const nm of ["write_batch", "image_preview"]) {
                const w = W(nm);
                if (w) { const k = node.widgets.indexOf(w); if (k >= 0) { node.widgets.splice(k, 1); node.widgets.push(w); } }
            }
            wxCompactWidgets(node);   // the two buttons take no slot: widgets_values = the inputs of object_info, in order

            // ---- the thumbnails, off by default. The frontend hangs them on the node from its own onDrawBackground (the
            // prototype's: at every draw it reads the node's outputs and, when `images` are there, loads them into node.imgs
            // and adds its preview widget). The outputs reach the node by two roads: the `executed` message (onExecuted below
            // takes `images` out of it) and a workflow loaded from the queue / history panel, which calls no onExecuted: the
            // thumbnails came up with the switch off. While the switch is off that handler is not run at all, and whatever
            // it may have hung on the node before (the switch was on, then turned off) is taken down. ----
            const PREVIEW_W = "$$canvas-image-preview";   // the frontend's preview widget (useNodeCanvasImagePreview)
            const thumbsOff = () => {
                let did = false;
                if (node.imgs !== undefined || node.images !== undefined) { node.imgs = undefined; node.images = undefined; did = true; }
                const k = (node.widgets || []).findIndex((w) => w.name === PREVIEW_W);
                if (k >= 0) { node.widgets.splice(k, 1); did = true; }
                if (did) node.setSize(node.computeSize());
            };
            const onDrawBg = node.onDrawBackground;
            node.onDrawBackground = function () {
                if (!val("image_preview", false)) { thumbsOff(); watch(); return undefined; }
                const r = onDrawBg ? onDrawBg.apply(this, arguments) : undefined; watch(); return r;
            };
            const onDrawFg = node.onDrawForeground;
            node.onDrawForeground = function () { const r = onDrawFg ? onDrawFg.apply(this, arguments) : undefined; watch(); return r; };
            const timer = setInterval(watch, 400);
            const origRemoved = node.onRemoved;
            node.onRemoved = function () { clearInterval(timer); if (wFg) closeFg(); hideCss?.remove(); hideCss = null; return origRemoved ? origRemoved.apply(this, arguments) : undefined; };

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
                const named = info?.widgets_values_named && typeof info.widgets_values_named === "object";
                if (Array.isArray(wv) && wv.length > S.length && !named) {
                    const flat = wv.filter((v) => v !== null && v !== undefined);
                    if (flat.length === S.length) S.forEach((w, k) => { if (wxFits(w, flat[k])) w.value = flat[k]; });
                }
                // a wf saved with 8 parts (0.7.1 and before) and no names: write_batch and image_preview sat right after part 8,
                // where part 9 is now, and the frontend read them by position into text9 / type9. Back where they belong.
                if (Array.isArray(wv) && wv.length === OLD_8_VALUES && S.length === OLD_8_VALUES + 3 * (MAX_PARTS - 8) && !named) {
                    S.forEach((w, k) => { if (k < OLD_8_VALUES - 2 && wxFits(w, wv[k])) w.value = wv[k]; });
                    for (const [nm, k] of [["write_batch", OLD_8_VALUES - 2], ["image_preview", OLD_8_VALUES - 1]]) { const w = W(nm); if (w && typeof wv[k] === "boolean") w.value = wv[k]; }
                    for (let i = 9; i <= MAX_PARTS; i++) for (const [f, d] of [["text", "_"], ["type", "int"], ["value", ""]]) { const w = W(f + i); if (w) w.value = d; }
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
                // si spengono qui: il frontend le legge dal suo store degli output, che tiene lo stesso oggetto di msg
                // (anche Nodes 2.0 legge da lì). Per la strada della history (nessun onExecuted) vedi onDrawBackground.
                if (msg && msg.images && !val("image_preview", false)) { delete msg.images; thumbsOff(); }
                const r = origExecuted ? origExecuted.apply(this, arguments) : undefined;
                if (msg && msg.fields && msg.fields[0] && typeof msg.fields[0] === "object") runFields = msg.fields[0];
                if (msg && msg.preview && preview) { preview.value = lastRun = String(msg.preview[0]); render(); node.setDirtyCanvas(true, true); }
                return r;
            };

            layout();
            return ret;
        };
    },
});
