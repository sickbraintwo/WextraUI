// WextraUI — WCheckpoint: the core Load Checkpoint with the `folder` menu above the name and the seed-style control
// under it (both shared with WLoRA: wxFolder.js), auto title = checkpoint name once collapsed, and `carry`
// in and out (wxCarry.js): the odometer cable — every checkpoint of the folder for every sampler, in one queue.
import { app } from "../../scripts/app.js";
import { wxCompactWidgets } from "./wxStyle.js";
import { wxFolderMenu, wxLoadingGuard, wxTitleFollows } from "./wxFolder.js";
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
            const wFolder = W("folder"), wName = W("ckpt_name");
            if (!wName) return r;
            wxFolderMenu(node, wFolder, wName);
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
            wxCarryMenu(node, wName, [wFolder]);   // the odometer cable: at / size / move on the menu narrowed by `folder`
            return r;
        };
    },
});
