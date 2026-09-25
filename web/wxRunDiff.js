import { app } from "../../scripts/app.js";
import { wxAddButton, wxCompactWidgets } from "./wxStyle.js";

// WDifference.
// `add` / `remove`: two buttons under `ignore` that take the nodes selected on the canvas (this node left out) and put
// their ids into `track` (only these nodes are compared; empty = all), or take them out, with their `74.seed` entries.
// A click on a button selects this node and deselects the others before the button fires, so the buttons read a photo
// of the selection kept every 200 ms: the label counts it (`add · 3` = three nodes selected, `remove · 2` = two of them
// are in track already). `ignore` stays a box to type in: the exceptions (`74.seed`) inside what is tracked.
// Guard at load: a wf saved before changes_max existed (14/09) has the saved values shifted by one — the text of
// ignore lands in the changes_max box ("" -> shown 0) and the server rejects the run ("couldn't be converted to INT").
// Here, after the configure, a changes_max that is not a valid number goes back to 240. And `track` (0.6.0) sits
// above `ignore`: a wf saved before it (five values) would put the text of ignore into track — put back here.
const items = (t) => String(t || "").split(/[,\s]+/).map((s) => s.trim().replace(/^#/, "")).filter(Boolean);
const idOf = (s) => s.split(".")[0];

app.registerExtension({
    name: "wextraui.rundiff",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxRunDiff") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            const wTrk = () => (node.widgets || []).find((w) => w.name === "track");
            let photo = [];   // ids of the nodes selected on the canvas, this node left out
            const selectedNow = () => {
                const c = app.canvas;
                const raw = c?.selected_nodes ? Object.values(c.selected_nodes) : c?.selectedItems ? [...c.selectedItems] : [];
                return raw.filter((n) => n && typeof n.type === "string" && n.id != null);
            };
            const inTrack = () => { const have = new Set(items(wTrk()?.value).map(idOf)); return photo.filter((id) => have.has(id)); };
            const set = (list) => { const w = wTrk(); if (!w) return; w.value = list.join(", "); w.callback?.(w.value); node.setDirtyCanvas(true, true); };
            const add = () => {
                const w = wTrk(); if (!w || !photo.length) return;
                const cur = items(w.value), have = new Set(cur.filter((s) => !s.includes(".")));
                const nu = photo.filter((id) => !have.has(id));
                if (nu.length) set([...cur, ...nu]);
            };
            const remove = () => {
                const w = wTrk(); if (!w || !photo.length) return;
                const gone = new Set(photo), cur = items(w.value), kept = cur.filter((s) => !gone.has(idOf(s)));
                if (kept.length !== cur.length) set(kept);
            };
            const bAdd = wxAddButton(node, "add", add), bRem = wxAddButton(node, "remove", remove);
            wxCompactWidgets(node);   // the two buttons take no slot in widgets_values
            // the buttons sit right under `track`, the box they act on; the empty boxes say what goes in them
            const place = () => {
                const ws = node.widgets || [], t = wTrk();
                if (!t || ws.indexOf(t) < 0) return;
                for (const b of [bRem, bAdd]) { const i = ws.indexOf(b); if (i >= 0) ws.splice(i, 1); ws.splice(ws.indexOf(t) + 1, 0, b); }
                const hint = (w, text) => { const el = w?.inputEl || w?.element?.querySelector?.("textarea"); if (el) el.placeholder = text; };
                hint(t, "track changes of these nodes: 74, 12 (empty = every node)");
                hint(ws.find((w) => w.name === "ignore"), "ignore (74.seed, 12)");
                node.setSize([node.size[0], node.computeSize()[1]]);
            };
            place();
            setTimeout(place, 0);
            const tick = () => {
                const raw = selectedNow(), others = raw.filter((n) => n !== node).map((n) => String(n.id));
                if (!raw.length) photo = [];               // nothing selected: the photo goes
                else if (others.length) photo = others;    // other nodes: the photo is them
                /* only this node selected (a click on a button): the last photo stays */
                const nAdd = photo.length, nRem = inTrack().length;
                const la = nAdd ? `add · ${nAdd}` : "add", lr = nRem ? `remove · ${nRem}` : "remove";
                if (bAdd.name !== la || bRem.name !== lr) { bAdd.name = la; bRem.name = lr; node.setDirtyCanvas(true, false); }
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
            return r;
        };
    },
});
