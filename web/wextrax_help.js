// WextraUI — "?" help button on every WextraUI node (canvas nodes and Vue nodes).
// Click it: a popup shows web/docs/<node type>.md (served at /extensions/WextraUI/docs/), falling back to the
// node DESCRIPTION. Written from scratch for WextraUI (Apache-2.0); the idea is the one KJNodes users know.
// Also here, for every WextraUI node: the default width and the colours of a new node (web/colors.json), and the
// hover tooltip of the frontend switched off while the mouse is over one of ours (the ? has it all).
import { app } from "../../scripts/app.js";

const CATEGORY = "WextraUI";
const WIDTHS = { saveWimage: 210, h3PromptComposer: 400, h3SimplePrompt: 400, h3Scene: 220, h3CollectScenes: 220, h3LoopRange: 210, h3SceneConditioning: 270,
                 h3HandoffTail: 200, wxRoute: 210, wxRouteIndex: 210, wxRunDiff: 210, wxLoraLoaderTrigger: 380, wxCheckpointLoader: 300, wxSampler: 260, wxScheduler: 260, wxFrame: 210 };
const DOCS = new URL("./docs/", import.meta.url).pathname;  // /extensions/<folder>/docs/, whatever the folder is called
const ICON = 16, MARGIN = 6;
const popups = new Map();   // node id -> popup element
// Colours of a NEW node, per type, from web/colors.json: { "wxSampler": { "color": "#223", "bgcolor": "#335" } } (color =
// title bar, bgcolor = body), or a LiteGraph palette name as a string ("blue"). A node loaded from a file keeps what the
// file says. The file is read once; a missing or broken file = no colours.
const COLORS_URL = new URL("./colors.json", import.meta.url).href;
let COLORS = {};
fetch(COLORS_URL, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).then((j) => { COLORS = j && typeof j === "object" ? j : {}; }).catch(() => {});
// A colour in the file: "#335" / "#1a2b3c", "0,80,159" (rgb), or a palette name — LiteGraph's (red, brown, green, blue,
// pale_blue, cyan, purple, yellow, black), a few of ours (dark green) and the Italian ones; "normal grey" / "grey" /
// "" = the default. A palette name in `color` with `bgcolor` empty paints both from the palette.
const ALIAS = { viola: "purple", giallo: "yellow", rosso: "red", verde: "green", blu: "blue", marrone: "brown", nero: "black",
                azzurro: "pale_blue", "light blue": "pale_blue", ciano: "cyan" };
const EXTRA = { "dark green": { color: "#1a2a1a", bgcolor: "#243324" }, "verde scuro": { color: "#1a2a1a", bgcolor: "#243324" } };
const NONE = new Set(["", "normal grey", "normal gray", "grey", "gray", "none", "default", "no color", "nessuno"]);
function palette(name) {
    const k = ALIAS[name] || name;
    return EXTRA[k] || (LiteGraph.LGraphCanvas || globalThis.LGraphCanvas)?.node_colors?.[k] || null;
}
function shade(v, part) {   // one field of the file -> a CSS colour, or null
    if (typeof v !== "string") return null;
    const s = v.trim().toLowerCase();
    if (NONE.has(s)) return null;
    if (/^#[0-9a-f]{3,8}$/.test(s)) return s;
    const rgb = /^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/.exec(s);
    if (rgb) return `rgb(${rgb[1]},${rgb[2]},${rgb[3]})`;
    return palette(s)?.[part] || null;
}
function paint(node, type) {
    let c = COLORS[type];
    if (typeof c === "string") c = { color: c, bgcolor: c };
    if (!c || typeof c !== "object") return;
    const color = shade(c.color, "color"), bg = shade(c.bgcolor, "bgcolor") || (c.bgcolor ? null : shade(c.color, "bgcolor"));
    if (color) node.color = color;
    if (bg) node.bgcolor = bg;
}
const mdCache = new Map();  // node type -> html

function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// Tiny markdown -> html: headings, bullets, bold, italics, inline code, paragraphs. Enough for the docs pages.
function mdToHtml(md) {
    const inline = (t) => esc(t)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
        .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<i>$2</i>");
    const out = []; let list = false, para = [];
    const flush = () => { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } };
    const endList = () => { if (list) { out.push("</ul>"); list = false; } };
    for (const raw of md.split(/\r?\n/)) {
        const line = raw.trimEnd();
        const h = /^(#{1,3})\s+(.*)$/.exec(line);
        const b = /^\s*[-*]\s+(.*)$/.exec(line);
        if (h) { flush(); endList(); out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); }
        else if (b) { flush(); if (!list) { out.push("<ul>"); list = true; } out.push("<li>" + inline(b[1]) + "</li>"); }
        else if (!line.trim()) { flush(); endList(); }
        else { endList(); para.push(line); }
    }
    flush(); endList();
    return out.join("\n");
}

