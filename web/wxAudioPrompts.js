// WAudio Prompts. Restyle C (Sick 02/11, mockup WAudioPrompts): one row per scene instead of two boxes of `time | prompt`.
// The three text widgets of the schema stay, hidden: their strings are what the file and the backend read, the rows read
// and write them. A row is a scene of the `prompts` box, from the `# k · a-b s` comments the backend writes above its lines,
// and shows the text that will go out: the line of `custom` when the scene has one, else the model's. `mine?` copies the
// model's text into `custom` to start from there; a click on `mine` takes that line away and the row is the model's again,
// and so does a line of yours left empty. Typing writes the right line of the right box, its `+` and its seed kept; an
// empty line of the model's is written again at the Run, as ever. `text` opens the two boxes, to paste or to write what
// has no row yet (the scenes are known after the Run). `context` is a box with its name too, so it reads whole.
// wxSceneBoxes.js still fills `prompts` after a Run and fits the sheet.
import { app } from "../../scripts/app.js";
import { wxCompactWidgets, wxHideWidget, wxOnRedraw } from "./wxStyle.js";
import { upstreamInt, upstreamValue } from "./wxReso.js";
import { frameOf } from "./wxTimes.js";

const SCENE = /^#\s*(\d+)\s*·\s*([\d.]+)-([\d.]+)\s*s(.*)$/;   // the comment of box_text() in src/audioprompts.py
const VUE_W = 240;

const isText = (l) => l && !l.startsWith("#");
/** The line of frame `f` in a box: { at, end (the lines that go on from it), text, seed }; null if there is none. */
function lineOf(lines, f, fps) {
    for (let at = 0; at < lines.length; at++) {
        const l = lines[at].trim();
        if (!isText(l) || !l.includes("|")) continue;
        const parts = l.split("|").map((x) => x.trim());
        if (frameOf(parts[0], fps) !== f) continue;
        let end = at + 1, text = parts[1] || "";
        while (end < lines.length && isText(lines[end].trim()) && !lines[end].includes("|")) text = `${text} ${lines[end++].trim()}`.trim();
        return { at, end, text, seed: parts[2] || "" };
    }
    return null;
}
/** A box -> the frames of its lines (read_box in src/audioprompts.py; a line that is not a time is for the Run to say). */
function framesOf(text, fps) {
    const out = [];
    for (const raw of String(text || "").split("\n")) {
        const l = raw.trim();
        if (!isText(l) || !l.includes("|")) continue;
        const f = frameOf(l.split("|")[0], fps);
        if (f != null) out.push(f);
    }
    return out;
}
/** The scenes the `prompts` box knows of. */
function scenesOf(text, fps) {
    const out = [];
    for (const raw of String(text || "").split("\n")) {
        const m = SCENE.exec(raw.trim());
        if (m) out.push({ k: Number(m[1]), a: m[2], b: m[3], f: frameOf(m[2], fps), beat: m[4].includes("same shot") });
    }
    return out;
}

