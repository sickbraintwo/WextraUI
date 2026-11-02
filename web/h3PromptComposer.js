import { app } from "../../scripts/app.js";
import { ensureWxStyle, wxCompactWidgets, wxHideWidget, wxOnRedraw, wxVueNodeEl } from "./wxStyle.js";

// WScene Composer H3. Restyle B (Sick 01/11, mockup WSceneComposerH3): `intro`, `sound` and `avoid` say their name inside,
// full or empty, in one font with the beats; the table is quiet, a lock instead of the chip, a `✕` on every row when the
// pointer is on it, the fold in the empty corner of the head, `+ beat` next to the count of the frames. On top a bar of the
// clip: a segment per beat as long as its real seconds, the lock on the locked ones, the flex in blue, hatched at the end
// the frames H3 adds rounding up. An edge of the bar drags: it sets the length of the beat it belongs to (the one before
// the flex beat, or the locked one after it), by 0.1 s, and the flex absorbs the difference.

const BASE_REFERENCE_SECONDS = 10.0;
const MIN_TEXTAREA_HEIGHT = 24;
const BOX_MIN_HEIGHT = 39;      // a native box: its name and one line of text
const TEXTAREA_GAP = 6;
const LOCK = (on) => `<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><rect x="2.5" y="5.5" width="7" height="5" rx="1" fill="currentColor"/>`
    + `<path d="${on ? "M4 5.5V4a2 2 0 0 1 4 0v1.5" : "M4 5.5V3.7a2 2 0 0 1 3.9-.7"}" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`;