async function helpHtml(node) {
    const type = node.type;
    if (mdCache.has(type)) return mdCache.get(type);
    let html = null;
    try {
        const r = await fetch(DOCS + encodeURIComponent(type) + ".md", { cache: "no-cache" });
        if (r.ok) html = mdToHtml(await r.text());
    } catch (e) { /* no docs page: fall back to the description */ }
    if (!html) html = "<p>" + esc(node._wxHelp || "No help available.") + "</p>";
    mdCache.set(type, html);
    return html;
}

function ensureStyle() {
    if (document.getElementById("wx-help-style")) return;
    const st = document.createElement("style"); st.id = "wx-help-style";
    st.textContent = `
      .wx-help-popup { position: fixed; z-index: 10000; width: 460px; max-width: 45vw; max-height: 70vh; overflow: auto;
        background: #1e1e1e; color: #ddd; border: 1px solid #1464b3; border-radius: 8px; padding: 12px 14px 12px 14px;
        font: 13px/1.45 sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
      .wx-help-popup h2 { margin: 0 24px 8px 0; font-size: 15px; color: #1464b3; }
      .wx-help-popup h3 { margin: 12px 0 4px; font-size: 11px; font-weight: 600; color: #1464b3; text-transform: uppercase; letter-spacing: .04em; }
      .wx-help-popup p { margin: 6px 0; } .wx-help-popup ul { margin: 4px 0 4px 18px; padding: 0; }
      .wx-help-popup li { margin: 3px 0; }
      .wx-help-popup code { background: #333; padding: 0 4px; border-radius: 3px; font-size: 12px; color: #a8cdf5; }
      .wx-help-close { position: absolute; top: 6px; right: 10px; cursor: pointer; color: #aaa; font-size: 16px; }
      .wx-help-close:hover { color: #fff; }
      .wx-help-btn { color: #1464b3; font-weight: bold; font-size: 14px; cursor: pointer; flex-shrink: 0; padding: 0 5px;
        line-height: 1; user-select: none; }
      .wx-help-btn:hover { color: #fff; }
      body.wx-no-tip .node-tooltip { display: none !important; }`;
    document.head.appendChild(st);
}

function closePopup(id) {
    const el = popups.get(id);
    if (el) { el.remove(); popups.delete(id); }
}

async function togglePopup(node, clientX, clientY) {
    if (popups.has(node.id)) { closePopup(node.id); return; }
    ensureStyle();
    const el = document.createElement("div");
    el.className = "wx-help-popup";
    el.innerHTML = `<span class="wx-help-close" title="Close">✕</span><p>Loading…</p>`;
    el.querySelector(".wx-help-close").onclick = () => closePopup(node.id);
    el.addEventListener("wheel", (e) => e.stopPropagation());
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    document.body.appendChild(el);
    popups.set(node.id, el);
    const x = Math.min(clientX + 14, window.innerWidth - 480), y = Math.min(clientY, window.innerHeight - 40);
    el.style.left = Math.max(8, x) + "px"; el.style.top = Math.max(8, y) + "px";
    const html = await helpHtml(node);
    if (popups.get(node.id) === el) el.innerHTML = `<span class="wx-help-close" title="Close">✕</span>` + html,
        el.querySelector(".wx-help-close").onclick = () => closePopup(node.id);
    const clamp = () => { const r = el.getBoundingClientRect(); if (r.bottom > window.innerHeight - 8) el.style.top = Math.max(8, window.innerHeight - 8 - r.height) + "px"; };
    clamp();
}

