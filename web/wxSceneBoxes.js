// WextraUI — the text boxes of WCutScene and WLoop Start Foley, and what WAudio Prompts gets back from the Run (its boxes
// are hidden behind the rows of web/wxAudioPrompts.js, which have their own height).
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
    wxCutScene: { grow: ["cuts", "beats"], fill: "cuts", key: "wx_cuts", head: 15 },   // head: the name above the box (web/wxCutScene.js)
    wxAudioPrompts: { grow: [], fill: "prompts", key: "wx_prompts" },
    wxFoleyLoopStart: { grow: ["timeline", "common"], head: 15, thin: "timeline" },   // thin: with a cable the box is one row (web/wxLoopRow.js writes its name)
};
const MIN_H = 50;     // an empty box: what Comfy gives a multiline box
const AIR = 4;        // under the last line, so the box never scrolls
let LOST = 20;        // what the frontend keeps of the widget's height for the margins around the box: learned from the first box drawn
const PREVIEW = "$$canvas-image-preview";
const LABEL_H = 30;   // the size Comfy writes under the picture, and a little air

let twin = null;      // the hidden box the text is measured in: one for all, same font and padding as the real ones
const headOf = (node) => (LiteGraph.vueNodesMode ? 0 : NODES[node.type]?.head || 0);
function measure(text, width, head) {
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
    return Math.max(MIN_H, twin.scrollHeight + LOST + AIR) + head;
}

// the names of the boxes of WLoop Start Foley, on the classic canvas (Nodes 2.0 writes its own): above the box, or beside
// the socket when a cable has made the box one row
function nameBoxes(node) {
    if (LiteGraph.vueNodesMode || !NODES[node.type]?.head || node.type === "wxCutScene") return;
    if (!document.getElementById("wx-box-style")) {
        const st = document.createElement("style"); st.id = "wx-box-style";
        st.textContent = `
          textarea.wx-box-ta { height: calc(100% - 15px) !important; margin-top: 15px !important; }
          .wx-box-hd { position: absolute; left: 0; right: 0; top: 0; padding: 0 2px; font: 11px/14px "Segoe UI", system-ui, sans-serif; color: var(--input-text, #ddd); white-space: nowrap; pointer-events: none; }`;
        document.head.appendChild(st);
    }
    for (const name of NODES[node.type].grow) {
        const box = (node.widgets || []).find((x) => x.name === name)?.element, p = box?.parentElement;
        if (!p || p.querySelector(":scope > .wx-box-hd")) continue;   // the frame of the box is made by Comfy after the node is born
        if (getComputedStyle(p).position === "static") p.style.position = "relative";
        const hd = document.createElement("div"); hd.className = "wx-box-hd"; hd.textContent = name;
        p.appendChild(hd);
        box.classList.add("wx-box-ta");
    }
}
const wired = (node, name) => (node.inputs || []).find((i) => i.widget?.name === name)?.link != null;
function boxH(node, w) {
    if (NODES[node.type]?.thin === w.name && wired(node, w.name) && !LiteGraph.vueNodesMode) return LiteGraph.NODE_WIDGET_HEIGHT;
    return measure(w.value, node.size[0] - 20, headOf(node));
}

// what the frontend keeps for itself between the widget's height and the box's: read on a box that is drawn
function learn(w, head) {
    if (!w.element?.isConnected || !w.computedHeight || !w.element.clientHeight) return;
    const lost = w.computedHeight - w.element.clientHeight - head;
    if (lost > 0 && lost < 60) LOST = lost;
}

// every growing box of the node at the height of its text, the node at the height of its boxes (onlyGrow: a node
// resized by hand is left taller if it is, but never too short for its text)
function fitBoxes(node, onlyGrow = false, again = true) {
    const names = NODES[node.type]?.grow || [];
    const ws = names.map((name) => (node.widgets || []).find((x) => x.name === name)).filter(Boolean);
    for (const w of ws) {
        learn(w, headOf(node));
        if (w.options) w.options.getMinHeight = () => boxH(node, w);
    }
    nameBoxes(node);
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
                if (w.options) w.options.getMinHeight = () => boxH(node, w);
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
        if (spec.thin) {   // the cable of a box that goes thin comes or goes: the node follows
            const onLink = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function () {
                const r = onLink?.apply(this, arguments);
                if (this.graph) setTimeout(() => fitBoxes(this), 0);
                return r;
            };
            const onDraw = nodeType.prototype.onDrawForeground;
            nodeType.prototype.onDrawForeground = function (ctx) {
                const r = onDraw?.apply(this, arguments);
                const i = (this.inputs || []).findIndex((s) => s.widget?.name === spec.thin);
                if (i >= 0 && this.inputs[i].link != null && !this.flags?.collapsed) {
                    const p = this.getConnectionPos(true, i);
                    ctx.save();
                    ctx.font = `${LiteGraph.NODE_SUBTEXT_SIZE || 12}px Arial`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
                    ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR || "#aaa";
                    ctx.fillText(spec.thin, p[0] - this.pos[0] + 10, p[1] - this.pos[1]);
                    ctx.restore();
                }
                return r;
            };
        }
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
