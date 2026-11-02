// WextraUI — the `folder` menu of the loaders (WLoRA, WCheckpoint), shared.
// `folder` sits above the name and narrows the name menu, and the walk of increment / decrement / randomize, to one
// folder (any depth) and what is under it. Frontend only: the name stays a full path and the backend checks it
// against the whole list. The label shows where the file of now sits in the folder (3/12) = the runs to queue.
import { wxCollapsedValue } from "./wxStyle.js";
export const WX_ALL = "(all)";
export const WX_NONE = "None";   // the empty block of WLoRA Stack (src/loraStack.py, NO_LORA): not a file, in no list and no count

/** Wires `folder` (wFolder) to the name menu (wName) of `node`. Sets node.__wxLoading(on): while a file is being
 *  read the menu is whole, so a saved name is judged against the whole list. wName may be a list of name menus
 *  (WLoRA Stack: one folder for every block): each menu is narrowed the same way, a change of folder moves none of the
 *  names already chosen, and the label reads how many files the folder holds (`folder · 12`); these menus give the files
 *  of the folder and nothing else: the caller puts `None` and the name of now on top. `onName` (WCheckpoint,
 *  Sick 30/10, variant B): the place of now goes on the name's own label (`ckpt_name · 3/12`), `folder` reads `folder`. */
export function wxFolderMenu(node, wFolder, wName, { onName = false } = {}) {
    if (Array.isArray(wName)) return folderMenuMany(node, wFolder, wName.filter((w) => w?.options));
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
    // (the one linked to this name: a node with several names, WLoRA Stack, has one box per name)
    const wFilter = (wName?.linkedWidgets || []).find((w) => /control_filter_list$/.test(w.name || "")) || W("control_filter_list");
    if (wFilter) {
        Object.defineProperty(wFilter, "value", { get: () => { const f = folderRx(); return f ? "/" + f + "/" : ""; }, set: () => {}, configurable: true });
        const at = node.widgets.indexOf(wFilter);
        if (at >= 0) node.widgets.splice(at, 1);   // out of the view, the object stays with the frontend
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
        const place = vals.length ? " · " + (i >= 0 ? i + 1 : "-") + "/" + vals.length : "";
        const lab = onName ? [wName, wName.name] : [wFolder, "folder"];
        if (lab[0].label === lab[1] + place) return;
        lab[0].label = lab[1] + place;
        if (onName) wFolder.label = "folder";
        node.setDirtyCanvas(true, false);
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

/** wxFolderMenu for several name menus: the same narrowing on each, no name moved. Only files in the list: a name kept
 *  from another folder must not count as one of this folder's (selection reads its count from here). */
function folderMenuMany(node, wFolder, names) {
    if (!wFolder || !names.length) return;
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const folderRx = () => {
        const v = String(wFolder.value ?? WX_ALL);
        return v === WX_ALL ? "" : "^" + v.split(" / ").map(esc).join("[\\\\/]") + "[\\\\/]";
    };
    let loading = false;
    const wholes = names.map((w) => w.options.values);
    const listOf = (k) => { const v = wholes[k]; return ((typeof v === "function" ? v() : v) || []).filter((x) => x !== WX_NONE); };
    names.forEach((w, k) => {
        const narrowed = () => {
            const all = listOf(k), f = folderRx();
            if (!f || loading) return all;
            const rx = new RegExp(f, "i"), some = all.filter((v) => rx.test(v));
            return some.length ? some : all;   // a folder that is gone: the whole list, not an empty menu
        };
        Object.defineProperty(w.options, "values", { get: narrowed, set: (v) => { wholes[k] = v; }, configurable: true, enumerable: true });
    });
    const relabel = () => {   // how many files the folder holds (with (all): the whole list)
        const f = folderRx(), all = listOf(0);
        const n = f ? all.filter((v) => new RegExp(f, "i").test(v)).length || all.length : all.length;
        const want = "folder" + (n ? " · " + n : "");
        if (wFolder.label !== want) { wFolder.label = want; node.setDirtyCanvas(true, false); }
    };
    const cbFolder = wFolder.callback;
    wFolder.callback = function () { const r = cbFolder?.apply(this, arguments); relabel(); node.setDirtyCanvas(true, true); return r; };
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

/** Collapsed, the node reads its name and the clean file name of `wName`: `WSampler · euler`, `WCheckpoint · krea2`
 *  (wxCollapsedValue). Before 0.11.0 the title became the file name itself: a file saved that way gets its name back. */
export function wxTitleFollows(node, wName, displayName) {
    node.__wxTitleOf = wName;   // who reads the title (WSave Image): a title equal to the clean name is the node's own, not the user's
    const clean = () => wxCleanName(wName.value);
    wxCollapsedValue(node, clean, displayName, clean);
}
