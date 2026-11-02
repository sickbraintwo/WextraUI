// WextraUI — `selection`: the drop-down with the tick boxes, shared by WSampler / WScheduler (above the name) and
// WCheckpoint / WLoRA (under `folder`). It reads `all · n` (n = the length of the list it narrows); open it and every
// name of that list has a tick box; close it with at least one ticked and it reads `custom · n`. The ticked names, in
// the order you drag them, ARE the menu of the name from then on: the arrows, the list and the walk of increment /
// decrement / randomize only meet them. The ticks live in the hidden `selection` box (a JSON list, an input of the
// node: saved in the workflow, ignored by the backend). Under `folder` the ticks are judged against the menu as `folder`
// leaves it: a tick on a name outside the folder of now waits, and counts again when that folder comes back.
// WInt🌱 and WFloat have the same row under `value` with numbers of your own instead of ticks (wxNumberList, below): seeds
// that are not one after the other, strengths of your own, in the order you give them; the walk goes through them instead of by step.
// There, and on WSampler / WScheduler, the row is drawn by the node as a row of the canvas (wxRoadRow, Sick 27/10, variant
// D of the restyle): the value of now in the middle, lit, the ones before it on the left and the ones after on the right,
// the side the walk goes to lit with its arrow, one notch per place on the foot: `40 41 [42] › 43 44`.
import { WX, ensureWxStyle, wxHideWidget, wxVueDrawnRow } from "./wxStyle.js";

let openPop = null;   // one drop-down open at a time

function ensureStyle() {
    if (document.getElementById("wx-sel-style")) return;
    ensureWxStyle();
    const st = document.createElement("style"); st.id = "wx-sel-style";
    st.textContent = `
      .wx-sel { display: flex; align-items: center; justify-content: space-between; height: 20px; width: calc(100% - 10px) !important; box-sizing: border-box; margin: 0 5px; position: relative; top: -10px; padding: 0 8px;
        background: #222; border: 1px solid #444; border-radius: 10px; cursor: pointer; user-select: none; font-size: 12px; color: #ddd; }
      .lg-node-widget .wx-sel { top: 0; }   /* Nodes 2.0 lays the row where it goes: the lift of the old canvas would put it on the row above */
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
      .wx-sel-pop label .n { flex: none; width: 11px; height: 11px; box-sizing: border-box; border: 1.5px solid #777; border-radius: 50%; cursor: pointer; }
      .wx-sel-pop label .n:hover { border-color: #a8cdf5; } .wx-sel-pop label.now .n { background: #a8cdf5; border-color: #a8cdf5; } .wx-sel-pop label.now .t { color: #fff; }
      .wx-sel-pop input[type=checkbox] { margin: 0; accent-color: #1464b3; }
      .wx-sel-pop .wx-muted { padding: 2px 10px; display: block; }`;
    document.head.appendChild(st);
}

/** The row (`selection  all · 27 ▾`) as a DOM widget of `node`, in the slot of an ordinary widget, under `after` (none = on
 *  top). Returns { row, widget, setLabel(text, on) }. */
function selectionRow(node, wSel, { after = null, read, relabel, name = "wx_selection" }) {
    const row = document.createElement("div"); row.className = "wx wx-sel";
    row.innerHTML = `<span class="l">selection</span><span class="v">all</span>`;
    const setLabel = (text, on) => { const v = row.querySelector(".v"); v.textContent = text; v.classList.toggle("on", on); };
    row.addEventListener("pointerdown", (e) => e.stopPropagation());
    row.addEventListener("wheel", (e) => e.stopPropagation());
    const widget = node.addDOMWidget(name, "custom", row, { serialize: false, hideOnZoom: false,
        getValue: () => wSel.value, setValue: (v) => { wSel.value = v; read(); relabel(); } });
    widget.serialize = false;   // mirrors `selection`: no slot of its own in widgets_values
    widget.computeSize = (width) => [width, 20];   // the slot of an ordinary widget (20 + the 4 of spacing): the row sits even with what is above and below (measured 08/10, with top: -10px)
    node.widgets.splice(node.widgets.indexOf(widget), 1);
    const at = after ? node.widgets.indexOf(after) + 1 : 0;   // under `folder` / `value`, or first, above the name
    node.widgets.splice(at, 0, widget);
    return { row, widget, setLabel };
}

