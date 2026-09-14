import { app } from "../../scripts/app.js";
import { ensureWxStyle } from "./wxStyle.js";

// WPrompt Rows (frontend 1.49+): il prompt a righe.
// Ogni riga e' il widget multiline text{i} di Comfy (cosi' il puntino a sinistra e il link STRING sono quelli nativi),
// reso auto-crescente; sopra il suo angolo destro si monta una barretta HTML con tre chip: on/off (scrive nel widget
// nascosto on{i}), - (toglie questa riga) e + (ne aggiunge una sotto). Il numero di righe vive nel widget nascosto "rows".
// Cavo attaccato: il frontend marca il widget computedDisabled e per un widget HTML disabilitato = invisibile
// (BaseWidget.isVisible = !hidden && !computedDisabled): qui lo si tiene visibile, in sola lettura, col testo a monte.
// Backend: src/promptRows.py.
const MAX = 60;
const MIN_H = 22;   // una riga sola, come una stringa: cresce solo se il testo va a capo
const GAP = 6;      // aria sotto ogni riga

function bury(w) {   // widget di canvas che non si deve vedere (rows, on{i}) ma che resta nel workflow e nel prompt
    if (!w) return;
    w.type = "converted-widget";
    w.computeSize = () => [0, -4];
    w.hidden = true;
    w.options = w.options || {};
    w.options.hidden = true;
}

function measure(el) {   // altezza vera del testo (reset a "auto" prima, altrimenti si legge la misura precedente)
    el.style.height = "auto";
    const h = Math.max(MIN_H, el.scrollHeight + 2);
    el.style.height = h + "px";
    const p = el.parentElement;
    if (p && p.classList.contains("dom-widget")) p.style.height = h + "px";
    return h;
}

