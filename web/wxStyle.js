import { app } from "../../scripts/app.js";
// WextraUI — the one look shared by every node's HTML parts (labels, chips, inputs, buttons, hints).
// Accent = the WextraUI blue; everything else sits quietly on the node's own grey.
export const WX = {
    accent: "#1464b3",   // the ? badge, section labels, active borders
    light: "#a8cdf5",    // text on dark: picked chips, code, file names
    deep: "#00509f",     // background of a picked / active chip
};

const CSS = `
  .wx { font: 12px/1.3 sans-serif; color: #ddd; box-sizing: border-box; }
  .wx * { box-sizing: border-box; }
  .wx-label { margin: 6px 0 3px; font-size: 11px; font-weight: 600; color: ${WX.accent}; text-transform: uppercase; letter-spacing: .04em; }
  .wx-label .wx-muted { text-transform: none; font-weight: 400; letter-spacing: 0; }
  .wx-muted { color: #888; font-style: italic; }
  .wx-hint { color: #888; font-size: 10px; }
  .wx-err { color: #e08080; font-size: 10px; }
  .wx-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .wx-box { border: 1px dashed #666; border-radius: 6px; padding: 4px; min-height: 26px; background: #1a1a1a; }
  .wx-chip { display: inline-flex; align-items: center; gap: 4px; background: #2b2b2b; border: 1px solid #444; border-radius: 12px; padding: 2px 8px;
    cursor: pointer; user-select: none; white-space: nowrap; max-width: 100%; color: #ddd; font-size: 12px; line-height: 1.3; }
  .wx-chip .t { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .wx-chip > :not(.t) { flex-shrink: 0; }
  .wx-chip:hover { border-color: ${WX.accent}; }
  .wx-chip.on { background: ${WX.deep}; border-color: ${WX.accent}; color: ${WX.light}; }
  .wx-input, .wx input[type=text], .wx input[type=number], .wx input:not([type]) { background: #222; border: 1px solid #444; color: #ddd;
    border-radius: 4px; padding: 2px 6px; font: 12px sans-serif; min-width: 0; }
  .wx-input:focus, .wx input:focus { outline: none; border-color: ${WX.accent}; }
  .wx-btn, .wx button { background: #333; border: 1px solid #555; color: #ddd; border-radius: 4px; padding: 1px 8px; font-size: 11px; cursor: pointer; }
  .wx-btn:hover, .wx button:hover { border-color: ${WX.accent}; }
  .wx-mono { font-family: ui-monospace, Consolas, monospace; color: ${WX.light}; }
  .wx-rowbar { position: absolute; right: 6px; top: 3px; display: flex; gap: 3px; z-index: 2; }
  .wx-pill { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 15px; margin-left: 8px; border-radius: 8px;
    font: 11px sans-serif; background: #2b2b2b; border: 1px solid #555; color: #999; cursor: pointer; user-select: none; flex-shrink: 0; }
  .wx-pill.on { background: ${WX.deep}; border-color: ${WX.accent}; color: ${WX.light}; }
  .wx-vue-chip { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; margin-left: 8px; border-radius: 4px;
    font: 12px sans-serif; background: #2b2b2b; border: 1px solid ${WX.accent}; color: ${WX.light}; cursor: pointer; user-select: none; flex-shrink: 0; }
  .wx-rowbar .wx-chip { padding: 0 7px; font-size: 11px; line-height: 1.4; min-width: 22px; justify-content: center; }
  textarea.wx-preview { font-family: ui-monospace, Consolas, monospace !important; color: ${WX.light} !important;
    border: 1px dashed #666 !important; border-radius: 6px !important; background: #1a1a1a !important; }
`;

export function ensureWxStyle() {
    if (document.getElementById("wx-style")) return;
    const st = document.createElement("style"); st.id = "wx-style"; st.textContent = CSS;
    document.head.appendChild(st);
}

