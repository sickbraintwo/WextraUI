// WextraUI — the chip picker of the trigger words, shared by WLoRA (wxLoraLoader.js) and WLoRA Stack (wxLoraStack.js, one per block).
// Click a row of the list to pick it (official words first, with a blue dot; the training tags with a bar as long as their
// count); picked chips sit on top, drag them to reorder, click ✕ to remove.
// The picked words are stored in the (hidden) `picked` widget as a JSON list; the backend uses them when present.
// The official words come from the .rgthree-info.json next to the LoRA, the training tags from its header (route
// /wextraui/lora_tags, src/loraLoader.py); the height of the picker follows its content.
import { api } from "../../scripts/api.js";
import { ensureWxStyle, wxOnRedraw, wxHideWidget } from "./wxStyle.js";
import { WX_NONE } from "./wxFolder.js";

const MAX_TAGS = 80;

function ensureStyle() {
    if (document.getElementById("wx-lora-style")) return;
    const st = document.createElement("style"); st.id = "wx-lora-style";
    ensureWxStyle();
    // restyle C (Sick 26/10 and 30/10, mockup WLoRA): the picker is the node a shade darker, not a black panel on it; one
    // full blue only, the picked words; the greys come from the text colour by transparency, so they take the node's colour.
    // The tags are rows with a bar behind as long as their count against the most frequent; the official words on top of
    // the same list, marked by a blue dot instead of a title.
    st.textContent = `
      .wx-lp { --ink: var(--input-text, #ddd); --quiet: color-mix(in srgb, var(--ink) 60%, transparent); --faint: color-mix(in srgb, var(--ink) 40%, transparent);
        --line: color-mix(in srgb, var(--ink) 18%, transparent); --line2: color-mix(in srgb, var(--ink) 30%, transparent); --well: rgba(0,0,0,.24);
        padding: 8px 5px 4px; overflow: hidden; color: var(--ink); font: 12px/1.3 "Segoe UI", system-ui, sans-serif; }
      .wx-lp h5 { display: flex; align-items: baseline; gap: 7px; margin: 0 0 4px; font: 400 11px/16px "Segoe UI", system-ui, sans-serif; color: var(--quiet); }
      .wx-lp h5 .wx-muted { color: var(--faint); }
      .wx-lp .wx-muted { color: var(--quiet); font-style: normal; font-size: 11px; }
      .wx-lp .wx-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
      .wx-lp .wx-box { background: var(--well); border: 0; border-radius: 8px; padding: 4px; min-height: 28px; }
      .wx-lp .wx-box > .wx-muted { padding: 0 4px; }
      .wx-lp .wx-chip { height: 20px; max-width: 100%; padding: 0 3px 0 8px; gap: 0; border: 0; border-radius: 10px; background: #00509f; color: #eaf3fd;
        white-space: nowrap; cursor: grab; user-select: none; box-sizing: border-box; }
      .wx-lp .wx-chip .x { display: inline-grid; place-items: center; width: 15px; height: 15px; margin-left: 4px; border-radius: 50%; font-size: 9px;
        color: color-mix(in srgb, #eaf3fd 70%, transparent); cursor: pointer; }
      .wx-lp .wx-chip .x:hover { background: rgba(255,255,255,.18); color: #eaf3fd; }
      .wx-lp .wx-chip.drag { opacity: .4; }
      .wx-lp .tools { display: flex; align-items: center; gap: 2px; margin: 8px 0 6px; }
      .wx-lp .tools input { flex: 1; min-width: 60px; height: 20px; box-sizing: border-box; padding: 0 9px; border: 1px solid transparent; border-radius: 10px;
        background: var(--well); color: var(--ink); font: 12px "Segoe UI", system-ui, sans-serif; }
      .wx-lp .tools input::placeholder { color: var(--faint); }
      .wx-lp .tools input:focus { outline: none; border-color: #1464b3; box-shadow: 0 0 0 2px color-mix(in srgb, #1464b3 30%, transparent); }
      .wx-lp .tools button { height: 20px; padding: 0 7px; border: 0; border-radius: 10px; background: transparent; color: var(--quiet); cursor: pointer;
        font: 11px "Segoe UI", system-ui, sans-serif; }
      .wx-lp .tools button:hover { background: var(--well); color: var(--ink); }
      .wx-lp .lists { display: flex; flex-direction: column; max-height: 200px; overflow-y: auto; padding-right: 2px; scrollbar-width: thin; scrollbar-color: var(--line2) transparent; }
      .wx-lp .grp + .grp { margin-top: 6px; }
      .wx-lp .grp:empty { display: none; }
      .wx-lp .tr { --bar: color-mix(in srgb, var(--ink) 10%, transparent); display: flex; align-items: center; gap: 7px; flex: none; height: 20px; padding: 0 7px 0 6px;
        border-radius: 4px; cursor: pointer; user-select: none; white-space: nowrap;
        background: linear-gradient(90deg, var(--bar) calc(var(--w, 0) * 100%), transparent 0); }
      .wx-lp .tr + .tr { margin-top: 2px; }
      .wx-lp .tr:hover { box-shadow: inset 0 0 0 1px var(--line2); }
      .wx-lp .tr.on { --bar: color-mix(in srgb, #1464b3 50%, transparent); color: #eaf3fd; }
      .wx-lp .tr .mk { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
      .wx-lp .tr .mk.o { background: #a8cdf5; }
      .wx-lp .tr .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .wx-lp .tr .n { font-size: 10.5px; color: var(--quiet); font-variant-numeric: tabular-nums; }
      .wx-lp .tr.on .n { color: inherit; }
      .wx-lp .base { margin-top: 8px; font-size: 11px; color: var(--faint); }
      .wx-lp.none { padding: 4px 5px; }
      .wx-lp.none > :not(.lists) { display: none; }
      .wx-lp.none .wx-muted { color: var(--faint); font-size: 11.5px; }
      @media (prefers-reduced-motion: no-preference) { .wx-lp .tools button, .wx-lp .tr { transition: background-color .12s, color .12s, box-shadow .12s; } }`;
    document.head.appendChild(st);
}

