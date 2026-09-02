// WextraX — "?" help button on every WextraX node (canvas nodes and Vue nodes).
// Click it: a popup shows web/docs/<node type>.md (served at /extensions/WextraX/docs/), falling back to the
// node DESCRIPTION. Written from scratch for WextraX (Apache-2.0); the idea is the one KJNodes users know.
import { app } from "../../scripts/app.js";

const CATEGORY = "WextraX";
const DOCS = "/extensions/WextraX/docs/";
const ICON = 16, MARGIN = 6;
const popups = new Map();   // node id -> popup element
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
        background: #1e1e1e; color: #ddd; border: 1px solid #e59a1b; border-radius: 8px; padding: 12px 14px 12px 14px;
        font: 13px/1.45 sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
      .wx-help-popup h2 { margin: 0 24px 8px 0; font-size: 15px; color: #f0b13a; }
      .wx-help-popup h3 { margin: 12px 0 4px; font-size: 13px; color: #f0b13a; }
      .wx-help-popup p { margin: 6px 0; } .wx-help-popup ul { margin: 4px 0 4px 18px; padding: 0; }
      .wx-help-popup li { margin: 3px 0; }
      .wx-help-popup code { background: #333; padding: 0 4px; border-radius: 3px; font-size: 12px; color: #ffd27a; }
      .wx-help-close { position: absolute; top: 6px; right: 10px; cursor: pointer; color: #aaa; font-size: 16px; }
      .wx-help-close:hover { color: #fff; }
      .wx-help-btn { color: #f0b13a; font-weight: bold; font-size: 14px; cursor: pointer; flex-shrink: 0; padding: 0 5px;
        line-height: 1; user-select: none; }
      .wx-help-btn:hover { color: #fff; }`;
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
    btn.className = "wx-help-btn"; btn.textContent = "?"; btn.title = "WextraX help";
    btn.addEventListener("pointerdown", (e) => e.stopPropagation());
    btn.addEventListener("click", (e) => { e.stopPropagation(); togglePopup(node, e.clientX, e.clientY); });
    box.appendChild(btn);
}

app.registerExtension({
    name: "WextraX.help",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.category !== CATEGORY) return;
        const desc = nodeData.description || "";
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            this._wxHelp = desc || nodeData.display_name || nodeData.name;
            return r;
        };
        // legacy canvas rendering: "?" in the title bar, right side
        const drawFg = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            const r = drawFg?.apply(this, arguments);
            if (this.flags?.collapsed) return r;
            const x = this.size[0] - ICON - MARGIN, y = -LiteGraph.NODE_TITLE_HEIGHT / 2 - ICON / 2;
            ctx.save();
            ctx.fillStyle = "#f0b13a"; ctx.beginPath(); ctx.arc(x + ICON / 2, y + ICON / 2, ICON / 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#1e1e1e"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
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
    setup() {
        // Vue nodes mode: watch for node headers and add the button
        let pending = false;
        const scan = () => document.querySelectorAll(".lg-node-header:not(:has(.wx-help-btn))").forEach(injectVue);
        new MutationObserver(() => {
            if (pending) return; pending = true;
            requestAnimationFrame(() => { pending = false; scan(); });
        }).observe(document.body, { childList: true, subtree: true });
        scan();
    },
});
