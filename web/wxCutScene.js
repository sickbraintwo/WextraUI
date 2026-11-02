// WCutScene. Restyle C (Sick 02/11, mockup WCutScene): the two boxes keep a name and their rule when full, and under them a
// strip shows the scenes, in proportion to their length, before the Run: a beat with a blue edge, a scene under half a second
// orange as on the sheet. A time that is not a time, or past the end, reads under the strip at once. The strip reads the
// boxes as the backend does (web/wxTimes.js) and looks at nothing else: the Run does what it did. The length of the video
// comes from the Run (`wx_total`) and stays with the node, so it is the length of the last Run. Under Nodes 2.0 the name is
// Vue's, the rule goes beside it and the short example comes back into the box.
import { app } from "../../scripts/app.js";
import { wxOnRedraw, wxVueNodeEl } from "./wxStyle.js";
import { upstreamInt, upstreamValue } from "./wxReso.js";
import { scenesOf } from "./wxTimes.js";

const BOXES = [["cuts", "found at the Run, editable"], ["beats", "sound changes, shot goes on"]];
const H = 44;       // the strip and its line of words
const SHORT = 0.5;  // seconds: the sheet of src/cutscene.py marks these
const VUE_MIN = 64; // an empty box of Vue

function ensureStyle() {
    if (document.getElementById("wx-cut-style")) return;
    const st = document.createElement("style"); st.id = "wx-cut-style";
    st.textContent = `
      textarea.wx-cut-ta { height: calc(100% - 15px) !important; margin-top: 15px !important; }
      .wx-cut-hd { --ink: var(--input-text, #ddd); position: absolute; left: 0; right: 0; top: 0; display: flex; align-items: baseline; gap: 6px; padding: 0 2px; font: 11px/14px "Segoe UI", system-ui, sans-serif; color: var(--ink); white-space: nowrap; overflow: hidden; pointer-events: none; }
      .wx-cut-rule { font-size: 10.5px; color: color-mix(in srgb, var(--ink) 62%, transparent); overflow: hidden; text-overflow: ellipsis; }
      .wx-cut-vr { margin-left: 6px; font-size: 10.5px; opacity: .7; }
      .wx-cut { --ink: var(--input-text, #ddd); --quiet: color-mix(in srgb, var(--ink) 62%, transparent);
        box-sizing: border-box; width: 100%; padding: 6px 15px 0; color: var(--ink); font: 10.5px/14px "Segoe UI", system-ui, sans-serif; user-select: none; pointer-events: none; }
      .wx-cut.vue { --ink: var(--component-node-foreground, #ddd); padding: 6px 0 0; }
      .wx-cut * { box-sizing: border-box; }
      .wx-cut .bar { display: flex; gap: 1px; height: 16px; border-radius: 4px; overflow: hidden; }
      .wx-cut .sg { min-width: 2px; background: color-mix(in srgb, var(--ink) 16%, transparent); font-size: 10px; line-height: 16px; text-align: center; font-variant-numeric: tabular-nums; overflow: hidden; pointer-events: auto; }
      .wx-cut .sg:nth-child(even) { background: color-mix(in srgb, var(--ink) 26%, transparent); }
      .wx-cut .sg.beat { box-shadow: inset 2px 0 0 #a8cdf5; }
      .wx-cut .sg.short { background: color-mix(in srgb, #f0a070 55%, transparent); color: #f0a070; }
      .wx-cut .sg.none { background: transparent; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 22%, transparent); color: var(--quiet); }
      .wx-cut .cap { display: flex; justify-content: space-between; gap: 6px; margin-top: 3px; color: var(--quiet); white-space: nowrap; font-variant-numeric: tabular-nums; }
      .wx-cut .err { color: #f0a070; overflow: hidden; text-overflow: ellipsis; }`;
    document.head.appendChild(st);
}

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

