import { app } from "../../scripts/app.js";
import { ensureWxStyle, wxAddButton } from "./wxStyle.js";

// WSave Image (frontend 1.49+): parti dinamiche (+ / -) e anteprima live del nome.
// folder / subject / text{i} / value{i} collegati a un link: la preview legge il valore a monte quando il nodo sorgente
// lo tiene in un widget (Primitive, String, Int...), altrimenti mostra {folder} / {subject} / {int}.
// write_batch (interruttore sotto i tasti) aggiunge _B{batch}{index} in coda: i segnaposto li risolve il backend a run.
// image_preview (ultimo): miniature nel nodo dopo il run, off di default.
// Backend (src/saveWimage.py): per ogni parte i = text{i}, type{i}, value{i} (widget di testo il cui
// puntino accetta qualsiasi link: qui il suo slot viene messo a tipo "*").
// Il numero di parti vive nel widget nascosto "parts" (cosi' si salva e si ricarica col workflow).
const MAX_PARTS = 8;

// Meccanismo del frontend 1.49: widget.hidden + widget.options.hidden (vedi setWidgetHidden nel core).
function setHidden(w, hidden) {
    if (!w) return;
    w.hidden = hidden;
    w.options = w.options || {};
    w.options.hidden = hidden;
    if (w.element) w.element.style.display = hidden ? "none" : "";
}
function fmt(v, kind) {
    if (v === undefined || v === null || v === "") return "";
    if (kind === "int") return String(Math.round(Number(v)));
    if (kind === "float") return Number(v).toFixed(2); // due decimali fissi
    if (kind === "bool") return (v === true || String(v).toLowerCase() === "true" || v === 1 || v === "1") ? "true" : "false";
    return String(v);
}

