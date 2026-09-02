import { app } from "../../scripts/app.js";

// Save Wimage (frontend 1.49+): parti dinamiche (+ / -) e anteprima live del nome.
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
    name: "WextraX.SaveWimage",
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

            const preview = W("preview");
            if (preview) {
                setHidden(preview, false);
                preview.options = preview.options || {};
                preview.options.read_only = true;
                if (preview.element) { preview.element.readOnly = true; preview.element.style.opacity = "0.85"; preview.element.style.fontFamily = "monospace"; }
            }
            setHidden(W("parts"), true);

            function count() { return Math.max(0, Math.min(MAX_PARTS, Number(val("parts", 1)) || 0)); }

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

            function refresh() {
                let folder = String(val("folder", "") || "").trim().replace(/\\/g, "/");
                if (folder && !folder.endsWith("/")) folder += "/";
                let name = String(val("subject", "") || "");
                const n = count();
                for (let i = 1; i <= n; i++) {
                    const k = String(val("type" + i, "int"));
                    const v = val("value" + i, "");
                    name += String(val("text" + i, "") || "") + (linked("value" + i) ? "{" + k + "}" : fmt(v, k));
                }
                if (preview) preview.value = folder + name;
                node.setDirtyCanvas(true, true);
            }

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

            node.addWidget("button", "+ Add part", null, () => setCount(count() + 1));
            node.addWidget("button", "- Remove last part", null, () => setCount(count() - 1));

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
                const r = origExecuted ? origExecuted.apply(this, arguments) : undefined;
                if (msg && msg.preview && preview) { preview.value = String(msg.preview[0]); node.setDirtyCanvas(true, true); }
                return r;
            };

            layout();
            return ret;
        };
    },
});