app.registerExtension({
    name: "wextraui.cutscene",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxCutScene") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            ensureStyle();
            const W = (name) => (node.widgets || []).find((w) => w.name === name);
            const linked = (name) => (node.inputs || []).find((i) => i.name === name)?.link != null;
            const read = (name) => (linked(name) ? String(upstreamValue(node, name) ?? "") : String(W(name)?.value ?? ""));
            const fpsNow = () => (linked("fps") ? upstreamInt(node, "fps", true) : Number(W("fps")?.value)) || 24;

            for (const [name] of BOXES) W(name)?.element?.classList.add("wx-cut-ta");

            const root = mk("div", "wx-cut"), bar = mk("div", "bar"), cap = mk("div", "cap"), left = mk("span"), right = mk("span");
            cap.append(left, right);
            root.append(bar, cap);
            const widget = node.addDOMWidget("wx_strip", "custom", root, { serialize: false, hideOnZoom: false, margin: 0, getValue: () => undefined, setValue: () => {} });
            widget.serialize = false;   // the strip reads the boxes: no slot of its own in widgets_values
            widget.computeSize = (width) => [width, H];

            let sig = null;
            const paint = () => {
                const ran = node.properties?.wx_video, fps = Number(ran?.fps) || fpsNow(), total = Number(ran?.frames) || null;
                const cuts = read("cuts"), beats = read("beats"), vue = !!LiteGraph.vueNodesMode;
                const now = [cuts, beats, fps, total, vue].join("\u0001");
                if (now === sig) return;
                sig = now;
                root.classList.toggle("vue", vue);
                const { starts, beats: bt, err, found } = scenesOf(cuts, beats, fps, total);
                if (total) {
                    bar.replaceChildren(...starts.map((a, k) => {
                        const b = starts[k + 1] ?? total, w = ((b - a) / total) * 100, beat = bt.has(a), s = mk("div", "sg");
                        s.classList.toggle("none", found);
                        s.classList.toggle("beat", beat);
                        s.classList.toggle("short", !found && (b - a) / fps < SHORT);
                        s.style.width = `${w}%`;
                        s.textContent = w > 7 ? String(k) : "";
                        s.title = `${k} · ${(a / fps).toFixed(2)} - ${(b / fps).toFixed(2)} s${beat ? " (beat)" : ""}`;
                        return s;
                    }));
                } else {
                    const s = mk("div", "sg none"); s.style.width = "100%";
                    bar.replaceChildren(s);
                }
                const n = starts.length, count = `${n} scene${n === 1 ? "" : "s"}`;
                left.className = err ? "err" : "";
                left.textContent = err || (found ? "the cuts come with the Run" : total ? count : `${count}, the length comes with the Run`);
                left.title = err || "";
                right.textContent = total ? `${(total / fps).toFixed(2)} s` : "";
            };

            const tick = () => {
                const vue = !!LiteGraph.vueNodesMode, el = wxVueNodeEl(node);
                for (const [name, rule] of BOXES) {
                    const w = W(name), box = w?.element;
                    if (!vue && box?.parentElement && !box.parentElement.querySelector(":scope > .wx-cut-hd")) {   // the frame of the box is made by Comfy after the node is born
                        const p = box.parentElement, hd = mk("div", "wx-cut-hd");
                        if (getComputedStyle(p).position === "static") p.style.position = "relative";
                        hd.append(mk("span", "", name), mk("span", "wx-cut-rule", rule));
                        p.appendChild(hd);
                    }
                    if (!el) continue;
                    const all = [...el.querySelectorAll(".lg-node-widget textarea")];
                    const vt = all.find((t) => t.dataset.wxCut === name) || all.find((t) => !t.dataset.wxCut && t.closest(".lg-node-widget")?.querySelector("label")?.textContent.trim() === name);
                    if (!vt) continue;
                    if (vt.dataset.wxCut !== name) {
                        vt.dataset.wxCut = name;
                        vt.closest(".lg-node-widget").querySelector("label")?.append(mk("span", "wx-cut-vr", rule));
                    }
                    if (box && vt.placeholder !== box.placeholder) vt.placeholder = box.placeholder;
                    if (vt.value !== vt.__wxText) {   // as tall as its text here too: wxSceneBoxes.js fits the boxes of the canvas
                        vt.__wxText = vt.value;
                        vt.style.height = "0px"; vt.style.overflow = "hidden";
                        vt.style.height = Math.max(VUE_MIN, vt.scrollHeight) + "px";
                    }
                }
                paint();
            };
            paint();
            wxOnRedraw(node, tick, 150);

            const onExec = node.onExecuted;
            node.onExecuted = function (msg) {
                const rr = onExec?.apply(this, arguments);
                const t = msg?.wx_total;
                if (t) { node.properties = node.properties || {}; node.properties.wx_video = { frames: Number(t[0]), fps: Number(t[1]) }; paint(); }
                return rr;
            };
            node.setSize([node.size[0], node.computeSize()[1]]);
            return r;
        };
    },
});
