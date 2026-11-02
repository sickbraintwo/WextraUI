// WextraUI — WMount: the strip of the clips and the rules of one clip, the folder menu kept fresh, the video_1..32 sockets in a cascade.
// Restyle C (Sick 02/11, mockup WMount): one band per clip, as long as its frames: the clips of the folder (in the order
// of their names), then the connected sockets, empty because their frames are not known before the Run. What `in` and
// `drop` take off is hatched, a `blend` fades blue on both clips. Under it the frames that will come out (plan() in
// src/mount.py is the rule, and the number here does the same sum). A click on a band opens its rules: `in` (frames off
// the head), `out` drop / blend and its frames. They live in the hidden `specs` box as JSON ({"f:scene_1.mp4": {in, out,
// n}, "video_1": {...}}): what nobody touched is not written, reads faint, and takes the default the backend gives too
// (in 22, 0 for the first clip; out drop 0). The node stays short with thirty clips. The sockets: only the first shows on
// a new node; connect the last one and the next appears under it; disconnect, and the empty ones at the end go away.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { wxHideWidget, wxCompactWidgets } from "./wxStyle.js";

const MAX = 32;
const HANDOFF = 22;
const H = 118;        // the strip, the sum and the rules of one clip
const ARROWS = 10;    // past this many clips a band is thin to hit: the rules get ‹ › to walk them
const NAME = (i) => "video_" + i;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

function ensureStyle() {
    if (document.getElementById("wx-mt-style")) return;
    const st = document.createElement("style"); st.id = "wx-mt-style";
    st.textContent = `
      .wx-mt { --ink: var(--input-text, #ddd); --quiet: color-mix(in srgb, var(--ink) 62%, transparent); --faint: color-mix(in srgb, var(--ink) 40%, transparent);
        --line: color-mix(in srgb, var(--ink) 16%, transparent); --well: color-mix(in srgb, var(--ink) 8%, transparent); --lt: #a8cdf5; --acc: #1464b3;
        box-sizing: border-box; width: 100%; padding: 4px 10px 0; color: var(--ink); font: 11.5px/16px "Segoe UI", system-ui, sans-serif; user-select: none; overflow: hidden; }
      .wx-mt * { box-sizing: border-box; }
      .wx-mt.vue { --ink: var(--component-node-foreground, #ddd); padding: 4px 0 0; }
      .wx-mt button, .wx-mt input { margin: 0; border: 0; padding: 0; background: none; color: inherit; font: inherit; }
      .wx-mt button { cursor: pointer; }
      .wx-mt button:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
      .wx-mt .strip { display: flex; gap: 2px; height: 42px; margin-bottom: 4px; overflow: hidden; }
      .wx-mt .seg { position: relative; height: 42px; min-width: 2px; border-radius: 5px; background: color-mix(in srgb, var(--ink) 22%, transparent); overflow: hidden; cursor: pointer; }
      .wx-mt .seg .cut { position: absolute; top: 0; bottom: 0; background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--ink) 18%, transparent) 0 2px, transparent 2px 5px); }
      .wx-mt .seg .bl { position: absolute; top: 0; bottom: 0; right: 0; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--lt) 70%, transparent)); }
      .wx-mt .seg .hd { position: absolute; top: 0; bottom: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--lt) 70%, transparent), transparent); }
      .wx-mt .seg .n { position: absolute; left: 5px; top: 4px; font-size: 12px; line-height: 16px; font-variant-numeric: tabular-nums; }
      .wx-mt .seg.sock { background: transparent; box-shadow: inset 0 0 0 1px var(--line); }
      .wx-mt .seg.bad { background: color-mix(in srgb, #f0a070 40%, transparent); }
      .wx-mt .seg.sel { box-shadow: inset 0 0 0 2px var(--lt); }
      .wx-mt .sum { display: flex; justify-content: space-between; align-items: baseline; height: 22px; font-size: 10.5px; color: var(--faint); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .wx-mt .sum b { font-size: 15px; font-weight: 600; color: var(--ink); }
      .wx-mt .sum .err { color: #f0a070; }
      .wx-mt .clip { padding: 3px 5px 4px; border-radius: 6px; background: var(--well); }
      .wx-mt .top, .wx-mt .bot { display: flex; align-items: center; gap: 5px; height: 18px; white-space: nowrap; }
      .wx-mt .bot { padding-left: 19px; }
      .wx-mt .num { width: 14px; flex-shrink: 0; color: var(--faint); font-variant-numeric: tabular-nums; }
      .wx-mt .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .wx-mt .sock .nm { color: var(--quiet); font-style: italic; }
      .wx-mt .fr { color: var(--faint); font-variant-numeric: tabular-nums; }
      .wx-mt .go { width: 14px; height: 16px; flex-shrink: 0; border-radius: 4px; color: var(--quiet); }
      .wx-mt .go:hover { color: var(--ink); background: var(--line); }
      .wx-mt .lbq { color: var(--faint); font-size: 11px; }
      .wx-mt .gap { width: 6px; }
      .wx-mt .fld { width: 34px; height: 18px; padding: 0 5px; border-radius: 9px; background: color-mix(in srgb, var(--ink) 10%, transparent); text-align: right; font-variant-numeric: tabular-nums; cursor: ew-resize; user-select: text; }
      .wx-mt .fld:focus { outline: none; box-shadow: inset 0 0 0 1px var(--acc); cursor: text; }
      .wx-mt .fld.dflt { color: var(--faint); }
      .wx-mt .kind { height: 18px; padding: 0 7px; border-radius: 9px; background: var(--well); color: var(--quiet); font-size: 11px; }
      .wx-mt .kind.blend { background: color-mix(in srgb, var(--acc) 30%, transparent); color: var(--lt); }
      .wx-mt .kind:hover { box-shadow: inset 0 0 0 1px var(--acc); }`;
    document.head.appendChild(st);
}