function ensureStyle() {
    if (document.getElementById("wx-ap-style")) return;
    const st = document.createElement("style"); st.id = "wx-ap-style";
    st.textContent = `
      .wx-ap { --ink: var(--input-text, #ddd); --quiet: color-mix(in srgb, var(--ink) 62%, transparent); --faint: color-mix(in srgb, var(--ink) 40%, transparent);
        --line: color-mix(in srgb, var(--ink) 18%, transparent); --well: rgba(0,0,0,.26); --lt: #a8cdf5; --acc: #1464b3; --dp: #00509f;
        box-sizing: border-box; width: 100%; padding: 0 10px; color: var(--ink); font: 11.5px/15px "Segoe UI", system-ui, sans-serif; user-select: none; }
      .wx-ap * { box-sizing: border-box; }
      .wx-ap.vue { --ink: var(--component-node-foreground, #ddd); padding: 0; }
      .wx-ap button, .wx-ap textarea { margin: 0; border: 0; padding: 0; background: none; color: inherit; font: inherit; }
      .wx-ap button { cursor: pointer; }
      .wx-ap button:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
      .wx-ap textarea { display: block; width: 100%; resize: none; overflow: hidden; outline: none; user-select: text; font-variant-numeric: tabular-nums; }
      .wx-ap textarea::placeholder { color: var(--faint); }
      .wx-ap .tbox { padding-top: 8px; }
      .wx-ap .tbox + .tbox { padding-top: 10px; }
      .wx-ap .th { display: flex; align-items: baseline; gap: 6px; height: 16px; font: 11px/16px "Segoe UI", system-ui, sans-serif; color: var(--quiet); white-space: nowrap; }
      .wx-ap .th b { font-weight: 600; color: var(--ink); }
      .wx-ap .th .mk { width: 7px; height: 7px; border-radius: 50%; background: var(--lt); align-self: center; }
      .wx-ap .sw { margin-left: auto; display: inline-flex; gap: 2px; }
      .wx-ap .sw button { padding: 0 6px; height: 16px; border-radius: 8px; color: var(--faint); }
      .wx-ap .sw button.on { background: var(--well); color: var(--ink); }
      .wx-ap .ta { margin-top: 3px; min-height: 34px; padding: 5px 7px; border-radius: 6px; background: var(--well); }
      .wx-ap .ta.ctx { min-height: 0; }
      .wx-ap .ta:focus { box-shadow: inset 0 0 0 1px var(--acc); }
      .wx-ap .ta[readonly] { font-style: italic; color: var(--quiet); }
      .wx-ap .scl { margin-top: 3px; display: flex; flex-direction: column; gap: 3px; }
      .wx-ap .sc { padding: 4px 7px 5px 9px; border-radius: 6px; background: var(--well); }
      .wx-ap .sc.mine { box-shadow: inset 3px 0 0 var(--lt); }
      .wx-ap .sc .hd { display: flex; align-items: center; gap: 6px; height: 16px; font: 10.5px/16px "Segoe UI", system-ui, sans-serif; color: var(--faint); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .wx-ap .sc .k { color: var(--quiet); }
      .wx-ap .sc .bt { color: var(--lt); }
      .wx-ap .mn { margin-left: auto; height: 15px; padding: 0 7px; border-radius: 8px; font-size: 10.5px; line-height: 15px; color: var(--faint); box-shadow: inset 0 0 0 1px var(--line); }
      .wx-ap .mn:hover { color: var(--ink); box-shadow: inset 0 0 0 1px var(--acc); }
      .wx-ap .sc.mine .mn { background: var(--dp); color: #eaf3fd; box-shadow: none; }
      .wx-ap .tx { min-height: 15px; }
      .wx-ap .tx:focus { box-shadow: 0 1px 0 var(--acc); }
      .wx-ap .tx[readonly] { font-style: italic; color: var(--quiet); }
      .wx-ap .empty, .wx-ap .note { padding: 6px 8px; border-radius: 6px; background: var(--well); font: 11px/15px "Segoe UI", system-ui, sans-serif; color: var(--quiet); }
      .wx-ap .empty b { font-weight: 600; color: var(--ink); }
      .wx-ap .note { color: #f0a070; }
      .wx-ap .foot { height: 4px; }
      .wx-ap.vue .ta, .wx-ap.vue .sc, .wx-ap.vue .empty, .wx-ap.vue .note { border-radius: 8px; }
      @media (prefers-reduced-motion: no-preference) { .wx-ap .sc { transition: box-shadow .12s; } }`;
    document.head.appendChild(st);
}

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const fit = (ta) => { ta.style.height = "0px"; ta.style.height = ta.scrollHeight + "px"; };

