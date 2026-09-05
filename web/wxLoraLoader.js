// WextraUI — LoRA Loader + Trigger: chip picker for trigger words / training tags, and auto title = LoRA name.
// Click a chip in the lists to pick it; picked chips sit on top, drag them to reorder, click ✕ to remove.
// The picked words are stored in the (hidden) `picked` widget as a JSON list; the backend uses them when present.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureWxStyle } from "./wxStyle.js";

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
function cleanName(lora) {
    return String(lora || "").replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "");
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
            const wCiv = node.widgets.find((w) => w.name === "civitai");
            const wPicked = node.widgets.find((w) => w.name === "picked");
            if (!wLora || !wPicked) return r;
            hideWidget(wPicked);

            let picked = [];
            try { picked = JSON.parse(wPicked.value || "[]"); if (!Array.isArray(picked)) picked = []; } catch (e) { picked = []; }
            let data = { civitai: [], tags: [] }, filter = "", loading = false;

            const root = document.createElement("div"); root.className = "wx wx-lp";
            root.innerHTML = `<h5>Picked <span class="wx-muted">— drag to reorder, ✕ to remove</span></h5>
              <div class="row wx-row wx-box picked"></div>
              <div class="tools"><input placeholder="filter tags…"><button data-a="all">all civitai</button><button data-a="top">top 5</button><button data-a="clear">clear</button></div>
              <div class="lists"><h5>Civitai trigger words</h5><div class="row wx-row civ"></div><h5>Training tags</h5><div class="row wx-row tags"></div></div>`;
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
                if (!data.civitai.length) civ.innerHTML = `<span class="wx-muted">${wCiv && !wCiv.value ? "civitai look-up is off" : "none declared on Civitai"}</span>`;
                data.civitai.forEach((w) => { const c = chip(w, picked.includes(w) ? "on" : ""); c.onclick = () => toggle(w); civ.appendChild(c); });
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
                else if (a === "all") data.civitai.forEach((w) => { if (!picked.includes(w)) picked.push(w); });
                else if (a === "top") data.tags.slice(0, 5).forEach(([t]) => { if (!picked.includes(t)) picked.push(t); });
                save(); render();
            });

            let seq = 0;
            const load = async () => {
                const my = ++seq; loading = true; renderLists();
                try {
                    const civ = wCiv ? (wCiv.value ? 1 : 0) : 1;
                    const res = await api.fetchApi(`/wextraui/lora_tags?name=${encodeURIComponent(wLora.value)}&civitai=${civ}`);
                    const j = await res.json();
                    if (my !== seq) return;
                    data = { civitai: j.civitai || [], tags: j.tags || [] };
                } catch (e) { data = { civitai: [], tags: [] }; }
                loading = false; render();
            };

            node.addDOMWidget("wx_picker", "custom", root, { serialize: false, hideOnZoom: false,
                getValue: () => wPicked.value, setValue: (v) => { wPicked.value = v; } });
            // Height follows the content (no tags = short node; long lists cap at 190px and scroll).
            const widget = node.widgets[node.widgets.length - 1];
            let H = 120;
            widget.computeSize = (width) => [width, H];
            const fitHeight = () => requestAnimationFrame(() => {
                if (!root.isConnected) return;
                const h = Math.max(90, Math.min(330, root.scrollHeight + 10));
                if (Math.abs(h - H) < 4) return;
                H = h; node.setSize([node.size[0], node.computeSize()[1]]); node.setDirtyCanvas(true, true);
            });

            // Title: "Lora Loader Trigger" until the node is collapsed for the first time; from then on = LoRA name
            // (a collapsed node shows only its title, so the LoRA name is what you want to read there).
            // node.title !== display name after a reload means the switch already happened: it stays on the LoRA.
            const named = () => !!node.title && node.title !== nodeData.display_name;
            const setTitle = () => { node.title = cleanName(wLora.value); node.setDirtyCanvas(true, true); };
            const onLoraChange = () => { if (named()) setTitle(); picked = []; save(); load(); };
            const cbLora = wLora.callback;
            wLora.callback = function (...a) { const r = cbLora?.apply(this, a); onLoraChange(); return r; };
            if (wCiv) { const cbCiv = wCiv.callback; wCiv.callback = function (...a) { const r = cbCiv?.apply(this, a); load(); return r; }; }
            render(); load();

            // The combo's callback does not always fire in the new frontend: watch the value (and the collapse) on every redraw.
            let lastLora = wLora.value;
            const watch = () => {
                if (wLora.value !== lastLora) { lastLora = wLora.value; onLoraChange(); }
                if (node.flags?.collapsed && !named()) setTitle();
            };
            const onDrawBg = node.onDrawBackground;
            node.onDrawBackground = function () { const r = onDrawBg?.apply(this, arguments); watch(); return r; };
            const onDrawFgT = node.onDrawForeground;
            node.onDrawForeground = function () { const r = onDrawFgT?.apply(this, arguments); watch(); return r; };
            const onCollapse = node.collapse;
            node.collapse = function () { const r = onCollapse?.apply(this, arguments); watch(); return r; };

            const onConf = node.onConfigure;
            node.onConfigure = function (info) {
                const r = onConf?.apply(this, arguments);
                try { picked = JSON.parse(wPicked.value || "[]"); if (!Array.isArray(picked)) picked = []; } catch (e) { picked = []; }
                lastLora = wLora.value;
                render(); load(); return r;
            };
            return r;
        };
    },
});
