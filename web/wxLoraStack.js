// WextraUI — WLoRA Stack: up to twenty LoRAs loaded together in one run, as twenty LoRA loaders in a row (backend: src/loraStack.py).
// One `folder` and one `selection` on top narrow the LoRA menu of every block (wxFolder.js, wxSelection.js, given the
// list of the twenty menus: a change there moves none of the LoRAs already chosen); `step` under them is how much the
// arrows move every strength; `control_i` under the strengths of a block walks them by that step after every queued
// run (fixed, increment, decrement); `solo`, under every block, leaves only the next block on after every queued run
// (one LoRA at a time), with `carry` in and out and the chips ⟲ / ▶ n on its row (wxCarry.js); a block under its lock keeps
// its on / off and stays out of that walk (node.properties.wx_locks, Sick 27/10; locked without being switched on, 29/10). Each block has the rows of WLoRA (name,
// two strengths, rgthree info, the chip picker: wxLoraPicker.js) under a head row: the handle ≡, the on/off switch (the
// hidden box `on_i`), the number, the summary when folded to one line, the fold button, which turns through three
// states: open, without rgthree info and the picker (the tags), one line (name, `1.00 / 1.00`, `3 words`, in columns). A block
// not folded to one line is a card, a well a shade darker from its head to its last row, drawn on the canvas (Sick 01/11,
// restyle: open as variant B, one line as variant C, and no block ever closes the others). The folds
// live in node.properties.wx_folds, not in the graph. Drag a block by its ≡ onto another one: it takes that place and
// the ones between move up or down (as the slots of WSwitch), with their values, words, fold and cables. `loras` says
// how many blocks show and load (the ones below keep their values). The ✕ after the lock takes that block out of the
// stack: the ones under it move up and `loras` goes down by one. Under `separator`, the row `all`: on / off, lock and ✕
// for every block in use at once (Sick 29/10). A lock drawn inside the row of each strength, before the number (light
// blue, the number too, when closed: variant A, Sick 30/10), keeps it out of `control_i` (the strength still moves by hand): on by default for strength_clip, off for strength_model (Sick 30/10); a click in the middle of it folds every block in use one step, as the
// fold button of a block: open, without rgthree info and the tags, one line, open again; mixed, the first click opens
// them all (Sick 30/10). A new block reads None (Sick 02/11): an empty block, no LoRA from the first place of the menu that
// stays there when a folder is chosen; None heads every menu, in no list and no count. Collapsed, the node shows its name alone.
import { app } from "../../scripts/app.js";
import { WX, ensureWxStyle, wxCompactWidgets, wxOnRedraw, wxSlotHidden, wxHideWidget, wxAddButton, wxVueDecor, wxVueNodeEl, wxVueChip } from "./wxStyle.js";
import { wxFolderMenu, wxLoadingGuard, wxCleanName, WX_NONE } from "./wxFolder.js";
import { wxSelectionMenu } from "./wxSelection.js";
import { wxLoraPicker } from "./wxLoraPicker.js";
import { upstreamInt } from "./wxReso.js";
import { wxCarry } from "./wxCarry.js";

const TYPE = "wxLoraStack";
const MAX = 20;
const FOLDS = ["open", "tags", "line"];
const FOLD_GLYPH = { open: "▾", tags: "▿", line: "▸" };
const FOLD_NEXT = { open: "Fold: hide rgthree info and the tags", tags: "Fold to one line", line: "Open the block" };
const PARK = -10000;
const SLOCK_TITLE = "Lock: control leaves this strength where it is (by hand it still moves)";
const LOCK_SVG = `<svg width="11" height="13" viewBox="0 0 11 13"><path class="shk" d="M3 6V4a2.5 2.5 0 0 1 5 0v2"/><rect class="body" x="1" y="6" width="9" height="6.4" rx="1.6"/></svg>`;
const SHACKLE = new Path2D("M3 6V4a2.5 2.5 0 0 1 5 0v2");

// the same lock on the canvas, its box 11 x 13 at (x, y): closed = full, open = an outline with the shackle raised
function drawLock(ctx, x, y, on) {
    ctx.save();
    ctx.translate(x, y); ctx.lineCap = "round"; ctx.fillStyle = ctx.strokeStyle = on ? WX.light : "rgba(221,221,221,0.32)";
    ctx.beginPath(); ctx.roundRect(1, 6, 9, 6.4, 1.6);
    if (on) ctx.fill(); else { ctx.lineWidth = 1.2; ctx.stroke(); ctx.translate(10, 4.4); ctx.rotate(14 * Math.PI / 180); ctx.translate(-7.5, -6); }
    ctx.lineWidth = 1.5; ctx.stroke(SHACKLE);
    ctx.restore();
}