app.registerExtension({
    name: "WextraUI.SaveWimage",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "saveWimage") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const ret = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;
            const W = (name) => node.widgets ? node.widgets.find((w) => w.name === name) : undefined;
            const val = (name, d) => { const w = W(name); return w ? w.value : d; };
            const slot = (name) => (node.inputs || []).find((i) => i.name === name);
            const linked = (name) => { const s = slot(name); return !!(s && s.link != null); };
            // valore a monte di un puntino collegato, se il nodo sorgente lo tiene in un widget (Primitive, String, Int...):
            // altrimenti undefined e la preview mostra un segnaposto {nome}.
            function upstream(name) {
                try {
                    const s = slot(name);
                    if (!s || s.link == null || !node.graph) return undefined;
                    const links = node.graph.links;
                    const link = links instanceof Map ? links.get(s.link) : (node.graph.getLink ? node.graph.getLink(s.link) : links?.[s.link]);
                    if (!link) return undefined;
                    const src = node.graph.getNodeById(link.origin_id);
                    if (!src || !src.widgets || !src.widgets.length) return undefined;
                    const out = (src.outputs || [])[link.origin_slot];
                    const w = src.widgets.find((w) => out?.widget?.name && w.name === out.widget.name)
                        || src.widgets.find((w) => out?.name && w.name === out.name)
                        || (src.widgets.length === 1 ? src.widgets[0] : undefined)
                        || src.widgets.find((w) => w.name === "value");
                    return w ? w.value : undefined;
                } catch (e) { return undefined; }
            }
            // testo di un campo: widget, oppure il valore a monte se collegato, oppure {segnaposto}
            function field(name, holder) {
                if (!linked(name)) return String(val(name, "") || "");
                const u = upstream(name);
                return (u === undefined || u === null) ? "{" + holder + "}" : String(u);
            }

            const preview = W("preview");
            if (preview) {
                setHidden(preview, false);
                preview.options = preview.options || {};
                preview.options.read_only = true;
                if (preview.element) { ensureWxStyle(); preview.element.readOnly = true; preview.element.classList.add("wx-preview"); preview.element.placeholder = "file name"; }
            }
            setHidden(W("parts"), true);

            function count() { return Math.max(0, Math.min(MAX_PARTS, Number(val("parts", 0)) || 0)); }

            // lo slot del widget value{i} accetta qualsiasi tipo; se il frontend lo ha tolto, lo ricrea
            function anySlot(i) {
                const name = "value" + i;
                let s = slot(name);
                if (!s) {
                    node.addInput(name, "*");
                    s = slot(name);
                    if (s) s.widget = { name };
                }
                if (s) s.type = "*";
            }

            function compose() {
                let folder = field("folder", "folder").trim().replace(/\\/g, "/");
                if (folder && !folder.endsWith("/")) folder += "/";
                let name = field("subject", "subject");
                const n = count();
                for (let i = 1; i <= n; i++) {
                    const k = String(val("type" + i, "int"));
                    let v;
                    if (linked("value" + i)) { const u = upstream("value" + i); v = (u === undefined || u === null) ? "{" + k + "}" : fmt(u, k); }
                    else v = fmt(val("value" + i, ""), k);
                    name += field("text" + i, "text") + v;
                }
                if (val("write_batch", true)) name += "_B{batch}{index}";
                return folder + name;
            }
            let lastComposed = null;
            function refresh() {
                lastComposed = compose();
                if (preview) preview.value = lastComposed;
                node.setDirtyCanvas(true, true);
            }
            // Il callback dei widget non scatta sempre (testo a riga singola, Nodes 2.0, valori che cambiano a monte):
            // a ogni ridisegno, e a intervalli, si ricompone il nome e si aggiorna solo se e' cambiato.
            // Dopo un run la preview mostra il nome vero dal backend (onExecuted) finche' un campo non cambia.
            function watch() { if (lastComposed !== null && compose() !== lastComposed) refresh(); }

            function layout() {
                const n = count();
                for (let i = 1; i <= MAX_PARTS; i++) {
                    const on = i <= n;
                    setHidden(W("text" + i), !on);
                    setHidden(W("type" + i), !on);
                    setHidden(W("value" + i), !on);
                    if (on) anySlot(i);
                    else if (linked("value" + i)) {      // parte tolta: stacca il cavo, niente link nel vuoto
                        const idx = node.inputs.findIndex((s) => s.name === "value" + i);
                        if (idx >= 0) node.disconnectInput(idx);
                    }
                }
                refresh();
                node.setSize(node.computeSize());
            }

            function setCount(n) {
                const w = W("parts");
                if (w) w.value = Math.max(0, Math.min(MAX_PARTS, n));
                layout();
            }

            for (const w of node.widgets || []) {
                if (w.name === "preview" || w.name === "parts") continue;
                const orig = w.callback;
                w.callback = function () {
                    const r = orig ? orig.apply(this, arguments) : undefined;
                    refresh();
                    return r;
                };
            }

            wxAddButton(node, "+ Add part", () => setCount(count() + 1));
            wxAddButton(node, "− Remove last part", () => setCount(count() - 1));
            // write_batch sotto i tasti (e' l'ultimo input del backend: spostarlo in coda non cambia l'ordine dei valori salvati)
            for (const nm of ["write_batch", "image_preview"]) {
                const w = W(nm);
                if (w) { const k = node.widgets.indexOf(w); if (k >= 0) { node.widgets.splice(k, 1); node.widgets.push(w); } }
            }

            const onDrawBg = node.onDrawBackground;
            node.onDrawBackground = function () { const r = onDrawBg ? onDrawBg.apply(this, arguments) : undefined; watch(); return r; };
            const onDrawFg = node.onDrawForeground;
            node.onDrawForeground = function () { const r = onDrawFg ? onDrawFg.apply(this, arguments) : undefined; watch(); return r; };
            const timer = setInterval(watch, 400);
            const origRemoved = node.onRemoved;
            node.onRemoved = function () { clearInterval(timer); return origRemoved ? origRemoved.apply(this, arguments) : undefined; };

            const origConn = node.onConnectionsChange;
            node.onConnectionsChange = function () {
                const r = origConn ? origConn.apply(this, arguments) : undefined;
                setTimeout(refresh, 0);
                return r;
            };
            const origConfigure = node.onConfigure;
            node.onConfigure = function () {
                const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                setTimeout(layout, 0);
                return r;
            };
            const origExecuted = node.onExecuted;
            node.onExecuted = function (msg) {
                // Il backend dichiara sempre le immagini (servono a /history e agli automatismi); le miniature nel nodo
                // si spengono qui: il frontend le legge da app.nodeOutputs, che e' lo stesso oggetto di msg.
                if (msg && msg.images && !val("image_preview", false)) { delete msg.images; node.images = undefined; node.imgs = undefined; }
                const r = origExecuted ? origExecuted.apply(this, arguments) : undefined;
                if (msg && msg.preview && preview) { preview.value = String(msg.preview[0]); node.setDirtyCanvas(true, true); }
                return r;
            };

            layout();
            return ret;
        };
    },
});
