// WextraUI — the `folder` menu of the loaders (WLoRA, WCheckpoint), shared.
// `folder` sits above the name and narrows the name menu, and the walk of increment / decrement / randomize, to one
// folder (any depth) and what is under it. Frontend only: the name stays a full path and the backend checks it
// against the whole list. The label shows where the file of now sits in the folder (3/12) = the runs to queue.
import { wxOnRedraw } from "./wxStyle.js";
export const WX_ALL = "(all)";

/** Wires `folder` (wFolder) to the name menu (wName) of `node`. Sets node.__wxLoading(on): while a file is being
 *  read the menu is whole, so a saved name is judged against the whole list. */
export function wxFolderMenu(node, wFolder, wName) {
    const W = (nm) => node.widgets.find((w) => w.name === nm);
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const SEP = "[\\\\/]";
    // "Krea2 / Sliders" -> ^Krea2[\\/]Sliders[\\/]("" = no narrowing)
    const folderRx = () => {
        const v = String(wFolder?.value ?? WX_ALL);
        return !wFolder || v === WX_ALL ? "" : "^" + v.split(" / ").map(esc).join(SEP) + SEP;
    };
    // The control-after-generate of the frontend adds a filter box (control_filter_list) that it reads by .value when
    // it moves along the list: a plain string is a case-insensitive "contains", a regex only when wrapped as /abc/
    // (the frontend's own convention: a bare pattern is taken as text and matches nothing, so the control never moves).
    // The box is taken out of the view: what it answers is the `folder` menu, wrapped, so increment / decrement /
    // randomize keep to the folder chosen (any depth) and what is under it.
    const wFilter = W("control_filter_list");
    if (wFilter) {
        Object.defineProperty(wFilter, "value", { get: () => { const f = folderRx(); return f ? "/" + f + "/" : ""; }, set: () => {}, configurable: true });
        node.widgets.splice(node.widgets.indexOf(wFilter), 1);   // out of the view, the object stays with the frontend
    }
    if (!wFolder || !wName?.options) return;
    let loading = false;                // while a file is being read the menu is whole: a saved name is judged against the whole list
    let whole = wName.options.values;   // the whole list, kept up to date when the frontend refreshes it
    const narrowed = () => {
        const all = (typeof whole === "function" ? whole() : whole) || [];
        const f = folderRx();
        if (!f || loading) return all;
        const rx = new RegExp(f, "i"), some = all.filter((v) => rx.test(v));
        if (!some.length) return all;   // a folder that is gone: the whole list, not an empty menu
        return some.includes(wName.value) || !all.includes(wName.value) ? some : [wName.value, ...some];   // the file of now is never missing from its own menu
    };
    Object.defineProperty(wName.options, "values", { get: narrowed, set: (v) => { whole = v; }, configurable: true, enumerable: true });
    // live label: where the file of now sits in the folder chosen (3/12; with (all), in the whole list) = how many runs to queue
    const relabel = () => {
        let vals = wName.options?.values || [];
        const f = folderRx();
        if (f) { const rx = new RegExp(f, "i"); vals = vals.filter((v) => rx.test(v)); }
        const i = vals.indexOf(wName.value);
        wFolder.label = "folder" + (vals.length ? " · " + (i >= 0 ? i + 1 : "-") + "/" + vals.length : "");
    };
    const cbFolder = wFolder.callback;
    wFolder.callback = function () {
        const r = cbFolder?.apply(this, arguments);
        const f = folderRx();
        if (f && !new RegExp(f, "i").test(String(wName.value ?? ""))) {   // the file of now is outside the new folder: the first one inside
            const first = narrowed().find((v) => new RegExp(f, "i").test(v));
            if (first !== undefined) { wName.value = first; wName.callback?.(first); }
        }
        relabel();
        node.setDirtyCanvas(true, true);
        return r;
    };
    node.__wxLoading = (on) => { loading = on; };
    relabel();
    const tick = setInterval(relabel, 500);
    const origRemoved = node.onRemoved;
    node.onRemoved = function () { clearInterval(tick); return origRemoved ? origRemoved.apply(this, arguments) : undefined; };
    const origConfigure = node.onConfigure;
    node.onConfigure = function () {
        const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
        if (!(wFolder.options?.values || []).includes(wFolder.value)) wFolder.value = WX_ALL;   // a folder that is gone: (all)
        setTimeout(relabel, 0);
        return r;
    };
}

/** To call last, after wxCompactWidgets: the outermost onConfigure keeps the name menu whole for as long as the file is read. */
export function wxLoadingGuard(node) {
    const confAll = node.onConfigure;
    node.onConfigure = function () { node.__wxLoading?.(true); try { return confAll?.apply(this, arguments); } finally { node.__wxLoading?.(false); } };
}

/** The file name without folders and extension. */
export function wxCleanName(name) {
    return String(name || "").replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "");
}

/** Title = file name once the node is collapsed for the first time (a collapsed node shows only its title), and it
 *  follows the name from then on. node.title !== display name after a reload means the switch already happened. */
export function wxTitleFollows(node, wName, displayName) {
    node.__wxTitleOf = wName;   // who reads the title (WSave Image): the title is automatic when it equals the clean name
    const named = () => !!node.title && node.title !== displayName;
    const setTitle = () => { node.title = wxCleanName(wName.value); node.setDirtyCanvas(true, true); };
    let last = wName.value;
    const watch = () => {
        if (wName.value !== last) { last = wName.value; if (named()) setTitle(); }
        if (node.flags?.collapsed && !named()) setTitle();
    };
    wxOnRedraw(node, watch);   // every redraw, and on a timer under Nodes 2.0
    const onCollapse = node.collapse;
    node.collapse = function () { const r = onCollapse?.apply(this, arguments); watch(); return r; };
    const onConf = node.onConfigure;
    node.onConfigure = function () { const r = onConf?.apply(this, arguments); last = wName.value; return r; };
}