/** The picker of `node` for the LoRA in wLora, the words in wPicked (hidden here), the switch wRg3 (may be null).
 *  name: the name of the DOM widget (one per block in WLoRA Stack); after: the widget it sits under (none = at the end);
 *  oneLine: a LoRA with no words at all says so in one line, without the box, the filter and the buttons (WLoRA Stack);
 *  mounted(widget): called right after the widget is added, before the height and the callbacks are wired (WLoRA puts
 *  its compaction, loading guard and carry there, in the order they always had). Returns { root, widget, fit, show,
 *  reload, resync, words }: show(on) puts it in or out of the view, words() = the words picked now, resync() = LoRA and
 *  words set together from outside, taken as they are. */
export function wxLoraPicker(node, wLora, wPicked, wRg3, { name = "wx_picker", after = null, mounted = null, oneLine = false } = {}) {
    ensureStyle();
    wxHideWidget(wPicked, node);   // the shared one: the widget and its socket out of the view

    let picked = [];
    try { picked = JSON.parse(wPicked.value || "[]"); if (!Array.isArray(picked)) picked = []; } catch (e) { picked = []; }
    let data = { rgthree_info: [], has_rg3: false, base: "", tags: [] }, filter = "", loading = false;
    const NONE = { rgthree_info: [], has_rg3: false, base: "", tags: [] };
    const official = () => (wRg3 && !wRg3.value ? [] : data.rgthree_info);

    const root = document.createElement("div"); root.className = "wx wx-lp";
    root.innerHTML = `<h5>Picked <span class="wx-muted">drag to reorder</span></h5>
      <div class="row wx-row wx-box picked"></div>
      <div class="tools"><input placeholder="filter tags…"><button data-a="all">all official</button><button data-a="top">top 5</button><button data-a="clear">clear</button></div>
      <div class="lists"><div class="grp civ"></div><div class="grp tags"></div></div>
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
        if (!picked.length) { box.innerHTML = `<span class="wx-muted">Click a word below to add it to the prompt</span>`; return; }
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
        // one list: the official words first (a blue dot), then the training tags; behind each row a bar as long as its count
        // against the most frequent tag (an official word that is also a tag has its bar too)
        const f = filter.trim().toLowerCase(), hit = (t) => !f || t.toLowerCase().includes(f);
        const max = data.tags.reduce((m, [, n]) => Math.max(m, n), 0) || 1, count = new Map(data.tags);
        const row = (t, n, off) => {
            const r = document.createElement("div"); r.className = "tr" + (picked.includes(t) ? " on" : "");
            if (n) r.style.setProperty("--w", (n / max).toFixed(3));
            r.title = off ? (n ? `${t}: official trigger word, ${n} times in the training captions` : `${t}: official trigger word`) : `${t}: ${n} times in the training captions`;
            const mk = document.createElement("span"); mk.className = "mk" + (off ? " o" : "");
            const tx = document.createElement("span"); tx.className = "t"; tx.textContent = t;
            r.append(mk, tx);
            if (n) { const c = document.createElement("span"); c.className = "n"; c.textContent = n; r.appendChild(c); }
            r.onclick = () => toggle(t);
            return r;
        };
        const off = official();
        off.filter(hit).forEach((t) => civ.appendChild(row(t, count.get(t) || 0, true)));
        const list = data.tags.filter(([t]) => hit(t) && !off.includes(t)).slice(0, MAX_TAGS);
        list.forEach(([t, n]) => tags.appendChild(row(t, n, false)));
        const left = data.tags.filter(([t]) => !off.includes(t)).length - list.length;
        const note = (text) => { const m = document.createElement("span"); m.className = "wx-muted"; m.textContent = text; tags.appendChild(m); };
        const none = oneLine && !picked.length && !data.has_rg3 && !data.tags.length;
        root.classList.toggle("none", none);
        if (none) note(wLora.value === WX_NONE ? "No LoRA in this block" : "No words to pick: no info file, no training tags");
        else if (!civ.children.length && !list.length) note(f ? "no match" : data.has_rg3 || data.tags.length ? "no words in this file" : "no rgthree info file and no training tags in this LoRA");
        else if (left > 0 && !f) note(`… ${left} more, use the filter`);
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
        const my = ++seq;
        if (wLora.value === WX_NONE) { data = NONE; loading = false; render(); return; }   // an empty block: nothing to ask the server
        loading = true; renderLists();
        try {
            const res = await api.fetchApi(`/wextraui/lora_tags?name=${encodeURIComponent(wLora.value)}`);
            const j = await res.json();
            if (my !== seq) return;
            data = { rgthree_info: j.rgthree_info || [], has_rg3: !!j.has_rg3, base: j.base || "", tags: j.tags || [] };
        } catch (e) { data = NONE; }
        loading = false; render();
    };

    node.addDOMWidget(name, "custom", root, { serialize: false, hideOnZoom: false,
        getValue: () => wPicked.value, setValue: (v) => { wPicked.value = v; } });
    // Height follows the content (no tags = short node; long lists cap at 190px and scroll).
    const widget = node.widgets[node.widgets.length - 1];
    widget.serialize = false;    // the picker mirrors `picked`: no slot of its own in widgets_values
    if (after) {   // under the widget asked for (WLoRA Stack: under the block's rgthree_info)
        node.widgets.splice(node.widgets.indexOf(widget), 1);
        node.widgets.splice(node.widgets.indexOf(after) + 1, 0, widget);
    }
    mounted?.(widget);
    // The height is measured from the DOM, so only when the DOM is there to be read: the box of the widget is sized by the
    // canvas at every draw, and a page in the background (a tab not in front) is never drawn — its box is 0 wide, the text
    // wraps and the measure is garbage; before, the measure was taken in a requestAnimationFrame, which a page in the
    // background never runs, and the first one it runs may come before the box is sized: a workflow loaded that way came
    // up with the node at a wrong height, the picker cut or floating, until something on it changed. Now a measure that
    // cannot be taken is owed, and taken again at every redraw and on the timer (wxOnRedraw) until it can; and a box whose
    // width changed (the node resized) is measured again, so the chips that wrap do not push the base line out of sight.
    let H = 120, lastW = 0, unfit = true, fitting = false, hidden = false;
    widget.computeSize = (width) => [width, hidden ? -4 : H];
    const readyW = () => (root.isConnected && root.offsetHeight ? root.offsetWidth : 0);   // the width of the box, 0 = not in view or not sized yet
    const measure = () => {
        fitting = false;
        const w = readyW();
        if (w < 100) { unfit = true; return; }
        unfit = false; lastW = w;
        // where the content ends, not scrollHeight: that one never goes below the height the box already has, so the node grew and never shrank back
        const last = root.lastElementChild, content = last.offsetTop - root.offsetTop + last.offsetHeight + 4;
        const h = root.classList.contains("none") ? 26 : Math.max(90, Math.min(520, content + 10));   // the lists scroll at 190px; the room above them is for the picked chips, so the base line stays in sight
        if (Math.abs(h - H) < 4) return;
        H = h; node.setSize([node.size[0], node.computeSize()[1]]); node.setDirtyCanvas(true, true);
    };
    const fitHeight = () => { unfit = true; if (!fitting) { fitting = true; setTimeout(measure, 0); } };   // after the draw of now, never inside it
    const prevFit = node._wxFit;
    const fit = () => { H = -1; fitHeight(); };
    node._wxFit = () => { prevFit?.(); fit(); };   // back from Nodes 2.0 (wxStyle.js): measure the content again, as on a load
    const show = (on) => {
        hidden = !on;
        widget.hidden = !on; widget.options = widget.options || {}; widget.options.hidden = !on;
        root.style.display = on ? "" : "none";
        if (on) fit();
    };

    const onLoraChange = () => { picked = []; save(); load(); };
    const cbLora = wLora.callback;
    wLora.callback = function (...a) { const r = cbLora?.apply(this, a); onLoraChange(); return r; };
    if (wRg3) { const cbRg3 = wRg3.callback; wRg3.callback = function (...a) { const r = cbRg3?.apply(this, a); render(); return r; }; }
    render(); load();

    // The combo's callback does not always fire in the new frontend: watch the value on every redraw, and on a
    // timer under Nodes 2.0 (wxOnRedraw).
    let lastLora = wLora.value;
    const watch = () => {
        if (wLora.value !== lastLora) { lastLora = wLora.value; onLoraChange(); }
        if (hidden) return;
        const w = readyW();
        if (unfit ? w >= 100 : w >= 100 && w !== lastW) fitHeight();   // a measure owed (a load in a background tab, the node off screen) as soon as the box is there; a box of a new width (the node resized) again
    };
    wxOnRedraw(node, watch);

    const onConf = node.onConfigure;
    node.onConfigure = function (info) {
        const r = onConf?.apply(this, arguments);
        // `picked` is hidden: the restore by name cannot tell its type, and a file of 0.4.x leaves the old switch
        // (true / false) in its slot. The name the frontend saved wins; without names, anything but a string goes.
        const byName = info?.widgets_values_named;
        if (byName && typeof byName === "object" && typeof byName[wPicked.name] === "string") wPicked.value = byName[wPicked.name];
        else if (typeof wPicked.value !== "string") wPicked.value = "";
        try { picked = JSON.parse(wPicked.value || "[]"); if (!Array.isArray(picked)) picked = []; } catch (e) { picked = []; }
        lastLora = wLora.value;
        render(); load(); return r;
    };
    // LoRA and words put in place together from outside (WLoRA Stack moving a block): taken as they are, the words are
    // not cleared as on a change of LoRA
    const resync = () => {
        try { picked = JSON.parse(wPicked.value || "[]"); if (!Array.isArray(picked)) picked = []; } catch (e) { picked = []; }
        lastLora = wLora.value;
        render(); load();
    };
    return { root, widget, fit, show, reload: load, resync, words: () => [...picked] };
}
