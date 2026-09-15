// WextraUI — LoRA Loader + Trigger: chip picker for trigger words / training tags, and auto title = LoRA name.
// Click a chip in the lists to pick it; picked chips sit on top, drag them to reorder, click ✕ to remove.
// The picked words are stored in the (hidden) `picked` widget as a JSON list; the backend uses them when present.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureWxStyle, wxCompactWidgets, wxFits } from "./wxStyle.js";

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
            const W = (nm) => node.widgets.find((w) => w.name === nm);
            const r2 = (x) => Math.round(Number(x) * 100) / 100;
            // Il control-after-generate del frontend aggiunge una casella di filtro (control_filter_list, regex) che legge
            // per .value quando fa avanzare la lista. Qui la si toglie dalla vista: al suo posto c'e' il menu "lora scope",
            // dal 0.3.6 un ingresso vero del nodo (object_info lo dichiara, widgets_values lo tiene al suo posto):
            // any = tutta la lista, folder = la cartella del LoRA scelto adesso (la segue).
            const wFilter = W("control_filter_list");
            const wScope = W("lora_scope");
            if (wScope) {
                const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const folderOf = (v) => { const p = String(v ?? "").replace(/\//g, "\\"); const k = p.lastIndexOf("\\"); return k >= 0 ? p.slice(0, k + 1) : ""; };
                const scope = () => (wScope.value === "folder" ? "folder" : "any");
                const effective = () => scope() === "folder" ? "^" + esc(folderOf(wLora.value)) : "";
                if (wFilter) {
                    Object.defineProperty(wFilter, "value", { get: () => effective(), set: () => {}, configurable: true });
                    node.widgets.splice(node.widgets.indexOf(wFilter), 1);   // via dalla vista, l'oggetto resta al frontend
                }
                // etichetta viva: posizione nella lista scelta (3/12) = quanti run accodare
                const relabel = () => {
                    if (wScope.value !== scope()) wScope.value = scope();    // valore vecchio o non valido -> any
                    let vals = wLora.options?.values || [];
                    const f = effective();
                    if (f) { const rx = new RegExp(f, "i"); vals = vals.filter((v) => rx.test(v)); }
                    const i = vals.indexOf(wLora.value);
                    wScope.label = "lora scope" + (vals.length ? " · " + (i >= 0 ? i + 1 : "-") + "/" + vals.length : "");
                };
                const cbScope = wScope.callback;
                wScope.callback = function () { const r = cbScope?.apply(this, arguments); relabel(); return r; };
                relabel();
                const tick = setInterval(relabel, 500);
                const origRemoved2 = node.onRemoved;
                node.onRemoved = function () { clearInterval(tick); return origRemoved2 ? origRemoved2.apply(this, arguments) : undefined; };
                const origConfigure2 = node.onConfigure;
                node.onConfigure = function () { const r = origConfigure2 ? origConfigure2.apply(this, arguments) : undefined; setTimeout(relabel, 0); return r; };
            }
            // Strength a scalare (Sick, 14/09): sotto strength_model tre caselle nello stile del seed - control (fixed /
            // increment / decrement), step, until - dal 0.3.6 ingressi veri del nodo (il backend li ignora). Dopo ogni run
            // accodato (afterQueued, come il seed) strength_model avanza di step e si ferma a until. Solo strength_model.
            const wStr = W("strength_model"), wCtl = W("strength_control"), wStep = W("strength_step"), wUntil = W("strength_until");
            if (wStr && wCtl && wStep && wUntil) {
                const CTL = ["fixed", "increment", "decrement"];
                const ctl = () => (CTL.includes(wCtl.value) ? wCtl.value : "fixed");
                const step = () => Math.abs(r2(wStep.value)) || 0.1;
                const until = () => (Number.isFinite(Number(wUntil.value)) ? r2(wUntil.value) : 1);
                // quanti run fino a until, partendo dal valore attuale
                const runsLeft = () => {
                    const cur = r2(wStr.value), stp = step(), u = until();
                    if (ctl() === "increment" && u > cur) return Math.ceil((u - cur) / stp - 1e-9) + 1;
                    if (ctl() === "decrement" && u < cur) return Math.ceil((cur - u) / stp - 1e-9) + 1;
                    return 1;
                };
                const relabelSw = () => {
                    wCtl.label = ctl() === "fixed" ? "strength control"
                        : "strength " + r2(wStr.value) + " \u2192 " + until() + " \u00b7 " + runsLeft() + " run";
                    node.setDirtyCanvas(true, false);
                };
                for (const w of [wCtl, wStep, wUntil]) { const cb = w.callback; w.callback = function () { const r = cb?.apply(this, arguments); relabelSw(); return r; }; }
                wCtl.afterQueued = () => {
                    if (ctl() === "fixed") return;
                    const cur = r2(wStr.value), stp = step(), u = until();
                    let next = cur;
                    if (ctl() === "increment" && cur < u) next = Math.min(u, cur + stp);
                    if (ctl() === "decrement" && cur > u) next = Math.max(u, cur - stp);
                    next = r2(next);
                    if (next !== cur) { wStr.value = next; wStr.callback?.(next); }
                    relabelSw();
                };
                relabelSw();
                const tickSw = setInterval(relabelSw, 500);
                const origRemoved3 = node.onRemoved;
                node.onRemoved = function () { clearInterval(tickSw); return origRemoved3 ? origRemoved3.apply(this, arguments) : undefined; };
                const origConfigure3 = node.onConfigure;
                node.onConfigure = function (info) {
                    const r = origConfigure3 ? origConfigure3.apply(this, arguments) : undefined;
                    // wf saved by an older loader and no widgets_values_named to go by: put the old values where they belong
                    // A (before the control) = [name, sm, sc, civitai, where, sep, picked]; B (0.3.4) = [name, ctl, sm, sc, civitai, where, sep, picked]
                    const wv = info?.widgets_values, named = info?.widgets_values_named;
                    const CTRLS = ["fixed", "increment", "decrement", "randomize", "increment-wrap"];
                    const todays = Array.isArray(wv) && wv.length >= 12 && ["any", "folder"].includes(wv[2]) && CTL.includes(wv[4]);
                    if (Array.isArray(wv) && wv.length > 1 && !todays && !(named && typeof named === "object")) {
                        const o = CTRLS.includes(wv[1]) ? 2 : 1;
                        const old = { strength_model: wv[o], strength_clip: wv[o + 1], civitai: wv[o + 2], where: wv[o + 3], separator: wv[o + 4], picked: wv[o + 5] };
                        const kind = { strength_model: "number", strength_clip: "number", civitai: "boolean", where: "combo", separator: "string", picked: "string" };
                        for (const [nm, v] of Object.entries(old)) {
                            const w = W(nm);
                            const ok = w && v !== null && v !== undefined && (kind[nm] === "combo" ? (w.options?.values || []).includes(v) : typeof v === kind[nm]) && !(kind[nm] === "number" && !Number.isFinite(v));
                            if (ok) w.value = v;
                        }
                        const wScope = W("lora_scope"); if (wScope) wScope.value = "any";
                        wCtl.value = "fixed"; wStep.value = 0.1; wUntil.value = 1.0;
                    }
                    // guardia: un wf salvato con un layout vecchio puo' lasciare qui valori del tipo sbagliato (es. true in strength_model)
                    const num = (w, d) => { if (w && (typeof w.value !== "number" || !Number.isFinite(w.value))) w.value = d; };
                    if (!CTL.includes(wCtl.value)) wCtl.value = "fixed";
                    const wScope = W("lora_scope"); if (wScope && !["any", "folder"].includes(wScope.value)) wScope.value = "any";
                    const wLoraCtl = node.widgets.find((w) => Array.isArray(w.options?.values) && w.options.values.includes("randomize"));
                    if (wLoraCtl && !wLoraCtl.options.values.includes(wLoraCtl.value)) {
                        // a file in the pre-control layout opened by 0.3.5 put strength_model in this slot: take it back
                        if (typeof wLoraCtl.value === "number" && Number.isFinite(wLoraCtl.value) && wStr && (typeof wStr.value !== "number" || !Number.isFinite(wStr.value))) wStr.value = wLoraCtl.value;
                        wLoraCtl.value = "fixed";
                    }
                    num(wStr, 1.0); num(W("strength_clip"), 1.0); num(wStep, 0.1); num(wUntil, 1.0);
                    setTimeout(relabelSw, 0);
                    return r;
                };
            }
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
            widget.serialize = false;    // the picker mirrors `picked`: no slot of its own in widgets_values
            wxCompactWidgets(node);
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
