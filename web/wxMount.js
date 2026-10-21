// WextraUI — WMount: one row of rules per clip, the folder menu kept fresh, the video_1..32 sockets in a cascade.
// The rows: the clips of the folder (in the order of their names, with their frames), then the connected sockets. Each
// row: `in` (frames off the head), `out` drop / blend and its frames. They live in the hidden `specs` box as JSON
// ({"f:scene_1.mp4": {in, out, n}, "video_1": {...}}): a row nobody touched is not written, and takes the default the
// backend gives too (in 22, 0 for the first clip; out drop 0). The sockets: only the first shows on a new node; connect
// the last one and the next appears under it; disconnect, and the empty ones at the end go away.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { WX, ensureWxStyle, wxHideWidget, wxCompactWidgets } from "./wxStyle.js";

const MAX = 32;
const HANDOFF = 22;
const ROW_H = 46;
const NAME = (i) => "video_" + i;
const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text !== undefined) e.textContent = text; return e; };

app.registerExtension({
    name: "WextraUI.Mount",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxMount") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const ret = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;
            ensureWxStyle();
            wxCompactWidgets(node);
            const W = (n) => node.widgets.find((w) => w.name === n);
            const wFolder = W("folder"), wSpecs = W("specs");
            wxHideWidget(wSpecs, node);

            // ---- the rules, read from and written to `specs` -----------------------------------------------------------
            const specs = () => { try { const o = JSON.parse(wSpecs.value || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; } };
            const setSpec = (key, part) => {
                const o = specs();
                o[key] = { ...o[key], ...part };
                wSpecs.value = JSON.stringify(o);
                node.setDirtyCanvas(true, true);
            };
            const ruleOf = (key, index) => {
                const s = specs()[key] || {};
                return { in: Number.isFinite(+s.in) && s.in !== "" && s.in != null ? +s.in : (index === 0 ? 0 : HANDOFF),
                         out: s.out === "blend" ? "blend" : "drop", n: Number.isFinite(+s.n) && s.n != null ? +s.n : 0 };
            };

            // ---- the rows ------------------------------------------------------------------------------------------------
            const root = el("div", "display:flex;flex-direction:column;gap:4px;width:100%;overflow:hidden"); root.className = "wx";
            for (const t of ["pointerdown", "pointermove", "pointerup", "mousedown", "mouseup", "wheel", "dblclick", "keydown", "contextmenu"])
                root.addEventListener(t, (e) => e.stopPropagation());
            let rows = 0;
            const widget = node.addDOMWidget("wx_mount", "custom", root, {
                serialize: false, hideOnZoom: false, getValue: () => undefined, setValue: () => {},
                getMinHeight: () => (rows ? rows * ROW_H + 6 : 0) });   // no clip, no room: the node is its menus (Sick, 21/10)
            widget.serialize = false;

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
                const x = el("input", "width:52px;text-align:right;cursor:ew-resize"); x.type = "number"; x.min = "0"; x.step = "1"; x.value = String(value);
                x.classList.add("wx-num");   // no spinner: in a narrow node the row squeezes the box, and the spinner hid the digits (22 read 2)
                x.title = title + " (drag left / right to change it, click to type)";
                const commit = () => { const v = Math.max(0, Math.round(+x.value || 0)); x.value = String(v); onChange(v); };
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
            const render = () => {
                const list = [...folderClips.map((c) => ({ key: "f:" + c.name, label: c.name, frames: c.frames })),
                              ...linked().map((k) => ({ key: k, label: k, frames: null }))];
                root.replaceChildren();
                list.forEach((c, i) => {
                    const r = ruleOf(c.key, i);
                    const box = el("div", `height:${ROW_H - 4}px;padding:2px 6px;border:1px solid #3a3a3a;border-radius:5px;background:#1c1c1c;display:flex;flex-direction:column;justify-content:center;gap:2px`);
                    const top = el("div", "display:flex;gap:6px;align-items:baseline;font-size:11px;white-space:nowrap");
                    const nm = el("span", `color:${WX.light};overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0`, `${i + 1}. ${c.label}`); nm.title = c.label;
                    top.append(nm, el("span", "color:#888", c.frames != null ? `${c.frames} f` : ""));
                    const bot = el("div", "display:flex;gap:5px;align-items:center;font-size:11px;color:#aaa;white-space:nowrap");
                    const fIn = num(r.in, "in: frames dropped from the head of this clip", (v) => setSpec(c.key, { in: v }));
                    const sel = el("select", "background:#222;border:1px solid #444;color:#ddd;border-radius:4px;font:11px sans-serif;padding:1px 2px");
                    sel.title = "out: drop = frames dropped from the tail of this clip; blend = its last frames mixed with the first ones of the clip after";
                    for (const o of ["drop", "blend"]) { const op = el("option", "", o); op.value = o; sel.append(op); }
                    sel.value = r.out;
                    sel.addEventListener("change", () => setSpec(c.key, { out: sel.value }));
                    const fOut = num(r.n, "out: how many frames are dropped from the tail, or blended with the clip after", (v) => setSpec(c.key, { n: v }));
                    bot.append(el("span", "", "in"), fIn, el("span", "margin-left:8px", "out"), sel, fOut);
                    box.append(top, bot);
                    root.append(box);
                });
                rows = list.length;
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
