// WextraUI — `selection`: the drop-down with the tick boxes, shared by WSampler / WScheduler (above the name) and
// WCheckpoint / WLoRA (under `folder`). It reads `all · n` (n = the length of the list it narrows); open it and every
// name of that list has a tick box; close it with at least one ticked and it reads `custom · n`. The ticked names, in
// the order you drag them, ARE the menu of the name from then on: the arrows, the list and the walk of increment /
// decrement / randomize only meet them. The ticks live in the hidden `selection` box (a JSON list, an input of the
// node: saved in the workflow, ignored by the backend). Under `folder` the ticks are judged against the menu as `folder`
// leaves it: a tick on a name outside the folder of now waits, and counts again when that folder comes back.
// WInt🌱 has the same row under `value` with numbers of your own instead of ticks (wxNumberList, below): seeds that are
// not one after the other, in the order you give them; the walk goes through them instead of by step.
import { ensureWxStyle, wxHideWidget } from "./wxStyle.js";

let openPop = null;   // one drop-down open at a time

function ensureStyle() {
    if (document.getElementById("wx-sel-style")) return;
    ensureWxStyle();
    const st = document.createElement("style"); st.id = "wx-sel-style";
    st.textContent = `
      .wx-sel { display: flex; align-items: center; justify-content: space-between; height: 20px; width: calc(100% - 10px) !important; box-sizing: border-box; margin: 0 5px; position: relative; top: -10px; padding: 0 8px;
        background: #222; border: 1px solid #444; border-radius: 10px; cursor: pointer; user-select: none; font-size: 12px; color: #ddd; }
      .wx-sel:hover { border-color: #1464b3; }
      .wx-sel .l { color: #999; } .wx-sel .v { color: #ddd; } .wx-sel .v.on { color: #a8cdf5; }
      .wx-sel .v::after { content: " ▾"; color: #888; }
      .wx-sel-pop { position: fixed; z-index: 10000; min-width: 220px; max-height: 60vh; overflow: auto; background: #1e1e1e;
        border: 1px solid #1464b3; border-radius: 6px; padding: 4px 0; box-shadow: 0 4px 16px rgba(0,0,0,.6); font: 12px/1.3 sans-serif; color: #ddd; }
      .wx-sel-pop .tools { display: flex; gap: 6px; padding: 2px 8px 4px; border-bottom: 1px solid #333; margin-bottom: 3px; align-items: center; }
      .wx-sel-pop .tools input { flex: 1; min-width: 80px; font: inherit; color: #ddd; background: #111; border: 1px solid #444; border-radius: 4px; padding: 1px 6px; }
      .wx-sel-pop h5 { margin: 4px 10px 2px; font-size: 10px; font-weight: 600; color: #1464b3; text-transform: uppercase; letter-spacing: .04em; }
      .wx-sel-pop label { display: flex; align-items: center; gap: 8px; padding: 2px 10px; cursor: pointer; white-space: nowrap; }
      .wx-sel-pop label:hover { background: #2b2b2b; }
      .wx-sel-pop label.on { color: #a8cdf5; cursor: grab; }
      .wx-sel-pop label.drag { opacity: .4; }
      .wx-sel-pop label.over { border-top: 2px solid #1464b3; }
      .wx-sel-pop label .h { color: #666; font-size: 11px; } .wx-sel-pop label .i { color: #666; font-size: 10px; min-width: 14px; text-align: right; }
      .wx-sel-pop label .t { flex: 1; } .wx-sel-pop label .x { color: #888; cursor: pointer; padding: 0 2px; } .wx-sel-pop label .x:hover { color: #fff; }
      .wx-sel-pop input[type=checkbox] { margin: 0; accent-color: #1464b3; }
      .wx-sel-pop .wx-muted { padding: 2px 10px; display: block; }`;
    document.head.appendChild(st);
}

/** The row (`selection  all · 27 ▾`) as a DOM widget of `node`, in the slot of an ordinary widget, under `after` (none = on
 *  top). Returns { row, widget, setLabel(text, on) }. */
function selectionRow(node, wSel, { after = null, read, relabel }) {
    const row = document.createElement("div"); row.className = "wx wx-sel";
    row.innerHTML = `<span class="l">selection</span><span class="v">all</span>`;
    const setLabel = (text, on) => { const v = row.querySelector(".v"); v.textContent = text; v.classList.toggle("on", on); };
    row.addEventListener("pointerdown", (e) => e.stopPropagation());
    row.addEventListener("wheel", (e) => e.stopPropagation());
    const widget = node.addDOMWidget("wx_selection", "custom", row, { serialize: false, hideOnZoom: false,
        getValue: () => wSel.value, setValue: (v) => { wSel.value = v; read(); relabel(); } });
    widget.serialize = false;   // mirrors `selection`: no slot of its own in widgets_values
    widget.computeSize = (width) => [width, 20];   // the slot of an ordinary widget (20 + the 4 of spacing): the row sits even with what is above and below (measured 08/10, with top: -10px)
    node.widgets.splice(node.widgets.indexOf(widget), 1);
    const at = after ? node.widgets.indexOf(after) + 1 : 0;   // under `folder` / `value`, or first, above the name
    node.widgets.splice(at, 0, widget);
    return { row, widget, setLabel };
}

