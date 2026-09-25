// WextraUI — WSampler / WScheduler: the menu with the control after generate, as a node of its own.
// The frontend makes the control (and its filter box) by itself from the schema. Here:
//  - `selection`, the drop-down above the name: it reads `all`; open it and every name of the list has a tick box; close
//    it with at least one ticked and it reads `custom · n`. The ticked names, in the order you drag them, ARE the menu
//    of the name from then on: the arrows, the list and the walk of increment / decrement / randomize only meet them.
//    The ticks live in the hidden `selection` box (a JSON list, an input of the node: saved in the workflow, ignored by
//    the backend); the frontend's filter box is not needed and is taken out of the view.
//  - the title follows the name once the node is collapsed (a collapsed node shows only its title);
//  - `carry` in and out (wxCarry.js): the odometer cable — every scheduler for every sampler, in one queue.
import { app } from "../../scripts/app.js";
import { ensureWxStyle, wxCompactWidgets, wxHideWidget } from "./wxStyle.js";
import { wxTitleFollows, wxLoadingGuard } from "./wxFolder.js";
import { wxCarryMenu } from "./wxCarry.js";

const TYPES = { wxSampler: "sampler_name", wxScheduler: "scheduler" };
let openPop = null;   // one drop-down open at a time

function ensureStyle() {
    if (document.getElementById("wx-sel-style")) return;
    ensureWxStyle();
    const st = document.createElement("style"); st.id = "wx-sel-style";
    st.textContent = `
      .wx-sel { display: flex; align-items: center; justify-content: space-between; height: 20px; width: calc(100% - 10px) !important; box-sizing: border-box; margin: 0 5px; position: relative; top: -6px; padding: 0 8px;
        background: #222; border: 1px solid #444; border-radius: 10px; cursor: pointer; user-select: none; font-size: 12px; color: #ddd; }
      .wx-sel:hover { border-color: #1464b3; }
      .wx-sel .l { color: #999; } .wx-sel .v { color: #ddd; } .wx-sel .v.on { color: #a8cdf5; }
      .wx-sel .v::after { content: " ▾"; color: #888; }
      .wx-sel-pop { position: fixed; z-index: 10000; min-width: 220px; max-height: 60vh; overflow: auto; background: #1e1e1e;
        border: 1px solid #1464b3; border-radius: 6px; padding: 4px 0; box-shadow: 0 4px 16px rgba(0,0,0,.6); font: 12px/1.3 sans-serif; color: #ddd; }
      .wx-sel-pop .tools { display: flex; gap: 6px; padding: 2px 8px 4px; border-bottom: 1px solid #333; margin-bottom: 3px; }
      .wx-sel-pop h5 { margin: 4px 10px 2px; font-size: 10px; font-weight: 600; color: #1464b3; text-transform: uppercase; letter-spacing: .04em; }
      .wx-sel-pop label { display: flex; align-items: center; gap: 8px; padding: 2px 10px; cursor: pointer; white-space: nowrap; }
      .wx-sel-pop label:hover { background: #2b2b2b; }
      .wx-sel-pop label.on { color: #a8cdf5; cursor: grab; }
      .wx-sel-pop label.drag { opacity: .4; }
      .wx-sel-pop label.over { border-top: 2px solid #1464b3; }
      .wx-sel-pop label .h { color: #666; font-size: 11px; } .wx-sel-pop label .i { color: #666; font-size: 10px; min-width: 14px; text-align: right; }
      .wx-sel-pop input { margin: 0; accent-color: #1464b3; }
      .wx-sel-pop .wx-muted { padding: 2px 10px; display: block; }`;
    document.head.appendChild(st);
}