// Small builders, so every node writes the same HTML.
export function wxLabel(text, hint) {
    const h = document.createElement("div"); h.className = "wx-label"; h.textContent = text;
    if (hint) { const s = document.createElement("span"); s.className = "wx-muted"; s.textContent = " — " + hint; h.appendChild(s); }
    return h;
}
export function wxChip(text, on, onClick) {
    const c = document.createElement("span"); c.className = "wx-chip" + (on ? " on" : "");
    const t = document.createElement("span"); t.className = "t"; t.textContent = text; c.appendChild(t);
    if (onClick) c.onclick = onClick;
    return c;
}
// A canvas button drawn in the WextraUI look (rounded, blue edge). Same call as addWidget("button"): the label is
// widget.name, so it can be renamed later (the Composer's collapse/expand toggle does).
export function wxAddButton(node, label, onClick) {
    const w = node.addWidget("wxbutton", label, null, () => {}, { serialize: false });
    w.serialize = false;   // no slot in widgets_values (see wxCompactWidgets)
    let last = 0;
    w.draw = function (ctx, node, width, y, H) {
        const m = 12, x = m, wd = width - 2 * m;
        ctx.save();
        ctx.beginPath(); ctx.roundRect(x, y + 1, wd, H - 2, 6);
        ctx.fillStyle = "#2b2b2b"; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = WX.accent; ctx.stroke();
        ctx.fillStyle = "#ddd"; ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(this.name, x + wd / 2, y + H / 2);
        ctx.restore();
    };
    w.mouse = function (event, pos, node) {
        const t = String(event?.type || "");
        if (t.includes("move")) return false;
        const now = Date.now(); if (now - last < 250) return true;   // down + up = one click
        last = now; onClick(); node?.setDirtyCanvas?.(true, true); return true;
    };
    w.computeSize = (width) => [width, LiteGraph.NODE_WIDGET_HEIGHT];
    return w;
}
export function wxButton(text, onClick, title) {
    const b = document.createElement("button"); b.className = "wx-btn"; b.textContent = text; if (title) b.title = title;
    b.onclick = onClick; return b;
}

// Widgets the scripts add (buttons, DOM pickers) carry no state of their own, so they must not take a slot in the
// saved widgets_values: whoever reads the workflow by position (comfy-cli's UI-to-API translator, MCP
// list_workflow_slots) pairs the values with the node's object_info inputs, and one extra slot shifts every later
// value onto the wrong input. The frontend skips a widget with .serialize === false when it saves, but leaves a hole
// (null) at its index, and restores by walking the serializable widgets in order. Here the array is compacted on save;
// on load, a file saved with the holes (0.3.5 and before) is recognised by its length and re-read by full index.
/** true when `v` is a value the widget can hold: a member for combos, a number / boolean / string for the others
 *  (judged on the widget's type, never on the value it holds now, which may be rubbish from an old file). */
/** A schema widget that holds state for a DOM widget: out of the view, its slot in widgets_values stays. */
export function wxHideWidget(w) {
    w.type = "converted-widget";
    w.hidden = true;
    if (w.options) w.options.hidden = true;
    w.computeSize = () => [0, -4];
    const hideEl = () => { if (w.element) { w.element.style.display = "none"; w.element.hidden = true; } };
    hideEl(); setTimeout(hideEl, 0);
}

export function wxFits(w, v) {
    if (v === null || v === undefined || typeof v === "object") return false;
    const opts = w.options?.values;
    if (Array.isArray(opts)) return !opts.length || opts.includes(v);
    if (w.type === "number" || w.type === "slider") return typeof v === "number" && Number.isFinite(v);
    if (w.type === "toggle") return typeof v === "boolean";
    if (w.type === "text" || w.type === "string" || w.type === "customtext" || w.type === "multiline") return typeof v === "string";
    const now = typeof w.value;                       // a converted or custom widget: the value it holds is the only hint
    return now === "undefined" || now === "object" || typeof v === now;
}