app.registerExtension({
    name: "wextraui.audioprompts",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxAudioPrompts") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            const W = (name) => (node.widgets || []).find((w) => w.name === name);
            const wCtx = W("context"), wP = W("prompts"), wC = W("custom");
            if (!wCtx || !wP || !wC) return r;
            ensureStyle();
            for (const w of [wCtx, wP, wC]) wxHideWidget(w, node);
            if (W("frames_per_scene")) W("frames_per_scene").label = "scene frames";

            const wired = (w) => (node.inputs || []).find((i) => i.widget?.name === w.name)?.link != null;   // a cable saved on the box before it became rows
            const read = (w) => (wired(w) ? String(upstreamValue(node, w.name) ?? "") : String(w.value ?? ""));
            const fps = () => (wired(W("fps")) ? upstreamInt(node, "fps", true) : Number(W("fps")?.value)) || 24;
            const put = (w, v) => { w.value = v; w.callback?.(v); sig = stamp(); node.setDirtyCanvas(true, true); };

            // one line of a box written again, added, or taken away (text null); its `+` and its seed stay
            const setLine = (w, s, text) => {
                const lines = w.value ? String(w.value).split("\n") : [], at = lineOf(lines, s.f, fps());
                const clean = text == null ? null : text.replace(/\s*\n\s*/g, " ").replace(/\|/g, ",");
                if (clean == null) { if (at) lines.splice(at.at, at.end - at.at); }
                else if (at) lines.splice(at.at, at.end - at.at, `${lines[at.at].split("|")[0].trim()} | ${clean}${at.seed ? ` | ${at.seed}` : ""}`);
                else if (w === wP) {
                    const c = lines.findIndex((l) => { const m = SCENE.exec(l.trim()); return m && frameOf(m[2], fps()) === s.f; });
                    lines.splice(c >= 0 ? c + 1 : lines.length, 0, `${s.beat ? "+" : ""}${s.a} | ${clean}`);
                } else lines.push(`${s.a} | ${clean}`);
                put(w, lines.join("\n").replace(/^\n+/, ""));
            };

            const root = mk("div", "wx-ap"), inner = mk("div");
            root.append(inner);
            root.addEventListener("pointerdown", (e) => e.stopPropagation());
            root.addEventListener("keydown", (e) => { if (!(e.ctrlKey && e.key === "Enter")) e.stopPropagation(); });   // Ctrl+Enter stays the Run

            const widget = node.addDOMWidget("wx_scenes", "custom", root, { serialize: false, hideOnZoom: false, margin: 0, getValue: () => undefined, setValue: () => {} });
            widget.serialize = false;   // the rows mirror the three boxes: no slot of their own in widgets_values
            wxCompactWidgets(node);

            const head = (name, say, mark) => {
                const th = mk("div", "th");
                th.append(mk("b", "", name));
                if (mark) th.append(mk("span", "mk"));
                th.append(mk("span", "", say));
                return th;
            };
            const box = (w, name, say, ph, mark, cls = "") => {
                const el = mk("div", "tbox"), ta = mk("textarea", `ta ${cls}`);
                ta.value = read(w); ta.placeholder = wired(w) ? "on a cable" : ph; ta.readOnly = wired(w); ta.spellcheck = false; ta.rows = 1;
                ta.title = w.options?.tooltip || "";
                ta.addEventListener("input", () => { put(w, ta.value); fit(ta); unfit = true; });
                ta.addEventListener("change", () => node.graph?.change?.());
                el.append(head(name, wired(w) ? "on a cable" : say, mark), ta);
                return el;
            };
            const row = (s, model, hand, canMine) => {
                const mine = !!hand, line = hand || model, el = mk("div", `sc${mine ? " mine" : ""}`), hd = mk("div", "hd"), ta = mk("textarea", "tx");
                const w = mine ? wC : wP, btn = mk("button", "mn", mine ? "mine" : "mine?");
                hd.append(mk("span", "k", String(s.k)));
                if (s.beat) { const b = mk("span", "bt", "+"); b.title = "The same shot goes on: a beat"; hd.append(b); }
                hd.append(mk("span", "", `${s.a}–${s.b} s`));
                if (line?.seed) hd.append(mk("span", "", `· seed ${line.seed}`));
                btn.title = mine ? "Back to the model's text" : "Write this scene yourself: the model skips it";
                btn.disabled = !canMine;
                btn.onclick = () => { setLine(wC, s, mine ? null : ta.value); paint(true); };   // what the row reads now, typed in or not
                hd.append(btn);
                ta.value = line?.text || ""; ta.rows = 1; ta.spellcheck = false; ta.readOnly = wired(w);
                ta.placeholder = mine ? "your prompt" : "empty: written again at the Run";
                ta.addEventListener("input", () => { setLine(w, s, ta.value); fit(ta); unfit = true; });
                ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.ctrlKey) { e.preventDefault(); ta.blur(); } });
                ta.addEventListener("change", () => node.graph?.change?.());
                ta.addEventListener("blur", () => { if (mine && !ta.value.trim()) { setLine(wC, s, null); paint(true); } });   // an empty line of yours: the scene goes back to the model
                el.append(hd, ta);
                return el;
            };
            const scenes = () => {
                const f = fps(), pText = read(wP), cText = read(wC), list = scenesOf(pText, f), pl = pText.split("\n"), cl = cText.split("\n");
                const el = mk("div", "tbox"), th = head("scenes", list.length ? `${list.length}, after the Run` : "after the Run"), sw = mk("span", "sw");
                for (const v of ["rows", "text"]) {
                    const b = mk("button", v === view ? "on" : "", v);
                    b.onclick = () => { view = v; paint(true); };
                    sw.append(b);
                }
                th.append(sw); el.append(th);
                if (view === "text") return [el, box(wP, "prompts", "the model's, after the Run", "One line per scene, time | prompt. Empty a line: it is written again."),
                                             box(wC, "custom", "yours: they win", "time | prompt: the model skips these scenes.", true)];
                const scl = mk("div", "scl"), mineFrames = framesOf(cText, f);
                if (!list.length) {
                    const e = mk("div", "empty"), n = mineFrames.length, typed = framesOf(pText, f).length;
                    e.append(mk("b", "", "No scenes yet."), " After the Run, one row per scene: the model's text, or yours.");
                    if (n) e.append(` ${n} line${n > 1 ? "s" : ""} of yours wait${n > 1 ? "" : "s"} for it.`);
                    if (typed) e.append(` ${typed} line${typed > 1 ? "s" : ""} in the prompts box too.`);
                    scl.append(e);
                } else {
                    scl.append(...list.map((s) => row(s, lineOf(pl, s.f, f), lineOf(cl, s.f, f), !wired(wC))));
                    const at = new Set(list.map((s) => s.f)), lost = mineFrames.filter((x) => !at.has(x)).length;
                    if (lost) { const e = mk("div", "note", `${lost} line${lost > 1 ? "s" : ""} of yours start${lost > 1 ? "" : "s"} no scene: not used. See text.`); scl.append(e); }
                }
                el.append(scl);
                return [el];
            };

            let view = "rows", sig = null, unfit = true, H = 90, lastW = 0;
            const stamp = () => [read(wCtx), read(wP), read(wC), view, fps(), wired(wCtx), wired(wP), wired(wC), !!LiteGraph.vueNodesMode].join("\u0001");
            function paint(force) {
                const now = stamp();
                if (!force && (now === sig || root.contains(document.activeElement))) return;   // a row being typed in stays as it is
                sig = now;
                root.classList.toggle("vue", !!LiteGraph.vueNodesMode);
                inner.replaceChildren(box(wCtx, "context", "for every scene", "A few words about the whole video.", false, "ctx"), ...scenes(), mk("div", "foot"));
                inner.querySelectorAll("textarea").forEach(fit);
                unfit = true;
            }

            // The height follows the rows, measured from the DOM, so only when the DOM is there to be read (see WDifference)
            widget.computeSize = (width) => [width, H];
            const measure = () => {
                const wd = root.isConnected && root.offsetHeight ? root.offsetWidth : 0;
                if (wd < 100 || (!unfit && wd === lastW)) return;
                if (wd !== lastW) inner.querySelectorAll("textarea").forEach(fit);   // the lines wrap again at a new width
                unfit = false; lastW = wd;
                const h = inner.offsetHeight;
                if (Math.abs(h - H) < 1) return;
                H = h; node.setSize([node.size[0], node.computeSize()[1]]); node.setDirtyCanvas(true, true);
            };
            node._wxFit = () => { H = -1; unfit = true; sig = null; };   // a load, and back from Nodes 2.0 (wxStyle.js)
            paint(true);
            wxOnRedraw(node, () => {
                if (LiteGraph.vueNodesMode && node.size[0] < VUE_W) node.setSize([VUE_W, node.size[1]]);
                paint(); measure();
            }, 200);
            return r;
        };
        const origConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = origConfigure?.apply(this, arguments);
            this._wxFit?.();
            return r;
        };
    },
});