/** The row `selection` drawn as a row of the canvas, under `after` (Sick 27/10, variant D of the restyle): the value of
 *  now in the middle, lit; on the left the ones before it, on the right the ones after, as many as fit, fading outwards;
 *  the side the walk goes to is lit, with its arrow; at the right, before `▾`, a short word (how many, or the control);
 *  on the foot one notch per place of the walk, the one of now lit. No label: the row is the one under the value.
 *  `paint()` → { now, before: [item], after: [item], dir: 1 | -1 | 0, clip, right: { t, on, act } | null,
 *  track: { n, at, next } | null }, item = { t, v } | { wrap: true } (the turn `↻`), nearest first; clip = a side
 *  item that does not fit whole is cut with `…` (names; numbers go whole or not at all). A click on a side item calls
 *  `onPick(item)`, on a right word with `act` `onRight()`, anywhere else `onClick()`: the drop-down opens under the
 *  pointer (a drawn row has no DOM box to measure: `row` is an anchor with the pointer's place). Under Nodes 2.0 the
 *  frontend draws a widget of a type of ours on a small canvas of its own: the same drawing, the same click. */
function wxRoadRow(node, { after = null, name = "wx_selection", paint, onClick, onPick = null, onRight = null }) {
    const row = { rect: null, contains: () => false, getBoundingClientRect() { return this.rect || { left: 0, top: 0, right: 220, bottom: 0, width: 220, height: 0 }; } };
    const w = node.addWidget("wxroad", name, null, () => {}, { serialize: false });
    w.serialize = false;   // mirrors `selection`: no slot of its own in widgets_values
    w.computeSize = (width) => [width, LiteGraph.NODE_WIDGET_HEIGHT];
    let hits = [];   // [x0, x1, what]: the side items and the right word, for the click
    w.draw = function (ctx, node, width, y, H) {
        const d = paint() || {}, m = wxVueDrawnRow(ctx) ? 1 : 15, tri = width - m - 11;
        const soft = LiteGraph.WIDGET_SECONDARY_TEXT_COLOR || "#999", ink = LiteGraph.WIDGET_TEXT_COLOR || "#ddd";
        hits = [];
        ctx.save();
        ctx.beginPath(); ctx.roundRect(m, y, width - m * 2, H, [H * 0.5]);
        ctx.fillStyle = LiteGraph.WIDGET_BGCOLOR || "#222"; ctx.fill();
        ctx.strokeStyle = LiteGraph.WIDGET_OUTLINE_COLOR || "#666"; ctx.stroke();
        const my = y + H / 2 + 0.5;
        ctx.textBaseline = "middle"; ctx.textAlign = "center"; ctx.fillStyle = ink; ctx.fillText("▾", tri, my);
        ctx.textAlign = "left";
        ctx.font = "11px Arial, sans-serif";   // as the chips of the pack: a size under the rows, so that the names find room
        const gap = 6, pad = 6, tw = (t) => ctx.measureText(t).width;
        let left = m + 10, right = tri - 9;
        // the word at the right (how many; the control under Nodes 2.0, where the frontend closes it in a wand)
        if (d.right?.t) {
            // a long word on a narrow row takes its short form (`inc-wrap`): the middle and the sides keep their room
            const t = d.right.short && right - tw(d.right.t) - left < 150 ? d.right.short : d.right.t;
            const wd = tw(t) + (d.right.act ? 8 : 0), x = right - wd;
            if (d.right.act) {
                ctx.beginPath(); ctx.roundRect(x, my - 7, wd, 14, [3]);
                ctx.strokeStyle = d.right.on ? WX.accent : LiteGraph.WIDGET_OUTLINE_COLOR || "#666"; ctx.stroke();
                hits.push([x, x + wd, "right"]);
            }
            ctx.fillStyle = d.right.on ? WX.light : soft; ctx.fillText(t, x + (d.right.act ? 4 : 0), my);
            right = x - gap - 2;
        }
        // the value of now, in the middle: a name too long is cut with `…`; a number keeps its last digits (the whole of
        // it is in the box just above)
        const avail = right - left;
        let now = String(d.now ?? "");
        // a name in the middle leaves each side room for three letters and the arrow at least: on a narrow row (the control
        // word of Nodes 2.0) the name before had no room left and vanished (Sick 27/10)
        const sideMin = tw("abc…") + tw("›") + 4 + gap;
        const nowMax = d.clip ? Math.max(tw("ab…") + pad * 2, Math.min(avail * 0.5, avail - 2 * sideMin)) : avail;
        if (tw(now) + pad * 2 > nowMax) {
            const s = now;
            if (d.clip) { while (now.length > 1 && tw(now + "…") + pad * 2 > nowMax) now = now.slice(0, -1); now += "…"; }
            else { now = s; for (let k = s.length - 1; k > 0 && tw(now) + pad * 2 > nowMax; k--) now = "…" + s.slice(-k); }
        }
        const pw = tw(now) + pad * 2, cx = left + avail / 2, px = cx - pw / 2;
        // the notches on the foot, in the middle of the row
        const tr = d.track;
        if (tr && tr.n > 1 && tr.at != null) {
            const full = Math.min(width - m * 2 - 24, tr.n * 14), seg = full / tr.n, x0 = width / 2 - full / 2, ty = y + H - 2.5;
            ctx.fillStyle = soft; ctx.globalAlpha = 0.35; ctx.fillRect(x0, ty, full, 1); ctx.globalAlpha = 1;
            const notch = (i, a) => { ctx.globalAlpha = a; ctx.fillStyle = WX.light; ctx.fillRect(x0 + i * seg, ty - 1, Math.max(2, seg - (seg > 4 ? 1 : 0)), 3); ctx.globalAlpha = 1; };
            notch(tr.at, 1);
            if (tr.next != null && tr.next !== tr.at) notch(tr.next, 0.45);
        }
        ctx.beginPath(); ctx.roundRect(px, my - 7, pw, 14, [7]); ctx.fillStyle = WX.deep; ctx.fill();
        ctx.fillStyle = "#e3eefa"; ctx.fillText(now, px + pad, my);
        // the two sides, from the middle outwards: as many as fit, fading; the side the walk goes to is lit, with its arrow
        const side = (items, s) => {   // s = -1 left, 1 right
            let edge = s < 0 ? px - gap : px + pw + gap;
            const limit = s < 0 ? left : right, lit = d.dir === s;
            for (let k = 0; k < items.length; k++) {
                const it = items[k];
                let t = it.wrap ? "↻" : String(it.t);
                const arrow = k === 0 && lit ? (s < 0 ? "‹" : "›") : "";
                const aw = arrow ? tw(arrow) + 4 : 0;
                let room = Math.abs(limit - edge) - aw;
                // what does not fit: `…`, or the arrow alone when not even that fits; a click on it picks that value all the
                // same (Sick 27/10: «rendi cliccabili i puntini»)
                const short = () => {
                    const g = room >= tw("…") ? "…" : arrow ? "" : null;
                    if (g === null) return;
                    const x0 = g ? draw(g, edge, s, soft, 1, arrow) : s < 0 ? edge - tw(arrow) : edge;
                    if (!g) { ctx.fillStyle = WX.light; ctx.fillText(arrow, x0, my); }
                    if (!it.wrap) hits.push([x0 - 3, x0 + tw(g) + aw + 3, it]);
                };
                if (tw(t) > room) {
                    if (!d.clip || it.wrap || k > 0) { short(); break; }
                    while (t.length > 3 && tw(t + "…") > room) t = t.slice(0, -1);
                    if (tw(t + "…") > room) { short(); break; }   // under three letters a name says nothing
                    t += "…";
                }
                const wd = tw(t) + aw;
                const col = it.wrap ? WX.light : lit ? ink : soft;
                const a = it.wrap ? 1 : Math.max(0.35, 1 - 0.18 * k);
                const x0 = draw(t, edge, s, col, a, arrow);
                if (!it.wrap) hits.push([x0, x0 + wd, it]);
                edge += s * (wd + gap);
                if (it.wrap) break;
            }
        };
        const draw = (t, edge, s, col, a, arrow) => {   // a side item from `edge` outwards; returns its left x
            const aw = arrow ? tw(arrow) + 4 : 0, wd = tw(t) + aw, x0 = s < 0 ? edge - wd : edge;
            if (arrow) { ctx.fillStyle = WX.light; ctx.fillText(arrow, s < 0 ? x0 + tw(t) + 4 : x0, my); }
            ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillText(t, s < 0 ? x0 : x0 + aw, my); ctx.globalAlpha = 1;
            return x0;
        };
        side(d.before || [], -1);
        side(d.after || [], 1);
        ctx.restore();
    };
    let last = 0;
    w.mouse = function (e, pos, node) {
        const t = String(e?.type || "");
        if (t.includes("move")) return false;
        const now = Date.now(); if (now - last < 250) return true;   // down + up = one click
        last = now;
        if (now - (row.__wxClosedAt || 0) < 250) return true;   // this click has just closed the drop-down: it stays closed
        const px = Number(pos?.[0]), hit = Number.isFinite(px) ? hits.find(([a, b]) => px >= a - 2 && px <= b + 2) : null;
        if (hit && hit[2] === "right" && onRight) onRight();
        else if (hit && hit[2] !== "right" && onPick) onPick(hit[2]);
        else {
            const cx = Number(e?.clientX), cy = Number(e?.clientY);
            if (Number.isFinite(cx) && Number.isFinite(cy)) row.rect = { left: cx - 60, right: cx + 160, width: 220, top: cy - 10, bottom: cy + 10, height: 20 };
            onClick();
        }
        node?.setDirtyCanvas?.(true, true);
        return true;
    };
    node.widgets.splice(node.widgets.indexOf(w), 1);
    node.widgets.splice(after ? node.widgets.indexOf(after) + 1 : 0, 0, w);
    return { row, widget: w };
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
    const off = (e) => { if (pop.contains(e.target) || row.contains(e.target)) return; document.removeEventListener("pointerdown", off, true); document.removeEventListener("keydown", key, true); row.__wxClosedAt = Date.now(); pop.__close(); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); off({ target: document.body }); } };
    setTimeout(() => { document.addEventListener("pointerdown", off, true); document.addEventListener("keydown", key, true); }, 0);
}
const closePop = () => { if (openPop) { openPop.remove(); openPop = null; } };
/** The click on a row: its own drop-down open = close it (with its onClose); another one, or none = open this one. */
const toggle = (row, openMenu) => { if (openPop?.__row === row) openPop.__close(); else { openPop?.__close(); openMenu(); } };

