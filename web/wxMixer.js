// WextraUI — WMixer: the timeline of a mixer inside the node, as the layers of After Effects (Sick, 17/10/2026). Every
// track is an audio file of ComfyUI's input or output folder: on the left its name, volume (dB), offset (s), M(ute),
// S(olo), ✕; on the right its waveform, and over it the stretches that play (clips), each with a fade in and a fade out.
// Over everything: the ruler, the cuts between the scenes (read from the timeline of a WLoop Start Foley in the same
// graph), the beat grid (bpm, and where the first beat falls), the playhead. It plays live (Web Audio) while you edit,
// with the video next to it, muted, in step; Run makes the same mix in Python (src/mixer.py) and gives it as AUDIO.
// Mouse on a track: double-click on empty = a clip filling the scene under the mouse, on a clip or on the name = that
// track over the whole room of the tracks (again = back) · drag a clip = move · drag its edges =
// trim · drag the small squares at its top corners = the fades · Ctrl+click = cut the clip there · Alt+click = delete
// it · middle button + drag = move the whole track with its clips · Shift+drag = slide the sound under the clips (the
// offset). Ctrl+Z / Ctrl+Y = the mixer's own undo / redo. Edges snap to the scene cuts, the beats and the
// other clips (the two chips in the bar). Tracks come from the `+ track…` menu (the input folder, then output, each in
// alphabetical order) or from audio files dragged from Windows onto the node; the video to watch from the `video` menu or
// dragged the same way (a dragged file is uploaded into the input folder first). A video with a sound brings it as the
// first track, `🎬 video sound` (ComfyUI takes it out into a flac of its temp folder): a track like the others, ✕ takes
// it away for that video. The handle under the video gives it more or less room; with the node selected, the space bar
// is play / pause, F (or ⛶ in the bar) the full screen of the whole mixer, the left / right arrows back and forward
// without sound (a tap = one frame), the up arrow the start. Clicking in the mixer selects the node. Every number box
// (dB, offset, length, bpm, first beat) also changes by dragging the mouse up and down on it (Shift: finer); while
// dragging the pointer is held (Pointer Lock), so the drag does not stop at the edge of the screen. `?` in the bar
// opens a card with all of this. The ruler: wheel = zoom around the mouse, middle button = drag the view, two
// yellow handles = the play range (only what is between them plays; the Run renders the whole mix). The waveform is drawn at the track's volume: full height = 0 dB, red = over it. The state lives in the hidden widget
// `mix_state` (JSON, read by the backend).
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { WX, ensureWxStyle, wxHideWidget, wxCompactWidgets } from "./wxStyle.js";

const HEAD_W = 270, LANE_H = 48, RULER_H = 24, BAR_H = 30, VIDEO_H = 180, VIDEO_MIN = 80, VIDEO_MAX = 900, GRIP_H = 8, FOOT_H = 20, GAP = 2;
const PEAKS_PER_S = 100, SNAP_PX = 8, MIN_CLIP = 0.05, NEW_FADE = 0.3;
const COLORS = ["#4a90d9", "#d9a54a", "#5cb85c", "#c76bd6", "#d95c5c", "#4ac0c0", "#b8b84a", "#8a8ad9"];
const HINT = "Double-click: a clip filling the scene · drag: move · edges: trim · top squares: fades · Ctrl+click: cut · Alt+click: delete · Shift+drag: slide the track";

// ---- files, decoding, peaks (shared by every WMixer) -----------------------------------------------------------------
let files = null, filesAt = 0, actx = null;
const audioCtx = () => (actx ??= new AudioContext());
const wire = (from, to) => from["connect"](to);   // one Web Audio node into the next (a sound graph, nothing leaves the page)
async function mediaFiles(force) {
    if (!files || force || Date.now() - filesAt > 5000) {
        try { files = await (await api.fetchApi("/wextraui/media_files")).json(); filesAt = Date.now(); }
        catch { files = files || { audio: [], video: [] }; }
    }
    return files;
}
const fkey = (f) => (f ? f.type + ":" + f.name : "");
function fileURL(f) {
    const i = f.name.lastIndexOf("/");
    const sub = i < 0 ? "" : f.name.slice(0, i), fn = f.name.slice(i + 1);
    return api.apiURL(`/view?filename=${encodeURIComponent(fn)}&subfolder=${encodeURIComponent(sub)}&type=${f.type}&t=${Date.now()}`);
}
const buffers = new Map();   // fkey -> { buf, peaks, err, p }
// the sound of a video, taken out by ComfyUI into a small flac of its temp folder: fkey(video) -> Promise<file | null>
const vaudio = new Map();
function videoAudio(v) {
    const k = fkey(v);
    if (!vaudio.has(k)) vaudio.set(k, api.fetchApi(`/wextraui/video_audio?name=${encodeURIComponent(v.name)}&type=${v.type}`)
        .then((r) => r.json()).then((j) => (j.file ? { ...j.file, ready: true } : null)).catch(() => null));
    return vaudio.get(k);
}
const vaudioNow = new Map();   // fkey(video) -> file, once known
// the light copy of a video the player shows (a keyframe every 4 frames: it follows the playhead at once) and its fps
const vproxy = new Map();
function videoProxy(v) {
    const k = fkey(v);
    if (!vproxy.has(k)) vproxy.set(k, api.fetchApi(`/wextraui/video_proxy?name=${encodeURIComponent(v.name)}&type=${v.type}`)
        .then((r) => r.json()).then((j) => (j.file ? { file: j.file, fps: j.fps || 24 } : null)).catch(() => null));
    return vproxy.get(k);
}
function loadBuffer(f, onReady) {
    const k = fkey(f);
    let e = buffers.get(k);
    if (!e) {
        e = { buf: null, peaks: null, err: null };
        e.p = fetch(fileURL(f)).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
            .then((ab) => audioCtx().decodeAudioData(ab))
            .then((buf) => {
                e.buf = buf;
                const n = Math.ceil(buf.duration * PEAKS_PER_S), step = buf.sampleRate / PEAKS_PER_S, pk = new Float32Array(n);
                for (let c = 0; c < buf.numberOfChannels; c++) {
                    const d = buf.getChannelData(c);
                    for (let i = 0; i < n; i++) {
                        let m = pk[i];
                        for (let j = Math.floor(i * step), J = Math.min(d.length, Math.floor((i + 1) * step)); j < J; j++) { const v = Math.abs(d[j]); if (v > m) m = v; }
                        pk[i] = m;
                    }
                }
                e.peaks = pk;
            })
            .catch((err) => { e.err = String(err); });
        buffers.set(k, e);
    }
    if (onReady) e.p.then(onReady);
    return e;
}

/** The gain of clip c at time t (0..1): constant-power fades, sin in, cos out (as the backend). */
function clipEnv(c, t) {
    if (t < c.s || t > c.e) return 0;
    let g = 1;
    if (c.fi > 0 && t < c.s + c.fi) g *= Math.sin(((t - c.s) / c.fi) * Math.PI / 2);
    if (c.fo > 0 && t > c.e - c.fo) g *= Math.cos(((t - (c.e - c.fo)) / c.fo) * Math.PI / 2);
    return Math.max(0, g);
}
const trackEnv = (tr, t) => Math.min(1, tr.clips.reduce((a, c) => a + clipEnv(c, t), 0));
// the volume line of a track: points { t, v, c } in time order. v is the height on the lane (0 = silence, 1 = +6 dB,
// V0 = 0 dB: the gain is 2·v²); c bends the stretch from the point to the next one (0 = straight; the stretch goes as
// u^(2^c)). Before the first point and after the last the line stays at their height; no points = 0 dB.
// The same reckoning as env_gain() in src/mixer.py.
const V0 = Math.SQRT1_2;
function envV(tr, t) {
    const p = tr.env;
    if (!p || !p.length) return V0;
    if (t <= p[0].t) return p[0].v;
    for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        if (t < b.t) return a.v + (b.v - a.v) * Math.pow(b.t > a.t ? (t - a.t) / (b.t - a.t) : 1, Math.pow(2, a.c || 0));
    }
    return p[p.length - 1].v;
}
const envGain = (tr, t) => { const v = envV(tr, t); return 2 * v * v; };
const fmtDb = (v) => (v <= 0.0005 ? "−∞ dB" : `${(20 * Math.log10(2 * v * v)).toFixed(1)} dB`);