function ensureStyle() {
    if (document.getElementById("wx-stack-style")) return;
    ensureWxStyle();
    const st = document.createElement("style"); st.id = "wx-stack-style";
    st.textContent = `
      .wx-blk { --ink: var(--input-text, #ddd); --quiet: color-mix(in srgb, var(--ink) 60%, transparent); --faint: color-mix(in srgb, var(--ink) 40%, transparent);
        --line: color-mix(in srgb, var(--ink) 18%, transparent); --line2: color-mix(in srgb, var(--ink) 30%, transparent);
        display: flex; align-items: center; gap: 6px; height: 20px; width: calc(100% - 10px) !important; box-sizing: border-box; margin: 0 5px;
        position: relative; top: -10px; padding: 0 4px 0 2px; border-radius: 6px; cursor: pointer; user-select: none; color: var(--ink);
        font: 12px "Segoe UI", system-ui, sans-serif; }
      .wx-blk.vue2 { top: 0; }
      .wx-blk:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); }
      .wx-blk.over { box-shadow: inset 0 0 0 1.5px ${WX.light}; }
      .wx-blk .g { flex: none; width: 12px; text-align: center; color: var(--faint); cursor: grab; font-size: 13px; opacity: .6; }
      .wx-blk:hover .g { opacity: 1; }
      .wx-blk .g:hover, .wx-blk .g.lift { color: ${WX.light}; opacity: 1; }
      .wx-blk .sw { flex: none; position: relative; width: 22px; height: 12px; border-radius: 6px; background: ${WX.accent}; cursor: pointer; }
      .wx-blk .sw::after { content: ""; position: absolute; top: 2px; left: 12px; width: 8px; height: 8px; border-radius: 50%; background: #fff; }
      .wx-blk.off .sw { background: color-mix(in srgb, var(--ink) 16%, transparent); }
      .wx-blk.off .sw::after { left: 2px; background: var(--quiet); }
      .wx-blk.mix .sw { background: color-mix(in srgb, ${WX.accent} 45%, transparent); }
      .wx-blk.mix .sw::after { left: 7px; }
      .wx-blk .k, .wx-slock { display: inline-grid; place-items: center; flex: none; cursor: pointer; user-select: none; }
      .wx-blk .k { width: 12px; height: 14px; color: var(--faint); }
      .wx-blk .k:hover { color: var(--ink); }
      .wx-blk .k.on { color: ${WX.light}; }
      .wx-blk .k svg, .wx-slock svg { display: block; overflow: visible; }
      .wx-blk .k .body, .wx-slock .body { fill: currentColor; }
      .wx-blk .k .shk, .wx-slock .shk { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; }
      .wx-blk .k:not(.on) .shk, .wx-slock:not(.on) .shk { transform: translate(2.5px, -1.6px) rotate(14deg); transform-origin: 7.5px 6px; }
      .wx-blk .k:not(.on) .body, .wx-slock:not(.on) .body { fill: none; stroke: currentColor; stroke-width: 1.2; }
      .wx-blk .x { flex: none; width: 12px; text-align: center; font-size: 11px; color: var(--faint); opacity: .6; cursor: pointer; }
      .wx-blk:hover .x { opacity: 1; }
      .wx-blk .x:hover { color: #e08080; }
      .wx-blk .n { flex: none; display: inline-grid; place-items: center; min-width: 18px; height: 16px; border-radius: 5px; font-weight: 600; font-variant-numeric: tabular-nums;
        color: ${WX.light}; background: color-mix(in srgb, ${WX.accent} 30%, transparent); }
      .wx-blk.off .n { color: var(--faint); background: transparent; box-shadow: inset 0 0 0 1px var(--line2); }
      .wx-blk.line .n { display: block; min-width: 12px; height: auto; background: none; box-shadow: none; }
      .wx-blk.wx-all .n { display: block; min-width: 0; height: auto; font-weight: 400; color: var(--quiet); background: none; box-shadow: none; }
      .wx-blk .s { flex: 1; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) 62px 56px; gap: 6px; white-space: nowrap; color: var(--quiet); }
      .wx-blk .s .sn { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--ink); }
      .wx-blk .s .sq, .wx-blk .s .sp { overflow: hidden; text-align: right; font-variant-numeric: tabular-nums; }
      .wx-blk.off .s, .wx-blk.off .s .sn { color: var(--faint); }
      .wx-blk.off .s .sn { text-decoration: line-through; text-decoration-color: var(--line2); }
      .wx-blk .f { flex: none; width: 14px; text-align: center; font-size: 10px; color: var(--quiet); }
      .wx-blk.line { border-top: 1px solid var(--line); border-radius: 0; }
      .wx-blk.line.last { border-bottom: 1px solid var(--line); }
      .wx-slock { position: absolute; right: 36px; top: 50%; transform: translateY(-50%); width: 14px; height: 16px; z-index: 1; color: rgba(221,221,221,.35); }
      .wx-slock.on { color: ${WX.light}; }
      .wx-vcard { position: absolute; z-index: -1; left: 6px; right: 6px; border-radius: 9px; pointer-events: none; box-sizing: border-box; background: rgba(0,0,0,.26); }
      .wx-vcard.off { background: transparent; box-shadow: inset 0 0 0 1px rgba(221,221,221,.3); }
      @media (prefers-reduced-motion: no-preference) { .wx-blk .sw::after { transition: left .12s; } }`;
    document.head.appendChild(st);
}