/** A row of the drop-down: a place number, a text, the handle ≡ and drag to reorder (onMove(fromKey, toKey)), an ✕ when
 *  onRemove is given; with a tick box (checked = on, onTick(on)) when onTick is given; with a dot when onNow is given
 *  (Sick 27/10): ● the value of now, ○ the others, a click on it makes that one the value of now (the one `fixed`
 *  keeps). Key = what identifies the row. */
function popRow({ key, text, i, on, onTick, onMove, onRemove, now = false, onNow = null }) {
    const lab = document.createElement("label");
    lab.classList.toggle("on", on);
    lab.classList.toggle("now", now);
    if (on) { const idx = document.createElement("span"); idx.className = "i"; idx.textContent = String(i + 1); lab.appendChild(idx); }
    if (onTick) { const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = on; cb.onchange = () => onTick(cb.checked); lab.appendChild(cb); }
    if (onNow) {   // the click stays on the dot: the label would tick the box
        const d = document.createElement("span"); d.className = "n";
        d.title = now ? "The value of now: on fixed it stays" : "Make it the value of now: on fixed it stays";
        d.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onNow(); };
        lab.appendChild(d);
    }
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
const SHORT_CTL = { increment: "inc", decrement: "dec", randomize: "random", "increment-wrap": "inc-wrap" };   // the control word on a narrow row
const btn = (parent, text, title, fn) => { const b = document.createElement("button"); b.textContent = text; b.title = title; b.onclick = (e) => { e.stopPropagation(); fn(); }; parent.appendChild(b); return b; };