/** Opens `pop` under `row` (above it when there is no room), closes it on a click outside or Esc, then calls onClose.
 *  A click on the row itself is left to the row (it closes with onClose through pop.__close). */
function showPop(row, pop, onClose) {
    closePop();
    pop.__row = row; pop.__close = () => { if (openPop === pop) { closePop(); onClose(); } };
    pop.addEventListener("pointerdown", (e) => e.stopPropagation());
    pop.addEventListener("wheel", (e) => e.stopPropagation());
    pop.addEventListener("keydown", (e) => e.stopPropagation());   // the keys typed in its box are not the canvas's
    document.body.appendChild(pop);
    const rc = row.getBoundingClientRect();
    const w = Math.max(220, rc.width);
    pop.style.left = Math.max(4, Math.min(rc.left, window.innerWidth - w - 8)) + "px";
    pop.style.minWidth = w + "px";
    const below = rc.bottom + 2, h = pop.offsetHeight;
    pop.style.top = (below + h > window.innerHeight - 8 ? Math.max(4, rc.top - h - 2) : below) + "px";
    openPop = pop;
    const off = (e) => { if (pop.contains(e.target) || row.contains(e.target)) return; document.removeEventListener("pointerdown", off, true); document.removeEventListener("keydown", key, true); pop.__close(); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); off({ target: document.body }); } };
    setTimeout(() => { document.addEventListener("pointerdown", off, true); document.addEventListener("keydown", key, true); }, 0);
}
const closePop = () => { if (openPop) { openPop.remove(); openPop = null; } };
/** The click on a row: its own drop-down open = close it (with its onClose); another one, or none = open this one. */
const toggle = (row, openMenu) => { if (openPop?.__row === row) openPop.__close(); else { openPop?.__close(); openMenu(); } };

/** A row of the drop-down: a place number, a text, the handle ≡ and drag to reorder (onMove(fromKey, toKey)), an ✕ when
 *  onRemove is given; with a tick box (checked = on, onTick(on)) when onTick is given. Key = what identifies the row. */
function popRow({ key, text, i, on, onTick, onMove, onRemove }) {
    const lab = document.createElement("label");
    lab.classList.toggle("on", on);
    if (on) { const idx = document.createElement("span"); idx.className = "i"; idx.textContent = String(i + 1); lab.appendChild(idx); }
    if (onTick) { const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = on; cb.onchange = () => onTick(cb.checked); lab.appendChild(cb); }
    const t = document.createElement("span"); t.className = "t"; t.textContent = text; lab.appendChild(t);
    if (on) {
        const h = document.createElement("span"); h.className = "h"; h.textContent = "≡"; lab.appendChild(h);
        if (onRemove) { const x = document.createElement("span"); x.className = "x"; x.textContent = "✕"; x.title = "Take it out"; x.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }; lab.appendChild(x); }
        lab.draggable = true;
        lab.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", key); lab.classList.add("drag"); });
        lab.addEventListener("dragend", () => lab.classList.remove("drag"));
        lab.addEventListener("dragover", (e) => { e.preventDefault(); lab.classList.add("over"); });
        lab.addEventListener("dragleave", () => lab.classList.remove("over"));
        lab.addEventListener("drop", (e) => { e.preventDefault(); lab.classList.remove("over"); onMove(e.dataTransfer.getData("text/plain"), key); });
    }
    return lab;
}
const btn = (parent, text, title, fn) => { const b = document.createElement("button"); b.textContent = text; b.title = title; b.onclick = (e) => { e.stopPropagation(); fn(); }; parent.appendChild(b); return b; };

/** Wires `selection` (wSel, taken out of the view) to the name menu (wName) of `node`. To call after wxFolderMenu
 *  when the node has a `folder`: the list this layer narrows is the one the layer below leaves (its getter is kept
 *  and called), a refreshed list goes down the same way. `after`: the widget the row sits under (none = on top);
 *  `watch`: widgets whose change moves the list (`folder`): the name of now outside the selection goes to the first
 *  ticked one, and the count follows. Returns { relabel }. */
