// WextraUI — LoRA Loader + Trigger: chip picker for trigger words / training tags, and auto title = LoRA name.
// Click a chip in the lists to pick it; picked chips sit on top, drag them to reorder, click ✕ to remove.
// The picked words are stored in the (hidden) `picked` widget as a JSON list; the backend uses them when present.
// `carry` in and out (wxCarry.js): the odometer cable — every LoRA of the folder for every checkpoint, in one queue.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureWxStyle, wxCompactWidgets, wxOnRedraw } from "./wxStyle.js";
import { wxFolderMenu, wxLoadingGuard, wxCleanName } from "./wxFolder.js";
import { wxCarryMenu } from "./wxCarry.js";

const TYPE = "wxLoraLoaderTrigger";
const MAX_TAGS = 80;

function hideWidget(w) {
    w.type = "converted-widget";
    w.hidden = true;
    if (w.options) w.options.hidden = true;
    w.computeSize = () => [0, -4];
    const hideEl = () => { if (w.element) { w.element.style.display = "none"; w.element.hidden = true; } };
    hideEl(); setTimeout(hideEl, 0);
}
function ensureStyle() {
    if (document.getElementById("wx-lora-style")) return;
    const st = document.createElement("style"); st.id = "wx-lora-style";
    ensureWxStyle();
    st.textContent = `
      .wx-lp { padding: 4px 6px; overflow: hidden; }
      .wx-lp h5 { margin: 6px 0 3px; font-size: 11px; font-weight: 600; color: #1464b3; text-transform: uppercase; letter-spacing: .04em; }
      .wx-lp .row { min-height: 22px; }
      .wx-lp h5 .wx-muted { text-transform: none; font-weight: 400; letter-spacing: 0; }
      .wx-lp .wx-chip .n { color: #888; font-size: 10px; margin-left: 4px; }
      .wx-lp .wx-chip.p { cursor: grab; }
      .wx-lp .wx-chip.p .x { margin-left: 6px; color: #aaa; cursor: pointer; } .wx-lp .wx-chip.p .x:hover { color: #fff; }
      .wx-lp .wx-chip.drag { opacity: .4; }
      .wx-lp .tools { display: flex; gap: 6px; align-items: center; margin: 4px 0; }
      .wx-lp input { flex: 1; min-width: 60px; }
      .wx-lp .lists { max-height: 190px; overflow-y: auto; }`;
    document.head.appendChild(st);
}

