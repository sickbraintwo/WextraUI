import { app } from "../../scripts/app.js";
import { ensureWxStyle, wxCompactWidgets, wxHideWidget } from "./wxStyle.js";

// WDifference.
// `track` and `ignore` are two boxes of chips (restyle B, Sick 01/11, mockup WDifference): every entry is a chip with the
// node it points to, `74 KSampler`, `74 KSampler.seed`, `✕` takes it out, a small box at the end takes a typed id. The two
// schema widgets stay, hidden: their strings are what the file and the backend read, the chips read and write them, and
// a timer keeps the chips up with the graph (a node renamed or removed, an undo, a load).
// `add` / `remove`, in the corner of `track`, take the nodes selected on the canvas (this node left out) and put their
// ids into `track` (only these nodes are compared; empty = all), or take them out, with their `74.seed` entries. The
// label counts the selection (`add · 3` = three nodes selected, `remove · 2` = two of them are in track already).
// `ignore` holds the exceptions (`74.seed`) inside what is tracked.
// Guard at load: a wf saved before changes_max existed (14/09) has the saved values shifted by one — the text of
// ignore lands in the changes_max box ("" -> shown 0) and the server rejects the run ("couldn't be converted to INT").
// Here, after the configure, a changes_max that is not a valid number goes back to 240. And `track` (0.6.0) sits
// above `ignore`: a wf saved before it (five values) would put the text of ignore into track — put back here.
const items = (t) => String(t || "").split(/[,\s]+/).map((s) => s.trim().replace(/^#/, "")).filter(Boolean);
const idOf = (s) => s.split(".")[0];
const VALID = /^\d+(:\d+)*(\.\w+)?$/;   // what the backend reads (parse_ignore in src/runDiff.py)
const VUE_W = 260;                      // under Nodes 2.0 the column of the labels grows with the node: at 230 `changes_max` is cut

/** The node of an id, `74` or `12:5` (inside a subgraph, the id the PROMPT gives it), from the root graph down. */
function nodeOf(id) {
    let g = app.graph, n = null;
    for (const p of id.split(":")) { n = g?.getNodeById?.(p); g = n?.subgraph; }
    return n || null;
}
/** The id the PROMPT gives node `n`: a node shown inside a subgraph has `12:5`, not its `5`. */
function promptId(n, g = app.graph, pre = "") {
    for (const x of g?._nodes || []) {
        if (x === n) return pre + x.id;
        if (x.subgraph) { const r = promptId(n, x.subgraph, `${pre}${x.id}:`); if (r) return r; }
    }
    return null;
}

function ensureStyle() {
    if (document.getElementById("wx-rundiff-style")) return;
    const st = document.createElement("style"); st.id = "wx-rundiff-style";
    ensureWxStyle();
    // the greys come from the text colour by transparency, so they take the node's colour; on a black node a darker well
    // does not show, so the boxes are a shade lighter, with an edge
    st.textContent = `
      .wx-rd { --ink: var(--input-text, #ddd); --quiet: color-mix(in srgb, var(--ink) 62%, transparent); --faint: color-mix(in srgb, var(--ink) 40%, transparent);
        --line: color-mix(in srgb, var(--ink) 16%, transparent); --line2: color-mix(in srgb, var(--ink) 30%, transparent); --chip: color-mix(in srgb, var(--ink) 9%, transparent);
        --blue: color-mix(in srgb, #1464b3 45%, var(--ink)); --pad: 15px;
        box-sizing: border-box; width: 100%; color: var(--ink); font: 12px "Segoe UI", system-ui, sans-serif; user-select: none; }
      .wx-rd * { box-sizing: border-box; }
      .wx-rd .in { padding: 0 var(--pad); }
      .wx-rd button, .wx-rd input { margin: 0; border: 0; padding: 0; background: none; color: inherit; font: inherit; }
      .wx-rd button { cursor: pointer; }
      .wx-rd button:focus-visible { outline: 2px solid #1464b3; outline-offset: 1px; }
      .wx-rd input:focus { outline: none; }
      .wx-rd .bx { padding: 3px 0 4px; border-radius: 8px; background: rgba(255,255,255,.035); box-shadow: inset 0 0 0 1px var(--line); }
      .wx-rd .bx + .bx { margin-top: 6px; }
      .wx-rd .hd { display: flex; align-items: center; gap: 4px; height: 16px; padding: 0 3px 0 9px; }
      .wx-rd .k { font: 11px/16px "Segoe UI", system-ui, sans-serif; color: var(--quiet); }
      .wx-rd .acts { margin-left: auto; display: flex; gap: 3px; }
      .wx-rd .act { height: 16px; padding: 0 7px; border-radius: 8px; font: 11px/16px "Segoe UI", system-ui, sans-serif; color: var(--quiet); box-shadow: inset 0 0 0 1px var(--line2); }
      .wx-rd .act:hover { box-shadow: inset 0 0 0 1px #1464b3; color: var(--blue); }
      .wx-rd .act:active { background: color-mix(in srgb, #1464b3 30%, transparent); }
      .wx-rd .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 3px 6px 0; cursor: text; }
      .wx-rd .ch { display: inline-flex; align-items: center; height: 20px; max-width: 100%; padding: 0 2px 0 8px; border-radius: 10px; background: var(--chip);
        font: 12px/20px "Segoe UI", system-ui, sans-serif; white-space: nowrap; cursor: default; }
      .wx-rd .ch .id { margin-right: 5px; font-size: 10.5px; color: var(--faint); font-variant-numeric: tabular-nums; flex-shrink: 0; }
      .wx-rd .ch .t { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .wx-rd .ch .t.miss { color: var(--faint); font-style: italic; }
      .wx-rd .ch .w { color: var(--blue); flex-shrink: 0; }
      .wx-rd .ch .x { display: inline-grid; place-items: center; width: 16px; height: 16px; margin-left: 3px; border-radius: 50%; font-size: 9px; color: var(--faint); flex-shrink: 0; }
      .wx-rd .ch .x:hover { background: var(--line); color: var(--ink); }
      .wx-rd .none { padding: 0 3px; font: 12px/20px "Segoe UI", system-ui, sans-serif; color: var(--faint); }
      .wx-rd .cin { width: 46px; height: 20px; padding: 0 6px; border-radius: 10px; font: 12px "Segoe UI", system-ui, sans-serif; user-select: text; }
      .wx-rd .cin::placeholder { color: var(--faint); }
      .wx-rd .cin:focus { box-shadow: inset 0 0 0 1px #1464b3; }
      .wx-rd .bx.wired .cin, .wx-rd .bx.wired .acts { display: none; }
      .wx-rd.vue { --ink: var(--component-node-foreground, #ddd); --pad: 0px; }
      .wx-rd.vue .bx { padding: 4px 0 5px; border-radius: 6px; background: var(--component-node-widget-background, #313235); box-shadow: none; }
      .wx-rd.vue .hd { height: 18px; padding: 0 4px 0 11px; }
      .wx-rd.vue .k { font: 12px/18px Inter, "Segoe UI", Arial, sans-serif; }
      .wx-rd.vue .chips { padding: 4px 8px 0; }
      @media (prefers-reduced-motion: no-preference) { .wx-rd .act, .wx-rd .ch .x { transition: background-color .12s, box-shadow .12s, color .12s; } }`;
    document.head.appendChild(st);
}

const mk = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };

app.registerExtension({
    name: "wextraui.rundiff",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxRunDiff") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            const wTrk = (node.widgets || []).find((w) => w.name === "track"), wIgn = (node.widgets || []).find((w) => w.name === "ignore");
            if (!wTrk || !wIgn) return r;
            ensureStyle();
            wxHideWidget(wTrk, node); wxHideWidget(wIgn, node);

            let photo = [];   // ids of the nodes selected on the canvas, this node left out
            const selectedNow = () => {
                const c = app.canvas;
                const raw = c?.selected_nodes ? Object.values(c.selected_nodes) : c?.selectedItems ? [...c.selectedItems] : [];
                return raw.filter((n) => n && typeof n.type === "string" && n.id != null);
            };
            const inTrack = () => { const have = new Set(items(wTrk.value).map(idOf)); return photo.filter((id) => have.has(id)); };
            const set = (w, list) => { w.value = list.join(", "); w.callback?.(w.value); paint(); node.setDirtyCanvas(true, true); };
            const add = () => {
                if (!photo.length) return;
                const cur = items(wTrk.value), have = new Set(cur.filter((s) => !s.includes(".")));
                const nu = photo.filter((id) => !have.has(id));
                if (nu.length) set(wTrk, [...cur, ...nu]);
            };
            const remove = () => {
                if (!photo.length) return;
                const gone = new Set(photo), cur = items(wTrk.value), kept = cur.filter((s) => !gone.has(idOf(s)));
                if (kept.length !== cur.length) set(wTrk, kept);
            };

            const onCable = (w) => (node.inputs || []).find((i) => i.widget?.name === w.name)?.link != null;   // a cable saved on the box before it became chips
            const chip = (w, s) => {
                const id = idOf(s), field = s.slice(id.length), n = nodeOf(id), c = mk("span", "ch");
                c.title = s;
                c.append(mk("span", "id", n ? id : s), mk("span", n ? "t" : "t miss", n ? n.title || n.type : "not in this workflow"));
                if (n && field) c.append(mk("span", "w", field));
                const x = mk("button", "x", "✕"); x.title = "Remove"; x.onclick = () => set(w, items(w.value).filter((o) => o !== s));
                c.append(x);
                return c;
            };
            const box = (w, name, empty, acts) => {
                const el = mk("div", "bx"), hd = mk("div", "hd"), k = mk("span", "k", name), list = mk("div", "chips"), input = mk("input", "cin");
                k.title = w.tooltip || "";
                hd.append(k);
                if (acts) hd.append(acts);
                input.placeholder = "id"; input.spellcheck = false; input.title = "Type an id (74) or a widget (74.seed), Enter";
                input.setAttribute("aria-label", `add an id to ${name}`);
                const take = () => {
                    const have = items(w.value), typed = items(input.value), good = [...new Set(typed.filter((s) => VALID.test(s)))];
                    const nu = good.filter((s) => !have.includes(s));
                    input.value = typed.filter((s) => !VALID.test(s)).join(", ");   // what is not an id stays in the box, to be fixed
                    if (nu.length) set(w, [...have, ...nu]);
                };
                input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); take(); } });
                input.addEventListener("blur", take);
                list.append(input);
                list.onclick = (e) => { if (e.target === list) input.focus(); };
                el.append(hd, list);
                return { w, el, list, input, empty };
            };
            const act = (text, tip, fn) => { const b = mk("button", "act", text); b.title = tip; b.onclick = fn; return b; };
            const bAdd = act("add", "Put the nodes selected on the canvas in track", add), bRem = act("remove", "Take the nodes selected on the canvas out of track", remove);
            const acts = mk("span", "acts"); acts.append(bAdd, bRem);
            const boxes = [box(wTrk, "track", "every node", acts), box(wIgn, "ignore", "nothing")];

            const root = mk("div", "wx-rd"), inner = mk("div", "in");
            inner.append(...boxes.map((b) => b.el));
            root.append(inner);
            for (const t of ["pointerdown", "keydown"]) root.addEventListener(t, (e) => e.stopPropagation());

            const widget = node.addDOMWidget("wx_lists", "custom", root, { serialize: false, hideOnZoom: false, margin: 0, getValue: () => undefined, setValue: () => {} });
            widget.serialize = false;   // the chips mirror track and ignore: no slot of their own in widgets_values
            wxCompactWidgets(node);

            // The height follows the chips, measured from the DOM, so only when the DOM is there to be read (a page in the
            // background is never drawn: its box is 0 wide): a measure that cannot be taken stays owed to the next tick.
            let H = 96, lastW = 0, unfit = true, sig = null;
            widget.computeSize = (width) => [width, H];
            const measure = () => {
                const wd = root.isConnected && root.offsetHeight ? root.offsetWidth : 0;
                if (wd < 100 || (!unfit && wd === lastW)) return;
                unfit = false; lastW = wd;
                const h = inner.offsetHeight + 4;
                if (Math.abs(h - H) < 1) return;
                H = h; node.setSize([node.size[0], node.computeSize()[1]]); node.setDirtyCanvas(true, true);
            };
            node._wxFit = () => { H = -1; unfit = true; };   // a load, and back from Nodes 2.0 (wxStyle.js): the size in the file may not be this one
            const paint = () => {
                const now = boxes.map((b) => [onCable(b.w), ...items(b.w.value).map((s) => s + "=" + (nodeOf(idOf(s))?.title ?? ""))].join("|")).join("\n");
                if (now === sig) return;
                sig = now;
                for (const b of boxes) {
                    const its = items(b.w.value), wired = onCable(b.w);
                    b.el.classList.toggle("wired", wired);
                    b.list.querySelectorAll(".ch, .none").forEach((e) => e.remove());
                    if (wired) b.input.before(mk("span", "none", "on a cable"));
                    else if (its.length) b.input.before(...its.map((s) => chip(b.w, s)));
                    else b.input.before(mk("span", "none", b.empty));
                }
                unfit = true;
            };
            paint();

            const tick = () => {
                const vue = !!LiteGraph.vueNodesMode;
                root.classList.toggle("vue", vue);
                if (vue && node.size[0] < VUE_W) node.setSize([VUE_W, node.size[1]]);
                const raw = selectedNow(), others = raw.filter((n) => n !== node).map((n) => promptId(n) ?? String(n.id));
                if (!raw.length) photo = [];               // nothing selected: the photo goes
                else if (others.length) photo = others;    // other nodes: the photo is them
                /* only this node selected (a click on it): the last photo stays */
                const nAdd = photo.length, nRem = inTrack().length;
                bAdd.textContent = nAdd ? `add · ${nAdd}` : "add";
                bRem.textContent = nRem ? `remove · ${nRem}` : "remove";
                paint();
                measure();
            };
            const timer = setInterval(tick, 200);
            const onRemoved = node.onRemoved;
            node.onRemoved = function () { clearInterval(timer); return onRemoved?.apply(this, arguments); };
            return r;
        };
        const origConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
            const wv = arguments[0]?.widgets_values, named = arguments[0]?.widgets_values_named;
            if (Array.isArray(wv) && wv.length === 5 && !named) {
                const t = (this.widgets || []).find((x) => x.name === "track"), g = (this.widgets || []).find((x) => x.name === "ignore");
                if (t && g) { g.value = typeof wv[4] === "string" ? wv[4] : ""; t.value = ""; }
            }
            const w = (this.widgets || []).find((x) => x.name === "changes_max");
            if (w) {
                const v = Number(w.value);
                if (!Number.isFinite(v) || v < 20 || v > 255) { w.value = 240; this.setDirtyCanvas(true, true); }
            }
            this._wxFit?.();
            return r;
        };
    },
});