export function wxCompactWidgets(node) {
    if (node.__wxCompact) return;                 // wrapped once, whoever calls first
    node.__wxCompact = true;
    const full = () => node.widgets || [];
    const kept = () => full().filter((w) => w.serialize !== false);
    const onSer = node.onSerialize;
    node.onSerialize = function (o) {
        onSer?.apply(this, arguments);
        if (o && Array.isArray(o.widgets_values)) o.widgets_values = kept().map((w) => (w.value === undefined ? null : w.value));
    };
    const onConf = node.onConfigure;
    node.onConfigure = function (info) {
        const wv = info?.widgets_values, W = full(), S = kept();
        if (Array.isArray(wv) && S.length !== W.length && wv.length === W.length) {
            // file saved before the compaction: one slot per widget, buttons included
            W.forEach((w, i) => { if (w.serialize !== false && wv[i] !== null && wv[i] !== undefined) w.value = wv[i]; });
        }
        const r = onConf?.apply(this, arguments);
        // the frontend (>= 1.5x) also saves widgets_values_named: a name is worth more than a position when the layout
        // of the node changed between the save and today (a value goes to the widget that had it, whatever its slot)
        const named = info?.widgets_values_named;
        if (named && typeof named === "object" && !Array.isArray(named)) {
            for (const w of S) {
                const v = named[w.name];
                if (wxFits(w, v)) w.value = v;
            }
        }
        wxCoerceWidgets(node);
        return r;
    };
}

/** After a load, every serializable widget holds a value of its own type: a numeric string becomes a number, "true"/"false"
 *  a boolean, anything else that does not fit goes back to the default of object_info (a value from an old layout
 *  that landed in the wrong box is never left there). */
export function wxCoerceWidgets(node) {
    const spec = node.constructor?.nodeData?.input || {};
    const dflt = (name) => { for (const sec of ["required", "optional"]) { const sp = spec[sec]?.[name]; if (sp && sp[1] && sp[1].default !== undefined) return sp[1].default; if (sp && Array.isArray(sp[0]) && sp[0].length) return sp[0][0]; } return undefined; };
    for (const w of node.widgets || []) {
        if (w.serialize === false || wxFits(w, w.value)) continue;
        const v = w.value;
        if ((w.type === "number" || w.type === "slider") && typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) { w.value = Number(v); continue; }
        if (w.type === "toggle" && (v === "true" || v === "false")) { w.value = v === "true"; continue; }
        const d = dflt(w.name);
        if (d !== undefined && wxFits(w, d)) w.value = d;
    }
}

/** `fn` on every redraw of the node (the classic canvas) and on a timer (Nodes 2.0 never draws a node on the canvas, so
 *  onDrawBackground / onDrawForeground do not fire there); off when the node is removed. */
export function wxOnRedraw(node, fn, ms = 400) {
    const bg = node.onDrawBackground, fg = node.onDrawForeground;
    node.onDrawBackground = function () { const r = bg?.apply(this, arguments); fn(); return r; };
    node.onDrawForeground = function () { const r = fg?.apply(this, arguments); fn(); return r; };
    const t = setInterval(() => { if (node.graph) fn(); }, ms);
    const rm = node.onRemoved;
    node.onRemoved = function () { clearInterval(t); return rm?.apply(this, arguments); };
}

// ---- Nodes 2.0 (the Vue renderer, `Comfy.VueNodes.Enabled`) -------------------------------------------------------
// A node is a DOM box there ([data-node-id]); its widgets are Vue components, a widget of a type of ours (wxbutton,
// wxpartbar) is drawn by the frontend's legacy widget on a small canvas, with the mouse; a DOM widget is mounted as it
// is. What a node paints on the canvas itself (onDrawForeground: the pills of WSwitch, the + chips of WScenes
// Collection) has no place: those get an HTML twin in the slot rows, kept up by a timer (the DOM is rebuilt when the
// slots change, so what is missing is put back).
/** The DOM box of the node under Nodes 2.0; null on the classic canvas, or before the DOM is there. */
export function wxVueNodeEl(node) {
    if (!LiteGraph.vueNodesMode || !node?.graph) return null;
    return document.querySelector(`[data-node-id="${node.id}"]`);
}
/** The DOM rows of the node's input slots (not the widget sockets): [{ el, idx }], idx = the index in node.inputs, read
 *  from the slot key "<id>-in-<idx>". Null on the classic canvas. */