export function wxSelectionMenu(node, wSel, wName, { after = null, watch = [] } = {}) {
    ensureStyle();
    wxHideWidget(wSel, node);
    let ticked = [], loading = false;
    // the list under this layer: what `folder` leaves (its getter), or the whole list, kept up to date when the frontend refreshes it
    const prev = Object.getOwnPropertyDescriptor(wName.options, "values");
    let whole = prev?.get ? null : wName.options.values;
    const all = () => (prev?.get ? prev.get.call(wName.options) : typeof whole === "function" ? whole() : whole) || [];
    const read = () => {
        try { ticked = JSON.parse(wSel.value || "[]"); if (!Array.isArray(ticked)) ticked = []; } catch (e) { ticked = []; }
        ticked = ticked.filter((t) => typeof t === "string");
    };
    const save = () => { wSel.value = ticked.length ? JSON.stringify(ticked) : ""; node.setDirtyCanvas(true, true); };
    const chosen = () => { const a = all(); return ticked.filter((t) => a.includes(t)); };   // a name gone from the list (or outside the folder) does not count
    // ---- the menu of the name = the selection, in its order (the list below while a file is being read) ----------
    const narrowed = () => {
        const c = chosen();
        if (!c.length || loading) return all();
        return c.includes(wName.value) || !all().includes(wName.value) ? c : [wName.value, ...c];   // the name of now is never missing from its own menu
    };
    Object.defineProperty(wName.options, "values", {
        get: narrowed,
        set: (v) => { if (prev?.set) prev.set.call(wName.options, v); else whole = v; relabel(); },   // a refreshed list: the layer below takes it, the count follows
        configurable: true, enumerable: true,
    });
    const prevLoading = node.__wxLoading;
    node.__wxLoading = (on) => { prevLoading?.(on); loading = on; };
    // ---- the drop-down row ----------------------------------------------------------------------------------------
    const relabel = () => {   // `all · 27` = the list and how long it is; `custom · 3` = the ticked names in it
        const n = chosen().length;
        setLabel(n ? "custom · " + n : "all · " + all().length, n > 0);
    };
    const { row, setLabel } = selectionRow(node, wSel, { after, read, relabel });
    const settle = () => {   // the name of now outside the selection: the first ticked one
        const c = chosen();
        if (c.length && !c.includes(wName.value)) { wName.value = c[0]; wName.callback?.(c[0]); }
        relabel();
    };
    const commit = () => { settle(); save(); };
    const openMenu = () => {
        const pop = document.createElement("div"); pop.className = "wx wx-sel-pop";
        const tools = document.createElement("div"); tools.className = "tools";
        const act = (fn) => { fn(); save(); relabel(); render(); };
        // the buttons act on the list of now (the folder's): ticks on names outside it wait where they are
        btn(tools, "clear", "No tick = the whole list: the row reads `all` again", () => act(() => { const a = all(); ticked = ticked.filter((t) => !a.includes(t)); }));
        btn(tools, "invert", "Tick what is not ticked, untick the rest", () => act(() => { const t = new Set(ticked), a = all(); ticked = [...ticked.filter((v) => !a.includes(v)), ...a.filter((v) => !t.has(v))]; }));
        btn(tools, "list order", "Put the ticked names back in the order of the list", () => act(() => { const t = new Set(ticked), a = all(); ticked = [...ticked.filter((v) => !a.includes(v)), ...a.filter((v) => t.has(v))]; }));
        pop.appendChild(tools);
        const body = document.createElement("div"); pop.appendChild(body);
        const render = () => {
            body.innerHTML = "";
            const c = chosen(), rest = all().filter((v) => !c.includes(v));
            const tick = (name, on) => act(() => { const i = ticked.indexOf(name); if (on && i < 0) ticked.push(name); else if (!on && i >= 0) ticked.splice(i, 1); });
            const move = (from, to) => { const a = ticked.indexOf(from), b = ticked.indexOf(to); if (a < 0 || b < 0 || a === b) return; act(() => { ticked.splice(a, 1); ticked.splice(b, 0, from); }); };
            const rowOf = (name, on, i) => popRow({ key: name, text: name, i, on, onTick: (v) => tick(name, v), onMove: move });
            if (c.length) { const h = document.createElement("h5"); h.textContent = "selected — drag to order the walk"; body.appendChild(h); c.forEach((n, i) => body.appendChild(rowOf(n, true, i))); }
            const h2 = document.createElement("h5"); h2.textContent = c.length ? "others" : "all — tick to select"; body.appendChild(h2);
            rest.forEach((n) => body.appendChild(rowOf(n, false, -1)));
        };
        render();
        showPop(row, pop, commit);
    };
    row.addEventListener("click", (e) => { e.stopPropagation(); toggle(row, openMenu); });
    read(); relabel();
    // a watched widget (`folder`) moved the list: the name of now outside the selection goes to the first ticked one
    for (const w of watch) {
        if (!w) continue;
        const cb = w.callback;
        w.callback = function () { const r = cb?.apply(this, arguments); settle(); return r; };
    }
    const onConf = node.onConfigure;
    node.onConfigure = function (info) {
        const res = onConf?.apply(this, arguments);
        if (typeof wSel.value !== "string") wSel.value = "";
        read(); relabel();
        setTimeout(() => { read(); relabel(); }, 0);   // again once the whole load is done (a value put back by name arrives after this layer)
        return res;
    };
    const onRemoved = node.onRemoved;
    node.onRemoved = function () { closePop(); return onRemoved?.apply(this, arguments); };
    return { relabel };
}