app.registerExtension({
    name: "WextraUI.Mount",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxMount") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const ret = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;
            ensureStyle();
            wxCompactWidgets(node);
            const W = (n) => node.widgets.find((w) => w.name === n);
            const wFolder = W("folder"), wSpecs = W("specs");
            wxHideWidget(wSpecs, node);
            if (W("filename_prefix")) W("filename_prefix").label = "save as";

            // ---- the rules, read from and written to `specs` -----------------------------------------------------------
            const specs = () => { try { const o = JSON.parse(wSpecs.value || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; } };
            const setSpec = (key, part) => {
                const o = specs();
                o[key] = { ...o[key], ...part };
                wSpecs.value = JSON.stringify(o);
                paintStrip();
                node.setDirtyCanvas(true, true);
            };
            const ruleOf = (key, index) => {
                const s = specs()[key] || {};
                return { in: Number.isFinite(+s.in) && s.in !== "" && s.in != null ? +s.in : (index === 0 ? 0 : HANDOFF),
                         out: s.out === "blend" ? "blend" : "drop", n: Number.isFinite(+s.n) && s.n != null ? +s.n : 0 };
            };

            // ---- the strip and the rules of one clip ---------------------------------------------------------------------
            const root = el("div", "wx-mt"), strip = el("div", "strip"), sum = el("div", "sum"), clip = el("div", "clip");
            root.append(strip, sum, clip);
            for (const t of ["pointerdown", "pointermove", "pointerup", "mousedown", "mouseup", "wheel", "dblclick", "keydown", "contextmenu"])
                root.addEventListener(t, (e) => e.stopPropagation());
            let rows = 0, sel = 0;
            const widget = node.addDOMWidget("wx_mount", "custom", root, { serialize: false, hideOnZoom: false, margin: 0, getValue: () => undefined, setValue: () => {} });
            widget.serialize = false;
            widget.computeSize = (width) => [width, rows ? H : -4];   // no clip, no room: the node is its menus (Sick, 21/10)

            let folderClips = [];   // [{name, frames}] of the folder picked
            const linked = () => {
                const out = [];
                for (let i = 1; i <= MAX; i++) {
                    const s = node.inputs?.find((x) => x.name === NAME(i));
                    if (s && s.link != null) out.push(NAME(i));
                }
                return out;
            };
            const num = (value, title, onChange) => {
                const x = el("input", "fld"); x.inputMode = "numeric"; x.value = String(value);
                x.title = title + " (drag left / right to change it, click to type)";
                const commit = () => { const v = Math.max(0, Math.round(+x.value || 0)); x.value = String(v); x.classList.remove("dflt"); onChange(v); };
                x.addEventListener("change", commit);
                // drag sideways: one frame every 6 px, never under 0; a click without moving = type in it
                let drag = null;
                x.addEventListener("pointerdown", (e) => {
                    if (e.button !== 0 || document.activeElement === x) return;
                    e.preventDefault();
                    drag = { x0: e.clientX, v0: Math.max(0, Math.round(+x.value || 0)), moved: false, id: e.pointerId };
                    x.setPointerCapture(e.pointerId);
                });
                x.addEventListener("pointermove", (e) => {
                    if (!drag || e.pointerId !== drag.id) return;
                    const dx = e.clientX - drag.x0;
                    if (!drag.moved && Math.abs(dx) < 3) return;
                    drag.moved = true;
                    const v = Math.max(0, drag.v0 + Math.round(dx / 6));
                    if (String(v) !== x.value) x.value = String(v);
                });
                const end = (e) => {
                    if (!drag || e.pointerId !== drag.id) return;
                    const moved = drag.moved;
                    drag = null;
                    if (x.hasPointerCapture(e.pointerId)) x.releasePointerCapture(e.pointerId);
                    if (moved) commit(); else { x.focus(); x.select(); }
                };
                x.addEventListener("pointerup", end);
                x.addEventListener("pointercancel", end);
                return x;
            };
            const clips = () => [...folderClips.map((c) => ({ key: "f:" + c.name, label: c.name, frames: c.frames })),
                                 ...linked().map((k) => ({ key: k, label: k, frames: null }))];
            // the sum of plan() in src/mount.py, band by band: {a, e, bi, bo}; a clip from a cable has no frames before the Run
            const spans = (L) => {
                let bo = 0;
                return L.map((c, i) => {
                    const r = ruleOf(c.key, i), bi = bo;
                    bo = r.out === "blend" && i < L.length - 1 ? r.n : 0;
                    return { r, a: r.in, e: c.frames == null ? null : c.frames - (r.out === "drop" ? r.n : 0), bi, bo };
                });
            };
            const paintStrip = () => {
                const L = clips(), S = spans(L);
                if (!L.length) { strip.replaceChildren(); sum.replaceChildren(); return; }
                const known = L.filter((c) => c.frames != null), avg = known.length ? known.reduce((t, c) => t + c.frames, 0) / known.length : 48;
                const all = L.reduce((t, c) => t + (c.frames ?? avg), 0);
                strip.style.gap = L.length > 30 ? "1px" : "";
                let total = 0, bad = -1;
                strip.replaceChildren(...L.map((c, i) => {
                    const { a, e, bi, bo } = S[i], f = c.frames ?? avg, short = e != null && e - a < bi + bo + 1;
                    if (e != null) total += Math.max(0, e - a) - bo;
                    if (short && bad < 0) bad = i;
                    const b = el("div", `seg${c.frames == null ? " sock" : ""}${short ? " bad" : ""}${i === sel ? " sel" : ""}`);
                    b.style.flex = `${f} 1 0`;
                    b.title = c.label + (c.frames != null ? ` · ${c.frames} f` : " · from the cable");
                    const pc = (x) => Math.min(100, (x / f) * 100).toFixed(1) + "%";
                    const part = (cls, css) => { const p = el("span", cls); p.style.cssText = css; b.append(p); };
                    if (a) part("cut", `left:0;width:${pc(a)}`);
                    if (e != null && c.frames - e) part("cut", `right:0;width:${pc(c.frames - e)}`);
                    if (bo) part("bl", `width:${pc(bo)}`);
                    if (bi) part("hd", `left:${pc(a)};width:${pc(bi)}`);
                    if (f / all > 0.05) b.append(el("span", "n", String(i + 1)));
                    b.onclick = () => { sel = i; paintStrip(); paintClip(); };
                    return b;
                }));
                const socks = L.length - known.length, t = el("b", "", `${total} f`), left = el("span");
                left.append(t, socks ? ` + ${socks} from cable${socks > 1 ? "s" : ""}` : "");
                sum.replaceChildren(left, bad < 0 ? el("span", "", `${L.length} clip${L.length > 1 ? "s" : ""}`) : el("span", "err", `clip ${bad + 1} is too short`));
                if (bad >= 0) sum.lastChild.title = "Its rules leave too few frames for its blends: the Run stops there.";
            };
            const paintClip = () => {
                const L = clips();
                if (!L.length) { clip.replaceChildren(); return; }
                const i = Math.min(sel, L.length - 1), c = L[i], r = ruleOf(c.key, i), o = specs()[c.key] || {};
                const top = el("div", "top"), nm = el("span", "nm", c.label), bot = el("div", "bot");
                nm.title = c.label;
                clip.classList.toggle("sock", c.frames == null);
                top.append(el("span", "num", String(i + 1)), nm, el("span", "fr", c.frames != null ? `${c.frames} f` : "from the cable"));
                if (L.length > ARROWS) for (const [text, d, tip] of [["‹", -1, "The clip before"], ["›", 1, "The clip after"]]) {
                    const g = el("button", "go", text); g.title = tip;
                    g.onclick = () => { sel = (i + d + L.length) % L.length; paintStrip(); paintClip(); };
                    top.append(g);
                }
                const fIn = num(r.in, "in: frames dropped from the head of this clip", (v) => setSpec(c.key, { in: v }));
                const kind = el("button", `kind${r.out === "blend" ? " blend" : ""}`, r.out);
                kind.title = "drop: frames cut from the tail · blend: mixed with the head of the clip after";
                kind.onclick = () => { setSpec(c.key, { out: r.out === "blend" ? "drop" : "blend" }); paintClip(); };
                const fOut = num(r.n, r.out === "blend" ? "Frames mixed with the clip after" : "Frames dropped from the tail", (v) => setSpec(c.key, { n: v }));
                fIn.classList.toggle("dflt", o.in == null);
                fOut.classList.toggle("dflt", o.n == null);
                bot.append(el("span", "lbq", "in"), fIn, el("span", "gap"), el("span", "lbq", "out"), kind, fOut);
                clip.replaceChildren(top, bot);
            };
            const render = () => {
                const L = clips();
                sel = Math.min(sel, Math.max(0, L.length - 1));
                rows = L.length;
                root.classList.toggle("vue", !!LiteGraph.vueNodesMode);
                root.style.display = rows ? "" : "none";
                paintStrip(); paintClip();
                const sz = node.computeSize();
                node.setSize([Math.max(node.size[0], 210), sz[1]]);
                node.setDirtyCanvas(true, true);
            };

            // ---- the folder: its clips, and a fresh menu -------------------------------------------------------------------
            let asked = "";
            const loadFolder = async () => {
                const f = wFolder.value;
                asked = f;
                if (!f || f === "none") { folderClips = []; render(); return; }
                try {
                    const j = await (await api.fetchApi(`/wextraui/mount_clips?folder=${encodeURIComponent(f)}`)).json();
                    if (asked !== f) return;
                    folderClips = Array.isArray(j) ? j : [];
                } catch { folderClips = []; }
                render();
            };
            const cbFolder = wFolder.callback;
            wFolder.callback = function (v) {
                const r = cbFolder?.apply(this, arguments);
                const o = specs();   // a new folder, new rules: the rows of the old one go
                for (const k of Object.keys(o)) if (k.startsWith("f:")) delete o[k];
                wSpecs.value = JSON.stringify(o);
                sel = 0;
                loadFolder();
                return r;
            };
            let listedAt = 0;
            const relist = async () => {
                if (Date.now() - listedAt < 3000) return;
                listedAt = Date.now();
                try {
                    const list = await (await api.fetchApi("/wextraui/mount_folders")).json();
                    const vals = wFolder.options.values;
                    if (Array.isArray(vals) && Array.isArray(list)) vals.splice(0, vals.length, ...list);
                } catch {}
            };
            const onDown = node.onMouseDown;
            node.onMouseDown = function () { relist(); return onDown?.apply(this, arguments); };

            // ---- the sockets in a cascade -----------------------------------------------------------------------------------
            const idxOf = (name) => (node.inputs ? node.inputs.findIndex((i) => i.name === name) : -1);
            const isLinked = (name) => { const idx = idxOf(name); return idx !== -1 && node.inputs[idx].link != null; };
            const sync = () => {
                let last = 0;
                for (let i = 1; i <= MAX; i++) if (isLinked(NAME(i))) last = i;
                const want = Math.min(last + 1, MAX);   // visible: 1..want
                for (let i = 1; i <= want; i++) {
                    if (idxOf(NAME(i)) !== -1) continue;
                    node.addInput(NAME(i), "VIDEO,IMAGE");   // back in its place, right after the one before
                    const from = idxOf(NAME(i));
                    const to = i === 1 ? from : idxOf(NAME(i - 1)) + 1;
                    if (to !== from) { const [inp] = node.inputs.splice(from, 1); node.inputs.splice(to, 0, inp); }
                }
                for (let i = MAX; i > want; i--) {
                    const idx = idxOf(NAME(i));
                    if (idx !== -1 && node.inputs[idx].link == null) node.removeInput(idx);
                }
                render();
            };

            sync();
            loadFolder();
            if (!node.size || node.size[0] < 210) node.setSize([210, node.size?.[1] || 0]);

            // a saved workflow puts back its own sockets and values after onNodeCreated
            const origOnConfigure = node.onConfigure;
            node.onConfigure = function () {
                const r = origOnConfigure ? origOnConfigure.apply(this, arguments) : undefined;
                setTimeout(() => { sync(); loadFolder(); }, 0);
                return r;
            };
            const origConn = node.onConnectionsChange;
            node.onConnectionsChange = function (type, index) {
                const r = origConn ? origConn.apply(this, arguments) : undefined;
                const inp = node.inputs && node.inputs[index];
                if (type === 1 && inp && /^video_\d+$/.test(inp.name)) setTimeout(sync, 0);
                return r;
            };
            return ret;
        };
    },
});
