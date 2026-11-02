// WextraUI — WCheckpoint: the core Load Checkpoint with the `folder` menu above the name, the `selection` drop-down
// under it (both shared with WLoRA: wxFolder.js, wxSelection.js; here the row is drawn as on WSampler, the place of now
// on the name's label) and the seed-style control under the name, auto title
// = checkpoint name once collapsed, and `carry` in and out (wxCarry.js): the odometer cable — every checkpoint of the
// folder for every sampler, in one queue.
import { app } from "../../scripts/app.js";
import { wxCompactWidgets } from "./wxStyle.js";
import { wxFolderMenu, wxLoadingGuard, wxTitleFollows, wxCleanName } from "./wxFolder.js";
import { wxSelectionMenu } from "./wxSelection.js";
import { wxCarryMenu } from "./wxCarry.js";

const TYPE = "wxCheckpointLoader";

app.registerExtension({
    name: "WextraUI.checkpointLoader",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== TYPE) return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            const W = (nm) => node.widgets.find((w) => w.name === nm);
            const wFolder = W("folder"), wName = W("ckpt_name"), wSel = W("selection");
            if (!wName) return r;
            wxFolderMenu(node, wFolder, wName, { onName: true });   // the place of now on the name's label: `ckpt_name · 3/12` (Sick 30/10, variant B)
            // under `folder`: ticks on the menu as `folder` leaves it; the row drawn as on WSampler (the checkpoints before and
            // after the one of now, a notch per place on the foot), the number only when names are ticked
            if (wSel) wxSelectionMenu(node, wSel, wName, { after: wFolder, watch: [wFolder], road: true, show: wxCleanName, count: false });
            // the control of the name: a value that is not one of its own (a file touched by hand) goes back to fixed
            const ctl = () => node.widgets.find((w) => w !== wFolder && w !== wName && Array.isArray(w.options?.values) && w.options.values.includes("randomize"));
            const onConf = node.onConfigure;
            node.onConfigure = function () {
                const res = onConf?.apply(this, arguments);
                const c = ctl();
                if (c && !c.options.values.includes(c.value)) c.value = "fixed";
                return res;
            };
            wxTitleFollows(node, wName, nodeData.display_name);
            wxCompactWidgets(node);
            wxLoadingGuard(node);   // outermost: the menu of ckpt_name stays whole for as long as the file is read
            wxCarryMenu(node, wName, [wFolder, wSel]);   // the odometer cable: at / size / move on the menu narrowed by `folder` and `selection`
            return r;
        };
    },
});
