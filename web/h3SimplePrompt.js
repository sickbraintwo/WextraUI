// WSimple Prompt H3. Restyle B (Sick 01/11, mockup WSimplePromptH3): every field is a row like the three `avoid` under it,
// the name inside on the left, the text after it, one line tall and taller only when the text wraps. The names are the
// ones of the prompt, with the capital (Scene, Action, Camera...: Sick 01/11); in the file they stay the names of the schema.
// The rows are Comfy's own multiline widgets, drawn differently, so the socket on the left and a cable on them stay what
// they are: with a cable a row keeps showing, read only, with the text from the far end when the graph can tell it (the
// frontend hides a DOM widget with a cable: see the note in promptRows.js). Under Nodes 2.0 the same on Vue's textarea.
import { app } from "../../scripts/app.js";
import { wxOnRedraw, wxVueNodeEl } from "./wxStyle.js";
import { upstreamValue } from "./wxReso.js";

const FIELDS = [
    ["scene", "Scene", "what we see before anything happens"],
    ["action", "Action", "what happens, in order: first… then… finally…"],
    ["camera", "Camera", "one camera idea for the whole clip"],
    ["sound", "Sound", "timbre and texture, and what stays silent"],
    ["stays_fixed", "What stays fixed", "what must not move or change"],
    ["what_moves", "What moves", "what moves, and how"],
    ["final_state", "Final state", "how the clip ends"],
];
const MIN_H = 20, GAP = 4;   // a row as tall as a native one, with the same gap
const VUE_MIN = 31;

function ensureStyle() {
    if (document.getElementById("wx-sp-style")) return;
    const st = document.createElement("style"); st.id = "wx-sp-style";
    st.textContent = `
      textarea.wx-sp-ta { --ink: var(--input-text, #ddd); box-sizing: border-box !important; display: block; width: calc(100% - 30px) !important; margin: 0 15px !important; padding: 2px 14px 2px 118px !important;
        resize: none !important; overflow: hidden !important; min-height: 0 !important; font: 12px/16px "Segoe UI", system-ui, sans-serif !important; color: var(--ink) !important;
        background: var(--wx-sp-bg, #222) !important; border: 0 !important; border-radius: 10px !important; box-shadow: inset 0 0 0 1px var(--wx-sp-line, #666) !important; }
      textarea.wx-sp-ta:focus { outline: none !important; box-shadow: inset 0 0 0 1px #1464b3 !important; }
      textarea.wx-sp-ta::placeholder { color: color-mix(in srgb, var(--ink) 40%, transparent); }
      .wx-sp-lb { position: absolute; left: 29px; top: 0; font: 12.5px/20px Inter, Arial, sans-serif; color: var(--wx-sp-label, #999); pointer-events: none; white-space: nowrap; }
      textarea.wx-sp-vue { box-sizing: border-box !important; flex: 1; min-width: 0; min-height: 0 !important; width: calc(100% - 104px) !important; margin-left: 104px !important;
        padding: 7px 14px !important; resize: none !important; overflow: hidden !important; font: 12.5px/16px "Segoe UI", system-ui, sans-serif !important; border-radius: 8px !important; }
      .wx-sp-vl { position: absolute; left: 12px; top: 0; font: 13px/31px Inter, "Segoe UI", sans-serif; color: var(--node-component-slot-text, #a0a0a0); pointer-events: none; white-space: nowrap; }`;
    document.head.appendChild(st);
}

function fit(el, min) {   // the true height of the text: back to "auto" first, or the last measure is read
    el.style.height = "auto";
    const h = Math.max(min, el.scrollHeight);
    el.style.height = h + "px";
    const p = el.parentElement;
    if (p?.classList.contains("dom-widget")) p.style.height = h + "px";
    return h;
}