const FOLD = (folded) => `<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="${folded ? "M2 3.5l3 3 3-3" : "M2 6.5l3-3 3 3"}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function ensureStyle() {
    if (document.getElementById("wx-sc-style")) return;
    const st = document.createElement("style"); st.id = "wx-sc-style";
    ensureWxStyle();
    // the greys come from the text colour by transparency and the wells are the node a shade darker: they take the node's colour
    st.textContent = `
      textarea.wx-sc-ta { --ink: var(--input-text, #ddd); box-sizing: border-box !important; padding: 19px 8px 4px !important; border: 0 !important; border-radius: 6px !important; resize: none !important; overflow: hidden !important;
        background: rgba(0,0,0,.24) !important; color: var(--ink) !important; font: 12px/16px "Segoe UI", system-ui, sans-serif !important; }
      textarea.wx-sc-ta:focus { outline: none !important; box-shadow: inset 0 0 0 1px #1464b3 !important; }
      textarea.wx-sc-ta::placeholder { color: color-mix(in srgb, var(--ink) 40%, transparent); }
      .wx-sc-bl { --ink: var(--input-text, #ddd); position: absolute; left: 8px; top: 4px; font: 11px/14px "Segoe UI", system-ui, sans-serif; color: color-mix(in srgb, var(--ink) 60%, transparent); pointer-events: none; }
      textarea.wx-sc-vue { field-sizing: content; min-height: 0 !important; resize: none !important; overflow: hidden !important; font: 12.5px/16px "Segoe UI", system-ui, sans-serif !important; }
      .wx-sc { --ink: var(--input-text, #ddd); --quiet: color-mix(in srgb, var(--ink) 60%, transparent); --faint: color-mix(in srgb, var(--ink) 40%, transparent);
        --line: color-mix(in srgb, var(--ink) 18%, transparent); --well: rgba(0,0,0,.24); box-sizing: border-box; display: flex; flex-direction: column; width: 100%; color: var(--ink); font: 12px/16px "Segoe UI", system-ui, sans-serif; }
      .wx-sc.vue { --ink: var(--component-node-foreground, #ddd); }
      .wx-sc * { box-sizing: border-box; }
      .wx-sc button, .wx-sc input, .wx-sc textarea { margin: 0; border: 0; padding: 0; background: none; color: inherit; font: inherit; }
      .wx-sc button { cursor: pointer; }
      .wx-sc button:focus-visible { outline: 2px solid #1464b3; outline-offset: 1px; }
      .wx-sc .tl { margin: 2px 0 8px; }
      .wx-sc .bar { position: relative; height: 22px; border-radius: 5px; overflow: hidden; background: var(--well); }
      .wx-sc .seg { position: absolute; top: 0; bottom: 0; display: flex; align-items: center; gap: 4px; padding: 0 6px; overflow: hidden; white-space: nowrap; font-size: 11px;
        background: color-mix(in srgb, var(--ink) 13%, transparent); box-shadow: inset -1px 0 0 rgba(0,0,0,.4); }
      .wx-sc .seg.locked { background: color-mix(in srgb, var(--ink) 22%, transparent); }
      .wx-sc .seg.flex { background: color-mix(in srgb, #1464b3 42%, transparent); color: #eaf3fd; }
      .wx-sc .seg svg { flex-shrink: 0; opacity: .8; }
      .wx-sc .tail { position: absolute; top: 0; bottom: 0; background: repeating-linear-gradient(135deg, var(--faint) 0 1px, transparent 1px 4px); }
      .wx-sc .edge { position: absolute; top: 0; bottom: 0; width: 9px; margin-left: -5px; cursor: ew-resize; z-index: 1; touch-action: none; }
      .wx-sc .edge::after { content: ""; position: absolute; left: 4px; top: 4px; bottom: 4px; width: 1px; background: var(--ink); opacity: 0; }
      .wx-sc .edge:hover::after, .wx-sc.dragging .edge::after { opacity: .7; }
      .wx-sc .ticks { position: relative; height: 14px; margin-top: 2px; font-size: 10px; line-height: 14px; color: var(--faint); font-variant-numeric: tabular-nums; }
      .wx-sc .ticks span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
      .wx-sc .ticks span:first-child { transform: none; }
      .wx-sc .ticks span:last-child { transform: translateX(-100%); }
      .wx-sc .th, .wx-sc .row { display: grid; grid-template-columns: 1fr 44px 24px 44px 18px; gap: 4px; align-items: center; }
      .wx-sc .th { height: 18px; font-size: 11px; color: var(--quiet); }
      .wx-sc .th span:nth-child(2), .wx-sc .th span:nth-child(4) { text-align: right; padding-right: 6px; }
      .wx-sc .beat { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
      .wx-sc .row input { width: 100%; min-width: 0; height: 20px; padding: 0 6px; border-radius: 4px; background: var(--well); font-size: 12px; }
      .wx-sc .row input.bs { text-align: right; font-variant-numeric: tabular-nums; -moz-appearance: textfield; appearance: textfield; }
      .wx-sc .row input.bs::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      .wx-sc input:focus, .wx-sc textarea:focus { outline: none; box-shadow: inset 0 0 0 1px #1464b3; }
      .wx-sc .lk { display: inline-grid; place-items: center; height: 20px; border-radius: 10px; color: var(--faint); }
      .wx-sc .lk:hover { color: var(--ink); background: var(--line); }
      .wx-sc .lk.on { background: #00509f; color: #eaf3fd; }
      .wx-sc .real { text-align: right; padding-right: 6px; font-variant-numeric: tabular-nums; color: var(--quiet); }
      .wx-sc .real.flex { color: #a8cdf5; }
      .wx-sc .del { height: 20px; border-radius: 4px; color: var(--faint); font-size: 10px; opacity: 0; }
      .wx-sc .beat:hover .del, .wx-sc .del:focus-visible { opacity: 1; }
      .wx-sc .del:hover { color: var(--ink); background: var(--line); }
      .wx-sc .bt { display: block; width: 100%; min-height: 24px; padding: 4px 6px; border-radius: 4px; background: var(--well); resize: none; overflow: hidden; font: 12px/16px "Segoe UI", system-ui, sans-serif; }
      .wx-sc .bt::placeholder { color: var(--faint); }
      .wx-sc .fold { height: 18px; border-radius: 4px; color: var(--quiet); display: inline-grid; place-items: center; }
      .wx-sc .fold:hover { color: var(--ink); background: var(--line); }
      .wx-sc .foot { display: flex; align-items: center; gap: 4px; margin-top: 6px; height: 18px; }
      .wx-sc .add { height: 18px; padding: 0 7px; border-radius: 9px; color: var(--quiet); font-size: 11px; }
      .wx-sc .add:hover { background: var(--line); color: var(--ink); }
      .wx-sc .hint { margin-left: auto; color: var(--faint); font-size: 11px; font-variant-numeric: tabular-nums; }
      .wx-sc .err { color: #e08080; font-size: 10px; }
      @media (prefers-reduced-motion: no-preference) { .wx-sc :is(.lk, .del, .add, .fold) { transition: background-color .12s, color .12s, opacity .12s; } }`;
    document.head.appendChild(st);
}

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

// Multiline STRING widgets are backed by a real <textarea> DOM element: the shared helper hides the element too,
// and the widget's socket with it.
const hideWidget = wxHideWidget;

function defaultBeat(name) {
    return { name: name || "BEAT", base_duration: 10.0, locked: false, text: "" };
}

// Measures the textarea's TRUE content height, always resetting to "auto"
// first. Reading scrollHeight without resetting first reads back whatever
// height a *previous* measurement already wrote onto the same element —
// each call would then pad that on top of itself, growing without bound.
function measureTextareaHeight(el) {
    el.style.height = "auto";
    const h = Math.max(el.classList.contains("wx-sc-ta") ? BOX_MIN_HEIGHT : MIN_TEXTAREA_HEIGHT, el.scrollHeight);
    el.style.height = h + "px";
    // ComfyUI wraps every multiline widget's <textarea> in its own
    // "dom-widget size-full" element and only resizes THAT wrapper on its
    // own schedule — if it lags behind, the (correctly-sized) textarea
    // overflows past the wrapper's stale bounds into whatever is drawn
    // next. Set the wrapper's height directly instead of trusting it to
    // catch up on its own.
    if (el.parentElement && el.parentElement.classList.contains("dom-widget")) {
        el.parentElement.style.height = h + "px";
    }
    return h;
}

// Native ComfyUI multiline STRING widgets are fixed-height <textarea>s with
// a manual drag-resize handle. Make one grow/shrink with its content instead,
// and report its real height to LiteGraph so the node reflows around it.
// `collapseState` is a shared {collapsed:bool} object — when collapsed, the
// widget reports/holds a fixed one-line height instead of measuring content.
function makeTextareaAutoGrow(node, widget, collapseState) {
    if (!widget || !widget.element) return;
    const el = widget.element;
    el.classList.add("wx-sc-ta");
    el.rows = 1;
    const recompute = () => {
        if (collapseState.collapsed) {
            el.style.height = BOX_MIN_HEIGHT + "px";
        } else {
            measureTextareaHeight(el);
        }
        node.setDirtyCanvas(true, true);
    };
    // Report a few px MORE than the textarea's own height: the DOM element
    // otherwise sits flush against the next canvas widget (the collapse
    // button under "avoid" was drawn 1-2 px over it).
    widget.computeSize = function (width) {
        return [width, (collapseState.collapsed ? BOX_MIN_HEIGHT : measureTextareaHeight(el)) + TEXTAREA_GAP + (widget.name === "avoid" ? 10 : 0)];
    };
    el.addEventListener("input", recompute);
    // scrollHeight isn't reliable until the element is laid out and has its
    // saved value restored; a couple of deferred passes cover both cases.
    requestAnimationFrame(recompute);
    setTimeout(recompute, 200);
}

// Mirror of src/h3_timing.py: seconds -> frames snapped up to 17k+5.
const H3_FPS = 24;
function secondsToH3Frames(seconds) {
    let frames = Math.max(5, Math.round((Number(seconds) || 0) * H3_FPS));
    const rem = (frames - 5) % 17;
    if (rem) frames += 17 - rem;
    return Math.min(frames, 3600);
}

function computeScaled(rows, totalDuration) {
    const total = Number(totalDuration) || BASE_REFERENCE_SECONDS;
    const unlockedIdx = rows.map((_, i) => i).filter((i) => !rows[i].locked);
    const lockedSum = rows.filter((b) => b.locked).reduce((s, b) => s + (Number(b.base_duration) || 0), 0);
    const scaleFactor = total / BASE_REFERENCE_SECONDS;
    const scaled = new Array(rows.length).fill(0);

    if (unlockedIdx.length === 0) {
        return { scaled, flexIdx: -1, error: "All beats locked — at least one must stay unlocked." };
    }

    const flexIdx = unlockedIdx[unlockedIdx.length - 1];
    const scaleIdx = unlockedIdx.slice(0, -1);

    rows.forEach((b, i) => {
        if (b.locked) scaled[i] = Math.round((Number(b.base_duration) || 0) * 100) / 100;
    });

    let sumScaled = 0;
    scaleIdx.forEach((i) => {
        const v = Math.round((Number(rows[i].base_duration) || 0) * scaleFactor * 100) / 100;
        scaled[i] = v;
        sumScaled += v;
    });

    const flexVal = Math.round((total - lockedSum - sumScaled) * 100) / 100;
    scaled[flexIdx] = flexVal;

    return { scaled, flexIdx, error: flexVal < 0 ? "Locked + scaled beats exceed total_duration." : null };
}

app.registerExtension({
    name: "WextraUI.H3PromptComposer.BeatTable",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "h3PromptComposer") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const ret = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;

            const jsonWidget = node.widgets.find((w) => w.name === "beats_json");
            const totalWidget = node.widgets.find((w) => w.name === "total_duration");
            if (!jsonWidget) return ret;

            let rows;
            try {
                rows = JSON.parse(jsonWidget.value);
                if (!Array.isArray(rows) || rows.length === 0) throw new Error("empty");
            } catch (e) {
                rows = [defaultBeat("BEAT1")];
            }

            const collapseState = { collapsed: false };

            ["intro", "sound", "avoid"].forEach((name) => {
                const w = node.widgets.find((ww) => ww.name === name);
                makeTextareaAutoGrow(node, w, collapseState);
            });

            hideWidget(jsonWidget, node);

            ensureStyle();
            const container = mk("div", "wx-sc");
            let tableWidget = null;

            function sync() {
                jsonWidget.value = JSON.stringify(rows);
                render();
                node.setDirtyCanvas(true, true);
            }

            // the bar of the clip: a segment per beat as long as its real seconds, on the length H3 really renders
            function timeline(total, scaled, flexIdx, tip) {
                const span = secondsToH3Frames(total) / H3_FPS, tl = mk("div", "tl"), bar = mk("div", "bar"), ticks = mk("div", "ticks");
                const tick = (left, text) => { const t = mk("span", "", text); t.style.left = left + "%"; ticks.appendChild(t); };
                tick(0, "0");
                let x = 0;
                rows.forEach((b, i) => {
                    const d = Math.max(0, scaled[i] || 0), w = d / span * 100;
                    const seg = mk("div", "seg" + (b.locked ? " locked" : "") + (i === flexIdx ? " flex" : ""));
                    seg.style.left = x + "%"; seg.style.width = w + "%"; seg.title = `${b.name}: ${d.toFixed(2)} s, ${tip(i)}`;
                    if (b.locked) seg.innerHTML = LOCK(true);
                    seg.appendChild(mk("span", "", b.name));
                    bar.appendChild(seg);
                    x += w;
                    if (i < rows.length - 1) tick(x, (x / 100 * span).toFixed(1));
                });
                const tail = mk("div", "tail"); tail.style.left = x + "%"; tail.style.width = Math.max(0, 100 - x) + "%";
                tail.title = `H3 rounds up to ${secondsToH3Frames(total)} frames: ${Math.max(0, span - total).toFixed(2)} s more`;
                bar.appendChild(tail);
                x = 0;
                rows.slice(0, -1).forEach((b, i) => {
                    x += Math.max(0, scaled[i] || 0) / span * 100;
                    if (flexIdx < 0) return;
                    const edge = mk("div", "edge"); edge.style.left = x + "%"; edge.title = "Drag to change the length";
                    edge.addEventListener("pointerdown", (e) => dragEdge(e, i, bar));
                    bar.appendChild(edge);
                });
                tick(rows.reduce((a, _, i) => a + Math.max(0, scaled[i] || 0), 0) / span * 100, total.toFixed(1) + " s");
                tl.append(bar, ticks);
                return tl;
            }
            // an edge sets the length of the beat it belongs to: the one before the flex beat, or the locked one after it
            function dragEdge(e, k, bar) {
                if (e.button !== 0) return;
                e.preventDefault(); e.stopPropagation();
                const total = Number(totalWidget?.value) || BASE_REFERENCE_SECONDS, t0 = computeScaled(rows, total), W = bar.getBoundingClientRect().width;
                const span = secondsToH3Frames(total) / H3_FPS, j = k < t0.flexIdx ? k : k + 1, sign = j === k ? 1 : -1, scale = total / BASE_REFERENCE_SECONDS;
                const d0 = t0.scaled[j], max = Math.floor((d0 + t0.scaled[t0.flexIdx]) * 10 + 1e-6) / 10, x0 = e.clientX;
                container.classList.add("dragging");
                const move = (ev) => {
                    const d = Math.min(max, Math.max(0.1, Math.round((d0 + sign * (ev.clientX - x0) / W * span) * 10) / 10));
                    rows[j].base_duration = rows[j].locked ? d : Math.round(d / scale * 100) / 100;
                    sync();
                };
                const up = () => { window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true); container.classList.remove("dragging"); };
                window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", up, true);   // on the way in: Nodes 2.0 stops the moves on the way out
            }

            function render() {
                container.innerHTML = "";
                const total = Number(totalWidget?.value) || BASE_REFERENCE_SECONDS;
                const { scaled, flexIdx, error } = computeScaled(rows, total);
                const tip = (i) => (i === flexIdx ? "flex: absorbs the remainder" : rows[i].locked ? "locked" : "scaled with total_duration");

                container.appendChild(timeline(total, scaled, flexIdx, tip));

                const header = mk("div", "th");
                header.append(mk("span", "", "Beat"), mk("span", "", "Base"), mk("span"), mk("span", "", "Real"));
                const fold = mk("button", "fold"); fold.innerHTML = FOLD(collapseState.collapsed);
                fold.title = collapseState.collapsed ? "Open the texts" : "Fold the texts to one line";
                fold.addEventListener("click", () => { collapseState.collapsed = !collapseState.collapsed; resyncLayout(); });
                header.appendChild(fold);
                container.appendChild(header);

                const textareasToSize = [];

                rows.forEach((beat, i) => {
                    const wrapper = mk("div", "beat"), row = mk("div", "row");

                    const nameInput = mk("input", "nm");
                    nameInput.value = beat.name;
                    nameInput.setAttribute("aria-label", "beat name");
                    nameInput.addEventListener("change", (e) => { beat.name = e.target.value; sync(); });

                    const durInput = mk("input", "bs");
                    durInput.type = "number";
                    durInput.step = "0.1";
                    durInput.value = beat.base_duration;
                    durInput.title = "seconds on a 10 s reference";
                    durInput.addEventListener("change", (e) => { beat.base_duration = parseFloat(e.target.value) || 0; sync(); });

                    const lockInput = mk("button", "lk" + (beat.locked ? " on" : ""));
                    lockInput.innerHTML = LOCK(!!beat.locked);
                    lockInput.title = beat.locked ? "Locked: keeps its seconds whatever the total" : "Scaled with total_duration — click to lock";
                    lockInput.setAttribute("aria-pressed", String(!!beat.locked));
                    lockInput.addEventListener("click", () => { beat.locked = !beat.locked; sync(); });

                    const scaledSpan = mk("span", "real" + (i === flexIdx ? " flex" : ""), scaled[i] != null ? scaled[i].toFixed(2) + "s" : "?");
                    scaledSpan.title = tip(i);
                    if (error) scaledSpan.classList.add("wx-err");

                    row.append(nameInput, durInput, lockInput, scaledSpan);
                    if (rows.length > 1) {
                        const del = mk("button", "del", "✕"); del.title = "Remove this beat";
                        del.addEventListener("click", () => { rows.splice(i, 1); sync(); });
                        row.appendChild(del);
                    } else row.appendChild(mk("span"));

                    const textArea = mk("textarea", "bt");
                    textArea.value = beat.text;
                    textArea.placeholder = "what happens in this beat";
                    textArea.rows = 1;
                    textArea.spellcheck = false;
                    textArea.addEventListener("input", (e) => {
                        beat.text = e.target.value;
                        if (!collapseState.collapsed) measureTextareaHeight(textArea);
                        jsonWidget.value = JSON.stringify(rows);
                        reflow();
                    });

                    // Collapsed height is a fixed constant — apply it right
                    // now, synchronously, so the table's own computeSize (read
                    // immediately after render() returns, same frame) already
                    // sees the correct height instead of a stale expanded one
                    // left over until the deferred pass below runs.
                    if (collapseState.collapsed) {
                        textArea.style.height = MIN_TEXTAREA_HEIGHT + "px";
                    }

                    wrapper.append(row, textArea);
                    container.appendChild(wrapper);
                    textareasToSize.push(textArea);
                });

                if (error) container.appendChild(mk("div", "err", error));

                // H3 only renders frame counts on a 17k+5 grid at 24 fps and
                // snaps UP — show the real clip length the request maps to.
                const frames = secondsToH3Frames(total);
                const foot = mk("div", "foot"), add = mk("button", "add", "+ beat");
                add.addEventListener("click", () => { rows.push(defaultBeat("BEAT" + (rows.length + 1))); sync(); });
                foot.append(add, mk("span", "hint", `H3: ${frames} frames @24fps = ${(frames / H3_FPS).toFixed(2)}s real`));
                container.appendChild(foot);

                // Expanded heights still need a real layout pass to measure
                // scrollHeight accurately (fine to arrive a frame late); the
                // collapsed case is already applied synchronously above.
                requestAnimationFrame(() => {
                    if (!collapseState.collapsed) textareasToSize.forEach(measureTextareaHeight);
                    reflow();
                });
            }
            // the node takes the height of what it holds: a beat added or taken out, a text that wraps
            function reflow() {
                if (tableWidget) { const h = node.computeSize()[1]; if (Math.abs(h - node.size[1]) >= 1) node.setSize([node.size[0], h]); }
                node.setDirtyCanvas(true, true);
            }

            render();

            node.addDOMWidget("beats_table", "custom", container, {
                getValue: () => jsonWidget.value,
                setValue: (v) => {
                    try { rows = JSON.parse(v); } catch (e) { /* keep current rows */ }
                    jsonWidget.value = v;
                    render();
                },
                serialize: false,
                hideOnZoom: false,
            });

            // addDOMWidget() appends the new widget at the end of node.widgets;
            // move it to sit right after the (now hidden) beats_json widget,
            // i.e. between "intro" and "total_duration", matching the intended
            // reading order of the node.
            tableWidget = node.widgets[node.widgets.length - 1];
            tableWidget.serialize = false;   // the table mirrors beats_json: no slot of its own in widgets_values
            const jsonIdx = node.widgets.indexOf(jsonWidget);
            node.widgets.splice(node.widgets.length - 1, 1);
            node.widgets.splice(jsonIdx + 1, 0, tableWidget);

            // Report the table's real content height to LiteGraph so the node
            // grows/shrinks and everything below it shifts, instead of the
            // table overlapping fixed-size space as rows are added/removed.
            // ComfyUI wraps `container` in its own DOM-widget element and
            // stretches container to 100% of THAT wrapper's height (class
            // "h-full") — so container.scrollHeight normally just mirrors
            // whatever height the wrapper was last given, not the content's
            // real size. Force height:auto first so the measurement reflects
            // actual content, exactly like measureTextareaHeight does.
            const ROW_HEIGHT = 44;
            const EXTRA_PADDING = 16;
            tableWidget.computeSize = function (width) {
                container.style.height = "auto";
                const measured = container.scrollHeight;
                const h = measured > 0 ? measured + EXTRA_PADDING : ROW_HEIGHT * (rows.length + 1) + EXTRA_PADDING;
                return [width, h];
            };

            if (totalWidget) {
                const origCallback = totalWidget.callback;
                totalWidget.callback = function (...args) {
                    const r = origCallback ? origCallback.apply(this, args) : undefined;
                    render();
                    return r;
                };
            }

            // Re-measures every text widget and re-applies the node's total
            // size from scratch. This is what actually fixes a stale/bogus
            // size (e.g. one restored from an older save) — used by the
            // collapse toggle, and also fired once automatically after load
            // so the node never depends on the user clicking anything first.
            function resyncLayout() {
                ["intro", "sound", "avoid"].forEach((name) => {
                    const w = node.widgets.find((ww) => ww.name === name);
                    if (w && w.element) {
                        if (collapseState.collapsed) {
                            w.element.style.height = BOX_MIN_HEIGHT + "px";
                            if (w.element.parentElement && w.element.parentElement.classList.contains("dom-widget")) {
                                w.element.parentElement.style.height = BOX_MIN_HEIGHT + "px";
                            }
                        } else {
                            measureTextareaHeight(w.element);
                        }
                    }
                });
                render();
                // Keep whatever width the user has set — computeSize() alone
                // would reset it back to the node's minimum/default width.
                const newSize = node.computeSize();
                node.setSize([node.size[0], newSize[1]]);
                node.setDirtyCanvas(true, true);
            }

            wxCompactWidgets(node);   // the table takes no slot: widgets_values = the inputs of object_info, in order

            // The name inside each native box, on the box Comfy makes around the textarea after the node is born; under
            // Nodes 2.0 the name is Vue's, and its textarea takes the height of the text. The colours follow a total typed
            // or arrowed, whichever way it changes.
            let lastTotal = totalWidget?.value;
            const vueBoxes = () => {
                const root = wxVueNodeEl(node); if (!root) return;
                for (const t of root.querySelectorAll(".lg-node-widget textarea:not(.bt)")) t.classList.add("wx-sc-vue");
            };
            wxOnRedraw(node, () => {
                container.classList.toggle("vue", !!LiteGraph.vueNodesMode);
                vueBoxes();
                if (totalWidget && totalWidget.value !== lastTotal) { lastTotal = totalWidget.value; render(); }
                for (const name of ["intro", "sound", "avoid"]) {
                    const p = node.widgets.find((ww) => ww.name === name)?.element?.parentElement;
                    if (!p || p.querySelector(":scope > .wx-sc-bl")) continue;
                    if (getComputedStyle(p).position === "static") p.style.position = "relative";
                    p.appendChild(mk("span", "wx-sc-bl", name));
                }
            });

            // The rows are read once here, when beats_json still holds its default: the saved value comes later, with the
            // configure, and the table would show the default and write it over the saved beats at the first touch. So they
            // are read again after every load. A file of 0.3.5 and before keeps a hole in its values for the table and one
            // for the button that is gone: seven values, read here by their old place.
            const origConfigure = node.onConfigure;
            node.onConfigure = function (info) {
                const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                const wv = info?.widgets_values;
                if (Array.isArray(wv) && wv.length === 7 && wv[2] == null && !info?.widgets_values_named) {
                    const put = (name, v) => { const w = node.widgets.find((ww) => ww.name === name); if (w && v != null) w.value = v; };
                    put("intro", wv[0]); put("beats_json", wv[1]); put("total_duration", wv[3]); put("sound", wv[4]); put("avoid", wv[5]);
                }
                setTimeout(() => {
                    try { const v = JSON.parse(jsonWidget.value); if (Array.isArray(v) && v.length) rows = v; } catch (e) { /* keep current rows */ }
                    lastTotal = totalWidget?.value;
                    resyncLayout();
                }, 0);
                return r;
            };

            // A node restored from a save (this workflow, or an older one
            // with a stale saved size) starts with whatever height was last
            // written to disk, which drifts from what the widgets actually
            // need. Recompute for real once, shortly after load, instead of
            // requiring a manual click on the collapse button to fix it.
            setTimeout(resyncLayout, 300);

            // Dragging the node's edge changes its width, which changes how
            // every textarea wraps its text — re-measure everything against
            // the new width once the resize settles, instead of leaving stale
            // heights computed for the old width. onResize fires repeatedly
            // (near-continuously) while the drag is in progress; rebuilding
            // the whole table on every single tick is what caused the
            // mid-drag flicker, so only do it once the drag pauses.
            let resizeSettleTimer = null;
            const origOnResize = node.onResize;
            node.onResize = function (size) {
                const r = origOnResize ? origOnResize.apply(this, arguments) : undefined;
                if (resizeSettleTimer) clearTimeout(resizeSettleTimer);
                resizeSettleTimer = setTimeout(() => {
                    if (!collapseState.collapsed) {
                        ["intro", "sound", "avoid"].forEach((name) => {
                            const w = node.widgets.find((ww) => ww.name === name);
                            if (w && w.element) measureTextareaHeight(w.element);
                        });
                    }
                    render();
                }, 150);
                return r;
            };

            return ret;
        };
    },
});