export function wxVueInputRows(node) {
    const root = wxVueNodeEl(node);
    if (!root) return null;
    const rows = [];
    for (const el of root.querySelectorAll(".lg-slot--input")) {
        const m = /-in-(\d+)$/.exec(el.querySelector("[data-slot-key]")?.dataset.slotKey || "");
        if (m) rows.push({ el, idx: Number(m[1]) });
    }
    return rows;
}
/** `fn()` on a timer while Nodes 2.0 is on (nothing on the classic canvas); off when the node is removed. */
export function wxVueDecor(node, fn, ms = 400) {
    ensureWxStyle();
    const t = setInterval(() => { if (LiteGraph.vueNodesMode && node.graph) fn(); }, ms);
    const rm = node.onRemoved;
    node.onRemoved = function () { clearInterval(t); return rm?.apply(this, arguments); };
}
/** One chip (class `cls`) at the end of a slot row, made once; the pointer stays on the chip (the row would start a cable). */
export function wxVueChip(row, cls, onClick) {
    let c = row.querySelector(":scope > ." + cls);
    if (c) return c;
    c = document.createElement("span"); c.className = cls;
    for (const t of ["pointerdown", "pointerup", "mousedown", "mouseup"]) c.addEventListener(t, (e) => e.stopPropagation());
    c.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); onClick(); });
    row.appendChild(c);
    return c;
}

/** Nodes 2.0 reads a node's widgets when the node comes in and again only on a few graph events: a widget hidden or shown
 *  later (the rows of WPrompt Rows, the parts of WSave Image) would stay as it was. The set of visible widgets is
 *  watched (timer below); when it changes, the event that makes the frontend re-read the node is fired. */
const wxVueSig = (node) => (node.widgets || []).filter((w) => !w.hidden && !w.options?.hidden).map((w) => w.name).join("|");
export function wxVueRefresh(node) {
    const sig = wxVueSig(node);
    if (node.__wxVueSig === sig) return false;
    node.__wxVueSig = sig;
    node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id, slotType: 1 });
    return true;
}

export const wxIsOurs = (node) => /wextraui/i.test(node?.constructor?.nodeData?.python_module || "");
const ourNodes = () => (app.graph?._nodes || []).filter(wxIsOurs);

// Every node of the pack: by-name restore + type guard on load (see wxCompactWidgets); nodes that hide widgets call it
// themselves at the right moment, the flag keeps it to one wrap.
app.registerExtension({
    name: "WextraUI.widgets",
    nodeCreated(node) {
        if (!wxIsOurs(node)) return;
        wxCompactWidgets(node);
        // a workflow loaded while Nodes 2.0 is on: the size in the file is the classic one, kept from the file itself (a
        // node's own onConfigure may already have grown the box on the DOM measure) before the layout of Nodes 2.0 lands
        const oc = node.onConfigure;
        node.onConfigure = function (info) {
            const sz = info?.size;
            if (LiteGraph.vueNodesMode && sz && Number.isFinite(Number(sz[0])) && Number.isFinite(Number(sz[1]))) this._wxClassicSize = [Number(sz[0]), Number(sz[1])];
            return oc?.apply(this, arguments);
        };
    },
    setup() {
        // Nodes 2.0 measures every node from its DOM (taller rows) and writes that size into the node; switched off, the
        // canvas keeps the tall box. On the way in the classic size is kept (at the switch, or at load: nodeCreated above);
        // on the way out it is put back (a node born under Nodes 2.0 gets the height the canvas asks for, its width stays).
        app.ui?.settings?.addEventListener?.("Comfy.VueNodes.Enabled.change", (e) => {
            if (e.detail?.value) { for (const n of ourNodes()) { n._wxClassicSize = [n.size[0], n.size[1]]; n.__wxVueSig = wxVueSig(n); } return; }
            const fix = () => {
                for (const n of ourNodes()) {
                    const s = n._wxClassicSize;
                    n.setSize([s ? s[0] : n.size[0], s ? s[1] : n.computeSize()[1]]);
                    n._wxFit?.();   // a node that fits its height to its content (WLoRA) measures it again, as on a load
                }
                app.graph?.setDirtyCanvas(true, true);
            };
            requestAnimationFrame(() => requestAnimationFrame(fix));
            setTimeout(fix, 400);
            setTimeout(fix, 1500);   // WLoRA and the Composer measure their DOM again once back on the canvas, a beat later
        });
        setInterval(() => { if (LiteGraph.vueNodesMode) for (const n of ourNodes()) wxVueRefresh(n); }, 400);
    },
});
