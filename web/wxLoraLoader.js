// WextraUI — LoRA Loader + Trigger: chip picker for trigger words / training tags, and collapsed title = name · LoRA.
// The picker (wxLoraPicker.js, shared with WLoRA Stack): click a chip to pick it, drag the picked ones to reorder, ✕ to remove;
// the picked words are stored in the (hidden) `picked` widget as a JSON list; the backend uses them when present.
// `carry` in and out (wxCarry.js): the odometer cable — every LoRA of the folder for every checkpoint, in one queue.
import { app } from "../../scripts/app.js";
import { wxCompactWidgets, wxHideWidget } from "./wxStyle.js";
import { wxFolderMenu, wxLoadingGuard, wxCleanName, wxTitleFollows } from "./wxFolder.js";
import { wxSelectionMenu } from "./wxSelection.js";
import { wxCarryMenu } from "./wxCarry.js";
import { wxLoraPicker } from "./wxLoraPicker.js";

const TYPE = "wxLoraLoaderTrigger";

app.registerExtension({
    name: "WextraUI.loraLoader",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== TYPE) return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            const wLora = node.widgets.find((w) => w.name === "lora_name");
            const W = (nm) => node.widgets.find((w) => w.name === nm);
            // `folder` (above the name) + the filter box of the control after generate: shared with WCheckpoint (wxFolder.js)
            const wFolder = W("folder"), wSel = W("selection");
            wxFolderMenu(node, wFolder, wLora);
            // `where` hidden since 0.11.0 (Sick, 26/10: the words always go before the prompt): the box stays in the schema, at its
            // place, so a saved file keeps its value (one saved with suffix keeps suffix) and the slots after it stay in line
            if (W("where")) wxHideWidget(W("where"), node);
            // `selection` (under `folder`, shared with WCheckpoint / WSampler: wxSelection.js): the ticked LoRAs, in their order, are the menu
            if (wSel && wLora) wxSelectionMenu(node, wSel, wLora, { after: wFolder, watch: [wFolder] });
            // Loading a file: put the values where they belong and settle what an older layout left in a wrong box.
            {
                const CTLS = ["fixed", "increment", "decrement", "randomize", "increment-wrap"];   // control after generate of the LoRA
                const SCOPES = ["any", "folder"], WALKS = ["fixed", "increment", "decrement"];      // boxes of 0.3.6 - 0.4.x, gone
                const wStr = W("strength_model");
                const loraCtl = () => node.widgets.find((w) => w !== wFolder && w !== wLora && Array.isArray(w.options?.values) && w.options.values.includes("randomize"));
                // saved layouts, slot by slot (null = a box that is gone, "ctl" = the control of the LoRA):
                //   A = before the control (7 values); B = 0.3.4 (8); C = 0.3.6-0.4.x (12) and C' = without strength_until (11), both with
                //   `lora scope` in slot 2 and the strength walk in 4-5; D = the 12 of the first `folder` build, `folder` in front
                const LAYOUTS = {
                    A: ["lora_name", "strength_model", "strength_clip", "rgthree_info", "where", "separator", "picked"],
                    B: ["lora_name", "ctl", "strength_model", "strength_clip", "rgthree_info", "where", "separator", "picked"],
                    C: ["lora_name", "ctl", null, "strength_model", null, null, null, "strength_clip", "rgthree_info", "where", "separator", "picked"],
                    C1: ["lora_name", "ctl", null, "strength_model", null, null, "strength_clip", "rgthree_info", "where", "separator", "picked"],
                    D: ["folder", "lora_name", "ctl", null, "strength_model", null, null, "strength_clip", "rgthree_info", "where", "separator", "picked"],
                };
                // the value's own type, not the widget's (`picked` is a hidden converted-widget by the time a file
                // loads, so its .type is no help; a combo checks membership, a plain string/number/boolean the typeof)
                const KIND = { folder: "combo", lora_name: "string", ctl: "combo", strength_model: "number",
                               strength_clip: "number", rgthree_info: "boolean", where: "combo", separator: "string", picked: "string" };
                const fitsKind = (w, nm, v) => {
                    const k = KIND[nm];
                    if (k === "combo") return (w.options?.values || []).includes(v);   // a LoRA gone from disk: kind "string", never checked here
                    if (k === "number") return typeof v === "number" && Number.isFinite(v);
                    return typeof v === k;
                };
                // "" = today's layout (9 values: the frontend has put every value in place already)
                const layoutOf = (wv) => {
                    if (wv.length >= 12 && SCOPES.includes(wv[3]) && WALKS.includes(wv[5])) return "D";
                    if (wv.length >= 11 && SCOPES.includes(wv[2]) && WALKS.includes(wv[4])) return typeof wv[7] === "boolean" ? "C1" : "C";
                    if (typeof wv[1] === "string" && CTLS.includes(wv[2])) return "";
                    return CTLS.includes(wv[1]) ? "B" : "A";
                };
                const origConfigure = node.onConfigure;
                node.onConfigure = function (info) {
                    const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                    const wv = info?.widgets_values, named = info?.widgets_values_named;
                    // no names to go by (a file saved before the frontend kept them): recognise the old layout from the array
                    if (Array.isArray(wv) && wv.length > 1 && !(named && typeof named === "object")) {
                        const kind = layoutOf(wv);
                        (LAYOUTS[kind] || []).forEach((nm, i) => {
                            if (!nm) return;
                            const w = nm === "ctl" ? loraCtl() : W(nm), v = wv[i];
                            if (w && v !== null && v !== undefined && fitsKind(w, nm, v)) w.value = v;   // a LoRA gone from disk stays in the box (kind "string", no membership check)
                        });
                    }
                    // the switch was called `civitai` up to 0.4.x: a file with names hands its value over
                    const wSw = W("rgthree_info");
                    const was = named && typeof named === "object" && named.rgthree_info === undefined ? [named.rg3info, named.civitai].find((v) => typeof v === "boolean") : undefined;
                    if (wSw && was !== undefined) wSw.value = was;   // `rg3info` for a few builds of 0.5.0, never released
                    // a file saved with the eight outputs of 0.4.x: `name` moves from slot 6 to 3, `carry` (0.6.0) comes last, the four
                    // outputs that are gone lose their cables (once the whole graph is in place: the nodes at the other end may not be yet)
                    setTimeout(() => {
                        const outs = node.outputs || [], g = node.graph;
                        // (the frontend has already renamed the first five after today's outputs: the old node is told by its tail)
                        if (!g || outs.length !== 8 || outs[6]?.name !== "name" || outs[7]?.name !== "info") return;
                        const linkOf = (id) => (g.links instanceof Map ? g.links.get(id) : g.getLink ? g.getLink(id) : g.links?.[id]);
                        for (const i of [3, 4, 5, 7]) for (const id of [...(outs[i].links || [])]) g.removeLink(id);
                        for (const id of outs[6].links || []) { const l = linkOf(id); if (l) l.origin_slot = 3; }
                        node.outputs = [outs[0], outs[1], outs[2], outs[6], outs[4]?.name === "carry" ? outs[4] : { name: "carry", type: "WX_CARRY", links: null }];
                        node.setSize([node.size[0], Math.max(node.size[1], node.computeSize()[1])]);
                        node.setDirtyCanvas(true, true);
                    }, 0);
                    // guard: a wf saved with an old layout can leave a value of the wrong type here (e.g. true in strength_model)
                    const num = (w, d) => { if (w && (typeof w.value !== "number" || !Number.isFinite(w.value))) w.value = d; };
                    const wLoraCtl = loraCtl();
                    if (wLoraCtl && !wLoraCtl.options.values.includes(wLoraCtl.value)) {
                        // a file in the pre-control layout opened by 0.3.5 put strength_model in this slot: take it back
                        if (typeof wLoraCtl.value === "number" && Number.isFinite(wLoraCtl.value) && wStr && (typeof wStr.value !== "number" || !Number.isFinite(wStr.value))) wStr.value = wLoraCtl.value;
                        wLoraCtl.value = "fixed";
                    }
                    num(wStr, 1.0); num(W("strength_clip"), 1.0);
                    return r;
                };
            }
            // rgthree_info: the official words come from the .rgthree-info.json next to the LoRA (the backend reads it, nothing
            // leaves the disk). No such file for the LoRA of now = the switch is greyed out and the chips are the header's tags.
            const wRg3 = node.widgets.find((w) => w.name === "rgthree_info");
            const wPicked = node.widgets.find((w) => w.name === "picked");
            if (!wLora || !wPicked) return r;
            // the chip picker (wxLoraPicker.js, shared with WLoRA Stack); right after it is added, the compaction, the
            // loading guard and the carry, in the order they always had
            wxLoraPicker(node, wLora, wPicked, wRg3, { mounted: () => {
                wxCompactWidgets(node);
                wxLoadingGuard(node);   // outermost: the menu of lora_name stays whole for as long as the file is read
                wxCarryMenu(node, wLora, [wFolder, wSel, W("where")]);   // the odometer cable: at / size / move on the menu narrowed by `folder` and `selection`
                // Collapsed, the node reads `WLoRA · <LoRA name>` (wxTitleFollows: the name stays, the LoRA follows the menu).
                wxTitleFollows(node, wLora, nodeData.display_name);
            } });
            return r;
        };
    },
});