app.registerExtension({
    name: "WextraUI.samplerScheduler",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        const field = TYPES[nodeData.name];
        if (!field) return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this, W = (nm) => node.widgets?.find((w) => w.name === nm);
            const wName = W(field), wSel = W("selection");
            if (!wName || !wSel) return r;
            ensureStyle();
            wxHideWidget(wSel);
            // ---- the ticks (the state lives in the hidden `selection` box) ------------------------------------------
            let ticked = [], loading = false;
            let whole = wName.options.values;   // the whole list, kept up to date when the frontend refreshes it
            const all = () => (typeof whole === "function" ? whole() : whole) || [];
            const read = () => {
                try { ticked = JSON.parse(wSel.value || "[]"); if (!Array.isArray(ticked)) ticked = []; } catch (e) { ticked = []; }
                ticked = ticked.filter((t) => typeof t === "string");
            };
            const save = () => { wSel.value = ticked.length ? JSON.stringify(ticked) : ""; node.setDirtyCanvas(true, true); };
            const chosen = () => ticked.filter((t) => all().includes(t));   // a name gone from the list does not count
            // ---- the menu of the name = the selection, in its order (the whole list while a file is being read) ------
            const narrowed = () => {
                const c = chosen();
                if (!c.length || loading) return all();
                return c.includes(wName.value) || !all().includes(wName.value) ? c : [wName.value, ...c];   // the name of now is never missing from its own menu
            };
            Object.defineProperty(wName.options, "values", { get: narrowed, set: (v) => { whole = v; }, configurable: true, enumerable: true });
            node.__wxLoading = (on) => { loading = on; };
            const wFilter = W("control_filter_list");   // not needed: the menu itself is narrowed. Out of the view, empty.
            if (wFilter) {
                Object.defineProperty(wFilter, "value", { get: () => "", set: () => {}, configurable: true });
                node.widgets.splice(node.widgets.indexOf(wFilter), 1);
            }
            // ---- the drop-down row --------------------------------------------------------------------------------
            const row = document.createElement("div"); row.className = "wx wx-sel";
            row.innerHTML = `<span class="l">selection</span><span class="v">all</span>`;
            const relabel = () => {
                const n = chosen().length, v = row.querySelector(".v");
                v.textContent = n ? "custom · " + n : "all";
                v.classList.toggle("on", n > 0);
            };
            const closePop = () => { if (openPop) { openPop.remove(); openPop = null; } };
            const commit = () => {
                // the name of now outside the selection: the first ticked one
                const c = chosen();
                if (c.length && !c.includes(wName.value)) { wName.value = c[0]; wName.callback?.(c[0]); }
                save(); relabel();
            };
            const openMenu = () => {
                closePop();
                const pop = document.createElement("div"); pop.className = "wx wx-sel-pop";
                const tools = document.createElement("div"); tools.className = "tools";
                const btn = (t, fn, title) => { const b = document.createElement("button"); b.textContent = t; b.title = title; b.onclick = (e) => { e.stopPropagation(); fn(); render(); }; tools.appendChild(b); };
                btn("clear", () => { ticked = []; }, "No tick = the whole list: the row reads `all` again");
                btn("invert", () => { const t = new Set(ticked); ticked = all().filter((v) => !t.has(v)); }, "Tick what is not ticked, untick the rest");
                btn("list order", () => { const t = new Set(ticked); ticked = all().filter((v) => t.has(v)); }, "Put the ticked names back in the order of the list");
                pop.appendChild(tools);
                const body = document.createElement("div"); pop.appendChild(body);
                const render = () => {
                    body.innerHTML = "";
                    const c = chosen(), rest = all().filter((v) => !c.includes(v));
                    const tick = (name, on) => { const i = ticked.indexOf(name); if (on && i < 0) ticked.push(name); else if (!on && i >= 0) ticked.splice(i, 1); save(); relabel(); render(); };
                    const rowOf = (name, on, i) => {
                        const lab = document.createElement("label"), cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = on;
                        lab.classList.toggle("on", on);
                        cb.onchange = () => tick(name, cb.checked);
                        if (on) {   // ticked: a number (its place in the walk), a handle, drag to reorder
                            const idx = document.createElement("span"); idx.className = "i"; idx.textContent = String(i + 1);
                            lab.appendChild(idx);
                        }
                        lab.appendChild(cb); lab.appendChild(document.createTextNode(name));
                        if (on) {
                            const h = document.createElement("span"); h.className = "h"; h.textContent = "≡"; lab.appendChild(h);
                            lab.draggable = true;
                            lab.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", name); lab.classList.add("drag"); });
                            lab.addEventListener("dragend", () => lab.classList.remove("drag"));
                            lab.addEventListener("dragover", (e) => { e.preventDefault(); lab.classList.add("over"); });
                            lab.addEventListener("dragleave", () => lab.classList.remove("over"));
                            lab.addEventListener("drop", (e) => {
                                e.preventDefault(); lab.classList.remove("over");
                                const from = e.dataTransfer.getData("text/plain"), a = ticked.indexOf(from), b = ticked.indexOf(name);
                                if (a < 0 || b < 0 || a === b) return;
                                ticked.splice(a, 1); ticked.splice(b, 0, from); save(); relabel(); render();
                            });
                        }
                        return lab;
                    };
                    if (c.length) { const h = document.createElement("h5"); h.textContent = "selected — drag to order the walk"; body.appendChild(h); c.forEach((n, i) => body.appendChild(rowOf(n, true, i))); }
                    const h2 = document.createElement("h5"); h2.textContent = c.length ? "others" : "all — tick to select"; body.appendChild(h2);
                    rest.forEach((n) => body.appendChild(rowOf(n, false, -1)));
                };
                render();
                pop.addEventListener("pointerdown", (e) => e.stopPropagation());
                pop.addEventListener("wheel", (e) => e.stopPropagation());
                document.body.appendChild(pop);
                const rc = row.getBoundingClientRect();
                const w = Math.max(220, rc.width);
                pop.style.left = Math.max(4, Math.min(rc.left, window.innerWidth - w - 8)) + "px";
                pop.style.minWidth = w + "px";
                const below = rc.bottom + 2, h = pop.offsetHeight;
                pop.style.top = (below + h > window.innerHeight - 8 ? Math.max(4, rc.top - h - 2) : below) + "px";
                openPop = pop;
                const off = (e) => { if (pop.contains(e.target)) return; document.removeEventListener("pointerdown", off, true); document.removeEventListener("keydown", key, true); if (openPop === pop) { closePop(); commit(); } };
                const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); off({ target: document.body }); } };
                setTimeout(() => { document.addEventListener("pointerdown", off, true); document.addEventListener("keydown", key, true); }, 0);
            };
            row.addEventListener("pointerdown", (e) => e.stopPropagation());
            row.addEventListener("click", (e) => { e.stopPropagation(); if (openPop) { closePop(); commit(); } else openMenu(); });
            row.addEventListener("wheel", (e) => e.stopPropagation());
            const widget = node.addDOMWidget("wx_selection", "custom", row, { serialize: false, hideOnZoom: false,
                getValue: () => wSel.value, setValue: (v) => { wSel.value = v; read(); relabel(); } });
            widget.serialize = false;   // mirrors `selection`: no slot of its own in widgets_values
            widget.computeSize = (width) => [width, 24];
            node.widgets.splice(node.widgets.indexOf(widget), 1);   // drawn first, above the name
            node.widgets.unshift(widget);
            read(); relabel();
            wxTitleFollows(node, wName, nodeData.display_name);
            wxCompactWidgets(node);
            const onConf = node.onConfigure;
            node.onConfigure = function (info) {
                const res = onConf?.apply(this, arguments);
                if (typeof wSel.value !== "string") wSel.value = "";
                read(); relabel();
                return res;
            };
            wxLoadingGuard(node);   // outermost: the menu of the name stays whole for as long as the file is read
            wxCarryMenu(node, wName, [wSel]);   // the odometer cable: at / size / move on the menu narrowed by `selection`
            const onRemoved = node.onRemoved;
            node.onRemoved = function () { closePop(); return onRemoved?.apply(this, arguments); };
            return r;
        };
    },
});
