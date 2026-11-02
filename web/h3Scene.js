// WScene H3. Restyle C (Sick 01/11, mockup WSceneH3): the rows read short names that fit (in the file and in the tooltip
// the names of the schema stay), and between the sockets and the rows a strip shows the scene on its time: what it
// inherits from the scene before, or how it starts, where the guide sits, where it lands, the duration. The duration is
// read from the node on the cable when that node holds it (a box, WScene Composer H3); when it is made by the Run the
// strip says `no duration` and keeps the proportions of five seconds. Nothing is anchored here: the backend decides.
import { app } from "../../scripts/app.js";
import { wxOnRedraw } from "./wxStyle.js";
import { originOf, upstreamInt } from "./wxReso.js";

const LABELS = { control_after_generate: "control", first_frame_from: "start", guide_frame_at: "guide at", handoff_frames: "handoff", previous_from: "previous", resume_from_video: "resume clip" };
const FALLBACK = 5;   // the seconds the strip is drawn on when the duration is not known
const H = 46;

function ensureStyle() {
    if (document.getElementById("wx-sh-style")) return;
    const st = document.createElement("style"); st.id = "wx-sh-style";
    st.textContent = `
      .wx-sh { --ink: var(--input-text, #ddd); --quiet: color-mix(in srgb, var(--ink) 62%, transparent); --blue: #a8cdf5; --warn: #e08080;
        box-sizing: border-box; width: 100%; padding: 2px 15px 0; color: var(--quiet); font: 10.5px/14px "Segoe UI", system-ui, sans-serif; pointer-events: none; user-select: none; }
      .wx-sh.vue { --ink: var(--component-node-foreground, #ddd); padding: 2px 0 0; }
      .wx-sh .tl { position: relative; height: 40px; }
      .wx-sh .tags { position: absolute; left: 0; right: 0; top: 0; height: 12px; }
      .wx-sh .tag { position: absolute; top: 0; transform: translateX(-50%); font-size: 10px; line-height: 12px; color: var(--blue); white-space: nowrap; }
      .wx-sh .tag.end { transform: none; right: 0; }
      .wx-sh .bar { position: absolute; left: 0; right: 0; top: 14px; height: 10px; }
      .wx-sh .track { position: absolute; left: 0; right: 0; top: 4px; height: 2px; border-radius: 1px; background: color-mix(in srgb, var(--ink) 30%, transparent); }
      .wx-sh .ho { position: absolute; left: 0; top: 0; height: 10px; border-radius: 3px 1px 1px 3px; box-sizing: border-box;
        background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--blue) 75%, transparent) 0 2px, transparent 2px 4px); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--blue) 50%, transparent); }
      .wx-sh .st { position: absolute; left: 0; top: 1px; width: 8px; height: 8px; border-radius: 2px; background: var(--blue); }
      .wx-sh .st.open { border-radius: 50%; background: transparent; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ink) 55%, transparent); }
      .wx-sh .st.warn { background: transparent; box-shadow: inset 0 0 0 1.5px var(--warn); }
      .wx-sh .gd { position: absolute; top: -2px; width: 2px; height: 14px; margin-left: -1px; border-radius: 1px; background: var(--blue); }
      .wx-sh .ld { position: absolute; right: -1px; top: 1px; width: 8px; height: 8px; transform: rotate(45deg); background: var(--blue); }
      .wx-sh .end { position: absolute; right: 0; top: 1px; width: 2px; height: 8px; border-radius: 1px; background: color-mix(in srgb, var(--ink) 45%, transparent); }
      .wx-sh .cap { position: absolute; left: 0; right: 0; top: 26px; display: flex; gap: 8px; white-space: nowrap; }
      .wx-sh .what { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .wx-sh .what.warn { color: var(--warn); }
      .wx-sh .dur { color: var(--ink); font-variant-numeric: tabular-nums; }`;
    document.head.appendChild(st);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** The seconds on the `duration` cable, when the graph can tell: a box of the node at the far end (through Reroute and
 *  Set / Get), or the total of WScene Composer H3. 0 = not known. */
function durationOf(node) {
    const v = upstreamInt(node, "duration", true);
    if (Number.isFinite(v) && v > 0) return v;
    const ws = originOf(node, "duration")?.node?.widgets || [];
    const w = ws.find((x) => x.name === "total_duration") || ws.find((x) => x.name === "value");
    const n = Number(w?.value);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The clip as a line of time, from the values of now. */
function stripHTML(s) {
    const D = s.dur || FALLBACK, guide = s.guide, lands = s.lands;
    let what = "", warn = false, start = "";
    if (s.ff === "previous_scene") {
        const fr = Number(s.hand) || 0;
        start = `<div class="ho" style="width:${Math.min(100, fr / 24 / D * 100).toFixed(1)}%"></div>`;
        if (s.prev === "file" && !s.resume) { what = "resume clip is empty"; warn = true; }
        else what = `${fr} fr from ${s.prev === "file" ? "the clip on file" : "the scene before"}`;
    } else if (s.ff === "first_frame") {
        start = `<div class="st${s.first ? "" : " warn"}"></div>`;
        what = s.first ? "starts on the first_frame image" : "first_frame is empty: connect an image"; warn = !s.first;
    } else { start = `<div class="st open"></div>`; what = "starts from the text"; }
    const at = s.gat >= 0 ? s.gat : D + s.gat, gp = Math.max(0, Math.min(100, at / D * 100));
    const tip = `${what}${guide ? ` · guide at ${s.gat.toFixed(2)} s` : ""}${lands ? " · lands on last_frame" : ""}`;
    const place = gp < 10 ? "left:0;transform:none" : gp > 80 ? `right:${100 - gp}%;transform:none` : `left:${gp}%`;
    return `<div class="tl" title="${esc(tip)}"><div class="tags">${guide ? `<span class="tag" style="${place}">guide</span>` : ""}${lands ? `<span class="tag end">lands</span>` : ""}</div>`
        + `<div class="bar"><div class="track"></div>${start}${guide ? `<div class="gd" style="left:${gp}%"></div>` : ""}${lands ? `<div class="ld"></div>` : `<div class="end"></div>`}</div>`
        + `<div class="cap"><span class="what${warn ? " warn" : ""}">${esc(what)}</span><span class="dur">${s.dur ? s.dur.toFixed(2) + " s" : "no duration"}</span></div></div>`;
}

app.registerExtension({
    name: "wextraui.h3scene",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "h3Scene") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            ensureStyle();
            const W = (name) => (node.widgets || []).find((w) => w.name === name);
            const relabel = () => { for (const [name, label] of Object.entries(LABELS)) { const w = W(name); if (w) w.label = label; } };
            relabel();
            const linked = (name) => (node.inputs || []).find((i) => i.name === name)?.link != null;

            const root = document.createElement("div"); root.className = "wx-sh";
            const widget = node.addDOMWidget("wx_strip", "custom", root, { serialize: false, hideOnZoom: false, margin: 0, getValue: () => undefined, setValue: () => {} });
            widget.serialize = false;
            widget.computeSize = (width) => [width, H];
            node.widgets.splice(node.widgets.indexOf(widget), 1);
            node.widgets.unshift(widget);   // over the rows, under the sockets

            let sig = null;
            const paint = () => {
                relabel();   // `control` comes with the frontend after the node is born
                const s = { ff: W("first_frame_from")?.value, hand: W("handoff_frames")?.value, prev: W("previous_from")?.value, resume: String(W("resume_from_video")?.value ?? "").trim(),
                    gat: Number(W("guide_frame_at")?.value) || 0, dur: durationOf(node), guide: linked("guide_frame") || linked("guide_audio"), lands: linked("last_frame"), first: linked("first_frame") };
                const now = JSON.stringify(s) + !!LiteGraph.vueNodesMode;
                if (now === sig) return;
                sig = now;
                root.classList.toggle("vue", !!LiteGraph.vueNodesMode);
                root.innerHTML = stripHTML(s);
            };
            paint();
            wxOnRedraw(node, paint);
            node.setSize([node.size[0], node.computeSize()[1]]);
            return r;
        };
        const origConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = origConfigure?.apply(this, arguments);
            this.setSize([this.size[0], Math.max(this.size[1], this.computeSize()[1])]);   // a size saved before the strip
            return r;
        };
    },
});