/** `selection` of WInt🌱: numbers of your own under `value`. The row reads `free` (no number: the walk by step, as it is)
 *  or `custom · 4`; the drop-down has a box to type numbers in (one, or several apart by anything that is not a digit:
 *  the placeholder shows it), the numbers picked with the handle ≡ to drag them into order and ✕ to take one out,
 *  `sort` and `clear`. The numbers live in the hidden `selection` box (a JSON list). `parse(text)` → the number or null
 *  (the node's own rounding and bounds); onChange() after every change. Returns { list(), add(text) }. */
export function wxNumberList(node, wSel, wVal, { after = null, parse, onChange } = {}) {
    ensureStyle();
    wxHideWidget(wSel, node);
    let list = [];
    const read = () => {
        try { list = JSON.parse(wSel.value || "[]"); if (!Array.isArray(list)) list = []; } catch (e) { list = []; }
        list = list.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : parse(String(v)))).filter((v) => v !== null);
        list = list.filter((v, i) => list.indexOf(v) === i);   // one place for a number
    };
    const save = () => { wSel.value = list.length ? JSON.stringify(list) : ""; node.setDirtyCanvas(true, true); onChange?.(); };
    const relabel = () => setLabel(list.length ? "custom · " + list.length : "free", list.length > 0);
    const { row, setLabel } = selectionRow(node, wSel, { after, read, relabel });
    const add = (text) => {   // every number in the text, in its order; one already in is not added twice
        let n = 0;
        for (const m of String(text).match(/-?\d+(?:\.\d+)?/g) || []) { const v = parse(m); if (v !== null && !list.includes(v)) { list.push(v); n++; } }
        return n;
    };
    const openMenu = () => {
        const pop = document.createElement("div"); pop.className = "wx wx-sel-pop";
        const tools = document.createElement("div"); tools.className = "tools";
        const box = document.createElement("input"); box.placeholder = "1, 3, 6, 90, 1234 ↵"; box.title = "Type a number and press Enter; several at once, apart by a comma, a space, a new line";
        box.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); if (add(box.value)) { box.value = ""; save(); relabel(); render(); } } });
        tools.appendChild(box);
        const act = (fn) => { fn(); save(); relabel(); render(); };
        btn(tools, "sort", "The numbers in order, small to big", () => act(() => list.sort((a, b) => a - b)));
        btn(tools, "clear", "No number = the walk by step, the row reads `free` again", () => act(() => { list = []; }));
        pop.appendChild(tools);
        const body = document.createElement("div"); pop.appendChild(body);
        const render = () => {
            body.innerHTML = "";
            const h = document.createElement("h5"); h.textContent = list.length ? "picked — drag to order the walk" : "none — the walk goes by step"; body.appendChild(h);
            const move = (from, to) => { const a = list.indexOf(Number(from)), b = list.indexOf(Number(to)); if (a < 0 || b < 0 || a === b) return; act(() => { const [m] = list.splice(a, 1); list.splice(b, 0, m); }); };
            list.forEach((v, i) => body.appendChild(popRow({ key: String(v), text: String(v), i, on: true, onMove: move, onRemove: () => act(() => list.splice(i, 1)) })));
        };
        render();
        showPop(row, pop, () => { if (add(box.value)) { save(); relabel(); } });   // a number left in the box counts
        setTimeout(() => box.focus(), 0);
    };
    row.addEventListener("click", (e) => { e.stopPropagation(); toggle(row, openMenu); });
    read(); relabel();
    const onConf = node.onConfigure;
    node.onConfigure = function (info) {
        const res = onConf?.apply(this, arguments);
        if (typeof wSel.value !== "string") wSel.value = "";
        read(); relabel();
        setTimeout(() => { read(); relabel(); onChange?.(); }, 0);
        return res;
    };
    const onRemoved = node.onRemoved;
    node.onRemoved = function () { closePop(); return onRemoved?.apply(this, arguments); };
    // add(text): every number in the text goes in (a PNG dropped on WInt🌱); true when at least one was new
    return { list: () => list, add: (text) => { if (!add(text)) return false; save(); relabel(); return true; } };
}
