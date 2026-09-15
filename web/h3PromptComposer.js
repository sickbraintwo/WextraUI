import { app } from "../../scripts/app.js";
import { WX, ensureWxStyle, wxChip, wxAddButton, wxCompactWidgets } from "./wxStyle.js";

const CONVERTED_TYPE = "converted-widget";
const BASE_REFERENCE_SECONDS = 10.0;
const MIN_TEXTAREA_HEIGHT = 24;
const TEXTAREA_GAP = 6;

function hideWidget(widget) {
    widget.type = CONVERTED_TYPE;
    widget.computeSize = () => [0, -4];
    // Multiline STRING widgets are backed by a real <textarea> DOM element,
    // not just canvas-drawn — computeSize alone doesn't hide that element.
    if (widget.element) {
        widget.element.style.display = "none";
    }
}

function defaultBeat(name) {
    return { name: name || "BEAT", base_duration: 10.0, locked: false, text: "" };
}

// Measures the textarea's TRUE content height, always resetting to "auto"
// first. Reading scrollHeight without resetting first reads back whatever
// height a *previous* measurement already wrote onto the same element —
// each call would then pad that on top of itself, growing without bound.
function measureTextareaHeight(el) {
    el.style.height = "auto";
    const h = Math.max(MIN_TEXTAREA_HEIGHT, el.scrollHeight + 8);
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
    el.style.resize = "none";
    el.style.overflowY = "hidden";
    const recompute = () => {
        if (collapseState.collapsed) {
            el.style.height = MIN_TEXTAREA_HEIGHT + "px";
        } else {
            measureTextareaHeight(el);
        }
        node.setDirtyCanvas(true, true);
    };
    // Report a few px MORE than the textarea's own height: the DOM element
    // otherwise sits flush against the next canvas widget (the collapse
    // button under "avoid" was drawn 1-2 px over it).
    widget.computeSize = function (width) {
        return [width, (collapseState.collapsed ? MIN_TEXTAREA_HEIGHT : measureTextareaHeight(el)) + TEXTAREA_GAP + (widget.name === "avoid" ? 10 : 0)];
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

            hideWidget(jsonWidget);

            ensureWxStyle();
            const container = document.createElement("div");
            container.className = "wx";
            Object.assign(container.style, {
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                fontSize: "11px",
                width: "100%",
                boxSizing: "border-box",
                padding: "2px 4px",
            });

            const COLS = "1fr 48px 40px 46px 22px";

            function sync() {
                jsonWidget.value = JSON.stringify(rows);
                render();
                node.setDirtyCanvas(true, true);
            }

            function render() {
                container.innerHTML = "";
                const { scaled, flexIdx, error } = computeScaled(rows, totalWidget ? totalWidget.value : BASE_REFERENCE_SECONDS);

                const header = document.createElement("div");
                Object.assign(header.style, { display: "grid", gridTemplateColumns: COLS, gap: "3px" });
                header.innerHTML = '<span class="wx-label" style="margin:2px 0 0">Beat</span><span class="wx-label" style="margin:2px 0 0">Base</span><span></span><span class="wx-label" style="margin:2px 0 0">Real</span><span></span>';
                container.appendChild(header);

                const textareasToSize = [];

                rows.forEach((beat, i) => {
                    const wrapper = document.createElement("div");
                    Object.assign(wrapper.style, { display: "flex", flexDirection: "column", gap: "1px" });

                    const row = document.createElement("div");
                    Object.assign(row.style, { display: "grid", gridTemplateColumns: COLS, gap: "3px", alignItems: "center" });

                    const nameInput = document.createElement("input");
                    nameInput.value = beat.name;
                    nameInput.className = "wx-input"; nameInput.style.width = "100%";
                    nameInput.addEventListener("change", (e) => { beat.name = e.target.value; sync(); });

                    const durInput = document.createElement("input");
                    durInput.type = "number";
                    durInput.step = "0.1";
                    durInput.value = beat.base_duration;
                    durInput.className = "wx-input"; durInput.style.width = "100%";
                    durInput.addEventListener("change", (e) => { beat.base_duration = parseFloat(e.target.value) || 0; sync(); });

                    const lockInput = wxChip("lock", !!beat.locked, () => { beat.locked = !beat.locked; sync(); });
                    lockInput.title = beat.locked ? "Locked: keeps its seconds whatever the total" : "Scaled with total_duration — click to lock";
                    lockInput.style.textAlign = "center";

                    const scaledSpan = document.createElement("span");
                    scaledSpan.textContent = scaled[i] != null ? scaled[i].toFixed(2) + "s" : "?";
                    scaledSpan.style.opacity = "0.85";
                    if (i === flexIdx) scaledSpan.style.color = WX.light;
                    scaledSpan.title = i === flexIdx ? "flex: absorbs the remainder" : (beat.locked ? "locked" : "scaled with total_duration");
                    if (error) scaledSpan.classList.add("wx-err");

                    const btn = document.createElement("button");
                    const isLast = i === rows.length - 1;
                    btn.textContent = isLast ? "+" : "−";
                    btn.className = "wx-btn"; btn.style.width = "100%"; btn.style.padding = "1px 0";
                    btn.addEventListener("click", () => {
                        if (isLast) rows.push(defaultBeat("BEAT" + (rows.length + 1)));
                        else rows.splice(i, 1);
                        sync();
                    });

                    row.append(nameInput, durInput, lockInput, scaledSpan, btn);

                    const textArea = document.createElement("textarea");
                    // same look as the native multiline widgets (intro/sound/avoid)
                    textArea.className = "comfy-multiline-input";
                    textArea.value = beat.text;
                    textArea.placeholder = "what happens in this beat...";
                    textArea.rows = 1;
                    Object.assign(textArea.style, {
                        width: "100%",
                        boxSizing: "border-box",
                        resize: "none",
                        overflowY: "hidden",
                        fontFamily: "inherit",
                        fontSize: "inherit",
                    });
                    textArea.addEventListener("input", (e) => {
                        beat.text = e.target.value;
                        if (!collapseState.collapsed) measureTextareaHeight(textArea);
                        jsonWidget.value = JSON.stringify(rows);
                        node.setDirtyCanvas(true, true);
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

                if (error) {
                    const err = document.createElement("div");
                    err.className = "wx-err";
                    err.textContent = error;
                    container.appendChild(err);
                }

                // H3 only renders frame counts on a 17k+5 grid at 24 fps and
                // snaps UP — show the real clip length the request maps to.
                const frames = secondsToH3Frames(totalWidget ? totalWidget.value : BASE_REFERENCE_SECONDS);
                const framesLine = document.createElement("div");
                framesLine.className = "wx-hint"; framesLine.style.textAlign = "right";
                framesLine.textContent = `H3: ${frames} frames @24fps = ${(frames / H3_FPS).toFixed(2)}s real`;
                container.appendChild(framesLine);

                // Expanded heights still need a real layout pass to measure
                // scrollHeight accurately (fine to arrive a frame late); the
                // collapsed case is already applied synchronously above.
                if (!collapseState.collapsed) {
                    requestAnimationFrame(() => {
                        textareasToSize.forEach(measureTextareaHeight);
                        node.setDirtyCanvas(true, true);
                    });
                }
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
            const tableWidget = node.widgets[node.widgets.length - 1];
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
                            w.element.style.height = MIN_TEXTAREA_HEIGHT + "px";
                            if (w.element.parentElement && w.element.parentElement.classList.contains("dom-widget")) {
                                w.element.parentElement.style.height = MIN_TEXTAREA_HEIGHT + "px";
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

            // Toggle button: collapse all text areas (intro/sound/avoid + every
            // beat's text) down to one line to see the node's structure at a
            // glance, or expand them all back.
            const collapseBtn = wxAddButton(node, "Collapse text areas", () => {
                collapseState.collapsed = !collapseState.collapsed;
                collapseBtn.name = collapseState.collapsed ? "Expand text areas" : "Collapse text areas";
                resyncLayout();
            });
            wxCompactWidgets(node);   // table and button take no slot: widgets_values = the inputs of object_info, in order
            // (Tried moving this button away from "avoid" to dodge a cosmetic
            // 1-2px overlap there — reverted: reordering widgets breaks older
            // saves. Not worth that risk for something this minor.)

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
                    node.setDirtyCanvas(true, true);
                }, 150);
                return r;
            };

            return ret;
        };
    },
});
