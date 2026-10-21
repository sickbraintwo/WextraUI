// WextraUI — WExtractor: one frame of a video, or every frame between two (Sick, 19/10/2026). Under the `video` menu, the
// upload button and `multiple`; then the preview of the video and, under it, the timeline: drag the pointer and the
// preview follows it; where it is left, that frame goes out of `images`. With `multiple` on, a second pointer (it
// starts at the end of the timeline) and between the two the number of frames that go out, both ends included.
// Keys, with the node selected (a click on the preview or the timeline selects it): ← / → one frame (Shift: ten),
// Home / End, space = play / pause, F (or ⛶ at the end of the timeline) the full screen, F or Esc back. Play moves the
// pointer with the video (one frame); with `multiple` it plays the stretch between the pointers over and over, the
// pointers stay. Full screen as WMixer's: the browser's own, the keys kept from the graph, Ctrl+S saves the workflow,
// and on top the video's name and a `multiple` chip (on the node they are the widgets).
// A video dragged from Windows onto the node is uploaded into the input folder, as Load Video does. The preview is the
// light copy WMixer makes (a keyframe every 4 frames: it follows the pointer at once), the file itself until it is ready.
// The pointers live in the hidden widgets `start` / `end` (frames from 0), read by src/extractor.py.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { WX, ensureWxStyle, wxHideWidget, wxCompactWidgets, wxAddButton } from "./wxStyle.js";

const TL_H = 54, VIDEO_MIN = 120, VIDEO_MAX = 640, WARN_GB = 2;
const isVideo = (n) => /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(n);

/** The menu's value -> { name, type }: `sub/clip.mp4 [output]` is in output, a bare name in input. */
function fileOf(value) {
    const m = /^(.*) \[(output|input|temp)\]$/.exec(String(value || ""));
    return m ? { name: m[1], type: m[2] } : { name: String(value || ""), type: "input" };
}
function viewURL(f) {
    const i = f.name.lastIndexOf("/");
    const sub = i < 0 ? "" : f.name.slice(0, i), fn = f.name.slice(i + 1);
    return api.apiURL(`/view?filename=${encodeURIComponent(fn)}&subfolder=${encodeURIComponent(sub)}&type=${f.type}`);
}
const infos = new Map(), proxies = new Map();
function videoInfo(value) {
    if (!infos.has(value)) infos.set(value, api.fetchApi(`/wextraui/extractor_info?video=${encodeURIComponent(value)}`)
        .then((r) => r.json()).then((j) => (j.error ? Promise.reject(j.error) : j)).catch((e) => { infos.delete(value); return { error: String(e) }; }));
    return infos.get(value);
}
function videoProxy(value) {
    const f = fileOf(value);
    if (!proxies.has(value)) proxies.set(value, api.fetchApi(`/wextraui/video_proxy?name=${encodeURIComponent(f.name)}&type=${f.type}`)
        .then((r) => r.json()).then((j) => (j.file ? j.file : null)).catch(() => null));
    return proxies.get(value);
}
const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text !== undefined) e.textContent = text; return e; };

