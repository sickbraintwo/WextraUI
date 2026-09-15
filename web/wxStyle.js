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
        return r;
    };
}
