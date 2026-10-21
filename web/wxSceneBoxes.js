// WextraUI — the text boxes of WCutScene, WAudio Prompts and WLoop Start Foley.
// 1. Each box is as tall as its text (Sick, 21/10/2026): empty, the height of an ordinary box; typed into, filled by the
//    Run or loaded with a workflow, it grows to show every line, and the node grows with it. The text is measured in a
//    hidden twin of the box, at the node's width, so the measure is the same at every zoom and even while the real box
//    is not on screen (Comfy hides them when the canvas is far away).
// 2. After a Run, what the backend wrote (the cuts it found, the prompts it wrote) goes into the node's box, so it can be
//    read, fixed by hand and kept with the workflow. WCutScene fills only an empty box; WAudio Prompts sends the whole box
//    back (the lines that were there, kept, plus the scenes written now).
// 3. The sheet of frames that arrives after the Run takes just the height it needs at the node's width (Comfy keeps
//    220 px for any preview, which left a wide, short sheet floating in empty space) (Sick, 19/10/2026).
import { app } from "../../scripts/app.js";

// the boxes that grow, and (for the two nodes that get text back from the Run) the box filled and the key it comes under
const NODES = {
    wxCutScene: { grow: ["cuts", "beats"], fill: "cuts", key: "wx_cuts" },
    wxAudioPrompts: { grow: ["prompts", "custom"], fill: "prompts", key: "wx_prompts" },
    wxFoleyLoopStart: { grow: ["timeline", "common"] },
};
const MIN_H = 50;     // an empty box: what Comfy gives a multiline box
const AIR = 4;        // under the last line, so the box never scrolls
let LOST = 20;        // what the frontend keeps of the widget's height for the margins around the box: learned from the first box drawn
const PREVIEW = "$$canvas-image-preview";
const LABEL_H = 30;   // the size Comfy writes under the picture, and a little air

let twin = null;      // the hidden box the text is measured in: one for all, same font and padding as the real ones
function measure(text, width) {
    if (!twin) {
        twin = document.createElement("textarea");
        twin.className = "comfy-multiline-input";
        twin.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden;height:0;overflow:hidden;resize:none;box-sizing:border-box";
        twin.setAttribute("aria-hidden", "true");
        document.body.appendChild(twin);
    }
    twin.style.width = Math.max(40, width) + "px";
    twin.value = text || "";
    twin.style.height = "0px";
    return Math.max(MIN_H, twin.scrollHeight + LOST + AIR);
}

// what the frontend keeps for itself between the widget's height and the box's: read on a box that is drawn
function learn(w) {
    if (!w.element?.isConnected || !w.computedHeight || !w.element.clientHeight) return;
    const lost = w.computedHeight - w.element.clientHeight;
    if (lost > 0 && lost < 60) LOST = lost;
}

// every growing box of the node at the height of its text, the node at the height of its boxes (onlyGrow: a node
// resized by hand is left taller if it is, but never too short for its text)
function fitBoxes(node, onlyGrow = false, again = true) {
    const names = NODES[node.type]?.grow || [];
    const ws = names.map((name) => (node.widgets || []).find((x) => x.name === name)).filter(Boolean);
    for (const w of ws) {
        learn(w);
        if (w.options) w.options.getMinHeight = () => measure(w.value, node.size[0] - 20);
    }
    const h = node.computeSize()[1];
    if (!onlyGrow || node.size[1] < h) node.setSize([node.size[0], h]);
    node.setDirtyCanvas(true, true);
    // once drawn, a box that still scrolls (the margins were not what was thought) is measured again, once
    if (again) requestAnimationFrame(() => {
        if (ws.some((w) => w.element?.isConnected && w.element.scrollHeight > w.element.clientHeight + 1)) fitBoxes(node, onlyGrow, false);
    });
}

// the preview of the sheet as tall as the sheet drawn across the node, the node fitted to it
function fitSheet(node, tries = 20) {
    const p = node.widgets?.find((w) => w.name === PREVIEW);
    const im = node.imgs?.[0];
    if (!p || !im || !im.naturalWidth) {
        if (tries > 0) setTimeout(() => fitSheet(node, tries - 1), 100);
        return;
    }
    const h = () => {   // read at every layout: the picture of the next Run, or a node made wider, change it
        const i = node.imgs?.[0];
        return i?.naturalWidth ? Math.round((node.size[0] - 20) * i.naturalHeight / i.naturalWidth) + LABEL_H : 220;
    };
    p.computeLayoutSize = () => ({ minHeight: h(), maxHeight: h(), minWidth: 1 });
    node.setSize([node.size[0], node.computeSize()[1]]);
    node.setDirtyCanvas(true, true);
}

app.registerExtension({
    name: "WextraUI.sceneBoxes",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        const spec = NODES[nodeData.name];
        if (!spec) return;
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);
            const node = this;
            for (const name of spec.grow) {
                const w = (node.widgets || []).find((x) => x.name === name);
                if (!w) continue;
                if (w.options) w.options.getMinHeight = () => measure(w.value, node.size[0] - 20);
                w.element?.addEventListener("input", () => fitBoxes(node));   // typed: the box follows, line by line
            }
            setTimeout(() => fitBoxes(node), 0);
            return r;
        };
        // a loaded workflow puts its text in after onNodeCreated: measured then (and once more when the fonts are in)
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = onConfigure?.apply(this, arguments);
            setTimeout(() => fitBoxes(this), 0);
            setTimeout(() => fitBoxes(this), 300);
            return r;
        };
        // a node made wider or narrower: the lines wrap otherwise, the boxes are measured again
        const onResize = nodeType.prototype.onResize;
        nodeType.prototype.onResize = function () {
            const r = onResize?.apply(this, arguments);
            if (this.graph && !this._wxFitting) {
                this._wxFitting = true;
                setTimeout(() => { try { fitBoxes(this, true); } finally { this._wxFitting = false; } }, 0);
            }
            return r;
        };
        if (!spec.fill) return;
        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            const r = onExecuted?.apply(this, arguments);
            const text = message?.[spec.key]?.[0];
            const w = (this.widgets || []).find((x) => x.name === spec.fill);
            if (text && w && w.value !== text) {
                w.value = text;
                w.callback?.(text);
                this.graph?.change?.();
            }
            fitBoxes(this);
            fitSheet(this);   // the sheet came: fitted under the boxes (again a moment later, when the new picture has loaded)
            setTimeout(() => { fitBoxes(this); fitSheet(this, 0); }, 800);
            return r;
        };
    },
});