app.registerExtension({
    name: "WextraUI.loraStack",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== TYPE) return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            ensureStyle();
            const W = (nm) => (node.widgets || []).find((w) => w.name === nm);
            const wCount = W("loras"), wFolder = W("folder"), wSel = W("selection"), wStep = W("step");

            // ---- the blocks: their widgets and the head row ----
            const blocks = [];
            for (let i = 1; i <= MAX; i++) {
                const b = { i, wOn: W("on_" + i), wLora: W("lora_" + i), wSM: W("strength_model_" + i), wSC: W("strength_clip_" + i),
                    wCtl: W("control_" + i), wRg3: W("rgthree_info_" + i), wPicked: W("picked_" + i) };
                if (!b.wLora) continue;
                if (b.wOn) wxHideWidget(b.wOn, node);   // its value is the pill on the head row
                const el = document.createElement("div"); el.className = "wx wx-blk"; el.dataset.i = String(i);
                el.innerHTML = `<span class="g" title="Drag onto another block: it takes that place, the ones between move">≡</span>` +
                    `<span class="sw" title="On / off: off = not loaded, its words stay out of the prompt"></span>` +
                    `<span class="k" title="Lock: the block keeps its on / off, and solo walks the other blocks">${LOCK_SVG}</span>` +
                    `<span class="x" title="Take this LoRA out of the stack: the blocks under it move up, loras goes down by one">✕</span>` +
                    `<span class="n">${i}</span><span class="s"><span class="sn"></span><span class="sq"></span><span class="sp"></span></span><span class="f"></span>`;
                el.addEventListener("pointerdown", (e) => {
                    e.stopPropagation();
                    if (e.target.closest(".g")) { e.preventDefault(); startDrag(b.i); }
                });
                el.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (e.target.closest(".g")) return;
                    if (e.target.closest(".sw")) { if (b.wOn) { b.wOn.value = !isOn(b); node.setDirtyCanvas(true, true); relabel(); } return; }
                    if (e.target.closest(".k")) { setLock(b.i, !lockOf(b.i)); return; }
                    if (e.target.closest(".x")) { removeBlock(b.i); return; }
                    setFold(i, FOLDS[(FOLDS.indexOf(foldOf(i)) + 1) % FOLDS.length]);
                });
                const head = node.addDOMWidget("wx_block_" + i, "custom", el, { serialize: false, hideOnZoom: false, getValue: () => "", setValue: () => {} });
                head.serialize = false;   // no state of its own: the pill mirrors `on_i`, the folds live in the node's properties
                head.computeSize = (width) => [width, head.hidden ? -4 : 20];
                node.widgets.splice(node.widgets.indexOf(head), 1);
                node.widgets.splice(node.widgets.indexOf(b.wOn || b.wLora), 0, head);
                b.head = { el, widget: head };
                blocks.push(b);
            }
            const byI = (i) => blocks.find((b) => b.i === i);
            // ---- the row of every block, under `separator` (Sick 29/10): on / off, lock and ✕ for all the blocks in use at
            // once, in the columns of the head rows ----
            const allEl = document.createElement("div"); allEl.className = "wx wx-blk wx-all";
            allEl.innerHTML = `<span class="g" style="visibility:hidden">≡</span>` +
                `<span class="sw" title="Every block on; when they are all on, every block off"></span>` +
                `<span class="k" title="Lock every block (each keeps its on / off, out of solo); when they are all locked, unlock them all">${LOCK_SVG}</span>` +
                `<span class="x" title="Take every LoRA out of the stack: one new block is left">✕</span>` +
                `<span class="n">all</span><span class="s"></span><span class="f"></span>`;
            allEl.addEventListener("pointerdown", (e) => e.stopPropagation());
            const allFold = () => {   // the fold every block in use has, or null when they differ
                const f = blocks.filter((b) => b.i <= count()).map((b) => foldOf(b.i));
                return f.length && f.every((x) => x === f[0]) ? f[0] : null;
            };
            allEl.addEventListener("click", (e) => {
                e.stopPropagation();
                const used = blocks.filter((b) => b.i <= count());
                if (e.target.closest(".sw")) { const on = !used.every(isOn); for (const b of used) if (b.wOn) b.wOn.value = on; relabel(); node.setDirtyCanvas(true, true); return; }
                if (e.target.closest(".k")) {
                    const on = !used.every((b) => lockOf(b.i));
                    const a = Array.from({ length: MAX }, (_, k) => lockOf(k + 1));
                    for (const b of used) a[b.i - 1] = on;   // the on / off of each stays as it is (Sick 29/10)
                    setLocks(a); relabel(); node.setDirtyCanvas(true, true); return;
                }
                if (e.target.closest(".x")) { removeAll(); return; }
                // anywhere else: every block in use one fold further (mixed: all open)
                const now = allFold(), next = now ? FOLDS[(FOLDS.indexOf(now) + 1) % FOLDS.length] : "open";
                const a = Array.from({ length: MAX }, (_, k) => foldOf(k + 1));
                for (const b of used) a[b.i - 1] = next;
                setFolds(a); layout(); relabel();
            });
            const allRow = node.addDOMWidget("wx_block_all", "custom", allEl, { serialize: false, hideOnZoom: false, getValue: () => "", setValue: () => {} });
            allRow.serialize = false;
            allRow.computeSize = (width) => [width, 20];
            node.widgets.splice(node.widgets.indexOf(allRow), 1);
            node.widgets.splice(node.widgets.indexOf(W("separator") || blocks[0].head.widget) + 1, 0, allRow);
            // one folder and one selection for the menus of every block (no LoRA already chosen is moved by them)
            const menus = blocks.map((b) => b.wLora);
            wxFolderMenu(node, wFolder, menus);
            if (wSel) wxSelectionMenu(node, wSel, menus, { after: wFolder, watch: [wFolder] });
            // folder and selection speak of files: `None` and the name a block keeps from outside them go on top here, over
            // both, so neither enters a count or the drop-down of the selection
            const below = Object.getOwnPropertyDescriptor(menus[0].options, "values");
            for (const w of menus) {
                const d = Object.getOwnPropertyDescriptor(w.options, "values");
                Object.defineProperty(w.options, "values", { ...d, get: () => {
                    const l = d.get.call(w.options), v = w.value;
                    return [WX_NONE, ...(v && v !== WX_NONE && !l.includes(v) ? [v] : []), ...l];
                } });
            }
            // ---- the button above the selection, while it reads `all`: every LoRA of the folder into the blocks, from
            // the first one, up to twenty; `loras` follows (Sick 27/10) ----
            const folderList = () => below.get.call(menus[0].options);
            const ticks = () => { try { const t = JSON.parse(wSel?.value || "[]"); return Array.isArray(t) ? t : []; } catch (e) { return []; } };
            const fillShown = () => { const l = folderList(); return l.length > 0 && !ticks().some((t) => l.includes(t)); };
            const fillAll = () => {
                if (!fillShown()) return;
                // the locked blocks keep their LoRA (in use or not): the others take the folder in order, without those
                const kept = blocks.filter((b) => lockOf(b.i) && b.i <= count()).map((b) => b.wLora.value);
                const list = folderList().filter((v) => !kept.includes(v));
                let k = 0, n = 0;
                for (const b of blocks) {
                    if (lockOf(b.i)) { if (b.i <= count()) n = b.i; continue; }
                    if (k >= list.length) break;
                    const v = list[k++];
                    if (b.wLora.value !== v) { b.wLora.value = v; b.wLora.callback?.(v); }   // through the callback: the picker reads the words of the new LoRA
                    if (b.wOn) b.wOn.value = true;
                    n = b.i;
                }
                if (!n) return;
                if (wCount) wCount.value = n;
                if (wSolo && wSolo.value !== "fixed" && ring().length) soloAt(ring()[0]);   // `solo` walking: the first one alone, as when it is switched on
                layout();
            };
            const wFill = wxAddButton(node, "load every LoRA into the blocks", fillAll);
            wFill.computeSize = (width) => [width, wFill.hidden ? -4 : LiteGraph.NODE_WIDGET_HEIGHT];
            node.widgets.splice(node.widgets.indexOf(wFill), 1);
            node.widgets.splice(node.widgets.indexOf(wFolder) + 1, 0, wFill);   // between `folder` and the selection
            let fillOn = null;
            const fillCheck = () => {   // shown only while the selection reads `all`; the node changes height with it
                const on = fillShown();
                if (on === fillOn) return false;
                fillOn = on; wFill.hidden = !on; wFill.options = wFill.options || {}; wFill.options.hidden = !on;
                return true;
            };
            wxCompactWidgets(node);
            wxLoadingGuard(node);   // outermost of the menus: the names stay whole for as long as the file is read
            for (const b of blocks) if (b.wPicked) b.picker = wxLoraPicker(node, b.wLora, b.wPicked, b.wRg3, { name: "wx_picker_" + b.i, after: b.wRg3 || b.wSC, oneLine: true });

            // ---- `step`: how much the arrows (and a drag) move every strength; on a cable, the number it brings ----
            let stepNow = null;
            const applyStep = () => {
                if (!wStep) return;
                const s = (node.inputs || []).find((x) => x.widget?.name === "step");
                const v = Number(s?.link != null ? upstreamInt(node, "step", true) ?? wStep.value : wStep.value);
                const st = Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 || 0.01 : 0.01;
                if (st === stepNow) return;
                stepNow = st;
                // step2 is the move itself (canvas and Nodes 2.0); step is its old form, ten times as much
                for (const b of blocks) for (const w of [b.wSM, b.wSC]) if (w) { w.options = w.options || {}; w.options.step2 = st; w.options.step = st * 10; }
            };
            if (wStep) {
                const cb = wStep.callback; wStep.callback = function () { const rr = cb?.apply(this, arguments); applyStep(); return rr; };
                wStep.options = wStep.options || {}; wStep.options.precision = 2;   // two decimals shown
            }

            // ---- `control_i`: after every queued run (afterQueued, like the seed) the two strengths of block i move by
            // the step, up or down; only the blocks in use and on, and never a strength on a cable ----
            const onCable = (w) => (node.inputs || []).some((x) => x.widget?.name === w.name && x.link != null);
            for (const b of blocks) {
                if (!b.wCtl) continue;
                b.wCtl.afterQueued = () => {
                    const c = b.wCtl.value;
                    if (c !== "increment" && c !== "decrement") return;
                    if (b.i > count() || !isOn(b)) return;
                    applyStep();
                    const d = (c === "decrement" ? -1 : 1) * (stepNow || 0.01);
                    for (const w of [b.wSM, b.wSC]) {
                        if (!w || onCable(w) || sLockOf(b.i, w === b.wSM ? "m" : "c")) continue;   // its lock: out of the control
                        const v = Math.round((Number(w.value) + d) * 100) / 100;
                        if (Number.isFinite(v)) w.value = Math.max(-100, Math.min(100, v));
                    }
                    node.setDirtyCanvas(true, true);
                };
            }

            // ---- the rows of a block, on the canvas: a block that is off is drawn faint (it stays editable); the lock of a
            // strength sits inside its row, before the number, and closed it turns the number light blue (variant A, Sick
            // 30/10): locked, the control of the block leaves that strength where it is, by hand it still moves. Default:
            // strength_clip locked, strength_model free. In the properties, as the folds: { m: [...], c: [...] }.
            // drawWidget and not draw: a widget with a `draw` of its own loses its Vue box in Nodes 2.0 ----
            for (const b of blocks) for (const w of [b.wLora, b.wSM, b.wSC, b.wCtl, b.wRg3]) {
                if (typeof w?.drawWidget !== "function") continue;
                const own = w.drawWidget, k = w === b.wSM ? "m" : w === b.wSC ? "c" : null;
                if (k) {
                    let arrows = false;   // the arrows read the same colour as the number: they stay as they are
                    const ar = w.drawArrowButtons;
                    w.drawArrowButtons = function () { arrows = true; ar.apply(this, arguments); arrows = false; };
                    Object.defineProperty(w, "text_color", { configurable: true, get: () => (!arrows && sLockOf(b.i, k) ? WX.light : LiteGraph.WIDGET_TEXT_COLOR) });
                    const down = w.onPointerDown;
                    w.onPointerDown = function (pointer, n, canvas) {   // the canvas asks the widget first: a click on the lock is ours
                        const e = pointer?.eDown, lx = this.__wxLockX;
                        if (e && !LiteGraph.vueNodesMode && lx != null) {
                            const x = e.canvasX - node.pos[0];
                            if (x >= lx - 3 && x <= lx + 14) { pointer.onClick = () => setSLock(b.i, k, !sLockOf(b.i, k)); return true; }
                        }
                        return typeof down === "function" ? down.apply(this, arguments) : false;
                    };
                }
                w.drawWidget = function (ctx, o) {
                    const a = ctx.globalAlpha;
                    if (!isOn(b)) ctx.globalAlpha = a * 0.55;
                    own.call(this, ctx, o);
                    if (k && o?.showText !== false) {   // where the frontend ends the number: its right padding is 20 past two margins
                        const m = this.constructor.margin ?? 15;
                        this.__wxLockX = o.width - 2 * m - 20 - ctx.measureText(String(this._displayValue ?? "")).width - 17;
                        drawLock(ctx, this.__wxLockX, this.y + 3.5, sLockOf(b.i, k));
                    }
                    ctx.globalAlpha = a;
                };
            }
            const usedRows = () => blocks.filter((b) => b.i <= count());
            // the card of a block not folded to one line: from its head to the next head (to `solo`, for the last one). Open it
            // is a well; off, only the edge. On the canvas under the rows, under the DOM of the head and of the picker too
            const cardEnd = (b) => (b.i < count() ? byI(b.i + 1).head.widget : wSolo);
            const origBG = node.onDrawBackground;
            node.onDrawBackground = function (ctx) {
                const rr = origBG?.apply(this, arguments);
                if (LiteGraph.vueNodesMode || node.flags?.collapsed) return rr;
                for (const b of usedRows()) {
                    const top = b.head.widget.y, end = cardEnd(b)?.y;
                    if (foldOf(b.i) === "line" || top == null || end == null || end <= top) continue;
                    ctx.save();
                    ctx.beginPath(); ctx.roundRect(9, top - 2, node.size[0] - 18, end - top - 1, 9);
                    if (isOn(b)) { ctx.fillStyle = "rgba(0,0,0,0.26)"; ctx.fill(); }
                    else { ctx.strokeStyle = "rgba(221,221,221,0.3)"; ctx.lineWidth = 1; ctx.stroke(); }
                    ctx.restore();
                }
                return rr;
            };
            // Nodes 2.0 draws its own rows: the same things over them. A row has no <label>: its name is its first text. The
            // column of the names has no room to spare, so the lock goes inside the box, before the +. The card is a div
            // behind the rows, placed from theirs; the rows are in a scaled box, so the measures go back through the scale
            const rowName = (r) => {
                const t = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
                for (let n = t.nextNode(); n; n = t.nextNode()) { const x = n.textContent.trim(); if (x) return x; }
                return "";
            };
            wxVueDecor(node, () => {
                const root = wxVueNodeEl(node); if (!root) return;
                const rows = new Map();
                for (const r of root.querySelectorAll(".lg-node-widget")) rows.set(rowName(r), r);
                const rowOf = (w) => (w ? rows.get(w.label || w.name) : null);
                for (const b of usedRows()) {
                    const off = !isOn(b);
                    for (const w of [b.wLora, b.wSM, b.wSC, b.wCtl, b.wRg3]) { const r = rowOf(w); if (r) r.style.opacity = off ? "0.55" : ""; }
                    for (const [w, k] of [[b.wSM, "m"], [b.wSC, "c"]]) {
                        const r = rowOf(w); if (!r) continue;
                        if (getComputedStyle(r).position === "static") r.style.position = "relative";
                        const c = wxVueChip(r, "wx-slock", () => setSLock(b.i, k, !sLockOf(b.i, k)));
                        if (!c.firstChild) { c.innerHTML = LOCK_SVG; c.title = SLOCK_TITLE; }
                        const on = sLockOf(b.i, k); c.classList.toggle("on", on);
                        const inp = r.querySelector("input"); if (inp) inp.style.color = on ? WX.light : "";
                    }
                }
                const box = root.getBoundingClientRect(), sc = box.height / (root.offsetHeight || 1) || 1;
                for (const b of blocks) {
                    const c = b.vcard || (b.vcard = Object.assign(document.createElement("div"), { className: "wx-vcard" }));
                    if (c.parentElement !== root) root.appendChild(c);
                    const end = b.i < count() ? byI(b.i + 1).head.el : rowOf(wSolo), on = b.i <= count() && foldOf(b.i) !== "line" && end;
                    c.style.display = on ? "" : "none";
                    if (!on) continue;
                    const t = (b.head.el.getBoundingClientRect().top - box.top) / sc, e = (end.getBoundingClientRect().top - box.top) / sc;
                    c.style.top = t - 2 + "px"; c.style.height = Math.max(0, e - t - 2) + "px";
                    c.classList.toggle("off", !isOn(b));
                }
                const sel = node.widgets.find((w) => w.name === "wx_selection")?.element;   // its own row, not 10 px up on `folder`
                if (sel && sel.style.top !== "0px") sel.style.top = "0px";
            });

            // ---- `solo`, under every block: one LoRA at a time. After every queued run (after the control of the blocks)
            // only the next block is on, among the blocks in use with a LoRA; where the walk is = the first block on ----
            const wSolo = W("solo");
            const ring = () => blocks.filter((b) => b.i <= count() && hasLora(b) && !lockOf(b.i)).map((b) => b.i);   // the locked blocks stay out of the walk
            const soloAt = (i) => {
                for (const b of blocks) if (b.i <= count() && b.wOn && !lockOf(b.i)) b.wOn.value = b.i === i;
                relabel(); node.setDirtyCanvas(true, true);
            };
            if (wSolo) {
                // switched off `fixed` with more than one block on: the first one on stays, alone (the next run is one LoRA already)
                const cb = wSolo.callback;
                wSolo.callback = function () {
                    const rr = cb?.apply(this, arguments);
                    if (wSolo.value !== "fixed") { const rg = ring(), on = rg.filter((i) => isOn(byI(i))); if (rg.length && on.length !== 1) soloAt(on[0] ?? rg[0]); }
                    return rr;
                };
                const soloIdx = () => ring().findIndex((i) => isOn(byI(i)));
                // one step: "+" / "-" / "rand"; `stop` = increment and decrement stay at the ends (the node alone, as the
                // seed's), the beat of a carry cable comes round; true when it came round (for the next node of the chain)
                const step1 = (dir, stop) => {
                    const rg = ring(), at = soloIdx(), last = rg.length - 1;
                    if (!rg.length) return false;
                    let k;
                    if (dir === "rand") { const rest = rg.map((_, j) => j).filter((j) => j !== at); k = rest.length ? rest[Math.floor(Math.random() * rest.length)] : 0; }   // never the same twice in a row
                    else if (at < 0) k = dir === "-" ? last : 0;
                    else if (dir === "-") k = at > 0 ? at - 1 : stop ? 0 : last;
                    else k = at < last ? at + 1 : stop ? last : 0;
                    soloAt(rg[k]);
                    return rg.length > 1 && at >= 0 && (dir === "+" ? k === 0 && at === last : dir === "-" ? k === last && at === 0 : false);
                };
                wSolo.afterQueued = () => {
                    const c = wSolo.value;
                    if (!c || c === "fixed") return;
                    step1(c === "decrement" ? "-" : c === "randomize" ? "rand" : "+", c !== "increment-wrap" && c !== "randomize");
                };
                // `carry` in and out, and the chips ⟲ / ▶ n on its row: n = the blocks in use with a LoRA (wxCarry.js)
                wxCarry(node, { control: () => wSolo,
                    at: () => { const k = soloIdx(); return ring().length > 1 && k >= 0 ? k : null; },
                    size: () => ring().length || null,
                    move: (dir) => step1(dir, false),
                    first: () => { const rg = ring(); if (rg.length) soloAt(rg[0]); } });
            }

            // ---- how many blocks, on / off, the folds ----
            const count = () => {
                const s = (node.inputs || []).find((x) => x.widget?.name === "loras");
                const v = s?.link != null ? upstreamInt(node, "loras") : undefined;
                return Math.max(1, Math.min(MAX, Math.round(Number(v ?? wCount?.value) || 1)));
            };
            const isOn = (b) => !b.wOn || b.wOn.value !== false;
            const hasLora = (b) => !!b.wLora.value && b.wLora.value !== WX_NONE;
            const folds = () => { const f = node.properties?.wx_folds; return Array.isArray(f) ? f : []; };
            function foldOf(i) { const f = folds()[i - 1]; return FOLDS.includes(f) ? f : "open"; }
            const setFolds = (a) => { node.properties = node.properties || {}; node.properties.wx_folds = a; };
            // the locks: a locked block keeps its on / off and `solo` walks the others (Sick 27/10; no longer switched on by
            // the lock, 29/10); in the properties, as the folds
            const locks = () => { const l = node.properties?.wx_locks; return Array.isArray(l) ? l : []; };
            function lockOf(i) { return locks()[i - 1] === true; }
            const setLocks = (a) => { node.properties = node.properties || {}; node.properties.wx_locks = a.some(Boolean) ? a : undefined; };
            function setLock(i, on) {
                const a = Array.from({ length: MAX }, (_, k) => lockOf(k + 1));
                a[i - 1] = on;
                setLocks(a);
                relabel(); node.setDirtyCanvas(true, true);
            }
            // the locks of the strengths: { m, c } arrays in the properties; a place never set = the default (clip locked)
            function sLockOf(i, k) { const a = node.properties?.wx_slocks?.[k], v = Array.isArray(a) ? a[i - 1] : undefined; return typeof v === "boolean" ? v : k === "c"; }
            function sLocksNow() { return { m: Array.from({ length: MAX }, (_, j) => sLockOf(j + 1, "m")), c: Array.from({ length: MAX }, (_, j) => sLockOf(j + 1, "c")) }; }
            function setSLocks(o) { node.properties = node.properties || {}; node.properties.wx_slocks = o; }
            function setSLock(i, k, on) { const o = sLocksNow(); o[k][i - 1] = on; setSLocks(o); node.setDirtyCanvas(true, true); }
            function setFold(i, f) {
                const a = Array.from({ length: MAX }, (_, k) => foldOf(k + 1));
                a[i - 1] = f;
                setFolds(a);
                layout();
            }

            // ---- the order: drag a block by its ≡ onto another one, it takes that place and the ones between move ----
            const graphLink = (id) => { const g = node.graph; return !g ? null : g.links instanceof Map ? g.links.get(id) : g.getLink ? g.getLink(id) : g.links?.[id]; };
            const slotOf = (w) => (w ? (node.inputs || []).findIndex((s) => s.widget?.name === w.name) : -1);
            const moveBlock = (a, to) => {
                const n = count();
                if (a === to || a < 1 || to < 1 || a > n || to > n) return;
                const order = []; for (let i = 1; i <= n; i++) if (i !== a) order.push(i); order.splice(to - 1, 0, a);   // order[p-1] = the block that lands at p
                // a cable = where it comes from (node and output); it is taken off and put back on the new socket by the
                // frontend's own calls: a link moved by hand in the graph's table was dropped by the frontend (26/10)
                const linkAt = (w) => {
                    const k = slotOf(w), id = k < 0 ? null : node.inputs[k].link, l = id != null ? graphLink(id) : null;
                    return l ? [l.origin_id, l.origin_slot] : null;
                };
                const snap = {};
                for (let i = 1; i <= n; i++) {
                    const x = byI(i);
                    snap[i] = { on: x.wOn?.value, lora: x.wLora.value, sm: x.wSM?.value, sc: x.wSC?.value, ctl: x.wCtl?.value, rg3: x.wRg3?.value, picked: x.wPicked?.value,
                        fold: foldOf(i), lock: lockOf(i), slM: sLockOf(i, "m"), slC: sLockOf(i, "c"), lSM: linkAt(x.wSM), lSC: linkAt(x.wSC) };
                }
                const f = Array.from({ length: MAX }, (_, k) => foldOf(k + 1)), lk = Array.from({ length: MAX }, (_, k) => lockOf(k + 1)), sl = sLocksNow();
                // the cables of the strengths: off every socket in the range first, then each onto its new place
                for (let p = 1; p <= n; p++) for (const w of [byI(p).wSM, byI(p).wSC]) { const k = slotOf(w); if (k >= 0 && node.inputs[k].link != null) node.disconnectInput(k); }
                order.forEach((o, idx) => {
                    const p = idx + 1, x = byI(p), s = snap[o];
                    if (x.wOn) x.wOn.value = s.on;
                    x.wLora.value = s.lora;   // not through the callback: the picker would take it as a new LoRA and drop its words
                    if (x.wSM) x.wSM.value = s.sm;
                    if (x.wSC) x.wSC.value = s.sc;
                    if (x.wCtl) x.wCtl.value = s.ctl;
                    if (x.wRg3) x.wRg3.value = s.rg3;
                    if (x.wPicked) x.wPicked.value = s.picked;
                    f[p - 1] = s.fold; lk[p - 1] = s.lock; sl.m[p - 1] = s.slM; sl.c[p - 1] = s.slC;
                    for (const [w, src] of [[x.wSM, s.lSM], [x.wSC, s.lSC]]) {
                        const k = slotOf(w), from = src ? node.graph?.getNodeById(src[0]) : null;
                        if (k >= 0 && from) LiteGraph.LGraphNode.prototype.connect.call(from, src[1], node, k);   // the frontend's own door (as wxSlots.js)
                    }
                });
                setFolds(f); setLocks(lk); setSLocks(sl);
                for (let p = 1; p <= n; p++) byI(p).picker?.resync();
                layout();
                node.graph?.setDirtyCanvas?.(true, true);
            };
            // ---- the ✕ of a block (Sick 29/10): the block leaves the stack, the ones under it move up, `loras` goes down
            // by one. The block goes to the bottom, out of view, as a new one (None, no words, 1.00 / 1.00, no cables, open,
            // unlocked): raising `loras` again does not bring back the LoRA taken out ----
            const countOnCable = () => (node.inputs || []).some((x) => x.widget?.name === "loras" && x.link != null);
            const resetBlock = (x) => {   // a block as a new one; its fold and lock are set by the caller
                for (const w of [x.wSM, x.wSC]) { const k = slotOf(w); if (k >= 0 && node.inputs[k].link != null) node.disconnectInput(k); }
                x.wLora.value = WX_NONE;   // not through the callback, as in moveBlock: resync below
                if (x.wOn) x.wOn.value = true;
                if (x.wSM) x.wSM.value = 1;
                if (x.wSC) x.wSC.value = 1;
                if (x.wCtl) x.wCtl.value = "fixed";
                if (x.wRg3) x.wRg3.value = true;
                if (x.wPicked) x.wPicked.value = "";
                x.picker?.resync();
            };
            const removeBlock = (i) => {
                const n = count();
                if (!wCount || countOnCable() || n < 2 || i < 1 || i > n) return;
                if (i < n) moveBlock(i, n);
                resetBlock(byI(n));
                const f = Array.from({ length: MAX }, (_, k) => foldOf(k + 1)), lk = Array.from({ length: MAX }, (_, k) => lockOf(k + 1));
                f[n - 1] = "open"; lk[n - 1] = false;
                const sl = sLocksNow(); sl.m[n - 1] = false; sl.c[n - 1] = true;
                setFolds(f); setLocks(lk); setSLocks(sl);
                wCount.value = n - 1;
                layout();
                node.graph?.setDirtyCanvas?.(true, true);
            };
            const removeAll = () => {   // every block in use as a new one, one left
                const n = count();
                if (!wCount || countOnCable() || n < 2) return;
                const f = Array.from({ length: MAX }, (_, k) => foldOf(k + 1)), lk = Array.from({ length: MAX }, (_, k) => lockOf(k + 1));
                const sl = sLocksNow();
                for (let p = 1; p <= n; p++) { resetBlock(byI(p)); f[p - 1] = "open"; lk[p - 1] = false; sl.m[p - 1] = false; sl.c[p - 1] = true; }
                setFolds(f); setLocks(lk); setSLocks(sl);
                wCount.value = 1;
                layout();
                node.graph?.setDirtyCanvas?.(true, true);
            };
            let drag = null;   // { from, to } while a block is dragged by its handle
            const blockAt = (e) => {
                const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".wx-blk");
                const b = el ? blocks.find((x) => x.head.el === el) : null;
                return b && b.i <= count() ? b.i : 0;
            };
            const marks = () => {
                for (const b of blocks) {
                    b.head.el.classList.toggle("over", !!drag && b.i === drag.to && b.i !== drag.from);
                    b.head.el.querySelector(".g").classList.toggle("lift", !!drag && b.i === drag.from);
                }
            };
            function startDrag(from) {
                if (from < 1 || from > count() || count() < 2) return;
                drag = { from, to: from }; marks();
                const move = (e) => { const t = blockAt(e); if (t && t !== drag.to) { drag.to = t; marks(); } };
                const up = () => {
                    document.removeEventListener("pointermove", move, true); document.removeEventListener("pointerup", up, true);
                    const d = drag; drag = null; marks();
                    if (d && d.to && d.to !== d.from) moveBlock(d.from, d.to);
                };
                document.addEventListener("pointermove", move, true); document.addEventListener("pointerup", up, true);
            }

            // ---- what the head rows say: the pill, the handle, the summary of a folded block, the fold button ----
            const num = (w) => {
                if (!w) return "-";
                const s = (node.inputs || []).find((x) => x.widget?.name === w.name);
                const v = s?.link != null ? upstreamInt(node, w.name, true) : w.value;
                return typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : "cable";
            };
            // [name, strengths, words], in columns: the name gives way to a narrow node, the data at the end stay whole
            const summary = (b) => {
                if (!hasLora(b)) return ["— no LoRA", "", ""];
                const n = (b.picker?.words() || []).length;
                return [wxCleanName(b.wLora.value), `${num(b.wSM)} / ${num(b.wSC)}`, n ? n + (n === 1 ? " word" : " words") : "no words"];
            };
            const relabel = () => {
                const many = count() >= 2;
                for (const b of blocks) {
                    const el = b.head.el, on = isOn(b), fold = foldOf(b.i);
                    el.classList.toggle("off", !on);
                    el.classList.toggle("line", fold === "line");
                    el.classList.toggle("last", fold === "line" && b.i === count());
                    el.classList.toggle("vue2", !!LiteGraph.vueNodesMode);
                    const g = el.querySelector(".g"), gv = many ? "" : "hidden"; if (g.style.visibility !== gv) g.style.visibility = gv;
                    const x = el.querySelector(".x"), xv = many && !countOnCable() ? "" : "hidden"; if (x.style.visibility !== xv) x.style.visibility = xv;
                    el.querySelector(".k").classList.toggle("on", lockOf(b.i));
                    const [sn, sq, sp] = fold === "line" ? summary(b) : ["", "", ""], eN = el.querySelector(".sn"), eQ = el.querySelector(".sq"), eP = el.querySelector(".sp");
                    if (eN.textContent !== sn) { eN.textContent = sn; el.querySelector(".s").title = sn; }
                    if (eQ.textContent !== sq) eQ.textContent = sq;
                    if (eP.textContent !== sp) eP.textContent = sp;
                    const f = el.querySelector(".f"); if (f.textContent !== FOLD_GLYPH[fold]) { f.textContent = FOLD_GLYPH[fold]; el.title = FOLD_NEXT[fold]; }
                    if (b.picker) { const o = on ? "" : "0.5"; if (b.picker.root.style.opacity !== o) b.picker.root.style.opacity = o; }
                }
                const used = blocks.filter((b) => b.i <= count()), allOn = used.every(isOn), allOff = !used.some(isOn);
                allEl.classList.toggle("off", allOff);
                allEl.classList.toggle("mix", !allOn && !allOff);
                allEl.classList.toggle("vue2", !!LiteGraph.vueNodesMode);
                allEl.querySelector(".k").classList.toggle("on", used.every((b) => lockOf(b.i)));
                const af = allFold(), fa = allEl.querySelector(".f"), fg = af ? FOLD_GLYPH[af] : "▸";
                if (fa.textContent !== fg) fa.textContent = fg;
                const ft = af ? FOLD_NEXT[af].replace("the block", "every block").replace(/^Fold/, "Fold every block") : "Open every block";
                if (allEl.title !== ft) allEl.title = ft;
                const x = allEl.querySelector(".x"), xv = many && !countOnCable() ? "" : "hidden"; if (x.style.visibility !== xv) x.style.visibility = xv;
            };

            // ---- show and hide: the blocks beyond `loras`, the rows a fold takes away ----
            // a hidden box keeps the socket at its last place, where the canvas would still find it under the mouse: it is
            // moved (as in WReso), with no cable off the node, with a cable onto the head of its block (or onto `loras`)
            let groups = [];   // [widget, shown, where its socket goes when hidden]
            const park = (w, on, to) => {
                if (!w || on) return;
                const s = (node.inputs || []).find((x) => x.widget?.name === w.name);
                const y = to?.hidden ? wCount?.y : to?.y ?? to?.last_y;
                w.y = s?.link != null && y != null ? y : PARK;
            };
            const parkAll = () => { for (const [w, on, to] of groups) park(w, on, to); };
            const show = (w, on, to) => {
                if (!w) return;
                w.hidden = !on; w.options = w.options || {}; w.options.hidden = !on;
                if (w.element) w.element.style.display = on ? "" : "none";
                wxSlotHidden(node, w, !on);
                groups.push([w, on, to]);
                park(w, on, to);
            };
            let shownKey = "";
            const keyNow = () => count() + "|" + blocks.map((b) => foldOf(b.i)).join(",");
            function layout() {
                const n = count();
                groups = [];
                for (const b of blocks) {
                    const here = b.i <= n, f = foldOf(b.i), rows = here && f !== "line", tags = rows && f === "open";
                    b.head.widget.hidden = !here; b.head.widget.options.hidden = !here; b.head.el.style.display = here ? "" : "none";
                    for (const w of [b.wLora, b.wSM, b.wSC, b.wCtl]) show(w, rows, b.head.widget);
                    show(b.wRg3, tags, b.head.widget);   // rgthree info goes with the picker at the first fold (Sick, 26/10)
                    b.picker?.show(tags);
                }
                shownKey = keyNow();
                relabel();
                const sz = node.computeSize();
                node.setSize([Math.max(node.size[0], sz[0]), sz[1]]);
                node.setDirtyCanvas(true, true);
                // the cables are drawn on the background before the sockets are parked in this frame: drawn again once
                // they are, or a cable on a folded block points at the parking place until something else redraws (26/10)
                setTimeout(() => node.setDirtyCanvas(true, true), 60);
            }
            if (wCount) { const cb = wCount.callback; wCount.callback = function () { const rr = cb?.apply(this, arguments); layout(); return rr; }; }
            // `loras` moved by a cable or a value set from outside, a fold read from the file: the layout follows; the sockets
            // of the hidden boxes stay parked (the frontend gives a box its place back at every draw)
            wxOnRedraw(node, () => { applyStep(); if (fillCheck() || keyNow() !== shownKey) layout(); else { parkAll(); relabel(); } });
            const onConf = node.onConfigure;
            node.onConfigure = function () { const rr = onConf?.apply(this, arguments); shownKey = ""; applyStep(); setTimeout(layout, 0); setTimeout(layout, 250); return rr; };

            applyStep();
            layout();
            setTimeout(layout, 200);
            return r;
        };
    },
});