/** Wires `selection` (wSel, taken out of the view) to the name menu (wName) of `node`. To call after wxFolderMenu
 *  when the node has a `folder`: the list this layer narrows is the one the layer below leaves (its getter is kept
 *  and called), a refreshed list goes down the same way. `after`: the widget the row sits under (none = on top);
 *  `watch`: widgets whose change moves the list (`folder`): the name of now outside the selection goes to the first
 *  ticked one, and the count follows; `name`: the name of the row's widget (one per block in WLoRA Stack); `road`
 *  (WSampler / WScheduler, Sick 27/10): the row is drawn (wxRoadRow) and reads the name of now in the middle, the one
 *  before and the one after in the order of the menu, how many at the right (the control under Nodes 2.0); `show`: how
 *  a name reads on the drawn row (WCheckpoint: the clean file name); `count: false` (WCheckpoint, Sick 30/10, variant B:
 *  the place is on the name's own label) = the number at the right only when names are ticked. Returns
 *  { relabel, widget }. */
export function wxSelectionMenu(node, wSel, wName, { after = null, watch = [], name = "wx_selection", road = false, show = (v) => v, count = true } = {}) {
    ensureStyle();
    wxHideWidget(wSel, node);
    // wName may be a list of name menus (WLoRA Stack: one selection for every block): each is narrowed the same way,
    // and no name already chosen is moved (the selection only shortens the menus)
    const many = Array.isArray(wName), names = many ? wName.filter((w) => w?.options) : [wName];
    if (many) wName = names[0];
    let ticked = [], loading = false;
    // the list under this layer, for each menu: what `folder` leaves (its getter), or the whole list, kept up to date when the frontend refreshes it
    const layer = (w) => {
        const prev = Object.getOwnPropertyDescriptor(w.options, "values");
        let whole = prev?.get ? null : w.options.values;
        return {
            all: () => (prev?.get ? prev.get.call(w.options) : typeof whole === "function" ? whole() : whole) || [],
            set: (v) => { if (prev?.set) prev.set.call(w.options, v); else whole = v; },
        };
    };
    const layers = names.map(layer);
    const all = layers[0].all;
    const read = () => {
        try { ticked = JSON.parse(wSel.value || "[]"); if (!Array.isArray(ticked)) ticked = []; } catch (e) { ticked = []; }
        ticked = ticked.filter((t) => typeof t === "string");
    };
    const save = () => { wSel.value = ticked.length ? JSON.stringify(ticked) : ""; node.setDirtyCanvas(true, true); };
    const chosen = () => { const a = all(); return ticked.filter((t) => a.includes(t)); };   // a name gone from the list (or outside the folder) does not count
    // ---- the menu of the name = the selection, in its order (the list below while a file is being read) ----------
    names.forEach((w, k) => {
        const below = layers[k].all;
        const narrowed = () => {
            const a = below(), c = ticked.filter((t) => a.includes(t));
            if (!c.length || loading) return a;
            return c.includes(w.value) || !a.includes(w.value) ? c : [w.value, ...c];   // the name of now is never missing from its own menu
        };
        Object.defineProperty(w.options, "values", {
            get: narrowed,
            set: (v) => { layers[k].set(v); relabel(); },   // a refreshed list: the layer below takes it, the count follows
            configurable: true, enumerable: true,
        });
    });
    const prevLoading = node.__wxLoading;
    node.__wxLoading = (on) => { prevLoading?.(on); loading = on; };
    // ---- the drop-down row ----------------------------------------------------------------------------------------
    const relabel = () => {   // `all · 27` = the list and how long it is; `custom · 3` = the ticked names in it
        if (road) { node.setDirtyCanvas(true, false); return; }
        const n = chosen().length;
        setLabel(n ? "custom · " + n : "all · " + all().length, n > 0);
    };
    // the drawn row: the control is the one the frontend linked to the name (fixed / increment / decrement / randomize / increment-wrap)
    const isCtl = (w) => Array.isArray(w?.options?.values) && w.options.values.includes("randomize");
    const control = () => (wName.linkedWidgets || []).find(isCtl) || (node.widgets || []).find((w) => w !== wName && w !== wSel && isCtl(w));
    const paint = () => {
        const menu = wName.options?.values || [], n = menu.length, p = menu.indexOf(wName.value), c = control()?.value || "fixed";
        const wrap = c === "increment-wrap", dir = c === "increment" || wrap ? 1 : c === "decrement" ? -1 : 0;
        const at = (k) => (k >= 0 && k < n ? menu[k] : wrap ? menu[((k % n) + n) % n] : undefined);
        const side = (s) => { const out = []; for (let k = 1; k < Math.min(n, 9) && p >= 0; k++) { const v = at(p + s * k); if (v === undefined) break; out.push({ t: show(v), v }); } return out; };
        const ticked = chosen().length;
        const right = LiteGraph.vueNodesMode
            ? { t: c, short: SHORT_CTL[c], on: c !== "fixed", act: true }   // Nodes 2.0 closes the control in a wand: here it is a word that turns at a click
            : count || ticked ? { t: String(ticked || n), on: ticked > 0 } : null;
        const next = dir && p >= 0 ? (wrap ? (p + dir + n) % n : p + dir >= 0 && p + dir < n ? p + dir : null) : null;
        return { now: show(wName.value), before: side(-1), after: side(1), dir, clip: true, right, track: p >= 0 ? { n, at: p, next } : null };
    };
    const pick = (it) => { if (it?.v !== undefined && it.v !== wName.value) { wName.value = it.v; wName.callback?.(it.v); } };
    const turn = () => {   // the word of the control (Nodes 2.0): the next mode, round at the end
        const c = control(); if (!c) return;
        const vals = c.options.values, v = vals[(vals.indexOf(c.value) + 1) % vals.length];
        c.value = v; c.callback?.(v);
    };
    let row, widget, setLabel = () => {};
    if (road) ({ row, widget } = wxRoadRow(node, { after, name, paint, onClick: () => toggle(row, openMenu), onPick: pick, onRight: turn }));
    else ({ row, widget, setLabel } = selectionRow(node, wSel, { after, read, relabel, name }));
    const settle = () => {   // the name of now outside the selection: the first ticked one (one menu only: a stack keeps its names)
        const c = chosen();
        if (!many && c.length && !c.includes(wName.value)) { wName.value = c[0]; wName.callback?.(c[0]); }
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
            // the dot of the value of now: on the names of the walk (the ticked ones; all of them when none is ticked). Not
            // on a stack, where one selection serves every block
            const dot = (name, on) => (!many && (on || !c.length) ? { now: name === wName.value, onNow: () => { pick({ v: name }); node.setDirtyCanvas(true, true); render(); } } : {});
            const rowOf = (name, on, i) => popRow({ key: name, text: name, i, on, onTick: (v) => tick(name, v), onMove: move, ...dot(name, on) });
            if (c.length) { const h = document.createElement("h5"); h.textContent = "selected — drag to order the walk"; body.appendChild(h); c.forEach((n, i) => body.appendChild(rowOf(n, true, i))); }
            const h2 = document.createElement("h5"); h2.textContent = c.length ? "others" : "all — tick to select"; body.appendChild(h2);
            rest.forEach((n) => body.appendChild(rowOf(n, false, -1)));
        };
        render();
        showPop(row, pop, commit);
    };
    if (!road) row.addEventListener("click", (e) => { e.stopPropagation(); toggle(row, openMenu); });
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
    return { relabel, widget };
}