app.registerExtension({
    name: "WextraUI.loraLoader",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== TYPE) return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            ensureStyle();
            const wLora = node.widgets.find((w) => w.name === "lora_name");
            const W = (nm) => node.widgets.find((w) => w.name === nm);
            // `folder` (above the name) + the filter box of the control after generate: shared with WCheckpoint (wxFolder.js)
            const wFolder = W("folder");
            wxFolderMenu(node, wFolder, wLora);
            // Loading a file: put the values where they belong and settle what an older layout left in a wrong box.
            {
                const CTLS = ["fixed", "increment", "decrement", "randomize", "increment-wrap"];   // control after generate of the LoRA
                const SCOPES = ["any", "folder"], WALKS = ["fixed", "increment", "decrement"];      // boxes of 0.3.6 - 0.4.x, gone
                const wStr = W("strength_model");
                const loraCtl = () => node.widgets.find((w) => w !== wFolder && w !== wLora && Array.isArray(w.options?.values) && w.options.values.includes("randomize"));
                // saved layouts, slot by slot (null = a box that is gone, "ctl" = the control of the LoRA):
                //   A = before the control (7 values); B = 0.3.4 (8); C = 0.3.6-0.4.x (12) and C' = without strength_until (11), both with
                //   `lora scope` in slot 2 and the strength walk in 4-5; D = the 12 of the first `folder` build, `folder` in front
                const LAYOUTS = {
                    A: ["lora_name", "strength_model", "strength_clip", "rgthree_info", "where", "separator", "picked"],
                    B: ["lora_name", "ctl", "strength_model", "strength_clip", "rgthree_info", "where", "separator", "picked"],
                    C: ["lora_name", "ctl", null, "strength_model", null, null, null, "strength_clip", "rgthree_info", "where", "separator", "picked"],
                    C1: ["lora_name", "ctl", null, "strength_model", null, null, "strength_clip", "rgthree_info", "where", "separator", "picked"],
                    D: ["folder", "lora_name", "ctl", null, "strength_model", null, null, "strength_clip", "rgthree_info", "where", "separator", "picked"],
                };
                // the value's own type, not the widget's (`picked` is a hidden converted-widget by the time a file
                // loads, so its .type is no help; a combo checks membership, a plain string/number/boolean the typeof)
                const KIND = { folder: "combo", lora_name: "string", ctl: "combo", strength_model: "number",
                               strength_clip: "number", rgthree_info: "boolean", where: "combo", separator: "string", picked: "string" };
                const fitsKind = (w, nm, v) => {
                    const k = KIND[nm];
                    if (k === "combo") return (w.options?.values || []).includes(v);   // a LoRA gone from disk: kind "string", never checked here
                    if (k === "number") return typeof v === "number" && Number.isFinite(v);
                    return typeof v === k;
                };
                // "" = today's layout (9 values: the frontend has put every value in place already)
                const layoutOf = (wv) => {
                    if (wv.length >= 12 && SCOPES.includes(wv[3]) && WALKS.includes(wv[5])) return "D";
                    if (wv.length >= 11 && SCOPES.includes(wv[2]) && WALKS.includes(wv[4])) return typeof wv[7] === "boolean" ? "C1" : "C";
                    if (typeof wv[1] === "string" && CTLS.includes(wv[2])) return "";
                    return CTLS.includes(wv[1]) ? "B" : "A";
                };
                const origConfigure = node.onConfigure;
                node.onConfigure = function (info) {
                    const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                    const wv = info?.widgets_values, named = info?.widgets_values_named;
                    // no names to go by (a file saved before the frontend kept them): recognise the old layout from the array
                    if (Array.isArray(wv) && wv.length > 1 && !(named && typeof named === "object")) {
                        const kind = layoutOf(wv);
                        (LAYOUTS[kind] || []).forEach((nm, i) => {
                            if (!nm) return;
                            const w = nm === "ctl" ? loraCtl() : W(nm), v = wv[i];
                            if (w && v !== null && v !== undefined && fitsKind(w, nm, v)) w.value = v;   // a LoRA gone from disk stays in the box (kind "string", no membership check)
                        });
                    }
                    // the switch was called `civitai` up to 0.4.x: a file with names hands its value over
                    const wSw = W("rgthree_info");
                    const was = named && typeof named === "object" && named.rgthree_info === undefined ? [named.rg3info, named.civitai].find((v) => typeof v === "boolean") : undefined;
                    if (wSw && was !== undefined) wSw.value = was;   // `rg3info` for a few builds of 0.5.0, never released
                    // a file saved with the eight outputs of 0.4.x: `name` moves from slot 6 to 3, `carry` (0.6.0) comes last, the four
                    // outputs that are gone lose their cables (once the whole graph is in place: the nodes at the other end may not be yet)
                    setTimeout(() => {
                        const outs = node.outputs || [], g = node.graph;
                        // (the frontend has already renamed the first five after today's outputs: the old node is told by its tail)
                        if (!g || outs.length !== 8 || outs[6]?.name !== "name" || outs[7]?.name !== "info") return;
                        const linkOf = (id) => (g.links instanceof Map ? g.links.get(id) : g.getLink ? g.getLink(id) : g.links?.[id]);
                        for (const i of [3, 4, 5, 7]) for (const id of [...(outs[i].links || [])]) g.removeLink(id);
                        for (const id of outs[6].links || []) { const l = linkOf(id); if (l) l.origin_slot = 3; }
                        node.outputs = [outs[0], outs[1], outs[2], outs[6], outs[4]?.name === "carry" ? outs[4] : { name: "carry", type: "WX_CARRY", links: null }];
                        node.setSize([node.size[0], Math.max(node.size[1], node.computeSize()[1])]);
                        node.setDirtyCanvas(true, true);
                    }, 0);
                    // guard: a wf saved with an old layout can leave a value of the wrong type here (e.g. true in strength_model)
                    const num = (w, d) => { if (w && (typeof w.value !== "number" || !Number.isFinite(w.value))) w.value = d; };
                    const wLoraCtl = loraCtl();
                    if (wLoraCtl && !wLoraCtl.options.values.includes(wLoraCtl.value)) {
                        // a file in the pre-control layout opened by 0.3.5 put strength_model in this slot: take it back
                        if (typeof wLoraCtl.value === "number" && Number.isFinite(wLoraCtl.value) && wStr && (typeof wStr.value !== "number" || !Number.isFinite(wStr.value))) wStr.value = wLoraCtl.value;
                        wLoraCtl.value = "fixed";
                    }
                    num(wStr, 1.0); num(W("strength_clip"), 1.0);
                    return r;
                };
            }
            // rgthree_info: the official words come from the .rgthree-info.json next to the LoRA (the backend reads it, nothing
            // leaves the disk). No such file for the LoRA of now = the switch is greyed out and the chips are the header's tags.
            const wRg3 = node.widgets.find((w) => w.name === "rgthree_info");
            const wPicked = node.widgets.find((w) => w.name === "picked");
            if (!wLora || !wPicked) return r;
            hideWidget(wPicked);

            let picked = [];
            try { picked = JSON.parse(wPicked.value || "[]"); if (!Array.isArray(picked)) picked = []; } catch (e) { picked = []; }
            let data = { rgthree_info: [], has_rg3: false, base: "", tags: [] }, filter = "", loading = false;
            const NONE = { rgthree_info: [], has_rg3: false, base: "", tags: [] };
            const official = () => (wRg3 && !wRg3.value ? [] : data.rgthree_info);

            const root = document.createElement("div"); root.className = "wx wx-lp";
            root.innerHTML = `<h5>Picked <span class="wx-muted">— drag to reorder, ✕ to remove</span></h5>
              <div class="row wx-row wx-box picked"></div>
              <div class="tools"><input placeholder="filter tags…"><button data-a="all">all official</button><button data-a="top">top 5</button><button data-a="clear">clear</button></div>
              <div class="lists"><h5>Official trigger words</h5><div class="row wx-row civ"></div><h5>Training tags</h5><div class="row wx-row tags"></div></div>
              <div class="base wx-muted"></div>`;
            const $ = (s) => root.querySelector(s);
            root.addEventListener("pointerdown", (e) => e.stopPropagation());
            root.addEventListener("wheel", (e) => e.stopPropagation());
            root.addEventListener("keydown", (e) => e.stopPropagation());

            const save = () => {
                wPicked.value = picked.length ? JSON.stringify(picked) : "";
                node.setDirtyCanvas(true, true);
            };
            const chip = (text, cls, extra) => {
                const c = document.createElement("span"); c.className = "wx-chip " + cls;
                const t = document.createElement("span"); t.className = "t"; t.textContent = text; c.appendChild(t);
                if (extra) c.appendChild(extra); return c;
            };
            const renderPicked = () => {
                const box = $(".picked"); box.innerHTML = "";
                if (!picked.length) { box.innerHTML = `<span class="wx-muted">nothing picked — click the chips below</span>`; return; }
                picked.forEach((w, i) => {
                    const x = document.createElement("span"); x.className = "x"; x.textContent = "✕";
                    x.onclick = (e) => { e.stopPropagation(); picked.splice(i, 1); save(); render(); };
                    const c = chip(w, "p on", x); c.draggable = true; c.dataset.i = i;
                    c.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", String(i)); c.classList.add("drag"); });
                    c.addEventListener("dragend", () => c.classList.remove("drag"));
                    c.addEventListener("dragover", (e) => e.preventDefault());
                    c.addEventListener("drop", (e) => {
                        e.preventDefault(); const from = parseInt(e.dataTransfer.getData("text/plain")); const to = i;
                        if (isNaN(from) || from === to) return;
                        const [m] = picked.splice(from, 1); picked.splice(to, 0, m); save(); render();
                    });
                    box.appendChild(c);
                });
            };
            const toggle = (w) => { const i = picked.indexOf(w); if (i >= 0) picked.splice(i, 1); else picked.push(w); save(); render(); };
            const renderLists = () => {
                const civ = $(".civ"), tags = $(".tags"); civ.innerHTML = ""; tags.innerHTML = "";
                if (loading) { civ.innerHTML = `<span class="wx-muted">loading…</span>`; return; }
                $(".base").textContent = data.base ? "base: " + data.base : "";   // what the header says, then what the rgthree file says
                if (wRg3) wRg3.disabled = !data.has_rg3;
                if (!official().length) civ.innerHTML = `<span class="wx-muted">${!data.has_rg3 ? "no rgthree info file next to this LoRA" : wRg3 && !wRg3.value ? "rgthree info is off" : "none declared in the rgthree info file"}</span>`;
                official().forEach((w) => { const c = chip(w, picked.includes(w) ? "on" : ""); c.onclick = () => toggle(w); civ.appendChild(c); });
                const f = filter.trim().toLowerCase();
                const list = data.tags.filter(([t]) => !f || t.toLowerCase().includes(f)).slice(0, MAX_TAGS);
                if (!list.length) tags.innerHTML = `<span class="wx-muted">${data.tags.length ? "no match" : "no training tags in this file"}</span>`;
                list.forEach(([t, n]) => {
                    const s = document.createElement("span"); s.className = "n"; s.textContent = n;
                    const c = chip(t, picked.includes(t) ? "on" : "", s); c.title = `${n} occurrences`; c.onclick = () => toggle(t); tags.appendChild(c);
                });
                if (data.tags.length > list.length && !f) { const m = document.createElement("span"); m.className = "wx-muted"; m.textContent = `… ${data.tags.length - list.length} more, use the filter`; tags.appendChild(m); }
            };
            const render = () => { renderPicked(); renderLists(); fitHeight(); };
            $("input").addEventListener("input", (e) => { filter = e.target.value; renderLists(); });
            root.querySelectorAll("button").forEach((b) => b.onclick = () => {
                const a = b.dataset.a;
                if (a === "clear") picked = [];
                else if (a === "all") official().forEach((w) => { if (!picked.includes(w)) picked.push(w); });
                else if (a === "top") data.tags.slice(0, 5).forEach(([t]) => { if (!picked.includes(t)) picked.push(t); });
                save(); render();
            });

            let seq = 0;
            const load = async () => {
                const my = ++seq; loading = true; renderLists();
                try {
                    const res = await api.fetchApi(`/wextraui/lora_tags?name=${encodeURIComponent(wLora.value)}`);
                    const j = await res.json();
                    if (my !== seq) return;
                    data = { rgthree_info: j.rgthree_info || [], has_rg3: !!j.has_rg3, base: j.base || "", tags: j.tags || [] };
                } catch (e) { data = NONE; }
                loading = false; render();
            };

            node.addDOMWidget("wx_picker", "custom", root, { serialize: false, hideOnZoom: false,
                getValue: () => wPicked.value, setValue: (v) => { wPicked.value = v; } });
            // Height follows the content (no tags = short node; long lists cap at 190px and scroll).
            const widget = node.widgets[node.widgets.length - 1];
            widget.serialize = false;    // the picker mirrors `picked`: no slot of its own in widgets_values
            wxCompactWidgets(node);
            wxLoadingGuard(node);   // outermost: the menu of lora_name stays whole for as long as the file is read
            wxCarryMenu(node, wLora, [wFolder, W("where")]);   // the odometer cable: at / size / move on the menu narrowed by `folder`
            let H = 120;
            widget.computeSize = (width) => [width, H];
            const fitHeight = () => requestAnimationFrame(() => {
                if (!root.isConnected || !root.offsetHeight) return;   // no box yet, or the node is off screen (the canvas hides its HTML): nothing to measure
                // where the content ends, not scrollHeight: that one never goes below the height the box already has, so the node grew and never shrank back
                const last = root.lastElementChild, content = last.offsetTop - root.offsetTop + last.offsetHeight + 4;
                const h = Math.max(90, Math.min(520, content + 10));   // the lists scroll at 190px; the room above them is for the picked chips, so the base line stays in sight
                if (Math.abs(h - H) < 4) return;
                H = h; node.setSize([node.size[0], node.computeSize()[1]]); node.setDirtyCanvas(true, true);
            });
            node._wxFit = () => { H = -1; fitHeight(); };   // back from Nodes 2.0 (wxStyle.js): measure the content again, as on a load

            // Title: "Lora Loader Trigger" until the node is collapsed for the first time; from then on = LoRA name
            // (a collapsed node shows only its title, so the LoRA name is what you want to read there).
            // node.title !== display name after a reload means the switch already happened: it stays on the LoRA.
            node.__wxTitleOf = wLora;   // who reads the title (WSave Image): the title is automatic when it equals the clean name
            const named = () => !!node.title && node.title !== nodeData.display_name;
            const setTitle = () => { node.title = wxCleanName(wLora.value); node.setDirtyCanvas(true, true); };
            const onLoraChange = () => { if (named()) setTitle(); picked = []; save(); load(); };
            const cbLora = wLora.callback;
            wLora.callback = function (...a) { const r = cbLora?.apply(this, a); onLoraChange(); return r; };
            if (wRg3) { const cbRg3 = wRg3.callback; wRg3.callback = function (...a) { const r = cbRg3?.apply(this, a); render(); return r; }; }
            render(); load();

            // The combo's callback does not always fire in the new frontend: watch the value (and the collapse) on every
            // redraw, and on a timer under Nodes 2.0 (wxOnRedraw).
            let lastLora = wLora.value;
            const watch = () => {
                if (wLora.value !== lastLora) { lastLora = wLora.value; onLoraChange(); }
                if (node.flags?.collapsed && !named()) setTitle();
            };
            wxOnRedraw(node, watch);
            const onCollapse = node.collapse;
            node.collapse = function () { const r = onCollapse?.apply(this, arguments); watch(); return r; };

            const onConf = node.onConfigure;
            node.onConfigure = function (info) {
                const r = onConf?.apply(this, arguments);
                // `picked` is hidden: the restore by name cannot tell its type, and a file of 0.4.x leaves the old switch
                // (true / false) in its slot. The name the frontend saved wins; without names, anything but a string goes.
                const byName = info?.widgets_values_named;
                if (byName && typeof byName === "object" && typeof byName.picked === "string") wPicked.value = byName.picked;
                else if (typeof wPicked.value !== "string") wPicked.value = "";
                try { picked = JSON.parse(wPicked.value || "[]"); if (!Array.isArray(picked)) picked = []; } catch (e) { picked = []; }
                lastLora = wLora.value;
                render(); load(); return r;
            };
            return r;
        };
    },
});