app.registerExtension({
    name: "wextraui.h3simpleprompt",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "h3SimplePrompt") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            ensureStyle();
            const W = (name) => (node.widgets || []).find((w) => w.name === name);
            const linked = (name) => (node.inputs || []).find((i) => i.name === name)?.link != null;
            const rows = FIELDS.map(([name, label, hint]) => ({ name, label, hint, w: W(name) })).filter((x) => x.w?.element);

            // a cable on a row must not hide it (see the top of the file)
            const origUCD = node.updateComputedDisabled;
            node.updateComputedDisabled = function () {
                const rr = origUCD?.apply(this, arguments);
                for (const x of rows) x.w.computedDisabled = false;
                return rr;
            };

            for (const x of rows) x.w.isVisible = () => !node.flags?.collapsed;

            const reflow = () => { const h = node.computeSize()[1]; if (Math.abs(h - node.size[1]) >= 1) node.setSize([node.size[0], h]); node.setDirtyCanvas(true, true); };
            for (const x of rows) {
                const el = x.w.element;
                el.classList.add("wx-sp-ta");
                el.rows = 1;
                el.placeholder = x.hint;
                x.w.label = x.label;
                x.w.options = x.w.options || {};
                x.w.options.margin = 0;
                x.lb = document.createElement("span"); x.lb.className = "wx-sp-lb"; x.lb.textContent = x.label;
                x.w.computeSize = (width) => [width, fit(el, MIN_H) + GAP];
                el.addEventListener("input", reflow);
            }

            // Nodes 2.0 has a textarea of its own for each row, with the name in a <label> above it
            const vueRow = (x) => {
                const root = wxVueNodeEl(node); if (!root) return null;
                const all = [...root.querySelectorAll(".lg-node-widget textarea")];
                const named = (t) => t.closest(".lg-node-widget")?.querySelector("label")?.textContent.trim() === x.label;
                return all.find((t) => t.dataset.wxSp === x.name) || all.find((t) => !t.dataset.wxSp && named(t)) || null;
            };
            let lastW = 0, sig = null;
            const tick = () => {
                const vue = !!LiteGraph.vueNodesMode;
                let changed = false;
                for (const x of rows) {
                    const el = x.w.element, lk = linked(x.name);
                    if (!vue && el.parentElement && x.lb.parentElement !== el.parentElement) {   // the box of the textarea is made by Comfy after the node is born
                        if (getComputedStyle(el.parentElement).position === "static") el.parentElement.style.position = "relative";
                        el.parentElement.appendChild(x.lb);
                    }
                    el.readOnly = lk;
                    el.style.fontStyle = lk ? "italic" : "";
                    el.placeholder = lk ? "← linked text" : x.hint;
                    const shown = lk ? upstreamValue(node, x.name) : undefined;
                    if (lk && typeof shown === "string" && el.value !== shown) { el.value = shown; changed = true; }
                    const vt = vue ? vueRow(x) : null;
                    if (vt) {
                        const p = vt.closest(".lg-node-widget");
                        if (vt.dataset.wxSp !== x.name) {
                            vt.dataset.wxSp = x.name; vt.classList.add("wx-sp-vue"); vt.rows = 1;
                            vt.addEventListener("input", () => fit(vt, VUE_MIN));
                            p.style.position = "relative";
                            const lb = p.querySelector("label"); if (lb) lb.style.display = "none";
                            const vl = document.createElement("span"); vl.className = "wx-sp-vl"; vl.textContent = x.label; p.appendChild(vl);
                        }
                        vt.placeholder = el.placeholder; vt.readOnly = lk; vt.style.fontStyle = el.style.fontStyle;
                        if (lk && typeof shown === "string" && vt.value !== shown) vt.value = shown;
                        fit(vt, VUE_MIN);
                    }
                }
                // the rows wrap again at a new width, and a value may come from outside (a load, an undo)
                const w = rows[0]?.w.element.offsetWidth || 0, now = rows.map((x) => x.w.element.value.length).join();
                if (changed || (w && w !== lastW) || now !== sig) { lastW = w || lastW; sig = now; if (!vue) reflow(); }
            };
            const nativeColors = () => {   // the colours of the native rows under them
                const s = document.documentElement.style;
                if (window.LiteGraph) { s.setProperty("--wx-sp-bg", LiteGraph.WIDGET_BGCOLOR); s.setProperty("--wx-sp-line", LiteGraph.WIDGET_OUTLINE_COLOR); s.setProperty("--wx-sp-label", LiteGraph.WIDGET_SECONDARY_TEXT_COLOR); }
            };
            nativeColors();
            wxOnRedraw(node, tick);
            setTimeout(() => { tick(); reflow(); }, 0);
            return r;
        };
    },
});