/** `selection` of WInt🌱 and WFloat: numbers of your own under `value`. The row reads `free` (no number: the walk by step,
 *  as it is) or `custom · 4`; the drop-down has a box to type numbers in (one, or several apart by anything that is not
 *  a digit: the placeholder shows it, `placeholder` = the node's own example), the numbers picked with the handle ≡ to
 *  drag them into order and ✕ to take one out, `sort` and `clear`. The numbers live in the hidden `selection` box (a
 *  JSON list). `parse(text)` → the number or null (the node's own rounding and bounds); onChange() after every change.
 *  road() / pick(item): the drawn row (wxRoadRow) and a click on a value of its sides; pick also takes the dot of a number
 *  in the drop-down (● the value of now, now() says which). Returns { list(), add(text) }. */
export function wxNumberList(node, wSel, wVal, { after = null, parse, onChange, placeholder = "1, 3, 6, 90, 1234 ↵", road = null, pick = null, now = null } = {}) {
    ensureStyle();
    wxHideWidget(wSel, node);
    let list = [];
    const read = () => {
        try { list = JSON.parse(wSel.value || "[]"); if (!Array.isArray(list)) list = []; } catch (e) { list = []; }
        list = list.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : parse(String(v)))).filter((v) => v !== null);
        list = list.filter((v, i) => list.indexOf(v) === i);   // one place for a number
    };
    const save = () => { wSel.value = list.length ? JSON.stringify(list) : ""; node.setDirtyCanvas(true, true); onChange?.(); };
    // road (WInt🌱, WFloat): the row is drawn and reads the values of the next runs; else the DOM row `free` / `custom · 4`
    let setLabel = () => {}, row = null;
    const relabel = () => (road ? node.setDirtyCanvas(true, false) : setLabel(list.length ? "custom · " + list.length : "free", list.length > 0));
    if (road) ({ row } = wxRoadRow(node, { after, paint: road, onClick: () => toggle(row, openMenu), onPick: pick }));
    else ({ row, setLabel } = selectionRow(node, wSel, { after, read, relabel }));
    const add = (text) => {   // every number in the text, in its order; one already in is not added twice
        let n = 0;
        for (const m of String(text).match(/-?\d+(?:\.\d+)?/g) || []) { const v = parse(m); if (v !== null && !list.includes(v)) { list.push(v); n++; } }
        return n;
    };
    const openMenu = () => {
        const pop = document.createElement("div"); pop.className = "wx wx-sel-pop";
        const tools = document.createElement("div"); tools.className = "tools";
        const box = document.createElement("input"); box.placeholder = placeholder; box.title = "Type a number and press Enter; several at once, apart by a comma, a space, a new line";
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
            const dot = (v) => (pick ? { now: now?.() === v, onNow: () => { pick({ v }); node.setDirtyCanvas(true, true); render(); } } : {});
            list.forEach((v, i) => body.appendChild(popRow({ key: String(v), text: String(v), i, on: true, onMove: move, onRemove: () => act(() => list.splice(i, 1)), ...dot(v) })));
        };
        render();
        showPop(row, pop, () => { if (add(box.value)) { save(); relabel(); } });   // a number left in the box counts
        setTimeout(() => box.focus(), 0);
    };
    if (!road) row.addEventListener("click", (e) => { e.stopPropagation(); toggle(row, openMenu); });
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