/** The scene cuts from the timeline of the first WLoop Start Foley of the graph: [{ t, k }]. */
function sceneMarks(graph) {
    const n = (graph?._nodes || []).find((x) => x.type === "wxFoleyLoopStart");
    const tl = n?.widgets?.find((w) => w.name === "timeline")?.value;
    if (typeof tl !== "string") return [];
    const fps = Number(n.widgets.find((w) => w.name === "fps")?.value) || 24;
    const out = [];
    for (const raw of tl.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#") || !line.includes("|")) continue;
        const m = /^(?:(\d+):)?(\d+(?:[.,]\d+)?)\s*(f?)$/.exec(line.split("|")[0].trim());
        if (!m) continue;
        const v = Number(m[2].replace(",", "."));
        out.push(m[3] ? (m[1] ? null : v / fps) : (Number(m[1] || 0) * 60 + v));
    }
    const ts = out.filter((x) => x != null).sort((a, b) => a - b);
    if (ts.length) ts[0] = 0;
    return ts.map((t, k) => ({ t, k }));
}
const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, "0")}`; };

app.registerExtension({
    name: "WextraUI.mixer",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxMixer") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            ensureWxStyle();
            wxCompactWidgets(node);
            const wState = node.widgets.find((w) => w.name === "mix_state");
            wxHideWidget(wState, node);

            let S = {};
            const normal = (o) => {
                o = o && typeof o === "object" ? o : {};
                o.tracks = Array.isArray(o.tracks) ? o.tracks : [];
                o.bpm = o.bpm || 0; o.beat = o.beat || 0; o.duration = o.duration || 0;
                o.snapScene = o.snapScene !== false; o.snapBeat = o.snapBeat !== false;
                for (const t of o.tracks) {
                    t.clips = Array.isArray(t.clips) ? t.clips : []; t.gain ??= 0; t.offset ??= 0;
                    t.env = Array.isArray(t.env) ? t.env.filter((p) => isFinite(p?.t) && isFinite(p?.v)).sort((a, b) => a.t - b.t) : [];
                }
                return o;
            };
            // the mixer's own history, for Ctrl+Z / Ctrl+Y while it is in hand: an edit is taken back at once, without the
            // frontend reloading the whole graph (which left the node black for seconds and closed the full screen)
            let hist = [], hi = -1;
            const snap = () => { const { dur_eff, ...rest } = S; return JSON.stringify(rest); };
            const remember = () => {
                const j = snap();
                if (hist[hi] === j) return;
                hist = hist.slice(0, hi + 1); hist.push(j);
                if (hist.length > 200) hist.shift();
                hi = hist.length - 1;
            };
            const load = () => {
                try { S = normal(JSON.parse(wState.value || "{}")); } catch { S = normal({}); }
                hist = [snap()]; hi = 0;
            };
            load();
            let videoDur = 0;
            let fs = null;   // the full screen, when on: { layer, parent, next, css, full }
            const dur = () => S.duration > 0 ? S.duration : (videoDur || Math.max(0, ...S.tracks.map((t) => {
                const f = src(t), b = f ? buffers.get(fkey(f))?.buf : null; return b ? (t.offset || 0) + b.duration : 0;
            })) || 60);
            /** The file a track plays: its own, or for the video's track the sound taken out of the video. */
            const src = (t) => (t.source === "video" ? (S.video ? vaudioNow.get(fkey(S.video)) || null : null) : t.file);
            /** The video's track: at the top when the video has a sound (unless ✕ took it away for that video), gone otherwise. */
            const syncVideoTrack = async () => {
                const v = S.video, has = S.tracks.findIndex((t) => t.source === "video");
                const f = v ? await videoAudio(v) : null;
                if (v !== S.video) return;   // another video was picked meanwhile
                if (f) vaudioNow.set(fkey(v), f);
                const want = !!f && S.videoTrackOff !== fkey(v);
                if (!want && has >= 0) { S.tracks.splice(has, 1); save(); build(); }
                else if (want && has < 0) {
                    const used = new Set(S.tracks.map((t) => t.color)), color = COLORS.findIndex((_, i) => !used.has(i));
                    S.tracks.unshift({ name: "🎬 video sound", source: "video", gain: 0, offset: 0, mute: false, solo: false,
                                       color: color < 0 ? 0 : color, clips: [{ s: 0, e: dur(), fi: 0, fo: 0 }] });
                    save(); build();
                } else if (want) build();
            };
            // one edit = one step of Ctrl+Z: the frontend is told at once (it would otherwise notice later, on a mouse-up the
            // node keeps from it, and Ctrl+Z took back several edits together)
            const checkState = () => (app.extensionManager?.workflow?.activeWorkflow ?? app.workflowManager?.activeWorkflow)?.changeTracker?.checkState?.();
            const save = () => {
                remember();
                S.dur_eff = Math.round(dur() * 1000) / 1000;
                wState.value = JSON.stringify(S);
                checkState();
            };

            // the length worked out changes when a file or the video is read: written only if it moved (a load is not an edit)
            const syncDur = () => { if (Math.abs((S.dur_eff || 0) - dur()) > 0.001) save(); };

            // ---- DOM ------------------------------------------------------------------------------------------------
            const el = (tag, css, txt) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; };
            const root = el("div", "display:flex;flex-direction:column;width:100%;height:100%;user-select:none;overflow:hidden;position:relative");
            root.className = "wx wx-mixer";
            for (const t of ["pointerdown", "pointermove", "pointerup", "mousedown", "mouseup", "wheel", "dblclick", "keydown", "contextmenu"])
                root.addEventListener(t, (e) => e.stopPropagation());
            // a click anywhere in the mixer selects the node (the shortcuts follow the node); a menu, once picked, and a box,
            // once confirmed with Enter, give the keyboard back to the shortcuts
            root.addEventListener("pointerdown", () => { if (!fs && !selected()) app.canvas?.selectNode?.(node, false); }, true);
            root.addEventListener("change", (e) => { if (e.target?.tagName === "SELECT") e.target.blur(); });
            root.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); });   // no browser autoscroll: the middle button drags the view
            root.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target?.tagName === "INPUT") e.target.blur(); });

            // the bar
            const bar = el("div", `display:flex;align-items:center;gap:6px;height:${BAR_H}px;flex:none;padding:0 4px;white-space:nowrap;overflow:hidden`);
            const btn = (txt, title, fn) => { const b = el("button", "min-width:26px", txt); b.title = title; b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; };
            /** A number box that also follows the mouse: drag up = more, down = less, `perPx` per pixel (Shift = ten
             *  times finer); a click without dragging is a click (the box takes the keyboard as before). `live(v)` while
             *  dragging, `done()` once let go. */
            const dragNum = (inp, perPx, live, done) => {
                inp.style.cursor = "ns-resize";
                const dec = Math.max(0, -Math.floor(Math.log10(perPx * 0.1 + 1e-9)) - 1);
                inp.addEventListener("pointerdown", (e) => {
                    if (e.button !== 0) return;
                    const v0 = Number(inp.value) || 0;
                    let moved = false, last = v0, dy = 0;
                    const mv = (ev) => {
                        dy -= ev.movementY || 0;   // movement, not position: with the pointer locked it never meets the edge
                        if (!moved && Math.abs(dy) < 3) return;
                        if (!moved) {
                            moved = true; inp.blur();
                            // the pointer is hidden and held where it is (Pointer Lock), so the drag goes on past the
                            // edge of the screen; it comes back on letting go
                            try { inp.requestPointerLock?.()?.catch?.(() => { }); } catch { }
                        }
                        ev.preventDefault();
                        let v = v0 + dy * perPx * (ev.shiftKey ? 0.1 : 1);
                        v = Number(v.toFixed(dec + (ev.shiftKey ? 1 : 0)));
                        if (inp.min !== "" && v < Number(inp.min)) v = Number(inp.min);
                        if (v !== last) { last = v; inp.value = v; live(v); }
                    };
                    const up = () => {
                        window.removeEventListener("pointermove", mv, true); window.removeEventListener("pointerup", up, true);
                        if (document.pointerLockElement === inp) document.exitPointerLock();
                        if (moved) done?.();
                    };
                    window.addEventListener("pointermove", mv, true); window.addEventListener("pointerup", up, true);
                });
            };
            const num = (title, w, step, get, set, ph) => {
                const i = el("input", `width:${w}px`); i.type = "number"; i.step = step; i.title = title; if (ph) i.placeholder = ph;
                i.value = get() || ""; i.onchange = () => { set(Number(i.value) || 0); save(); redraw(); };
                i.title += " Drag up / down to change it (Shift: finer).";
                dragNum(i, step, (v) => { set(v); redraw(); }, () => save());
                return i;
            };
            const lab = (t) => el("span", "color:#999;font-size:11px", t);
            const chip = (txt, title, get, set) => {
                const c = el("span", "", txt); c.className = "wx-chip"; c.title = title;
                const paint = () => c.classList.toggle("on", !!get());
                c.onclick = (e) => { e.stopPropagation(); set(!get()); paint(); save(); redraw(); };
                paint(); return c;
            };
            const bPlay = btn("▶", "Play / pause (from the playhead)", () => (playing ? pause() : play(false)));
            const bHome = btn("⏮", "Back to the start", () => seek(0));
            const tLab = el("span", `font:12px ui-monospace,Consolas,monospace;color:${WX.light};white-space:nowrap`);
            const iDur = num("Length of the mix in seconds. Empty = the video's, or the longest track's.", 58, 0.1, () => S.duration, (v) => (S.duration = Math.max(0, v)), "auto");
            const iBpm = num("Beats per minute of the grid (0 = no grid).", 50, 0.5, () => S.bpm, (v) => (S.bpm = Math.max(0, v)));
            const iBeat = num("Where the first beat falls, in seconds: moves the whole grid.", 52, 0.01, () => S.beat, (v) => (S.beat = v));
            const cScene = chip("snap scenes", "Edges snap to the cuts between the scenes of WLoop Start Foley.", () => S.snapScene, (v) => (S.snapScene = v));
            const cBeat = chip("snap beats", "Edges snap to the beats of the grid.", () => S.snapBeat, (v) => (S.snapBeat = v));
            const sVideo = el("select", "max-width:200px"); sVideo.title = "The video to watch while it plays (muted).";
            const bFull = btn("⛶", "Full screen: the whole mixer on the whole screen (F with the node selected; F or Esc to come back)", () => (fs ? exitFS() : enterFS()));
            // ? = a small card with the keys and the mouse moves; closed by ? again, a click outside it or Esc
            const help = el("div", "position:absolute;right:6px;z-index:5;display:none;background:#1e1e1e;border:1px solid " + WX.accent +
                ";border-radius:6px;padding:8px 12px;box-shadow:0 4px 16px rgba(0,0,0,.6);overflow:auto;font:12px/1.45 sans-serif;color:#ddd;user-select:text");
            help.style.top = BAR_H + "px";
            const HELP = [
                ["Keys (node selected, or full screen)", [
                    ["Space", "play / pause"], ["F", "full screen in / out (Esc out too)"], ["Ctrl+Z / Ctrl+Y", "undo / redo in the mixer"],
                    ["← / →", "back / forward without sound: a tap = one frame, held = faster and faster"], ["↑", "back to the start"]]],
                ["On a track", [
                    ["double-click on empty", "a clip filling the scene (between the orange cuts)"], ["double-click on a clip or the name", "the track over the whole room (again: back)"], ["drag a clip", "move it"],
                    ["drag an edge", "trim it"], ["drag a white square", "its fade in / fade out"], ["Ctrl + click", "cut the clip in two there"],
                    ["Alt + click", "delete the clip"], ["middle button on a clip + drag", "that clip alone, with its piece of sound (when the track has more clips)"], ["middle button on empty, on the only clip, or Shift + middle", "the whole track with its clips (off follows)"], ["Shift + drag", "slide the sound under the clips, the clips stay (off)"]]],
                ["Volume line (V on: the clips stay put)", [
                    ["click on the line", "a point"], ["drag a point", "when and how loud (it sticks to 0 dB, to the cuts and the beats)"],
                    ["drag the line between two points", "both up / down"], ["drag on empty", "a dip from where you start to where you let go, as low as the mouse"],
                    ["drag a small circle", "bend the stretch into a curve"], ["double-click a point / circle", "remove it / straight again"],
                    ["double-click on empty", "the track over the whole room (again: back)"]]],
                ["Numbers (dB, off, len, bpm, beat 1 at)", [
                    ["drag up / down", "more / less, past the edge of the screen"], ["Shift + drag", "ten times finer"],
                    ["click", "type the number, Enter to confirm"]]],
                ["Ruler (the time bar)", [
                    ["click / drag", "move the playhead (playing: it stops, and plays on where you let go)"], ["wheel", "zoom, around the mouse"], ["middle button + drag", "slide the view"],
                    ["drag a yellow handle", "the play range: only what is between them plays"], ["double-click a handle", "the whole mix again"]]],
                ["Files", [
                    ["+ track…", "add an audio file as a track"],
                    ["drag files onto the node", "audio = a new track, video = the video to watch"], ["video menu", "the video to watch (its sound comes as 🎬 video sound)"],
                    ["≡ + drag", "the order of the tracks"], ["V", "the volume line of the track (below)"], ["M / S / ✕", "mute / solo / remove the track"], ["⛶ / 🗗", "full screen in / out"]]],
            ];
            for (const [title, rows] of HELP) {
                const h5 = el("div", `margin:6px 0 2px;font-size:10px;font-weight:600;color:${WX.accent};text-transform:uppercase;letter-spacing:.04em`, title);
                const tb = el("div", "display:grid;grid-template-columns:auto 1fr;column-gap:12px");
                for (const [k, v] of rows) tb.append(el("span", `color:${WX.light};font-family:ui-monospace,Consolas,monospace;white-space:nowrap`, k), el("span", "", v));
                help.append(h5, tb);
            }
            // the card hangs from the button: its top right corner under the button's bottom right corner (positions in the
            // root's own pixels, so the zoom of the canvas does not move it)
            const showHelp = (on) => {
                help.style.display = on ? "block" : "none";
                bHelp.classList.toggle("on", on);
                if (!on) return;
                const top = bHelp.offsetTop + bHelp.offsetHeight + 2;
                help.style.top = top + "px";
                help.style.right = Math.max(2, root.clientWidth - (bHelp.offsetLeft + bHelp.offsetWidth)) + "px";
                help.style.maxHeight = Math.max(120, root.clientHeight - top - 4) + "px";
            };
            const helpOpen = () => help.style.display !== "none";
            const bHelp = btn("?", "Keys and mouse: what does what", () => showHelp(!helpOpen()));
            bHelp.style.marginLeft = "auto";
            root.addEventListener("pointerdown", (e) => { if (helpOpen() && !help.contains(e.target) && e.target !== bHelp) showHelp(false); }, true);
            // play, back to the start and the time sit over the names of the tracks, beside the ruler (Sick, 17/10)
            const transport = el("div", `height:${RULER_H}px;flex:none;display:flex;align-items:center;gap:4px;padding:0 2px`);
            transport.append(bPlay, bHome, tLab);
            bar.append(lab("video"), sVideo, lab("len"), iDur, lab("bpm"), iBpm, lab("beat 1 at"), iBeat, cScene, cBeat, bHelp, bFull);

            // the video
            const vWrap = el("div", `height:${VIDEO_H}px;flex:none;background:#000;display:none;justify-content:center;align-items:center;border-radius:4px;margin:2px 0`);
            const video = el("video", "height:100%;max-width:100%"); video.muted = true; video.playsInline = true; video.preload = "auto";
            video.addEventListener("loadedmetadata", () => { videoDur = video.duration || 0; syncDur(); redraw(); vSeek(pos); if (playing) video.play().catch(() => { }); });
            // a jump of the video waits for the one before to land (one after the other they would pile up and none would
            // show its frame); only the last one asked counts
            let vWant = null, vfps = 24;
            const vSeek = (t) => {
                if (!S.video || !video.src) return;
                if (video.seeking || video.readyState < 1) { vWant = t; return; }
                vWant = null;
                if (Math.abs(video.currentTime - t) > 1e-3) video.currentTime = t;
            };
            video.addEventListener("seeked", () => { if (vWant != null) { const t = vWant; vWant = null; vSeek(t); } });
            vWrap.append(video);
            // the handle under the video: drag it up or down to give the picture less or more room (kept in the node's
            // properties, not in mix_state: a matter of the view, not of the mix)
            // two heights: on the node (wxVideoH) and full screen (wxVideoHfs, half the screen to start)
            const vMax = () => (fs ? Math.max(VIDEO_MIN, window.innerHeight - 140) : VIDEO_MAX);
            const vKey = () => (fs ? "wxVideoHfs" : "wxVideoH");
            const vH = () => Math.min(vMax(), Math.max(VIDEO_MIN, Number(node.properties?.[vKey()]) || (fs ? Math.round(window.innerHeight * 0.45) : VIDEO_H)));
            const grip = el("div", `height:${GRIP_H}px;flex:none;display:none;cursor:ns-resize;align-items:center;justify-content:center`);
            grip.title = "Drag up or down: the room given to the video";
            const gripBar = el("div", "width:60px;height:3px;border-radius:2px;background:#666");
            grip.append(gripBar);
            grip.addEventListener("pointerenter", () => (gripBar.style.background = WX.accent));
            grip.addEventListener("pointerleave", () => { if (!gDrag) gripBar.style.background = "#666"; });
            let gDrag = null;
            grip.addEventListener("pointerdown", (e) => { gDrag = { y: e.clientY, h: vH() }; grip.setPointerCapture(e.pointerId); });
            grip.addEventListener("pointermove", (e) => {
                if (!gDrag) return;
                const scale = fs ? 1 : app.canvas?.ds?.scale || 1;   // on the node the mouse moves in screen pixels, the node in canvas pixels
                const was = vH();
                node.properties[vKey()] = Math.round(Math.min(vMax(), Math.max(VIDEO_MIN, gDrag.h + (e.clientY - gDrag.y) / scale)));
                if (!fs && node.properties.wxMixH > 0) node.properties.wxMixH += vH() - was;   // the tracks keep their room
                vWrap.style.height = vH() + "px"; if (!fs) fit();
            });
            const gEnd = () => { if (!gDrag) return; gDrag = null; gripBar.style.background = "#666"; checkState(); };
            grip.addEventListener("pointerup", gEnd); grip.addEventListener("pointercancel", gEnd);

            // the timeline: headers on the left, ruler + lanes on the right (scrolls sideways when zoomed)
            const body = el("div", "display:flex;flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;align-items:flex-start");   // tracks scroll up and down (full screen)
            const heads = el("div", `width:${HEAD_W}px;flex:none;display:flex;flex-direction:column;gap:${GAP}px`);
            const sc = el("div", "flex:1 1 auto;min-width:0;overflow:hidden;position:relative");
            const inner = el("div", `position:relative;width:100%;display:flex;flex-direction:column;gap:${GAP}px`);
            const PLAYHEAD = `position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:${WX.accent};pointer-events:none;left:0`;   // the WextraUI blue
            const head = el("div", PLAYHEAD);
            sc.append(inner); inner.append(head);
            body.style.position = "relative";
            body.append(heads, sc);
            // the ruler row stays put over the tracks while they scroll up and down: play / back / time, then the ruler
            const rRow = el("div", `display:flex;flex:none;height:${RULER_H}px;margin-bottom:${GAP}px`);
            const rWrap = el("div", "flex:1 1 auto;min-width:0;overflow:hidden;position:relative");
            const ruler = el("canvas", `height:${RULER_H}px;display:block;cursor:pointer`);
            const headR = el("div", PLAYHEAD);
            transport.style.width = HEAD_W + "px";
            rWrap.append(ruler, headR); rRow.append(transport, rWrap);

            // the foot: add a track, the hint / what is being dragged
            const foot = el("div", `display:flex;align-items:center;gap:6px;height:${FOOT_H}px;flex:none;padding:0 4px`);
            const sAdd = el("select", "max-width:260px"); sAdd.title = "Add a track: an audio file of the input or output folder.";
            const hint = el("span", "color:#888;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis", HINT);
            foot.append(sAdd, hint);
            root.append(bar, vWrap, grip, rRow, body, foot, help);

            // the mixer's height on the node with k tracks in sight (the video at its height on the node, also while the
            // mixer is full screen: the node keeps its own measures meanwhile)
            const vHnode = () => Math.min(VIDEO_MAX, Math.max(VIDEO_MIN, Number(node.properties?.wxVideoH) || VIDEO_H));
            const height = (k) => BAR_H + (S.video ? vHnode() + 4 + GRIP_H : 0) + RULER_H + GAP + k * (LANE_H + GAP) + FOOT_H + 12;
            // the node stretches up and down (Sick, 17/10): from one track in sight (the others scroll) to all of them
            const widget = node.addDOMWidget("wx_mixer", "custom", root, {
                serialize: false, hideOnZoom: false, getValue: () => undefined, setValue: () => {},
                getMinHeight: () => height(1), getMaxHeight: () => height(Math.max(1, S.tracks.length)) });
            widget.serialize = false;
            // the height chosen by hand stays in the node's properties (wxMixH, 0 = all the tracks); fit() holds it between
            // one track and all of them when the tracks or the video change
            const bounds = () => { const lo = node.computeSize()[1]; return [lo, lo + height(Math.max(1, S.tracks.length)) - height(1)]; };
            // `ready`: the tracks are read (a node being loaded gets its saved size before the mixer knows its tracks: that
            // size is not a resize by hand). The width is the user's: fit() touches only the height.
            let fitting = false, ready = false, configured = false;
            const fit = () => {
                if (fs) return;
                const [lo, hi] = bounds(), want = Number(node.properties?.wxMixH) || 0;
                const h = want > 0 ? Math.min(Math.max(want, lo), hi) : hi;
                fitting = true;
                if (Math.abs(node.size[1] - h) > 1) node.setSize([node.size[0], h]);
                fitting = false;
                node.setDirtyCanvas(true, true);
            };
            const onRes = node.onResize;
            node.onResize = function (size) {
                const rr = onRes?.apply(this, arguments);
                if (ready && !fitting && !fs) {   // a resize by hand: remembered, and kept within one track and all of them
                    const [lo, hi] = bounds();
                    node.properties.wxMixH = size[1] >= hi - 2 ? 0 : Math.max(lo, size[1]);
                    if (size[1] > hi) size[1] = hi;
                }
                return rr;
            };

            // ---- pickers --------------------------------------------------------------------------------------------
            // the menus: the input folder first, then output, each in alphabetical order (Sick, 17/10), one group each
            const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
            const groups = (list, first) => {
                const opts = [first];
                for (const typ of ["input", "output"]) {
                    const fs = list.filter((f) => f.type === typ).sort(byName);
                    if (!fs.length) continue;
                    const g = document.createElement("optgroup"); g.label = typ;
                    for (const f of fs) { const o = el("option", "", f.name); o.value = fkey(f); g.append(o); }
                    opts.push(g);
                }
                return opts;
            };
            const fillPickers = async (force) => {
                const fl = await mediaFiles(force);
                sAdd.replaceChildren(...groups(fl.audio, el("option", "", "+ track…")));
                sAdd.selectedIndex = 0;
                sVideo.replaceChildren(...groups(fl.video, el("option", "", "none")));
                sVideo.value = S.video ? fkey(S.video) : "none";
                if (S.video && sVideo.value !== fkey(S.video)) {
                    const o = el("option", "", S.video.name + " (missing)"); o.value = fkey(S.video); sVideo.append(o); sVideo.value = o.value;
                }
            };
            const findFile = (kind, k) => (files?.[kind] || []).find((f) => fkey(f) === k);
            for (const s of [sAdd, sVideo]) s.addEventListener("pointerdown", () => fillPickers(true));
            sAdd.onchange = () => { const f = findFile("audio", sAdd.value); sAdd.selectedIndex = 0; if (f) addTrack(f); };
            const addTrack = (f) => {
                const used = new Set(S.tracks.map((t) => t.color));
                const color = COLORS.findIndex((_, i) => !used.has(i));
                const name = f.name.split("/").pop().replace(/\.[^.]+$/, "").replace(/_\d{5}_?$/, "");
                S.tracks.push({ name, file: { name: f.name, type: f.type }, gain: 0, offset: 0, mute: false, solo: false,
                                color: color < 0 ? S.tracks.length % COLORS.length : color, clips: [{ s: 0, e: dur(), fi: 0, fo: 0 }] });
                loadBuffer(f, () => { const t = S.tracks[S.tracks.length - 1]; if (t && t.clips.length === 1 && t.clips[0].s === 0) t.clips[0].e = dur(); save(); redraw(); });
                save(); build();
                // the new track is the last one: brought into view, and its header lights up for a moment
                body.scrollTop = body.scrollHeight;
                const hd = lanes[lanes.length - 1]?.hd;
                if (hd) { hd.style.transition = "background .8s"; hd.style.background = WX.accent; setTimeout(() => (hd.style.background = "#222"), 350); }
                hint.textContent = `added ${name}: the last track`;
            };
            const useVideo = (f) => { S.video = f ? { name: f.name, type: f.type } : null; video.dataset.k = ""; setVideo(); save(); build(); fillPickers(); syncVideoTrack(); };
            sVideo.onchange = () => useVideo(findFile("video", sVideo.value) || null);

            // a file dragged from Windows onto the node: uploaded into the input folder (as Load Audio / Load Video do),
            // then a video becomes the video to watch, an audio file a new track
            const isVideo = (n) => /\.(mp4|mov|webm|mkv)$/i.test(n), isAudio = (n) => /\.(flac|wav|mp3|ogg|m4a|aac|opus)$/i.test(n);
            root.addEventListener("dragover", (e) => {
                if (![...(e.dataTransfer?.items || [])].some((i) => i.kind === "file")) return;
                e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; root.style.outline = `2px dashed ${WX.accent}`;
            });
            root.addEventListener("dragleave", () => { root.style.outline = ""; });
            root.addEventListener("drop", async (e) => {
                const fs = [...(e.dataTransfer?.files || [])].filter((f) => isVideo(f.name) || isAudio(f.name));
                root.style.outline = "";
                if (!fs.length) return;
                e.preventDefault(); e.stopPropagation();
                const fl = await mediaFiles(true);
                for (const file of fs) {
                    // a file ComfyUI already has (same name, same size, in input or output): used where it is, not copied
                    const have = [...fl.audio, ...fl.video].filter((f) => f.name.split("/").pop() === file.name &&
                        (f.size === undefined || f.size === file.size));
                    if (have.length) {
                        const f = have.find((x) => x.type === "input") || have[0];
                        if (isVideo(f.name)) useVideo(f); else addTrack(f);
                        continue;
                    }
                    hint.textContent = `uploading ${file.name}…`;
                    const body = new FormData();
                    body.append("image", file); body.append("type", "input"); body.append("overwrite", "true");
                    try {
                        const res = await api.fetchApi("/upload/image", { method: "POST", body });
                        if (!res.ok) throw new Error(res.status);
                        const j = await res.json();
                        const f = { name: (j.subfolder ? j.subfolder + "/" : "") + j.name, type: "input" };
                        buffers.delete(fkey(f));   // a file uploaded again under the same name is read again
                        if (isVideo(f.name)) useVideo(f); else addTrack(f);
                    } catch (err) {
                        hint.textContent = /413/.test(String(err))
                            ? `${file.name} is over the upload limit of ComfyUI (100 MB unless started with --max-upload-size): put it in the input folder and pick it from the menu`
                            : `cannot upload ${file.name} (${err})`;
                        return;
                    }
                }
                hint.textContent = HINT;
                fillPickers(true);
            });
            /** Where the room goes: the video as tall as its handle says (one height on the node, one full screen), the
             *  tracks in the rest, with a scroll bar when they do not fit. */
            const place = () => {
                grip.style.display = S.video ? "flex" : "none";
                vWrap.style.flex = "none"; vWrap.style.height = vH() + "px"; body.style.flex = "1 1 auto";
            };
            const setVideo = () => {
                vWrap.style.display = S.video ? "flex" : "none"; place();
                if (S.video) {
                    const k = fkey(S.video);
                    if (video.dataset.k !== k) {
                        // the file itself at once, then its light copy as soon as the server has it (made once, in temp)
                        video.dataset.k = k; video.src = fileURL(S.video); vfps = 24;
                        videoProxy(S.video).then((p) => { if (p && video.dataset.k === k) { vfps = p.fps; video.src = fileURL(p.file); } });
                    }
                }
                else { video.removeAttribute("src"); video.dataset.k = ""; videoDur = 0; video.load(); }
            };

            // ---- tracks: header + lane ------------------------------------------------------------------------------
            let lanes = [];
            // one track as tall as the whole room of the tracks (double-click on a clip or on its name; again = back)
            let big = null;
            // the tracks whose volume line is in hand (V on): a matter of the view, in memory only
            const vEdit = new Set();
            const bigH = () => Math.max(LANE_H, (body.clientHeight || LANE_H) - 4);
            const laneH = (t) => (big === t ? bigH() : LANE_H);
            const toggleBig = (t) => { big = big === t ? null : t; build(); };
            // the ≡ on the left of a track: drag it up or down, a blue line shows where it lands (the colours stay with
            // their tracks)
            const dropLine = el("div", `position:absolute;left:0;right:0;height:2px;margin-top:-${1 + GAP / 2}px;background:${WX.accent};display:none;pointer-events:none;z-index:3`);
            body.append(dropLine);
            const wireGrip = (hg, from) => {
                let to = -1;
                const target = (y) => {
                    let k = 0;
                    lanes.forEach((L, i) => { const r = L.hd.getBoundingClientRect(); if (y > r.top + r.height / 2) k = i + 1; });
                    return k;
                };
                hg.addEventListener("pointerdown", (e) => {
                    if (e.button !== 0 || big) return;
                    e.preventDefault(); hg.setPointerCapture(e.pointerId); hg.style.cursor = "grabbing";
                    lanes[from].hd.style.opacity = "0.4"; to = from;
                });
                hg.addEventListener("pointermove", (e) => {
                    if (to < 0) return;
                    const br = body.getBoundingClientRect();   // near the top or the bottom edge the tracks scroll
                    if (e.clientY < br.top + 16) body.scrollTop -= 8; else if (e.clientY > br.bottom - 16) body.scrollTop += 8;
                    to = target(e.clientY);
                    const ref = lanes[Math.min(to, lanes.length - 1)].hd;
                    dropLine.style.top = (to < lanes.length ? ref.offsetTop : ref.offsetTop + ref.offsetHeight + GAP) + "px";
                    dropLine.style.display = to === from || to === from + 1 ? "none" : "block";
                });
                const end = () => {
                    if (to < 0) return;
                    const k = to; to = -1; dropLine.style.display = "none"; hg.style.cursor = "grab";
                    if (k === from || k === from + 1) { lanes[from].hd.style.opacity = ""; build(); return; }
                    S.tracks.forEach((x, i) => { x.color ??= i % COLORS.length; });
                    const [t] = S.tracks.splice(from, 1);
                    S.tracks.splice(k > from ? k - 1 : k, 0, t);
                    save(); build();
                };
                hg.addEventListener("pointerup", end); hg.addEventListener("pointercancel", end);
            };
            const build = () => {
                if (big && !S.tracks.includes(big)) big = null;   // the big track was removed (or an undo replaced the tracks)
                heads.replaceChildren();
                for (const l of lanes) l.cv.remove();
                lanes = [];
                const solo = S.tracks.some((t) => t.solo);
                S.tracks.forEach((t, idx) => {
                    const col = COLORS[t.color ?? idx % COLORS.length];
                    const h = el("div", `height:${LANE_H}px;flex:none;display:flex;align-items:stretch;padding:0 4px 0 0;` +
                        `background:#222;border-left:3px solid ${col};border-radius:3px;opacity:${t.mute || (solo && !t.solo) ? 0.5 : 1}`);
                    const hg = el("div", "width:14px;flex:none;display:flex;align-items:center;justify-content:center;cursor:grab;color:#777;font-size:13px", "≡");
                    hg.title = "Drag up / down: the order of the tracks";
                    if (big) hg.style.visibility = "hidden";
                    wireGrip(hg, idx);
                    const hc = el("div", "flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:2px");
                    h.append(hg, hc);
                    const r1 = el("div", "display:flex;gap:4px;align-items:center"), r2 = el("div", "display:flex;gap:4px;align-items:center");
                    const nm = el("input", "flex:1 1 auto;width:0;font-weight:600"); nm.value = t.name || ""; nm.title = t.source === "video" ? "The sound of the video (" + (S.video?.name || "") + ")" : t.file?.name || "";
                    nm.onchange = () => { t.name = nm.value; save(); };
                    const x = el("button", "padding:0 5px", "✕"); x.title = "Remove the track";
                    x.onclick = (e) => { e.stopPropagation(); if (t.source === "video") S.videoTrackOff = fkey(S.video); S.tracks.splice(idx, 1); save(); build(); };
                    r1.append(nm, x);
                    const g = el("input", "width:60px"); g.type = "number"; g.step = 0.5; g.value = t.gain; g.title = "Volume of the track, dB";
                    g.onchange = () => { t.gain = Number(g.value) || 0; save(); redraw(); if (playing) play(); };
                    g.title += ": 0 = as it is, -6 about half, +6 about double. Drag up / down to change it (Shift: finer)";
                    dragNum(g, 0.25, (v) => { t.gain = v; liveGain(t); redraw(); }, () => save());
                    const o = el("input", "width:62px"); o.type = "number"; o.step = 0.01; o.value = t.offset; o.title = "Offset: the track slides by these seconds under its clips (Shift+drag on the lane does the same)";
                    o.onchange = () => { t.offset = Number(o.value) || 0; save(); redraw(); if (playing) play(); };
                    o.title += ". Drag up / down to change it (Shift: finer)";
                    dragNum(o, 0.01, (v) => { t.offset = v; redraw(); }, () => { save(); if (playing) play(); });
                    const m = el("span", "", "M"); m.className = "wx-chip" + (t.mute ? " on" : ""); m.title = "Mute";
                    m.onclick = (e) => { e.stopPropagation(); t.mute = !t.mute; save(); build(); if (playing) play(); };
                    const so = el("span", "", "S"); so.className = "wx-chip" + (t.solo ? " on" : ""); so.title = "Solo";
                    so.onclick = (e) => { e.stopPropagation(); t.solo = !t.solo; save(); build(); if (playing) play(); };
                    const vl = el("span", "", "V"); vl.className = "wx-chip" + (vEdit.has(t) ? " on" : "");
                    vl.title = "Volume line: on = the mouse draws the volume of this track over time (points, dips, curves); the clips stay put meanwhile";
                    vl.onclick = (e) => { e.stopPropagation(); vEdit.has(t) ? vEdit.delete(t) : vEdit.add(t); build(); };
                    r2.append(lab("dB"), g, lab("off"), o, m, so, vl);
                    hc.append(r1, r2);
                    heads.append(h);
                    h.addEventListener("dblclick", (e) => { if (!/^(INPUT|BUTTON|SELECT)$/.test(e.target.tagName) && !e.target.classList.contains("wx-chip")) toggleBig(t); });
                    h.title = "Double-click: this track over the whole room of the tracks (again: back)";
                    if (big && big !== t) h.style.display = "none";
                    h.style.height = laneH(t) + "px";
                    const cv = el("canvas", `height:${LANE_H}px;display:block;cursor:default`);
                    inner.insertBefore(cv, head);
                    if (big && big !== t) cv.style.display = "none";
                    const lane = { t, cv, col, offIn: o, hd: h };
                    lanes.push(lane);
                    wireLane(lane);
                    if (src(t)) loadBuffer(src(t), () => { syncDur(); redraw(); });
                });
                setVideo();
                fit();
                redraw();
            };

            // ---- the view: the stretch of time on screen (wheel on the ruler = zoom around the mouse, middle button = drag
            // it sideways) and the play range (the two handles on the ruler). Both are a matter of the view: kept in memory,
            // not in the workflow (they never become a step of Ctrl+Z).
            const view = { t0: 0, span: 0 };       // span 0 = the whole mix
            let range = null;                        // [in, out] in seconds; null = the whole mix
            const VW = () => Math.max(100, sc.clientWidth || 600);
            const span = () => { const D = dur(); return view.span > 0 ? Math.min(D, Math.max(0.25, view.span)) : D; };
            const v0 = () => Math.min(Math.max(0, view.t0), Math.max(0, dur() - span()));
            const pps = () => VW() / Math.max(0.05, span());
            const X = (t) => (t - v0()) * pps();
            const T = (x) => v0() + x / pps();
            const rIn = () => (range ? Math.max(0, Math.min(range[0], dur())) : 0);
            const rOut = () => (range ? Math.max(rIn(), Math.min(range[1], dur())) : dur());
            const zoomAt = (x, factor) => {
                const tm = T(x), D = dur();
                const s = Math.min(D, Math.max(0.25, span() * factor));
                view.span = s >= D ? 0 : s;
                view.t0 = tm - x * (s / VW());
                view.t0 = Math.min(Math.max(0, view.t0), Math.max(0, D - s));
                redraw();
            };
            // middle button, on the ruler or on a track: the view follows the mouse sideways
            const startPan = (e, elx) => {
                e.preventDefault();
                const x0 = e.clientX, t00 = v0(), k = span() / VW() / (fs ? 1 : app.canvas?.ds?.scale || 1);
                elx.setPointerCapture(e.pointerId);
                const mv = (ev) => { view.t0 = Math.min(Math.max(0, t00 - (ev.clientX - x0) * k), Math.max(0, dur() - span())); redraw(); };
                const up = () => { elx.removeEventListener("pointermove", mv); elx.removeEventListener("pointerup", up); elx.removeEventListener("pointercancel", up); };
                elx.addEventListener("pointermove", mv); elx.addEventListener("pointerup", up); elx.addEventListener("pointercancel", up);
            };
            let marks = [];
            const snapTo = (t, skip) => {
                const lim = SNAP_PX / pps();
                let best = t, bd = lim;
                const tryT = (x) => { const d = Math.abs(x - t); if (d < bd) { bd = d; best = x; } };
                tryT(0); tryT(dur());
                if (S.snapScene) for (const m of marks) tryT(m.t);
                if (S.snapBeat && S.bpm > 0) { const b = 60 / S.bpm, k = Math.round((t - S.beat) / b); tryT(S.beat + k * b); }
                for (const tr of S.tracks) for (const c of tr.clips) if (c !== skip) { tryT(c.s); tryT(c.e); }
                return best;
            };

            // ---- drawing --------------------------------------------------------------------------------------------
            const prep = (cv, h) => {
                const w = VW(), d = window.devicePixelRatio || 1;
                if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); cv.style.width = w + "px"; }
                const g = cv.getContext("2d"); g.setTransform(d, 0, 0, d, 0, 0); return g;
            };
            const grid = (g, h, faint) => {
                const p = pps(), a = v0(), z = a + span();
                if (S.bpm > 0) {
                    const b = 60 / S.bpm;
                    if (b * p >= 4) for (let k = Math.ceil((a - S.beat) / b), t = S.beat + k * b; t <= z; k++, t = S.beat + k * b) {
                        g.fillStyle = k % 4 === 0 ? (faint ? "#333" : "#555") : (faint ? "#262626" : "#3a3a3a");
                        g.fillRect(Math.round(X(t)), 0, 1, h);
                    }
                }
                g.fillStyle = faint ? "rgba(230,140,40,.45)" : "#e68c28";
                for (const m of marks) if (m.t >= a && m.t <= z) g.fillRect(Math.round(X(m.t)), 0, 1, h);
            };
            const outside = (g, h) => {   // what the play range leaves out, darker
                if (!range) return;
                g.fillStyle = "rgba(0,0,0,.45)";
                const xi = X(rIn()), xo = X(rOut());
                if (xi > 0) g.fillRect(0, 0, xi, h);
                if (xo < VW()) g.fillRect(xo, 0, VW() - xo, h);
            };
            const RANGE_COL = "#ffc83a";
            const drawRuler = () => {
                const g = prep(ruler, RULER_H), p = pps(), w = VW(), a = v0(), z = a + span();
                g.fillStyle = "#222"; g.fillRect(0, 0, w, RULER_H);
                grid(g, RULER_H, false);
                const step = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120].find((s) => s * p >= 56) || 300;
                g.fillStyle = "#aaa"; g.font = "10px sans-serif"; g.textBaseline = "top";
                for (let t = Math.ceil(a / step - 1e-9) * step; t <= z + 1e-6; t += step) {
                    const x = Math.round(X(t));
                    g.fillRect(x, RULER_H - 6, 1, 6);
                    g.fillText(step < 1 ? t.toFixed(step < 0.5 ? 2 : 1) : fmt(t).replace(/\.00$/, ""), x + 3, 2);
                }
                g.fillStyle = "#e68c28"; g.font = "bold 10px sans-serif";
                for (const m of marks) if (m.t >= a && m.t <= z) g.fillText(String(m.k), Math.round(X(m.t)) + 3, 12);
                outside(g, RULER_H);
                // the two handles of the play range: [ at the in point, ] at the out point
                for (const [t, dir] of [[rIn(), 1], [rOut(), -1]]) {
                    const x = Math.round(X(t));
                    if (x < -8 || x > w + 8) continue;
                    g.fillStyle = RANGE_COL;
                    g.fillRect(x - (dir > 0 ? 0 : 2), 0, 2, RULER_H);
                    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + dir * 9, 0); g.lineTo(x, 9); g.closePath(); g.fill();
                    g.beginPath(); g.moveTo(x, RULER_H); g.lineTo(x + dir * 9, RULER_H); g.lineTo(x, RULER_H - 9); g.closePath(); g.fill();
                }
            };
            // the volume line on a lane: height v from the bottom (silence) to the top (+6 dB), EP pixels of margin
            const EP = 5;
            const Yv = (v, H) => EP + (1 - v) * (H - 2 * EP);
            const vY = (y, H) => Math.min(1, Math.max(0, 1 - (y - EP) / (H - 2 * EP)));
            // the small circle that bends a stretch: halfway in time, on the line; only where the stretch rises or falls
            const curveAt = (tr, i) => {
                const a = tr.env[i], b = tr.env[i + 1];
                if (!b || Math.abs(b.v - a.v) < 0.02 || (X(b.t) - X(a.t)) < 16) return null;
                const tm = (a.t + b.t) / 2; return { t: tm, v: envV(tr, tm) };
            };
            const drawEnv = (g, t, H, ed) => {
                const pts = t.env || [], w = VW();
                if (!ed && !pts.length) return;
                if (ed) {   // 0 dB, for reference
                    g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 1; g.setLineDash([3, 4]);
                    g.beginPath(); g.moveTo(0, Math.round(Yv(V0, H)) + 0.5); g.lineTo(w, Math.round(Yv(V0, H)) + 0.5); g.stroke(); g.setLineDash([]);
                }
                g.strokeStyle = ed ? "#fff" : "rgba(255,255,255,.4)"; g.lineWidth = ed ? 1.5 : 1;
                g.beginPath();
                for (let x = 0; x <= w; x += 2) { const y = Yv(envV(t, T(x)), H); x ? g.lineTo(x, y) : g.moveTo(x, y); }
                g.stroke();
                if (!ed) return;
                for (let i = 0; i < pts.length; i++) {
                    const p = pts[i], x = X(p.t);
                    if (x < -8 || x > w + 8) continue;
                    g.fillStyle = "#fff"; g.fillRect(Math.round(x) - 3, Math.round(Yv(p.v, H)) - 3, 7, 7);
                    const q = curveAt(t, i);
                    if (q) {
                        g.beginPath(); g.arc(X(q.t), Yv(q.v, H), 3.5, 0, Math.PI * 2);
                        g.fillStyle = "#181818"; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.stroke();
                    }
                }
            };
            const drawLane = (L) => {
                const { t, cv, col } = L, H = laneH(t);
                if (cv.style.height !== H + "px") { cv.style.height = H + "px"; L.hd.style.height = H + "px"; }
                const g = prep(cv, H), p = pps(), w = VW();
                const solo = S.tracks.some((x) => x.solo), off = !!(t.mute || (solo && !t.solo));
                g.fillStyle = "#181818"; g.fillRect(0, 0, w, H);
                grid(g, H, true);
                const e = src(t) ? buffers.get(fkey(src(t))) : null;
                if (e?.peaks) {
                    const pk = e.peaks, mid = H / 2, vol = Math.pow(10, (t.gain || 0) / 20);   // the waveform drawn at the track's volume
                    for (let x = 0; x < w; x++) {
                        // under a clip, the sound that clip carries (its own shift on top of the track's)
                        const tx = T(x + 0.5), cx = t.clips.findLast((c) => tx >= c.s && tx <= c.e), so = (t.offset || 0) + (cx?.o || 0);
                        const ta = T(x) - so, tb = T(x + 1) - so;
                        if (tb <= 0 || ta >= e.buf.duration) continue;
                        let i0 = Math.max(0, Math.floor(ta * PEAKS_PER_S)), i1 = Math.min(pk.length, Math.max(i0 + 1, Math.ceil(tb * PEAKS_PER_S))), m = 0;
                        for (let i = i0; i < i1; i++) if (pk[i] > m) m = pk[i];
                        // full height = 0 dB; what the volume pushes over it is cut, and drawn red
                        const env = trackEnv(t, T(x + 0.5)), lvl = m * vol * envGain(t, T(x + 0.5)), a = Math.min(1, lvl) * (H / 2 - 3);
                        g.fillStyle = env > 0 ? (lvl > 1 ? "#ff4a4a" : col) : (lvl > 1 ? "#6a3030" : "#3a3a3a");
                        g.globalAlpha = env > 0 ? 0.3 + 0.7 * env : 1;
                        g.fillRect(x, mid - a, 1, Math.max(1, 2 * a));
                    }
                    g.globalAlpha = 1;
                } else {
                    g.fillStyle = e?.err ? "#e08080" : "#777"; g.font = "11px sans-serif"; g.textBaseline = "middle";
                    g.fillText(e?.err ? "cannot read " + (src(t)?.name || "") : "loading…", 8, H / 2);
                }
                const ed = vEdit.has(t);   // the volume line in hand: the clips step back
                for (const c of t.clips) {
                    const x0 = X(c.s), x1 = X(c.e);
                    if (x1 < -10 || x0 > w + 10) continue;
                    g.strokeStyle = col; g.lineWidth = 1.5; g.strokeRect(x0 + 0.5, 1.5, Math.max(1, x1 - x0 - 1), H - 3);
                    g.fillStyle = col; g.globalAlpha = 0.1; g.fillRect(x0, 1, x1 - x0, H - 2); g.globalAlpha = ed ? 0.25 : 1;
                    g.strokeStyle = "rgba(255,255,255,.75)"; g.lineWidth = 1; g.beginPath();
                    g.moveTo(x0, H - 2); g.lineTo(X(c.s + c.fi), 3); g.lineTo(X(c.e - c.fo), 3); g.lineTo(x1, H - 2); g.stroke();
                    g.fillStyle = "#fff";
                    g.fillRect(X(c.s + c.fi) - 3, 1, 7, 7); g.fillRect(X(c.e - c.fo) - 3, 1, 7, 7);
                    g.globalAlpha = 1;
                }
                // what the mouse would take: the piece lights up; an edge gets a bracket, [ for the start, ] for the end
                const hv = !ed && L.hov && t.clips.includes(L.hov.c) ? L.hov : null;
                if (hv) {
                    const c = hv.c, x0 = X(c.s), x1 = X(c.e);
                    g.fillStyle = "rgba(255,255,255,.13)"; g.fillRect(x0, 1, x1 - x0, H - 2);
                    g.fillStyle = "#fff";
                    if (hv.mode === "l" || hv.mode === "r") {
                        const l = hv.mode === "l", xb = l ? x0 : x1 - 3, xt = l ? x0 : x1 - 10;
                        g.fillRect(xb, 1, 3, H - 2); g.fillRect(xt, 1, 10, 3); g.fillRect(xt, H - 4, 10, 3);
                    } else if (hv.mode === "move") { g.strokeStyle = "#fff"; g.lineWidth = 2; g.strokeRect(x0 + 1, 2, x1 - x0 - 2, H - 4); }
                    else { const xs = X(hv.mode === "fi" ? c.s + c.fi : c.e - c.fo); g.strokeStyle = WX.accent; g.lineWidth = 2; g.strokeRect(xs - 5, -1, 11, 11); }
                }
                drawEnv(g, t, H, ed);
                outside(g, H);
                if (off) { g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(0, 0, w, H); }
            };
            const redraw = () => {
                marks = sceneMarks(node.graph);
                drawRuler();
                for (const L of lanes) drawLane(L);
                placeHead();
            };
            const placeHead = () => {
                const x = X(pos);
                for (const h of [head, headR]) { h.style.display = x < 0 || x > VW() ? "none" : ""; h.style.left = Math.round(x) + "px"; }
                tLab.textContent = `${fmt(pos)} / ${fmt(dur())}`;
            };

            // ---- mouse on a lane ------------------------------------------------------------------------------------
            const wireLane = (L) => {
                const cv = L.cv;
                // what the mouse would take: first the clip the mouse is inside (so at a cut between two clips the side
                // of the cut decides: left of it = the end of the left clip, right of it = the start of the right one),
                // then an edge just outside a clip
                const hit = (x, y) => {
                    const cs = L.t.clips;
                    for (let i = cs.length - 1; i >= 0; i--) {
                        const c = cs[i], x0 = X(c.s), x1 = X(c.e);
                        if (x < x0 || x > x1) continue;
                        if (y < 12 && Math.abs(x - X(c.s + c.fi)) <= 6) return { c, mode: "fi" };
                        if (y < 12 && Math.abs(x - X(c.e - c.fo)) <= 6) return { c, mode: "fo" };
                        const edge = Math.min(6, (x1 - x0) / 3);
                        if (x - x0 <= edge) return { c, mode: "l" };
                        if (x1 - x <= edge) return { c, mode: "r" };
                        return { c, mode: "move" };
                    }
                    for (let i = cs.length - 1; i >= 0; i--) {
                        const c = cs[i];
                        if (Math.abs(x - X(c.s)) <= 5) return { c, mode: "l" };
                        if (Math.abs(x - X(c.e)) <= 5) return { c, mode: "r" };
                    }
                    return null;
                };
                // the mouse over a clip: what it would take lights up (see drawLane)
                const hover = (h) => {
                    const k = h ? h.mode + L.t.clips.indexOf(h.c) : "";
                    if (k === (L.hovK || "")) return;
                    L.hov = h; L.hovK = k; drawLane(L);
                    const c = h?.c, at = c ? ` (${c.s.toFixed(2)} → ${c.e.toFixed(2)} s)` : "";
                    hint.textContent = !h ? HINT : `${L.t.name} · ` + ({
                        l: `the START of this clip${at}: drag to trim it`, r: `the END of this clip${at}: drag to trim it`,
                        move: `this clip${at}: drag = the window over the sound · ` +
                            (L.t.clips.length > 1 ? "middle = the clip with its sound · Shift+middle = the whole track" : "middle = the whole track"),
                        fi: `its fade in: drag it`, fo: `its fade out: drag it` })[h.mode];
                };
                cv.addEventListener("pointerleave", () => { if (!drag) hover(null); });
                // the volume line (V on): what is under the mouse
                const hitEnv = (x, y) => {
                    const H = laneH(L.t), pts = L.t.env || [];
                    for (let i = pts.length - 1; i >= 0; i--) if (Math.abs(x - X(pts[i].t)) <= 5 && Math.abs(y - Yv(pts[i].v, H)) <= 5) return { mode: "ept", i };
                    for (let i = 0; i < pts.length - 1; i++) {
                        const q = curveAt(L.t, i);
                        if (q && Math.abs(x - X(q.t)) <= 5 && Math.abs(y - Yv(q.v, H)) <= 5) return { mode: "ecurve", i };
                    }
                    if (Math.abs(y - Yv(envV(L.t, T(x)), H)) <= 5) return { mode: "eseg" };
                    return { mode: "erect" };
                };
                const ENV_CURSOR = { ept: "move", ecurve: "ns-resize", eseg: "pointer", erect: "crosshair" };
                cv.addEventListener("pointermove", (e) => {
                    if (drag) return;
                    if (vEdit.has(L.t)) { hover(null); cv.style.cursor = ENV_CURSOR[hitEnv(e.offsetX, e.offsetY).mode]; return; }
                    const h = hit(e.offsetX, e.offsetY);
                    hover(e.shiftKey ? null : h);
                    cv.style.cursor = e.shiftKey ? "ew-resize" : !h ? "default" : h.mode === "move" ? "grab" : "col-resize";
                });
                let drag = null;
                const envMove = (e) => {
                    const H = laneH(L.t), o = drag.o, x = e.offsetX, y = e.offsetY;
                    if (!drag.moved && Math.hypot(x - drag.x, y - drag.y) < 3) return;
                    drag.moved = true;
                    const v = vY(y, H), stick = (v) => (Math.abs(Yv(v, H) - Yv(V0, H)) < 4 ? V0 : v);   // 0 dB holds the point
                    if (drag.mode === "eseg" && !drag.ids.length) {   // no points yet: the first one, under the mouse
                        L.t.env = [{ t: Math.min(Math.max(0, T(drag.x)), dur()), v: V0, c: 0 }];
                        Object.assign(drag, { mode: "ept", i: 0, o: L.t.env.map((p) => ({ ...p })) });
                    }
                    const pts = L.t.env, name = L.t.name || "track";
                    if (drag.mode === "ept") {
                        const i = drag.i, lo = i > 0 ? pts[i - 1].t + 0.01 : 0, hi = i < pts.length - 1 ? pts[i + 1].t - 0.01 : dur();
                        pts[i].t = Math.min(Math.max(lo, snapTo(drag.o[i].t + (x - drag.x) / pps(), null)), hi);
                        pts[i].v = stick(v);
                        hint.textContent = `${name} · point ${pts[i].t.toFixed(2)} s · ${fmtDb(pts[i].v)}`;
                    } else if (drag.mode === "ecurve") {
                        const a = pts[drag.i], b = pts[drag.i + 1];
                        const m = Math.min(0.97, Math.max(0.03, (v - a.v) / (b.v - a.v)));
                        a.c = Math.round(Math.min(4, Math.max(-4, Math.log2(Math.log(m) / Math.log(0.5)))) * 100) / 100;
                        hint.textContent = `${name} · curve ${a.c > 0 ? "slow, then fast" : a.c < 0 ? "fast, then slow" : "straight"} (${a.c.toFixed(2)})`;
                    } else if (drag.mode === "eseg") {   // the stretch between two points: both up / down
                        const dv = v - vY(drag.y, H);
                        for (const k of drag.ids) pts[k].v = Math.min(1, Math.max(0, o[k].v + dv));
                        hint.textContent = `${name} · stretch at ${fmtDb(pts[drag.ids[0]].v)}`;
                    } else if (drag.mode === "erect") {   // a dip: from where the drag starts to where it is, as low as the mouse
                        const t0 = snapTo(Math.min(Math.max(0, T(drag.x)), dur()), null), t1 = snapTo(Math.min(Math.max(0, T(x)), dur()), null);
                        const s = Math.min(t0, t1), en = Math.max(t0, t1);
                        if (en - s < 0.1) { L.t.env = o.map((p) => ({ ...p })); redraw(); return; }
                        const r = Math.min(0.5, (en - s) / 4), was = { env: o }, lv = stick(v);
                        L.t.env = [...o.filter((p) => p.t < s - 1e-6 || p.t > en + 1e-6).map((p) => ({ ...p })),
                                   { t: s, v: envV(was, s), c: 0 }, { t: s + r, v: lv, c: 0 }, { t: en - r, v: lv, c: 0 }, { t: en, v: envV(was, en), c: 0 }]
                            .sort((p, q) => p.t - q.t);
                        hint.textContent = `${name} · dip ${s.toFixed(2)} → ${en.toFixed(2)} s · ${fmtDb(lv)}`;
                    }
                    redraw();
                };
                cv.addEventListener("pointerdown", (e) => {
                    if (e.button === 1) {
                        e.preventDefault();
                        // middle on a clip of a track with more clips: that clip alone, with its own piece of sound (its
                        // shift `o` follows); on the only clip, on empty or with Shift: the whole track (off follows)
                        const hc = !e.shiftKey && L.t.clips.length > 1 ? hit(e.offsetX, e.offsetY) : null;
                        if (hc) { drag = { mode: "csnd", c: hc.c, x: e.offsetX, o: { ...hc.c } }; cv.setPointerCapture(e.pointerId); return; }
                        // middle on empty: the whole track moves, its clips with it (the offset follows)
                        drag = { mode: "layer", x: e.offsetX, o: { off: L.t.offset || 0, clips: L.t.clips.map((c) => ({ ...c })), env: (L.t.env || []).map((p) => ({ ...p })) } };
                        cv.setPointerCapture(e.pointerId); return;
                    }
                    if (e.button !== 0) return;
                    if (vEdit.has(L.t)) {
                        L.t.env ??= [];
                        const h = hitEnv(e.offsetX, e.offsetY), tc = T(e.offsetX);
                        let k = -1; L.t.env.forEach((p, i) => { if (p.t <= tc) k = i; });   // the stretch under the click
                        drag = { ...h, x: e.offsetX, y: e.offsetY, o: L.t.env.map((p) => ({ ...p })), moved: false,
                                 ids: [k, k + 1].filter((i) => i >= 0 && i < L.t.env.length) };
                        cv.setPointerCapture(e.pointerId); return;
                    }
                    const x = e.offsetX, h = hit(x, e.offsetY);
                    if (h && e.altKey) { L.t.clips.splice(L.t.clips.indexOf(h.c), 1); save(); redraw(); if (playing) play(); return; }
                    if (h && (e.ctrlKey || e.metaKey) && h.mode === "move") {
                        const t = snapTo(T(x), null), c = h.c;
                        if (t - c.s > MIN_CLIP && c.e - t > MIN_CLIP) {
                            const b = { s: t, e: c.e, fi: 0, fo: Math.min(c.fo, c.e - t), o: c.o || 0 };   // the second half keeps the same sound
                            c.e = t; c.fo = 0; c.fi = Math.min(c.fi, c.e - c.s);
                            L.t.clips.push(b); save(); redraw(); if (playing) play();
                        }
                        return;
                    }
                    if (e.shiftKey) drag = { mode: "off", x, o: L.t.offset || 0 };
                    else if (h) drag = { ...h, x, o: { ...h.c } };
                    else return;
                    cv.setPointerCapture(e.pointerId);
                });
                cv.addEventListener("pointermove", (e) => {
                    if (!drag) return;
                    if (drag.mode[0] === "e") return envMove(e);
                    const dt = (e.offsetX - drag.x) / pps(), D = dur(), c = drag.c, o = drag.o;
                    if (drag.mode === "off") L.t.offset = Math.round((drag.o + dt) * 100) / 100;
                    else if (drag.mode === "layer") {
                        const d = Math.round(dt * 100) / 100;
                        L.t.offset = Math.round((o.off + d) * 100) / 100;
                        L.t.clips.forEach((x, i) => { x.s = o.clips[i].s + d; x.e = o.clips[i].e + d; });
                        (L.t.env || []).forEach((p, i) => { p.t = o.env[i].t + d; });   // the volume line goes with them
                    }
                    else if (drag.mode === "move" || drag.mode === "csnd") {
                        const len = o.e - o.s;
                        let s = snapTo(o.s + dt, c);
                        if (s === o.s + dt) s = snapTo(o.e + dt, c) - len;
                        s = Math.min(Math.max(0, s), Math.max(0, D - len));
                        c.s = s; c.e = s + len;
                        if (drag.mode === "csnd") c.o = Math.round(((o.o || 0) + s - o.s) * 1000) / 1000;
                    } else if (drag.mode === "l") { c.s = Math.min(Math.max(0, snapTo(o.s + dt, c)), c.e - MIN_CLIP); c.fi = Math.min(c.fi, c.e - c.s - c.fo); }
                    else if (drag.mode === "r") { c.e = Math.max(Math.min(D, snapTo(o.e + dt, c)), c.s + MIN_CLIP); c.fo = Math.min(c.fo, c.e - c.s - c.fi); }
                    else if (drag.mode === "fi") c.fi = Math.min(Math.max(0, o.fi + dt), c.e - c.s - c.fo);
                    else if (drag.mode === "fo") c.fo = Math.min(Math.max(0, o.fo - dt), c.e - c.s - c.fi);
                    if (drag.mode === "off" || drag.mode === "layer") L.offIn.value = L.t.offset;
                    hint.textContent = drag.mode === "layer" ? `${L.t.name} · moved with its clips · offset ${L.t.offset.toFixed(2)} s`
                        : drag.mode === "off" ? `${L.t.name} · sound slid under the clips · offset ${L.t.offset.toFixed(2)} s`
                        : drag.mode === "csnd" ? `${L.t.name} · clip with its sound ${c.s.toFixed(2)} → ${c.e.toFixed(2)} s · its shift ${(c.o || 0).toFixed(2)} s`
                        : `${L.t.name} · clip ${c.s.toFixed(2)} → ${c.e.toFixed(2)} s · fades ${c.fi.toFixed(2)} / ${c.fo.toFixed(2)} s`;
                    redraw();
                });
                const up = () => {
                    if (!drag) return;
                    if (drag.mode === "eseg" && !drag.moved) {   // a click on the line: a point there, on it
                        const t = Math.min(Math.max(0, T(drag.x)), dur()), pts = L.t.env;
                        const a = pts.filter((p) => p.t <= t).pop();
                        pts.push({ t, v: envV(L.t, t), c: a?.c || 0 }); pts.sort((p, q) => p.t - q.t);
                    }
                    drag = null; hint.textContent = HINT; save(); redraw(); if (playing) play();
                };
                cv.addEventListener("pointerup", up);
                cv.addEventListener("pointercancel", up);
                cv.addEventListener("dblclick", (e) => {
                    if (vEdit.has(L.t)) {   // a point: gone; a small circle: straight again; elsewhere: the track over the whole room
                        const h = hitEnv(e.offsetX, e.offsetY);
                        if (h.mode === "ept") L.t.env.splice(h.i, 1);
                        else if (h.mode === "ecurve") L.t.env[h.i].c = 0;
                        else return toggleBig(L.t);
                        save(); redraw(); if (playing) play(); return;
                    }
                    const t = T(e.offsetX);
                    if (hit(e.offsetX, e.offsetY)) { toggleBig(L.t); return; }   // on a clip: the track over the whole room
                    const ts = [0, ...marks.map((m) => m.t), dur()].sort((a, b) => a - b);
                    let s = 0, en = dur();
                    for (const x of ts) { if (x <= t) s = x; else { en = x; break; } }
                    // not over the clips already there
                    for (const c of L.t.clips) { if (c.e <= t && c.e > s) s = c.e; if (c.s >= t && c.s < en) en = c.s; }
                    if (en - s < MIN_CLIP) return;
                    const f = Math.min(NEW_FADE, (en - s) / 3);
                    L.t.clips.push({ s, e: en, fi: s > 0 ? f : 0, fo: en < dur() ? f : 0 });
                    save(); redraw(); if (playing) play();
                });
            };

            // ---- playback (only the play range) ---------------------------------------------------------------------
            let pos = 0, playing = false, srcs = [], t0 = 0, p0 = 0, raf = 0;
            const gains = new Map();   // track -> its gain node while playing: the volume follows the drag without a restart
            const liveGain = (t) => { const g = gains.get(t); if (g) g.gain.setTargetAtTime(Math.pow(10, (t.gain || 0) / 20), audioCtx().currentTime, 0.02); };
            const stopSrc = () => { for (const s of srcs) { try { s.stop?.(); } catch { } try { s.disconnect(); } catch { } } srcs = []; gains.clear(); };
            const now = () => (playing ? p0 + (audioCtx().currentTime - t0) : pos);
            async function play(keep = true) {   // keep = go on from where it is playing; false = from `pos` (a seek)
                const A = audioCtx();
                await A.resume();
                if (playing && keep) pos = now();
                stopSrc();
                await Promise.all(S.tracks.filter((t) => src(t)).map((t) => loadBuffer(src(t)).p));
                const a = rIn(), z = rOut();
                if (pos < a || pos >= z - 0.01) pos = a;   // outside the range, or at its end: from its start
                const solo = S.tracks.some((t) => t.solo), start = A.currentTime + 0.06;
                for (const t of S.tracks) {
                    if (!src(t) || t.mute || (solo && !t.solo)) continue;
                    const b = buffers.get(fkey(src(t)))?.buf;
                    if (!b) continue;
                    const tg = A.createGain(); tg.gain.value = Math.pow(10, (t.gain || 0) / 20); wire(tg, A.destination); srcs.push(tg); gains.set(t, tg);
                    for (const c of t.clips) {
                        let s = Math.max(c.s, pos), e = Math.min(c.e, z);
                        let bo = s - (t.offset || 0) - (c.o || 0);
                        if (bo < 0) { s -= bo; bo = 0; }
                        if (e <= s || bo >= b.duration) continue;
                        e = Math.min(e, s + (b.duration - bo));
                        const n = Math.max(2, Math.ceil((e - s) * 200)), curve = new Float32Array(n);
                        for (let i = 0; i < n; i++) { const x = s + (e - s) * i / (n - 1); curve[i] = clipEnv(c, x) * envGain(t, x); }
                        const src = A.createBufferSource(), g = A.createGain();
                        src.buffer = b;
                        g.gain.setValueCurveAtTime(curve, start + (s - pos), e - s);
                        wire(src, g); wire(g, tg);
                        src.start(start + (s - pos), bo, e - s);
                        srcs.push(src, g);
                    }
                }
                t0 = start; p0 = pos; playing = true; bPlay.textContent = "⏸";
                if (S.video && video.src) { vSeek(pos); video.play().catch(() => { }); }
                cancelAnimationFrame(raf);
                const tick = () => {
                    if (!playing) return;
                    pos = Math.max(p0, now());
                    if (pos >= rOut()) { pos = rOut(); pause(); return; }
                    if (S.video && video.src && !video.paused && !video.seeking && Math.abs(video.currentTime - pos) > 0.1) vSeek(pos);
                    // the view follows the playhead when it runs off the right edge
                    if (view.span > 0 && (pos > v0() + span() || pos < v0())) { view.t0 = pos - span() * 0.05; redraw(); }
                    placeHead();
                    raf = requestAnimationFrame(tick);
                };
                raf = requestAnimationFrame(tick);
            }
            function pause() {
                if (playing) pos = Math.min(dur(), now());
                playing = false; stopSrc(); cancelAnimationFrame(raf); bPlay.textContent = "▶";
                video.pause(); placeHead();
            }
            function seek(t) {
                pos = Math.min(Math.max(0, t), dur());
                if (playing) play(false); else { vSeek(pos); placeHead(); }
            }
            // the ruler: left button = move the playhead (or a range handle, when on one); middle = drag the view; wheel = zoom
            let rDrag = null;
            const handleAt = (x) => {
                const di = Math.abs(x - X(rIn())), dout = Math.abs(x - X(rOut()));
                if (Math.min(di, dout) > 7) return null;
                return di <= dout ? "in" : "out";
            };
            ruler.addEventListener("pointerdown", (e) => {
                if (e.button === 1) return startPan(e, ruler);
                if (e.button !== 0) return;
                ruler.setPointerCapture(e.pointerId);
                const h = handleAt(e.offsetX);
                // dragging the playhead while it plays: it stops, the picture follows the mouse, and it plays on from
                // where it is let go
                rDrag = h ? { kind: h } : { kind: "seek", was: playing };
                if (!h) { if (playing) pause(); seek(T(e.offsetX)); }
            });
            ruler.addEventListener("pointermove", (e) => {
                if (!rDrag) { ruler.style.cursor = handleAt(e.offsetX) ? "ew-resize" : "pointer"; return; }
                const t = Math.min(Math.max(0, T(e.offsetX)), dur());
                if (rDrag.kind === "seek") { seek(t); return; }
                const a = rIn(), z = rOut(), MIN = 0.1;
                range = rDrag.kind === "in" ? [Math.min(snapTo(t, null), z - MIN), z] : [a, Math.max(snapTo(t, null), a + MIN)];
                if (range[0] <= 0.001 && range[1] >= dur() - 0.001) range = null;   // back to the whole mix
                hint.textContent = `play range ${fmt(rIn())} → ${fmt(rOut())}`;
                redraw();
            });
            const rUp = (e) => {
                if (!rDrag) return;
                if (rDrag.kind === "seek") { if (rDrag.was) play(false); }
                else if (rDrag.kind !== "seek") { hint.textContent = HINT; if (playing) play(); }
                rDrag = null;
            };
            ruler.addEventListener("pointerup", rUp);
            ruler.addEventListener("pointercancel", rUp);
            ruler.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(e.offsetX, e.deltaY > 0 ? 1.25 : 0.8); }, { passive: false });
            ruler.addEventListener("dblclick", (e) => { if (handleAt(e.offsetX)) { range = null; redraw(); if (playing) play(); } });

            // ---- life cycle -----------------------------------------------------------------------------------------
            new ResizeObserver(() => redraw()).observe(sc);
            const onExec = node.onExecuted;
            node.onExecuted = function (msg) {
                const rr = onExec?.apply(this, arguments);
                const m = msg?.wx_mix?.[0];
                if (m) hint.textContent = String(m.info || "").split("\n")[0] + "  ·  " + HINT;
                return rr;
            };
            const onConf = node.onConfigure;
            node.onConfigure = function () {
                const rr = onConf?.apply(this, arguments);
                setTimeout(() => {
                    load();
                    for (const [i, x] of [[iDur, S.duration], [iBpm, S.bpm], [iBeat, S.beat]]) i.value = x || "";
                    cScene.classList.toggle("on", S.snapScene); cBeat.classList.toggle("on", S.snapBeat);
                    fillPickers(); build(); ready = true; syncVideoTrack();
                }, 0);
                configured = true;
                return rr;
            };
            const onRm = node.onRemoved;
            // ---- full screen: the root leaves the node for a layer over the whole window, then the browser's full screen;
            // back on the node where it was. The layer takes the keyboard (a key there never reaches the graph: Delete
            // would remove the node behind it).
            async function enterFS() {
                if (fs) return;
                const layer = el("div", "position:fixed;inset:0;z-index:100000;background:#141414;padding:10px;display:flex;outline:none");
                layer.className = "wx"; layer.tabIndex = -1;
                layer.addEventListener("keydown", (e) => e.stopPropagation());
                layer.addEventListener("pointerdown", (e) => { if (!typing(e)) layer.focus({ preventScroll: true }); });
                fs = { layer, parent: root.parentNode, next: root.nextSibling, css: root.style.cssText, full: false };
                document.body.append(layer); layer.append(root);
                root.style.width = "100%"; root.style.height = "100%";
                bFull.textContent = "🗗"; place(); layer.focus({ preventScroll: true });
                window.addEventListener("resize", place);
                try { await layer.requestFullscreen(); if (fs) fs.full = true; } catch { /* refused: the layer still covers the window */ }
                redraw();
            }
            function exitFS() {
                if (!fs) return;
                const f = fs; fs = null;
                if (document.fullscreenElement === f.layer) document.exitFullscreen().catch(() => { });
                if (f.parent) f.parent.insertBefore(root, f.next && f.next.parentNode === f.parent ? f.next : null);
                root.style.cssText = f.css; f.layer.remove();
                window.removeEventListener("resize", place);
                bFull.textContent = "⛶"; place(); fit(); redraw();
            }
            const onFsChange = () => { if (fs && fs.full && document.fullscreenElement !== fs.layer) exitFS(); };   // Esc of the browser
            document.addEventListener("fullscreenchange", onFsChange);
            // the shortcuts, while the node is in hand (and the keyboard is not in a box of text): space = play / pause (the
            // canvas would take it to pan, so it is kept from it), F = full screen (Esc out too), arrows (below)
            // the node is "in hand" when selected, when the keyboard is on something of it (a menu just used), or full screen
            const selected = () => !!(fs || app.canvas?.selected_nodes?.[node.id] || app.canvas?.selectedItems?.has?.(node) || root.contains(document.activeElement));
            // a box of text keeps its keys (a space in a name, the arrows in a number); a menu does not
            const typing = (e) => { const t = e.target; return !!t && (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "INPUT"); };
            // left / right: back / forward, silent; a tap = one frame, held = 2 s per second, after 1.5 s 6 s per second; the
            // play goes on from there when the key is let go, if it was playing. Up: back to the start.
            let shuttle = null;
            const startShuttle = (dir) => {
                if (shuttle) { shuttle.dir = dir; return; }
                const was = playing;
                if (playing) pause();
                const t0 = performance.now();
                shuttle = { dir, was, t0, last: t0, raf: 0 };
                seek(pos + dir / vfps);
                const step = (now) => {
                    if (!shuttle) return;
                    const held = now - shuttle.t0, dt = (now - shuttle.last) / 1000;
                    shuttle.last = now;
                    if (held > 250) seek(pos + shuttle.dir * (held > 1500 ? 6 : 2) * dt);
                    shuttle.raf = requestAnimationFrame(step);
                };
                shuttle.raf = requestAnimationFrame(step);
            };
            const endShuttle = () => { if (!shuttle) return; cancelAnimationFrame(shuttle.raf); const was = shuttle.was; shuttle = null; if (was) play(false); };
            const KEYS = ["Space", "KeyF", "ArrowLeft", "ArrowRight", "ArrowUp"];
            const restore = (j) => {
                S = normal(JSON.parse(j));
                S.dur_eff = Math.round(dur() * 1000) / 1000;
                wState.value = JSON.stringify(S);
                checkState();
                for (const [i, x] of [[iDur, S.duration], [iBpm, S.bpm], [iBeat, S.beat]]) i.value = x || "";
                cScene.classList.toggle("on", S.snapScene); cBeat.classList.toggle("on", S.snapBeat);
                setVideo(); build(); fillPickers();
                if (playing) play();
            };
            // the frontend hears Ctrl+Z before the mixer (its listener on the window came first) and takes its step back a
            // frame later, reloading the whole graph: the node went black and the full screen closed. Its undo is told to
            // let go of a key the mixer has taken (the mark __wxMixer on the event).
            const guardUndo = () => {
                const ct = (app.extensionManager?.workflow?.activeWorkflow ?? app.workflowManager?.activeWorkflow)?.changeTracker;
                const P = ct && Object.getPrototypeOf(ct);
                if (!P || P.__wxGuard || typeof P.undoRedo !== "function") return;
                const orig = P.undoRedo;
                P.undoRedo = async function (e, ...rest) { return e?.__wxMixer ? true : orig.call(this, e, ...rest); };
                P.__wxGuard = true;
            };
            const undo = () => { if (hi > 0) { hi--; restore(hist[hi]); hint.textContent = "undo"; } };
            const redo = () => { if (hi < hist.length - 1) { hi++; restore(hist[hi]); hint.textContent = "redo"; } };
            const onKey = (e) => {
                const k = e.code;
                // Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z): the mixer's own undo / redo, kept from the frontend's
                if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === "KeyZ" || k === "KeyY") && !typing(e) && node.graph && selected()) {
                    e.preventDefault(); e.stopImmediatePropagation();
                    guardUndo(); e.__wxMixer = true;
                    if (e.type === "keydown" && !e.repeat) (k === "KeyY" || e.shiftKey) ? redo() : undo();
                    return;
                }
                // Ctrl+S full screen: the layer keeps the keys from the frontend, so the browser would save the page; the
                // workflow is saved here instead (a workflow never saved asks its name: the full screen closes first, or
                // the box would open behind it)
                if (fs && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && k === "KeyS") {
                    e.preventDefault(); e.stopImmediatePropagation();
                    if (e.type !== "keydown" || e.repeat) return;
                    const wf = app.extensionManager?.workflow?.activeWorkflow;
                    if (!wf || wf.isTemporary) exitFS();
                    app.extensionManager?.command?.execute?.("Comfy.SaveWorkflow");
                    hint.textContent = "workflow saved";
                    return;
                }
                if (!(KEYS.includes(k) || (k === "Escape" && (fs || helpOpen()))) || e.ctrlKey || e.altKey || e.metaKey || typing(e) || !node.graph || !selected()) return;
                e.preventDefault(); e.stopImmediatePropagation();
                if (e.type === "keyup") { if (k === "ArrowLeft" || k === "ArrowRight") endShuttle(); return; }
                if (e.repeat) return;
                if (k === "Space") playing ? pause() : play(false);
                else if (k === "KeyF") fs ? exitFS() : enterFS();
                else if (k === "ArrowLeft") startShuttle(-1);
                else if (k === "ArrowRight") startShuttle(1);
                else if (k === "ArrowUp") seek(0);
                else if (helpOpen()) showHelp(false);   // Esc: the card first, then the full screen
                else exitFS();
            };
            window.addEventListener("keydown", onKey, true);
            window.addEventListener("keyup", onKey, true);
            node.onRemoved = function () { pause(); exitFS(); document.removeEventListener("fullscreenchange", onFsChange); window.removeEventListener("keydown", onKey, true); window.removeEventListener("keyup", onKey, true); return onRm?.apply(this, arguments); };
            let lastMarks = "";
            const t = setInterval(() => {   // the scene cuts follow the Foley timeline while you edit it
                if (!node.graph) return clearInterval(t);
                const k = JSON.stringify(sceneMarks(node.graph));
                if (k !== lastMarks) { lastMarks = k; redraw(); }
            }, 1000);
            fillPickers(); build();
            if (node.size[0] < 700) node.setSize([790, node.size[1]]);   // a new node starts wide; a loaded one gets its saved size next
            fit();
            setTimeout(() => { if (!configured) ready = true; }, 0);   // a new node (a loaded one is ready once its tracks are read)
            return r;
        };
    },
});