app.registerExtension({
    name: "WextraUI.extractor",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxExtractor") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            ensureWxStyle();
            wxCompactWidgets(node);
            const W = (n) => node.widgets.find((w) => w.name === n);
            const wVideo = W("video"), wMulti = W("multiple"), wStart = W("start"), wEnd = W("end");
            wxHideWidget(wStart, node); wxHideWidget(wEnd, node);

            // ---- the upload button, right under the menu ---------------------------------------------------------------
            const picker = el("input"); picker.type = "file"; picker.accept = "video/*"; picker.style.display = "none";
            document.body.append(picker);
            const wUp = wxAddButton(node, "choose video to upload", () => picker.click());
            node.widgets.splice(node.widgets.indexOf(wUp), 1);
            node.widgets.splice(node.widgets.indexOf(wVideo) + 1, 0, wUp);

            // ---- the preview and the timeline ----------------------------------------------------------------------
            const root = el("div", "display:flex;flex-direction:column;width:100%;height:100%;gap:4px;user-select:none"); root.className = "wx";
            for (const t of ["pointerdown", "pointermove", "pointerup", "mousedown", "mouseup", "wheel", "dblclick", "keydown", "contextmenu"])
                root.addEventListener(t, (e) => e.stopPropagation());
            // a click anywhere on the preview or the timeline selects the node: the shortcuts follow the node
            root.addEventListener("pointerdown", () => { if (!fs && !selected()) app.canvas?.selectNode?.(node, false); }, true);
            // full screen only: the video's name and `multiple` (on the node they are the widgets above)
            const head = el("div", "display:none;align-items:center;gap:10px;flex-shrink:0;font-size:12px");
            const hName = el("span", `color:${WX.light};overflow:hidden;text-overflow:ellipsis;white-space:nowrap`);
            const hMulti = el("span"); hMulti.className = "wx-chip"; hMulti.title = "multiple: a second pointer, and every frame between the two";
            hMulti.onclick = () => { wMulti.value = !wMulti.value; wMulti.callback?.(wMulti.value); };
            head.append(hName, hMulti);
            const vbox = el("div", "position:relative;flex:1;min-height:0;background:#111;border-radius:6px;overflow:hidden");
            const video = el("video", "width:100%;height:100%;object-fit:contain;display:block");
            video.muted = true; video.playsInline = true; video.preload = "auto";
            const msg = el("div", "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:8px;color:#888;font-size:11px;pointer-events:none");
            vbox.append(video, msg);
            const tl = el("div", `height:${TL_H}px;flex-shrink:0;outline:none;user-select:none`); tl.tabIndex = 0;
            const row = el("div", "display:flex;align-items:flex-end;gap:6px;height:32px");
            const play = el("button", "width:26px;height:22px;padding:0;flex-shrink:0", "▶"); play.className = "wx-btn"; play.title = "Play / pause (space)";
            const track = el("div", "position:relative;flex:1;height:32px;cursor:pointer;touch-action:none");
            const rail = el("div", "position:absolute;left:0;right:0;bottom:7px;height:6px;border-radius:3px;background:#333");
            const fill = el("div", `position:absolute;bottom:7px;height:6px;border-radius:3px;background:${WX.deep};display:none`);
            const cursor = el("div", "position:absolute;bottom:2px;width:1px;height:16px;background:#fff;display:none;pointer-events:none");
            const handle = (color) => {
                const h = el("div", "position:absolute;bottom:0;width:0;height:22px;pointer-events:none");
                h.append(el("div", `position:absolute;left:-1.5px;bottom:0;width:3px;height:22px;background:${color};border-radius:1px`),
                         el("div", `position:absolute;left:-6px;top:-4px;width:12px;height:9px;background:${color};border-radius:3px`));
                return h;
            };
            const hA = handle(WX.accent), hB = handle(WX.light);
            const count = el("div", `position:absolute;top:0;transform:translateX(-50%);white-space:nowrap;font-size:11px;color:${WX.light};pointer-events:none`);
            track.append(rail, fill, cursor, hB, hA, count);
            const bFull = el("button", "width:26px;height:22px;padding:0;flex-shrink:0", "⛶"); bFull.className = "wx-btn";
            bFull.title = "Full screen: the preview and the timeline on the whole screen (F with the node selected; F or Esc to come back)";
            bFull.onclick = (e) => { e.stopPropagation(); fs ? exitFS() : enterFS(); };
            row.append(play, track, bFull);
            const labels = el("div", "display:flex;justify-content:space-between;gap:8px;margin:4px 32px 0 32px;font-size:11px;color:#aaa;white-space:nowrap");
            const lA = el("span"), lB = el("span");
            labels.append(lA, lB);
            tl.append(row, labels);
            root.append(head, vbox, tl);
            const widget = node.addDOMWidget("wx_extractor", "custom", root, {
                serialize: false, hideOnZoom: false, getValue: () => undefined, setValue: () => {},
                getMinHeight: () => VIDEO_MIN + TL_H + 4 });
            widget.serialize = false;

            // ---- state -----------------------------------------------------------------------------------------------
            let inf = null, shown = "", last = "A", playing = false, raf = 0;
            let fs = null;   // the full screen, when on: { layer, parent, next, css, full }
            const N = () => (inf?.frames || 0);
            const clamp = (i) => Math.max(0, Math.min(N() - 1, Math.round(i)));
            const A = () => clamp(wStart.value), B = () => clamp(wEnd.value);
            const t = (i) => (inf ? (i / inf.fps).toFixed(2) : "0.00");
            const seek = (i) => { if (inf && video.readyState >= 1) video.currentTime = (i + 0.5) / inf.fps; };
            const draw = () => {
                const n = N(), multi = !!wMulti.value;
                hName.textContent = wVideo.value || "";
                hMulti.textContent = `multiple: ${multi}`; hMulti.classList.toggle("on", multi);
                const pct = (i) => (n > 1 ? (i / (n - 1)) * 100 : 0) + "%";
                hB.style.display = multi ? "" : "none";
                fill.style.display = multi ? "" : "none";
                count.style.display = multi && n ? "" : "none";
                if (!n) { lA.textContent = inf?.error ? "" : "…"; lB.textContent = ""; hA.style.left = "0%"; return; }
                const a = A(), b = B();
                hA.style.left = pct(a);
                if (multi) {
                    const lo = Math.min(a, b), hi = Math.max(a, b), k = hi - lo + 1;
                    hB.style.left = pct(b);
                    fill.style.left = pct(lo); fill.style.width = `calc(${pct(hi)} - ${pct(lo)})`;
                    const gb = (k * inf.width * inf.height * 3 * 4) / 1e9;
                    count.style.left = `calc((${pct(lo)} + ${pct(hi)}) / 2)`;
                    count.textContent = `${k} frame${k === 1 ? "" : "s"}` + (gb >= WARN_GB ? ` · ≈ ${gb.toFixed(1)} GB of RAM` : "");
                    count.style.color = gb >= WARN_GB ? "#e0a050" : WX.light;
                    lA.textContent = `from ${lo} · ${t(lo)} s`;
                    lB.textContent = `to ${hi} · ${t(hi)} s`;
                } else {
                    lA.textContent = `frame ${a} · ${t(a)} s`;
                    lB.textContent = `of ${n} · ${t(n)} s`;
                }
            };
            const setA = (i) => { wStart.value = clamp(i); last = "A"; if (wMulti.value && wStart.value > B()) wStart.value = B(); seek(wStart.value); draw(); node.setDirtyCanvas(true, false); };
            const setB = (i) => { wEnd.value = clamp(i); last = "B"; if (wEnd.value < A()) wEnd.value = A(); seek(wEnd.value); draw(); node.setDirtyCanvas(true, false); };

            /** The video of the menu: its numbers from the backend, the file at once, the light copy when it is ready.
             *  `fresh` = picked now (not loaded with the workflow): the pointers go back to the start and the end, and the
             *  node takes the shape of the video. */
            const load = async (fresh) => {
                const value = wVideo.value;
                stop();
                if (!value || value === shown && !fresh) return;
                shown = value; inf = null; draw();
                msg.textContent = "";
                const j = await videoInfo(value);
                if (shown !== value) return;
                if (j.error) { inf = { error: j.error }; msg.textContent = j.error; video.removeAttribute("src"); video.load(); draw(); return; }
                inf = j;
                if (fresh) { wStart.value = 0; wEnd.value = N() - 1; fitHeight(); }
                if (wMulti.value && B() <= A()) wEnd.value = N() - 1;
                draw();
                video.onerror = () => { msg.textContent = "the preview comes in a moment (making a light copy of the video)…"; };
                video.src = viewURL(fileOf(value));
                videoProxy(value).then((p) => {
                    if (!p || shown !== value) return;
                    stop();
                    video.src = viewURL(p); msg.textContent = "";   // loadedmetadata puts it back on the pointer
                });
            };
            video.addEventListener("loadedmetadata", () => { msg.textContent = ""; if (!playing) seek(last === "B" && wMulti.value ? B() : A()); });
            const fitHeight = () => {
                if (!inf?.width) return;
                const vw = Math.max(100, node.size[0] - 20);
                const vh = Math.min(VIDEO_MAX, Math.max(VIDEO_MIN, Math.round(vw * inf.height / inf.width)));
                const base = node.computeSize()[1];
                node.setSize([node.size[0], base + vh - VIDEO_MIN]);
                node.setDirtyCanvas(true, true);
            };

            // ---- mouse and keys on the timeline -------------------------------------------------------------------------
            const at = (e) => { const b = track.getBoundingClientRect(); return clamp(((e.clientX - b.left) / Math.max(1, b.width)) * (N() - 1)); };
            let drag = null;
            track.addEventListener("pointerdown", (e) => {
                if (!N() || e.button !== 0) return;
                e.preventDefault(); e.stopPropagation(); tl.focus();
                stop();
                const i = at(e);
                drag = !wMulti.value ? "A" : Math.abs(i - A()) < Math.abs(i - B()) ? "A" : Math.abs(i - A()) > Math.abs(i - B()) ? "B" : i <= A() ? "A" : "B";
                track.setPointerCapture(e.pointerId);
                (drag === "A" ? setA : setB)(i);
            });
            track.addEventListener("pointermove", (e) => { if (drag) (drag === "A" ? setA : setB)(at(e)); });
            const end = () => { drag = null; };
            track.addEventListener("pointerup", end); track.addEventListener("pointercancel", end);

            // ---- full screen (as WMixer): the root leaves the node for a layer over the whole window, then the browser's
            // full screen; back on the node where it was. The layer takes the keyboard (a key there never reaches the
            // graph: Delete would remove the node behind it).
            async function enterFS() {
                if (fs) return;
                const layer = el("div", "position:fixed;inset:0;z-index:100000;background:#141414;padding:10px;display:flex;outline:none");
                layer.className = "wx"; layer.tabIndex = -1;
                layer.addEventListener("keydown", (e) => e.stopPropagation());
                layer.addEventListener("pointerdown", () => layer.focus({ preventScroll: true }));
                fs = { layer, parent: root.parentNode, next: root.nextSibling, css: root.style.cssText, full: false };
                document.body.append(layer); layer.append(root);
                root.style.width = "100%"; root.style.height = "100%";
                head.style.display = "flex"; bFull.textContent = "🗗"; draw(); layer.focus({ preventScroll: true });
                try { await layer.requestFullscreen(); if (fs) fs.full = true; } catch { /* refused: the layer still covers the window */ }
            }
            function exitFS() {
                if (!fs) return;
                const f = fs; fs = null;
                if (document.fullscreenElement === f.layer) document.exitFullscreen().catch(() => { });
                if (f.parent) f.parent.insertBefore(root, f.next && f.next.parentNode === f.parent ? f.next : null);
                root.style.cssText = f.css; f.layer.remove();
                head.style.display = "none"; bFull.textContent = "⛶"; draw();
                node.setDirtyCanvas(true, true);
            }
            const onFsChange = () => { if (fs && fs.full && document.fullscreenElement !== fs.layer) exitFS(); };   // Esc of the browser
            document.addEventListener("fullscreenchange", onFsChange);

            // ---- the shortcuts, while the node is in hand (selected, the keyboard on something of it, or full screen) and
            // the keyboard is not in a box of text: space = play / pause (the canvas would take it to pan), F = full screen
            // (Esc out too), ← / → one frame (Shift: ten; held, the browser repeats it), Home / End, Ctrl+S full screen =
            // save the workflow (the layer keeps the keys from the frontend, the browser would save the page)
            const selected = () => !!(fs || app.canvas?.selected_nodes?.[node.id] || app.canvas?.selectedItems?.has?.(node) || root.contains(document.activeElement));
            const typing = (e) => { const t = e.target; return !!t && (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "INPUT"); };
            const KEYS = ["Space", "KeyF", "ArrowLeft", "ArrowRight", "Home", "End"];
            const onKey = (e) => {
                const k = e.code;
                if (fs && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && k === "KeyS") {
                    e.preventDefault(); e.stopImmediatePropagation();
                    if (e.type !== "keydown" || e.repeat) return;
                    const wf = app.extensionManager?.workflow?.activeWorkflow;
                    if (!wf || wf.isTemporary) exitFS();   // a workflow never saved asks its name: the box would open behind
                    app.extensionManager?.command?.execute?.("Comfy.SaveWorkflow");
                    return;
                }
                if (!(KEYS.includes(k) || (k === "Escape" && fs)) || e.ctrlKey || e.altKey || e.metaKey || typing(e) || !node.graph || !selected()) return;
                e.preventDefault(); e.stopImmediatePropagation();
                if (e.type === "keyup") return;
                if (k === "Space") { if (!e.repeat) toggle(); return; }
                if (k === "KeyF") { if (!e.repeat) fs ? exitFS() : enterFS(); return; }
                if (k === "Escape") { exitFS(); return; }
                if (!N()) return;
                stop();
                const step = e.shiftKey ? 10 : 1, onB = last === "B" && wMulti.value, cur = onB ? B() : A(), set = onB ? setB : setA;
                set(k === "ArrowLeft" ? cur - step : k === "ArrowRight" ? cur + step : k === "Home" ? 0 : N() - 1);
            };
            window.addEventListener("keydown", onKey, true);
            window.addEventListener("keyup", onKey, true);

            // ---- play: one frame = the pointer goes with the video; multiple = the stretch over and over -----------------
            const tick = () => {
                if (!playing || !inf) return;
                const i = clamp(Math.floor(video.currentTime * inf.fps));
                if (wMulti.value) {
                    const lo = Math.min(A(), B()), hi = Math.max(A(), B()), n = N();
                    if (i > hi || video.ended) { video.currentTime = (lo + 0.5) / inf.fps; if (video.paused) video.play(); }
                    cursor.style.left = (n > 1 ? (Math.min(i, hi) / (n - 1)) * 100 : 0) + "%";
                } else {
                    wStart.value = i; draw();
                    if (video.ended) { stop(); return; }
                }
                raf = requestAnimationFrame(tick);
            };
            function toggle() {
                if (playing) { stop(); return; }
                if (!N()) return;
                playing = true; play.textContent = "❚❚";
                const from = wMulti.value ? Math.min(A(), B()) : (A() >= N() - 1 ? 0 : A());
                video.currentTime = (from + 0.5) / inf.fps;
                cursor.style.display = wMulti.value ? "" : "none";
                video.play().catch(() => stop());
                raf = requestAnimationFrame(tick);
            }
            function stop() {
                if (!playing) return;
                playing = false; play.textContent = "▶"; cancelAnimationFrame(raf); video.pause(); cursor.style.display = "none";
                if (!wMulti.value) setA(Math.floor(video.currentTime * inf.fps)); else seek(last === "B" ? B() : A());
                node.setDirtyCanvas(true, false);
            }
            play.addEventListener("pointerdown", (e) => e.stopPropagation());
            play.onclick = (e) => { e.stopPropagation(); toggle(); tl.focus(); };

            // ---- the widgets ------------------------------------------------------------------------------------------
            const cbV = wVideo.callback;
            wVideo.callback = function () { const rr = cbV?.apply(this, arguments); load(true); return rr; };
            const cbM = wMulti.callback;
            wMulti.callback = function () {
                const rr = cbM?.apply(this, arguments);
                stop();
                if (wMulti.value && N() && (B() <= A() || wEnd.value >= N())) wEnd.value = N() - 1;   // the second pointer starts at the end
                last = "A"; draw(); seek(A());
                return rr;
            };

            // ---- the menu, fresh: new videos of the output folder show without reloading ComfyUI ----------------------------
            let listedAt = 0;
            const relist = async () => {
                if (Date.now() - listedAt < 3000) return;
                listedAt = Date.now();
                try {
                    const list = await (await api.fetchApi("/wextraui/extractor_files")).json();
                    const vals = wVideo.options.values;
                    if (Array.isArray(vals) && Array.isArray(list)) vals.splice(0, vals.length, ...list);
                } catch {}
            };
            const onDown = node.onMouseDown;
            node.onMouseDown = function () { relist(); return onDown?.apply(this, arguments); };

            // ---- upload: the button and a video dragged onto the node ---------------------------------------------------
            const upload = async (file) => {
                msg.textContent = `uploading ${file.name}…`;
                const body = new FormData();
                body.append("image", file); body.append("type", "input"); body.append("overwrite", "true");
                try {
                    const res = await api.fetchApi("/upload/image", { method: "POST", body });
                    if (!res.ok) throw new Error(res.status);
                    const j = await res.json();
                    const name = (j.subfolder ? j.subfolder + "/" : "") + j.name;
                    const vals = wVideo.options.values;
                    if (Array.isArray(vals) && !vals.includes(name)) vals.unshift(name);
                    infos.delete(name); proxies.delete(name);
                    wVideo.value = name; shown = "";
                    msg.textContent = "";
                    load(true);
                } catch (err) {
                    msg.textContent = /413/.test(String(err))
                        ? `${file.name} is over the upload limit of ComfyUI (100 MB unless started with --max-upload-size): put it in the input folder and pick it from the menu`
                        : `cannot upload ${file.name} (${err})`;
                }
            };
            picker.onchange = () => { const f = picker.files?.[0]; picker.value = ""; if (f) upload(f); };
            const dropped = (e) => [...(e.dataTransfer?.files || [])].find((f) => isVideo(f.name));
            const hasFile = (e) => [...(e.dataTransfer?.items || [])].some((i) => i.kind === "file");
            root.addEventListener("dragover", (e) => { if (!hasFile(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; vbox.style.outline = `2px dashed ${WX.accent}`; });
            root.addEventListener("dragleave", () => { vbox.style.outline = ""; });
            root.addEventListener("drop", (e) => { vbox.style.outline = ""; const f = dropped(e); if (!f) return; e.preventDefault(); e.stopPropagation(); upload(f); });
            node.onDragOver = (e) => hasFile(e);
            node.onDragDrop = (e) => { const f = dropped(e); if (!f) return false; upload(f); return true; };

            // ---- life ---------------------------------------------------------------------------------------------------
            const onConf = node.onConfigure;
            node.onConfigure = function () { const rr = onConf?.apply(this, arguments); shown = ""; setTimeout(() => load(false), 0); return rr; };
            const onRm = node.onRemoved;
            node.onRemoved = function () {
                stop(); exitFS(); document.removeEventListener("fullscreenchange", onFsChange);
                window.removeEventListener("keydown", onKey, true); window.removeEventListener("keyup", onKey, true);
                video.removeAttribute("src"); video.load(); picker.remove();
                return onRm?.apply(this, arguments);
            };
            if (!node.size || node.size[0] < 300) node.setSize([300, node.size?.[1] || 0]);
            setTimeout(() => { if (!shown) load(!app.configuringGraph && !node.__wxLoaded); }, 0);
            node.__wxLoaded = false;
            return r;
        };
        const onConfProto = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () { this.__wxLoaded = true; return onConfProto?.apply(this, arguments); };
    },
});
