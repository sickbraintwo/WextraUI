// WextraUI — WSampler / WScheduler: the menu with the control after generate, as a node of its own.
// The frontend makes the control (and its filter box) by itself from the schema. Here:
//  - `selection`, the drop-down above the name (wxSelection.js, shared with WCheckpoint / WLoRA): the ticked names,
//    in the order you drag them, are the menu of the name; the frontend's filter box is not needed and is taken out of the view.
//  - the title follows the name once the node is collapsed (a collapsed node shows only its title);
//  - `carry` in and out (wxCarry.js): the odometer cable — every scheduler for every sampler, in one queue.
import { app } from "../../scripts/app.js";
import { wxCompactWidgets } from "./wxStyle.js";
import { wxTitleFollows, wxLoadingGuard } from "./wxFolder.js";
import { wxSelectionMenu } from "./wxSelection.js";
import { wxCarryMenu } from "./wxCarry.js";

const TYPES = { wxSampler: "sampler_name", wxScheduler: "scheduler" };

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
            const wFilter = W("control_filter_list");   // not needed: the menu itself is narrowed. Out of the view, empty.
            if (wFilter) {
                Object.defineProperty(wFilter, "value", { get: () => "", set: () => {}, configurable: true });
                node.widgets.splice(node.widgets.indexOf(wFilter), 1);
            }
            wxSelectionMenu(node, wSel, wName);   // the drop-down first, above the name
            wxTitleFollows(node, wName, nodeData.display_name);
            wxCompactWidgets(node);
            wxLoadingGuard(node);   // outermost: the menu of the name stays whole for as long as the file is read
            wxCarryMenu(node, wName, [wSel]);   // the odometer cable: at / size / move on the menu narrowed by `selection`
            return r;
        };
    },
});