app.registerExtension({
    name: "WextraUI.PromptRows",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxPromptRows") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const ret = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            ensureWxStyle();
            const node = this;
            const W = (name) => node.widgets ? node.widgets.find((w) => w.name === name) : undefined;
            const slot = (name) => (node.inputs || []).find((i) => i.name === name);
            const slotIdx = (name) => (node.inputs || []).findIndex((i) => i.name === name);
            const linked = (name) => { const s = slot(name); return !!(s && s.link != null); };
            const isOn = (i) => { const w = W("on" + i); return w ? w.value !== false : true; };
            // testo a monte di un cavo, se il nodo sorgente lo tiene in un widget (Primitive, String, un altro WPrompt Rows no)
            function upstream(name) {
                try {
                    const s = slot(name);
                    if (!s || s.link == null || !node.graph) return undefined;
                    const L = node.graph.links;
                    const link = L instanceof Map ? L.get(s.link) : (node.graph.getLink ? node.graph.getLink(s.link) : L?.[s.link]);
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
            // un cavo sul puntino non deve spegnere la riga: il widget resta visibile (vedi nota in testa)
            const origUCD = node.updateComputedDisabled;
            node.updateComputedDisabled = function () {
                const r = origUCD ? origUCD.apply(this, arguments) : undefined;
                const n = count();
                for (let i = 1; i <= n; i++) { const w = W("text" + i); if (w) w.computedDisabled = false; }
                return r;
            };

            bury(W("rows"));
            for (let i = 1; i <= MAX; i++) bury(W("on" + i));

            function count() { return Math.max(1, Math.min(MAX, Number(W("rows")?.value) || 1)); }

            const ui = {};   // i -> { w, el, bar, tog, plus, mounted }

            function setup(i) {
                const w = W("text" + i);
                if (!w || !w.element || ui[i]) return;
                const el = w.element;
                el.style.resize = "none";
                el.style.overflowY = "hidden";
                el.rows = 1;                          // parte da una riga sola
                el.style.minHeight = "0";
                el.style.lineHeight = "1.3";
                el.style.paddingTop = "3px";
                el.style.paddingBottom = "3px";
                el.style.paddingRight = "96px";      // spazio per la barretta (on/off, -, +)
                const bar = document.createElement("div"); bar.className = "wx wx-rowbar";
                const tog = document.createElement("span"); tog.className = "wx-chip"; tog.title = "row on / off";
                tog.onclick = (e) => { e.stopPropagation(); e.preventDefault(); const o = W("on" + i); if (o) o.value = !isOn(i); paint(i); node.setDirtyCanvas(true, true); };
                const minus = document.createElement("span"); minus.className = "wx-chip"; minus.textContent = "−"; minus.title = "remove this row";
                minus.onclick = (e) => { e.stopPropagation(); e.preventDefault(); removeRow(i); };
                const plus = document.createElement("span"); plus.className = "wx-chip"; plus.textContent = "+"; plus.title = "add a row below";
                plus.onclick = (e) => { e.stopPropagation(); e.preventDefault(); insertRow(i); };
                for (const c of [tog, minus, plus]) c.onmousedown = (e) => e.stopPropagation();
                bar.append(tog, minus, plus);
                ui[i] = { w, el, bar, tog, minus, plus, mounted: false };
                w.computeSize = function (width) { return w.hidden ? [0, -4] : [width, measure(el) + GAP]; };
                el.addEventListener("input", () => { measure(el); node.setDirtyCanvas(true, true); });
            }

            function mount(i) {   // il contenitore del textarea lo crea Comfy dopo la creazione del nodo: si monta appena c'e'
                const u = ui[i];
                if (!u || u.mounted) return;
                const p = u.el.parentElement;
                if (!p) return;
                p.appendChild(u.bar);
                u.mounted = true;
            }

            function paint(i) {
                const u = ui[i];
                if (!u) return;
                const on = isOn(i), lk = linked("text" + i);
                u.tog.textContent = on ? "on" : "off";
                u.tog.className = "wx-chip" + (on ? " on" : "");
                u.el.style.opacity = on ? "1" : "0.4";
                u.el.placeholder = lk ? "← linked text" : "prompt row " + i;
                // cavo attaccato: sola lettura col testo a monte (se il nodo sorgente lo mostra), il testo scritto resta nel widget
                const shown = lk ? String(upstream("text" + i) ?? "") : String(u.w.value ?? "");
                if (u.el.readOnly !== lk) u.el.readOnly = lk;
                u.el.style.fontStyle = lk ? "italic" : "";
                if (u.el.value !== shown) { u.el.value = shown; measure(u.el); node.setDirtyCanvas(true, true); }
            }

            function moveLink(from, to) {   // sposta il cavo di text{from} su text{to}
                const s = slot("text" + from);
                if (!s || s.link == null || !node.graph) return;
                const L = node.graph.links;
                const link = L instanceof Map ? L.get(s.link) : (node.graph.getLink ? node.graph.getLink(s.link) : L?.[s.link]);
                const src = link ? node.graph.getNodeById(link.origin_id) : null;
                node.disconnectInput(slotIdx("text" + from));
                const t = slotIdx("text" + to);
                if (src && t >= 0) src.connect(link.origin_slot, node, t);
            }

            function insertRow(i) {   // una riga vuota sotto la riga i: quelle sotto scendono di uno, cavi compresi
                const n = count();
                if (n >= MAX) return;
                setCount(n + 1);
                for (let j = n; j > i; j--) {
                    const a = W("text" + j), b = W("text" + (j + 1)), oa = W("on" + j), ob = W("on" + (j + 1));
                    if (a && b) b.value = a.value;
                    if (oa && ob) ob.value = oa.value;
                    if (linked("text" + (j + 1))) node.disconnectInput(slotIdx("text" + (j + 1)));
                    if (linked("text" + j)) moveLink(j, j + 1);
                }
                const t = W("text" + (i + 1)), o = W("on" + (i + 1));
                if (t) t.value = "";
                if (o) o.value = true;
                layout();
            }

            function removeRow(i) {
                const n = count();
                if (n === 1) {                     // l'unica riga non si toglie: si svuota
                    const t = W("text1"), o = W("on1");
                    if (t) t.value = "";
                    if (o) o.value = true;
                    if (linked("text1")) node.disconnectInput(slotIdx("text1"));
                    layout();
                    return;
                }
                for (let j = i; j < n; j++) {      // le righe sotto salgono di uno, cavi compresi
                    const a = W("text" + j), b = W("text" + (j + 1)), oa = W("on" + j), ob = W("on" + (j + 1));
                    if (a && b) a.value = b.value;
                    if (oa && ob) oa.value = ob.value;
                    if (linked("text" + j)) node.disconnectInput(slotIdx("text" + j));
                    if (linked("text" + (j + 1))) moveLink(j + 1, j);
                }
                const last = W("text" + n), ol = W("on" + n);
                if (last) last.value = "";
                if (ol) ol.value = true;
                if (linked("text" + n)) node.disconnectInput(slotIdx("text" + n));
                setCount(n - 1);
            }

            // i puntini d'ingresso: solo le righe attive ne hanno uno (quelli di rows, on{i} e delle righe spente
            // restano altrimenti nel nodo e si accendono sotto di esso quando si trascina un cavo)
            const dead = (sl) => sl.name === "rows" || /^on\d+$/.test(sl.name) || (/^text\d+$/.test(sl.name) && Number(sl.name.slice(4)) > count());
            function pruneSlots() {
                for (let k = (node.inputs || []).length - 1; k >= 0; k--) {
                    const sl = node.inputs[k];
                    if (!dead(sl)) continue;
                    if (sl.link != null) node.disconnectInput(k);
                    node.removeInput(k);
                }
                const n = count();
                for (let i = 1; i <= n; i++) {
                    if (slot("text" + i)) continue;
                    node.addInput("text" + i, "STRING");
                    const sl = slot("text" + i);
                    if (sl) sl.widget = { name: "text" + i };
                }
            }

            function layout() {
                const n = count();
                for (let i = 1; i <= MAX; i++) {
                    const on = i <= n;
                    const w = W("text" + i);
                    if (!w) continue;
                    setup(i);
                    w.hidden = !on;
                    w.options = w.options || {};
                    w.options.hidden = !on;
                    if (w.element) w.element.style.display = on ? "" : "none";
                    const s = slot("text" + i);
                    if (s) { if (!on && s.link != null) node.disconnectInput(slotIdx("text" + i)); }
                    if (on) { mount(i); paint(i); }
                }
                pruneSlots();
                const sz = node.computeSize();
                node.setSize([Math.max(node.size[0], sz[0]), sz[1]]);
                node.setDirtyCanvas(true, true);
            }

            function setCount(n) {
                const w = W("rows");
                if (w) w.value = Math.max(1, Math.min(MAX, n));
                layout();
            }

            // le barrette si montano quando Comfy ha creato i contenitori; lo stato dei cavi si ripassa a intervalli
            const timer = setInterval(() => {
                const n = count();
                for (let i = 1; i <= n; i++) { mount(i); paint(i); }
                if ((node.inputs || []).some(dead)) { pruneSlots(); node.setDirtyCanvas(true, true); }
            }, 400);
            const origRemoved = node.onRemoved;
            node.onRemoved = function () { clearInterval(timer); return origRemoved ? origRemoved.apply(this, arguments) : undefined; };
            const origConn = node.onConnectionsChange;
            node.onConnectionsChange = function () { const r = origConn ? origConn.apply(this, arguments) : undefined; setTimeout(() => { const n = count(); for (let i = 1; i <= n; i++) paint(i); }, 0); return r; };
            const origConfigure = node.onConfigure;
            node.onConfigure = function () { const r = origConfigure ? origConfigure.apply(this, arguments) : undefined; setTimeout(layout, 0); setTimeout(layout, 250); return r; };

            layout();
            setTimeout(layout, 200);
            return ret;
        };
    },
});