// ---- Vue nodes: inject a "?" span in the node header --------------------------------------------------------------
function injectVue(header) {
    if (header.querySelector(".wx-help-btn")) return;
    const nodeEl = header.closest("[data-node-id]"); if (!nodeEl) return;
    const node = app.graph?.getNodeById?.(nodeEl.dataset.nodeId); if (!node || !node._wxHelp) return;
    const box = header.querySelector(":scope > div") || header;
    const btn = document.createElement("span");
    btn.className = "wx-help-btn"; btn.textContent = "?"; btn.title = "WextraUI help";
    btn.addEventListener("pointerdown", (e) => e.stopPropagation());
    btn.addEventListener("click", (e) => { e.stopPropagation(); togglePopup(node, e.clientX, e.clientY); });
    box.appendChild(btn);
}

app.registerExtension({
    name: "WextraUI.help",
    setup() {
        // The frontend shows a tooltip when the mouse rests on a node (title = DESCRIPTION, inputs and widgets = their
        // tooltip). Over a WextraUI node it is off: the ? has it all, and the popup got in the way (Sick, 24/09/2026).
        // The text comes from the frontend's own store of node definitions, filled before beforeRegisterNodeDef, so it
        // cannot be stripped from here: the tooltip element is hidden while the node under the mouse is one of ours.
        ensureStyle();
        let was = false;
        window.addEventListener("mousemove", () => {
            const ours = !!app.canvas?.node_over?._wxHelp;
            if (ours !== was) { was = ours; document.body.classList.toggle("wx-no-tip", ours); }
        }, { passive: true });
        // Nodes 2.0: the node is DOM, the ? goes in its header (watched: nodes come and go)
        let pending = false;
        const scan = () => document.querySelectorAll(".lg-node-header:not(:has(.wx-help-btn))").forEach(injectVue);
        new MutationObserver(() => {
            if (pending) return; pending = true;
            requestAnimationFrame(() => { pending = false; scan(); });
        }).observe(document.body, { childList: true, subtree: true });
        scan();
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.category !== CATEGORY) return;
        const desc = nodeData.description || "";
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            this._wxHelp = desc || nodeData.display_name || nodeData.name;
            // Default width (Sick's reference scene, 04/09/2026) and colours (web/colors.json) per node. The width only
            // for a NEW node (a workflow being loaded runs onConfigure right after this, and its saved size wins); the
            // colours also for a loaded node that has none — a node coloured by hand keeps what the file says.
            const w = WIDTHS[nodeData.name];
            setTimeout(() => {
                if (!this.graph) return;
                if (!this.color && !this.bgcolor) paint(this, nodeData.name);
                if (w && !this._wxConfigured) this.setSize([w, this.computeSize()[1]]);
                this.setDirtyCanvas(true, true);
            }, 0);
            return r;
        };
        const onConfigured = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () { this._wxConfigured = true; return onConfigured?.apply(this, arguments); };
        // legacy canvas rendering: "?" in the title bar, right side
        const drawFg = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            const r = drawFg?.apply(this, arguments);
            if (this.flags?.collapsed) return r;
            const x = this.size[0] - ICON - MARGIN, y = -LiteGraph.NODE_TITLE_HEIGHT / 2 - ICON / 2;
            ctx.save();
            ctx.fillStyle = "#1464b3"; ctx.beginPath(); ctx.arc(x + ICON / 2, y + ICON / 2, ICON / 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#ffffff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("?", x + ICON / 2, y + ICON / 2 + 0.5);
            ctx.restore();
            return r;
        };
        const onDown = nodeType.prototype.onMouseDown;
        nodeType.prototype.onMouseDown = function (e, pos) {
            if (!this.flags?.collapsed && pos && pos[1] < 0 && pos[1] > -LiteGraph.NODE_TITLE_HEIGHT
                && pos[0] > this.size[0] - ICON - MARGIN * 2) {
                togglePopup(this, e.clientX ?? 200, e.clientY ?? 200);
                return true;
            }
            return onDown?.apply(this, arguments);
        };
        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () { closePopup(this.id); return onRemoved?.apply(this, arguments); };
    },
});
