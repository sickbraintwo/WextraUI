// WAonV. Restyle B (Sick 01/11, mockup WAonV): under `length` two bars, `picture` and `sound`, and the blue bracket of the
// file: the stretch the file does not keep is hatched, the silence added is dashed, a line says it in words. Before a Run
// the lengths are not known: the bars are a scheme (a sound a little longer, to show the cut); after it they are the real
// ones, read from the text the backend sends back (mux() in src/foley.py), which stays the source of the rules: the three
// cases here are the ones of mux() in src/avtools.py, drawn. `filename_prefix` reads `save as`; in the file its name stays.
import { app } from "../../scripts/app.js";
import { wxOnRedraw } from "./wxStyle.js";

const H = 88;   // the bars and two lines of words: the height does not move with the sentence

function ensureStyle() {
    if (document.getElementById("wx-aonv-style")) return;
    const st = document.createElement("style"); st.id = "wx-aonv-style";
    st.textContent = `
      .wx-av { --ink: var(--input-text, #ddd); --quiet: color-mix(in srgb, var(--ink) 62%, transparent); --blue: color-mix(in srgb, #1464b3 45%, var(--ink));
        box-sizing: border-box; width: 100%; padding: 2px 15px 0; color: var(--quiet); font: 11px/14px "Segoe UI", system-ui, sans-serif; pointer-events: none; user-select: none; }
      .wx-av.vue { --ink: var(--component-node-foreground, #ddd); padding: 2px 0 0; }
      .wx-av .bar { display: flex; align-items: center; gap: 6px; height: 14px; }
      .wx-av .bar + .bar { margin-top: 3px; }
      .wx-av .k { width: 40px; flex-shrink: 0; font-size: 10.5px; }
      .wx-av .file .k { color: var(--blue); }
      .wx-av .tr { position: relative; flex: 1; height: 8px; }
      .wx-av .p { position: absolute; top: 0; bottom: 0; border-radius: 3px; box-sizing: border-box; }
      .wx-av .p.keep { background: color-mix(in srgb, var(--ink) 55%, transparent); }
      .wx-av .p.cut { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--ink) 30%, transparent) 0 2px, transparent 2px 4px); }
      .wx-av .p.pad { border: 1px dashed color-mix(in srgb, var(--ink) 40%, transparent); }
      .wx-av .file .p { top: 3px; bottom: auto; height: 2px; background: var(--blue); border-radius: 1px; }
      .wx-av .file .p::before, .wx-av .file .p::after { content: ""; position: absolute; top: -3px; width: 2px; height: 8px; background: var(--blue); }
      .wx-av .file .p::before { left: 0; }
      .wx-av .file .p::after { right: 0; }
      .wx-av .say { margin-top: 3px; }`;
    document.head.appendChild(st);
}

/** The bars of the file: length = video, audio or shortest; ran = { v, a, f } from a Run, or null for the scheme. */
function html(length, ran) {
    const V = ran ? ran.v : 10, A = ran ? ran.a : 11.5;
    const F = ran ? ran.f : length === "video" ? V : length === "audio" ? A : Math.min(V, A), M = Math.max(V, A, F);
    const pc = (x) => (x / M * 100).toFixed(1) + "%";
    const bar = (k, len) => {
        let h = `<div class="bar"><span class="k">${k}</span><span class="tr"><span class="p keep" style="left:0;width:${pc(Math.min(len, F))}"></span>`;
        if (len > F) h += `<span class="p cut" style="left:${pc(F)};width:${pc(len - F)}"></span>`;
        if (len < F) h += `<span class="p pad" style="left:${pc(len)};width:${pc(F - len)}"></span>`;
        return h + `</span></div>`;
    };
    // before a Run nothing says which of the two is longer: the words stay general
    const say = !ran ? { video: "The sound is cut, or padded with silence, to the picture.", audio: "The whole sound: a longer picture is cut.", shortest: "Both end with the shorter one." }[length]
        : length === "video" ? (A > V ? "The sound is cut to the picture." : A < V ? "The sound is padded with silence." : "Picture and sound end together.")
        : length === "audio" ? (A > V ? "The last stretch has sound and no picture." : A < V ? "The picture is cut to the sound." : "Picture and sound end together.")
        : "Both end with the shorter one.";
    return `${bar("picture", V)}${bar("sound", A)}<div class="bar file"><span class="k">file</span><span class="tr"><span class="p" style="left:0;width:${pc(F)}"></span></span></div>`
        + `<div class="say">${ran ? `${ran.f.toFixed(2)} s. ` : ""}${say}</div>`;
}

app.registerExtension({
    name: "wextraui.aonv",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxAonV") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            ensureStyle();
            const W = (name) => (node.widgets || []).find((w) => w.name === name);
            if (W("filename_prefix")) W("filename_prefix").label = "save as";
            const root = document.createElement("div"); root.className = "wx-av";
            const widget = node.addDOMWidget("wx_length", "custom", root, { serialize: false, hideOnZoom: false, margin: 0, getValue: () => undefined, setValue: () => {} });
            widget.serialize = false;
            widget.computeSize = (width) => [width, H];

            let ran = null, sig = null;
            const paint = () => {
                const length = String(W("length")?.value ?? "video"), now = `${length}|${ran ? [ran.v, ran.a, ran.f].join() : ""}|${!!LiteGraph.vueNodesMode}`;
                if (now === sig) return;
                sig = now;
                root.classList.toggle("vue", !!LiteGraph.vueNodesMode);
                root.innerHTML = html(length, ran);
            };
            paint();
            wxOnRedraw(node, paint);

            const onExec = node.onExecuted;
            node.onExecuted = function (msg) {
                const rr = onExec?.apply(this, arguments);
                const m = /video ([\d.]+) s · sound ([\d.]+) s · file ([\d.]+) s/.exec(String(msg?.text?.[0] ?? ""));
                if (m) { ran = { v: Number(m[1]), a: Number(m[2]), f: Number(m[3]) }; paint(); }
                return rr;
            };
            node.setSize([node.size[0], node.computeSize()[1]]);
            return r;
        };
        const origConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = origConfigure?.apply(this, arguments);
            this.setSize([this.size[0], Math.max(this.size[1], this.computeSize()[1])]);   // a size saved before the bars
            return r;
        };
    },
});
