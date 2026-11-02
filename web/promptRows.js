import { app } from "../../scripts/app.js";
import { ensureWxStyle, wxVueNodeEl, wxHideWidget, wxSlotHidden, wxCompactWidgets } from "./wxStyle.js";

// WPrompt Rows (frontend 1.49+): il prompt a righe.
// Ogni riga e' il widget multiline text{i} di Comfy (cosi' il puntino a sinistra e il link STRING sono quelli nativi),
// reso auto-crescente; sopra il suo angolo destro si monta una barretta HTML con tre chip: on/off (scrive nel widget
// nascosto on{i}), - (toglie questa riga) e + (ne aggiunge una sotto). Il numero di righe vive nel widget nascosto "rows".
// Cavo attaccato: il frontend marca il widget computedDisabled e per un widget HTML disabilitato = invisibile: qui lo si
// tiene visibile riscrivendo isVisible sull'istanza (02/11, computedDisabled da solo non basta piu'), in sola lettura, col testo a monte.
// Restyle C (Mockup/WPromptRows, scelta di Sick 30/10): le righe col font del nodo, a 15 px dai bordi come `join`, un
// pozzo per trasparenza; on/off blu se acceso, - e + quieti finche' il puntatore non arriva sulla riga; la riga spenta
// spegne solo il testo; il ≡ a sinistra si trascina su un'altra riga e la riga va li' con testo, interruttore e cavo.
// prompt_to_divide (Sick 30/10, facoltativo): con un cavo, in testa al nodo il tasto Divide Input Prompt, che mette in righe
// nuove, dopo l'ultima scritta, le frasi del testo divise dalle virgole (non quelle dentro parentesi: (a, b:1.2) resta
// una frase). Il testo si legge dal widget del nodo a monte; se a monte non ce n'e' uno, da quello dell'ultima run.
// Reset (Sick 02/11), sotto quel tasto e sempre in vista: il nodo come appena messo sul canvas (una riga vuota e accesa,
// join comma, nessun cavo sulle righe); i cavi su prompt_to_divide e join restano, si puo' ridividere subito.
// Collapse / Expand (Sick 02/11): oltre le 10 righe, sotto join, un tasto. Collapse lascia in vista 10 righe, il resto si
// scorre con la rotellina o con la barra sul bordo destro. Comfy posa ogni riga da se', quindi lo scorrimento e' a righe
// intere: le righe fuori vista sono nascoste ma ci sono, col testo, il cavo e l'interruttore, ed entrano nel prompt.
// Il fondo del nodo (Sick 02/11): l'altezza la fanno le righe, sempre. Il mouse decide la larghezza; quando il testo va a
// capo in piu' o in meno, o una riga cresce, il nodo si richiude sotto l'ultima riga (fit), nei due renderer.
// Backend: src/promptRows.py.
const MAX = 60;
const MIN_H = 22;   // una riga sola, come una stringa: cresce solo se il testo va a capo
const GAP = 4;      // aria sotto ogni riga
const PAD_L = 22, PAD_R = 70;   // spazio per il ≡ a sinistra e per la barretta (on/off, -, +) a destra
const WIN = 10;     // oltre tante righe compare il tasto, e Collapse ne lascia in vista tante

function ensurePrStyle() {
    if (document.getElementById("wx-pr-style")) return;
    const st = document.createElement("style"); st.id = "wx-pr-style";
    st.textContent = `
      .wx-pr-ta { --ink: var(--input-text, #ddd); }
      textarea.wx-pr-ta { font: 12px/16px "Segoe UI", system-ui, sans-serif !important; color: var(--ink) !important;
        background: rgba(0,0,0,.22) !important; border: 0 !important; border-radius: 8px !important;
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 14%, transparent) !important; }
      textarea.wx-pr-ta::placeholder { color: color-mix(in srgb, var(--ink) 40%, transparent); }
      textarea.wx-pr-ta.off { color: color-mix(in srgb, var(--ink) 40%, transparent) !important; }
      textarea.wx-pr-ta.vue { font-size: 12.5px !important; border-radius: 6px !important; box-shadow: none !important; background: rgba(0,0,0,.18) !important; min-height: 0 !important; }
      .wx-pr-bar { position: absolute; right: 3px; top: 3px; display: flex; gap: 2px; z-index: 2; --ink: var(--input-text, #ddd); }
      .wx-pr-chip { height: 16px; min-width: 16px; border-radius: 8px; font: 11px/16px "Segoe UI", system-ui, sans-serif; text-align: center;
        color: color-mix(in srgb, var(--ink) 62%, transparent); cursor: pointer; user-select: none; }
      .wx-pr-chip.sw { width: 28px; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 30%, transparent); color: color-mix(in srgb, var(--ink) 40%, transparent); }
      .wx-pr-chip.sw:hover { box-shadow: inset 0 0 0 1px #1464b3; color: var(--ink); }
      .wx-pr-chip.sw.on { background: #00509f; box-shadow: none; color: #eaf3fd; }
      .wx-pr-chip.pm { opacity: .35; font-size: 13px; }
      .wx-pr-row:hover .wx-pr-chip.pm, .wx-pr-row:focus-within .wx-pr-chip.pm { opacity: 1; }
      .wx-pr-chip.pm:hover { background: color-mix(in srgb, var(--ink) 14%, transparent); color: var(--ink); }
      .wx-pr-grip { position: absolute; left: 3px; top: 0; width: 16px; height: 22px; z-index: 2; font: 12px/22px sans-serif; text-align: center;
        --ink: var(--input-text, #ddd); color: color-mix(in srgb, var(--ink) 40%, transparent); cursor: grab; user-select: none; touch-action: none; }
      .wx-pr-grip:hover { color: #a8cdf5; }
      .wx-pr-grip.vue { left: 14px; height: 24px; line-height: 24px; }   /* a sinistra di 12 px comanda la presa della riga */
      .wx-pr-row.drag { opacity: .45; }
      .wx-pr-row.drop-a { box-shadow: 0 -2px 0 #1464b3; border-radius: 8px; }
      .wx-pr-row.drop-b { box-shadow: 0 2px 0 #1464b3; border-radius: 8px; }
      body.wx-pr-dragging, body.wx-pr-dragging * { cursor: grabbing !important; }
      .wx-pr-sb { position: absolute; right: 0; width: 14px; z-index: 3; cursor: pointer; --ink: var(--input-text, #ddd); touch-action: none; }
      .wx-pr-sb::before { content: ""; position: absolute; right: 5px; top: 0; bottom: 0; width: 4px; border-radius: 2px; background: color-mix(in srgb, var(--ink) 14%, transparent); }
      .wx-pr-sb i { position: absolute; right: 5px; width: 4px; border-radius: 2px; background: #1464b3; }
      @media (prefers-reduced-motion: no-preference) { .wx-pr-chip { transition: opacity .12s, background-color .12s, color .12s; } }
    `;
    document.head.appendChild(st);
}

function bury(w, node) {   // widget di canvas che non si deve vedere (rows, on{i}) ma che resta nel workflow e nel prompt; nemmeno il suo puntino
    if (w) wxHideWidget(w, node);
}

function measure(el, min = MIN_H) {   // altezza vera del testo (reset a "auto" prima, altrimenti si legge la misura precedente)
    if (!el.offsetWidth) return Math.max(min, parseFloat(el.style.height) || 0);   // non a schermo (zoom lontano, Nodes 2.0): vale l'ultima misura
    el.style.height = "auto";
    const h = Math.max(min, el.scrollHeight + 2);
    el.style.height = h + "px";
    const p = el.parentElement;
    if (p && p.classList.contains("dom-widget")) p.style.height = h + "px";
    return h;
}

/** Le frasi di un testo: divise dalle virgole che non stanno dentro (), [] o {} (un peso come (red, blue:1.2) resta
 *  intero), senza spazi ai bordi, le vuote saltate. */
export function prPhrases(text) {
    const out = []; let depth = 0, cur = "";
    for (const ch of String(text ?? "")) {
        if ("([{".includes(ch)) depth++;
        else if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
        if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim()).filter(Boolean);
}

app.registerExtension({
    name: "WextraUI.PromptRows",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxPromptRows") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const ret = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            ensureWxStyle(); ensurePrStyle();
            const node = this;
            const W = (name) => node.widgets ? node.widgets.find((w) => w.name === name) : undefined;
            const slot = (name) => (node.inputs || []).find((i) => i.name === name);
            const slotIdx = (name) => (node.inputs || []).findIndex((i) => i.name === name);
            const linked = (name) => { const s = slot(name); return !!(s && s.link != null); };
            const isOn = (i) => { const w = W("on" + i); return w ? w.value !== false : true; };
            const linkOf = (name) => {   // il cavo di un ingresso: { src, slot } del nodo a monte, o null
                const s = slot(name);
                if (!s || s.link == null || !node.graph) return null;
                const L = node.graph.links;
                const link = L instanceof Map ? L.get(s.link) : (node.graph.getLink ? node.graph.getLink(s.link) : L?.[s.link]);
                const src = link ? node.graph.getNodeById(link.origin_id) : null;
                return src ? { src, slot: link.origin_slot } : null;
            };
            // testo a monte di un cavo, se il nodo sorgente lo tiene in un widget (Primitive, String, un altro WPrompt Rows no)
            function upstream(name) {
                try {
                    const o = linkOf(name);
                    const src = o?.src;
                    if (!src || !src.widgets || !src.widgets.length) return undefined;
                    const out = (src.outputs || [])[o.slot];
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

            bury(W("rows"), node);
            for (let i = 1; i <= MAX; i++) bury(W("on" + i), node);

            function count() { return Math.max(1, Math.min(MAX, Number(W("rows")?.value) || 1)); }

            // ---- Divide Input Prompt: il tasto in testa, solo con un cavo su prompt_to_divide ------------------------------
            // sotto Nodes 2.0 il clic arriva dopo il mouseup che la coda di Ctrl+Z guarda: il passo va annunciato prima e dopo
            const changed = () => { try { app.extensionManager?.workflow?.activeWorkflow?.changeTracker?.checkState?.(); } catch (e) { /* no tracker: nothing to tell */ } };
            const undoStep = (fn) => { changed(); fn(); changed(); };
            const wDiv = node.addWidget("button", "Divide Input Prompt", null, () => undoStep(divide), { serialize: false });
            wDiv.serialize = false;   // nessun posto in widgets_values (vedi wxCompactWidgets)
            wDiv.tooltip = "One new row for every phrase of prompt_to_divide (divided by the commas), after the last row with text";
            node.widgets.splice(node.widgets.indexOf(wDiv), 1);
            node.widgets.unshift(wDiv);
            const wReset = node.addWidget("button", "Reset", null, () => undoStep(reset), { serialize: false });
            wReset.serialize = false;
            wReset.tooltip = "Back to a new node: one empty row, on, join on comma. The cables on the rows come off; the ones on prompt_to_divide and join stay";
            node.widgets.splice(node.widgets.indexOf(wReset), 1);
            node.widgets.splice(1, 0, wReset);
            const wFold = node.addWidget("button", "Collapse", null, () => undoStep(fold), { serialize: false });
            wFold.serialize = false;
            wFold.tooltip = "Collapse keeps 10 rows in view, the wheel or the bar on the right edge scrolls the others; Expand shows them all";
            node.widgets.splice(node.widgets.indexOf(wFold), 1);
            node.widgets.splice(node.widgets.findIndex((w) => w.name === "join") + 1, 0, wFold);
            wxCompactWidgets(node);
            const divShow = () => {   // true se e' cambiato
                const on = linked("prompt_to_divide");
                if (wDiv.hidden === !on) return false;
                wDiv.hidden = !on;
                wDiv.options = wDiv.options || {}; wDiv.options.hidden = !on;
                if (on) delete wDiv.computeSize; else wDiv.computeSize = () => [0, -4];
                return true;
            };
            let top = 0;     // quante righe stanno sopra la finestra
            const folded = () => !!node.properties?.wxCollapsed && count() > WIN;
            const inView = (i) => !folded() || (i > top && i <= top + WIN);
            const foldShow = () => {   // true se e' cambiato
                const on = count() > WIN, text = folded() ? "Expand" : "Collapse", was = !wFold.hidden;
                if (wFold.label !== text) { wFold.label = text; node.setDirtyCanvas(true, false); }
                if (was === on) return false;
                wFold.hidden = !on;
                wFold.options = wFold.options || {}; wFold.options.hidden = !on;
                if (on) delete wFold.computeSize; else wFold.computeSize = () => [0, -4];
                return true;
            };
            function fold() {
                node.properties = node.properties || {};
                if (folded()) delete node.properties.wxCollapsed; else node.properties.wxCollapsed = true;
                layout();
            }
            function scrollTo(t) {
                t = Math.max(0, Math.min(count() - WIN, t));
                if (t !== top) { top = t; layout(); }
            }
            const reveal = (i) => { if (folded() && !inView(i)) scrollTo(i <= top ? i - 1 : i - WIN); };
            let wheelSum = 0;
            function onWheel(e) {   // una tacca = una riga; con Ctrl lo zoom resta a Comfy
                e.preventDefault();
                wheelSum += e.deltaY;
                const k = Math.trunc(wheelSum / 40);
                if (k) { wheelSum = 0; scrollTo(top + Math.sign(k)); }
            }
            // la finestra sul nodo (coordinate del nodo, vecchio stile): dove vanno la barra e la rotellina nei varchi fra le righe
            function band() {
                const a = W("text" + (top + 1)), b = W("text" + (top + WIN));
                return a && b ? [a.y, b.y + (b.computedHeight || MIN_H)] : null;
            }
            function barPress(e, frac, pxPerRow) {   // frac = dove si e' premuto sulla barra; fuori dal cursore si salta li'
                const n = count();
                if (frac < top / n || frac > (top + WIN) / n) scrollTo(Math.round(frac * n - WIN / 2));
                const y0 = e.clientY, t0 = top;
                const move = (ev) => scrollTo(t0 + Math.round((ev.clientY - y0) / pxPerRow));
                const up = () => { window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true); };
                window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", up, true);
            }
            const onDrawFg = node.onDrawForeground;
            node.onDrawForeground = function (ctx) {
                const r = onDrawFg ? onDrawFg.apply(this, arguments) : undefined;
                if (LiteGraph.vueNodesMode || !folded() || node.flags?.collapsed) return r;
                const b = band(); if (!b) return r;
                // i cavi delle righe fuori vista entrano dal bordo della finestra
                const n = count(), A = W("text" + (top + 1)), B = W("text" + (top + WIN));
                for (let i = 1; i <= n; i++) if (!inView(i)) { const w = W("text" + i); if (w) w.y = i <= top ? A.y : B.y; }
                const x = node.size[0] - 9, h = b[1] - b[0];
                ctx.save();
                ctx.fillStyle = "rgba(255,255,255,.14)";
                ctx.beginPath(); ctx.roundRect(x, b[0], 4, h, 2); ctx.fill();
                ctx.fillStyle = "#1464b3";
                ctx.beginPath(); ctx.roundRect(x, b[0] + h * top / n, 4, Math.max(14, h * WIN / n), 2); ctx.fill();
                ctx.restore();
                return r;
            };
            const onDown = node.onMouseDown;
            node.onMouseDown = function (e, pos, canvas) {
                if (!LiteGraph.vueNodesMode && folded() && !node.flags?.collapsed && pos[0] >= node.size[0] - 15) {
                    const b = band();
                    if (b && pos[1] >= b[0] && pos[1] <= b[1]) {
                        const h = b[1] - b[0];
                        barPress(e, (pos[1] - b[0]) / h, h * (canvas?.ds?.scale || 1) / count());
                        return true;
                    }
                }
                return onDown ? onDown.apply(this, arguments) : undefined;
            };
            // la rotellina si prende in cattura sulla finestra: i varchi fra le righe sono canvas, e sotto Nodes 2.0 Comfy
            // zooma prima che l'evento arrivi al nodo. Conta solo se il puntatore e' sulla colonna delle righe di questo nodo
            function overRows(e) {
                const t = e.target;
                if (LiteGraph.vueNodesMode) {
                    const a = ui[top + 1]?.grip.parentElement, b = ui[top + WIN]?.grip.parentElement, root = wxVueNodeEl(node);
                    return !!(a?.isConnected && b?.isConnected && root?.contains(t)) && e.clientY >= a.getBoundingClientRect().top - GAP && e.clientY <= b.getBoundingClientRect().bottom + GAP;
                }
                if (t !== app.canvas?.canvas && !t?.closest?.(".wx-pr-row")) return false;
                const b = band(), p = app.canvas.convertEventToCanvasOffset(e);
                if (!b || app.graph?.getNodeOnPos?.(p[0], p[1]) !== node) return false;
                const y = p[1] - node.pos[1];
                return y >= b[0] - GAP && y <= b[1] + GAP;
            }
            const onAnyWheel = (e) => { if (folded() && !e.ctrlKey && overRows(e)) { onWheel(e); e.stopImmediatePropagation(); } };
            window.addEventListener("wheel", onAnyWheel, { capture: true, passive: false });
            // Nodes 2.0: la stessa barra, come elemento sul nodo
            let sb = null;
            function vueBar() {
                const root = wxVueNodeEl(node);
                if (!folded() || !root) { sb?.remove(); return; }
                if (!sb) {
                    sb = document.createElement("div"); sb.className = "wx wx-pr-sb"; sb.title = "scroll the rows"; sb.appendChild(document.createElement("i"));
                    sb.onmousedown = (e) => e.stopPropagation();
                    sb.addEventListener("pointerdown", (e) => {
                        e.preventDefault(); e.stopPropagation();
                        const r = sb.getBoundingClientRect();
                        barPress(e, (e.clientY - r.top) / r.height, r.height / count());
                    });
                }
                if (sb.parentElement !== root) root.appendChild(sb);
                const a = ui[top + 1]?.grip.parentElement, b = ui[top + WIN]?.grip.parentElement;
                if (!a?.isConnected || !b?.isConnected) return;
                const r = root.getBoundingClientRect(), k = root.offsetWidth / (r.width || 1);
                const t = (a.getBoundingClientRect().top - r.top) * k, h = (b.getBoundingClientRect().bottom - a.getBoundingClientRect().top) * k, n = count();
                sb.style.top = t + "px"; sb.style.height = h + "px";
                sb.firstChild.style.top = (h * top / n) + "px"; sb.firstChild.style.height = Math.max(14, h * WIN / n) + "px";
            }
            const onExec = node.onExecuted;
            node.onExecuted = function (msg) {   // il testo dell'ultima run, per quando a monte non c'e' un widget da leggere
                const r = onExec ? onExec.apply(this, arguments) : undefined;
                const t = msg?.wx_divide?.[0];
                if (typeof t === "string") node._wxDivide = t;
                return r;
            };
            function divide() {
                if (!linked("prompt_to_divide")) return;
                const up = upstream("prompt_to_divide");
                const text = typeof up === "string" ? up : node._wxDivide;
                if (typeof text !== "string") {
                    app.extensionManager?.toast?.add?.({ severity: "info", summary: "Divide Input Prompt", detail: "The text of prompt_to_divide is made by the run: queue once, then divide.", life: 4000 });
                    return;
                }
                const ps = prPhrases(text);
                if (!ps.length) return;
                const n = count();
                let k = n;   // l'ultima riga con testo o con un cavo: le frasi vanno dopo, le righe vuote in fondo si riusano
                while (k > 0 && !linked("text" + k) && !String(W("text" + k)?.value ?? "").trim()) k--;
                const m = Math.min(ps.length, MAX - k);
                if (k + m > n) { const w = W("rows"); if (w) w.value = k + m; }
                for (let j = 0; j < m; j++) {
                    const t = W("text" + (k + 1 + j)), o = W("on" + (k + 1 + j));
                    if (t) t.value = ps[j];
                    if (o) o.value = true;
                }
                reveal(k + 1);
                if (m < ps.length) app.extensionManager?.toast?.add?.({ severity: "warn", summary: "Divide Input Prompt", detail: `${MAX} rows at most: ${ps.length - m} phrases left out.`, life: 4000 });
                layout();
            }
            function reset() {
                for (let i = count(); i >= 1; i--) if (linked("text" + i)) node.disconnectInput(slotIdx("text" + i));
                for (let i = 1; i <= MAX; i++) {   // anche le righe nascoste: non tornano piene aggiungendone una
                    const t = W("text" + i), o = W("on" + i);
                    if (t) t.value = "";
                    if (o) o.value = true;
                }
                const j = W("join"); if (j) j.value = "comma";
                if (node.properties) delete node.properties.wxCollapsed;
                top = 0;
                setCount(1);
            }

            const ui = {};   // i -> { w, el, bar, tog, minus, plus, grip, mounted }

            function setup(i) {
                const w = W("text" + i);
                if (!w || !w.element || ui[i]) return;
                const el = w.element;
                el.classList.add("wx-pr-ta");
                el.style.resize = "none";
                el.style.overflowY = "hidden";
                el.rows = 1;                          // parte da una riga sola
                el.style.minHeight = "0";
                el.style.paddingTop = "3px";
                el.style.paddingBottom = "3px";
                el.style.paddingLeft = PAD_L + "px";   // il ≡
                el.style.paddingRight = PAD_R + "px";  // la barretta (on/off, -, +)
                w.options = w.options || {};
                w.options.margin = 15;                // le righe in colonna con `join` (il widget DOM ne ha 10)
                const bar = document.createElement("div"); bar.className = "wx wx-pr-bar";
                const tog = document.createElement("span"); tog.className = "wx-pr-chip sw"; tog.title = "row on / off";
                tog.onclick = (e) => { e.stopPropagation(); e.preventDefault(); const o = W("on" + i); if (o) o.value = !isOn(i); paint(i); node.setDirtyCanvas(true, true); };
                const minus = document.createElement("span"); minus.className = "wx-pr-chip pm"; minus.textContent = "−"; minus.title = "remove this row";
                minus.onclick = (e) => { e.stopPropagation(); e.preventDefault(); removeRow(i); };
                const plus = document.createElement("span"); plus.className = "wx-pr-chip pm"; plus.textContent = "+"; plus.title = "add a row below";
                plus.onclick = (e) => { e.stopPropagation(); e.preventDefault(); insertRow(i); };
                for (const c of [tog, minus, plus]) { c.onmousedown = (e) => e.stopPropagation(); c.onpointerdown = (e) => e.stopPropagation(); }
                bar.append(tog, minus, plus);
                const grip = document.createElement("span"); grip.className = "wx-pr-grip"; grip.textContent = "≡"; grip.title = "drag onto another row to move this one there";
                grip.onmousedown = (e) => e.stopPropagation();
                grip.addEventListener("pointerdown", (e) => startDrag(e, i));
                const u = ui[i] = { w, el, bar, tog, minus, plus, grip, mounted: false, on: i <= count() };
                // chi si vede lo decidiamo noi (u.on): col cavo il frontend mette hidden da solo, e computedDisabled non basta piu'
                w.isVisible = () => u.on && !node.flags?.collapsed;
                w.computeSize = function (width) { return u.on ? [width, measure(el) + GAP] : [0, -4]; };
                el.addEventListener("input", () => { measure(el); node.setDirtyCanvas(true, true); });
                seen.observe(el);
            }

            // Nodes 2.0 mostra un textarea suo per text{i} (con accanto una <label> col nome del widget), il nostro resta fuori
            // vista: la barretta e le tinte vanno su quello. Riconosciuto una volta (data-wx-row), poi per label se il DOM e' rifatto.
            function vueTextarea(i) {
                const root = wxVueNodeEl(node); if (!root) return null;
                const all = [...root.querySelectorAll(".lg-node-widget textarea")];
                const named = (t) => (t.closest("[node-id]") || t.parentElement)?.querySelector("label")?.textContent.trim() === "text" + i;
                return all.find((t) => t.dataset.wxRow === String(i)) || all.find((t) => !t.dataset.wxRow && named(t)) || null;
            }
            function mount(i) {   // il contenitore del textarea lo crea Comfy dopo la creazione del nodo: si monta appena c'e';
                // sotto Nodes 2.0 e' il contenitore del textarea di Vue, e tornati al canvas classico si rimonta nel nostro
                const u = ui[i];
                if (!u) return;
                const vt = vueTextarea(i);
                const p = vt ? vt.closest(".lg-node-widget") : u.el.parentElement;
                if (!p) return;
                if (u.bar.parentElement !== p) {
                    if (vt) {
                        p.style.position = "relative";
                        vt.classList.add("wx-pr-ta", "vue");
                        vt.rows = 1;
                        vt.style.paddingLeft = PAD_L + 2 + "px"; vt.style.paddingRight = PAD_R + "px";
                        vt.style.paddingTop = vt.style.paddingBottom = "4px";
                        const lb = p.querySelector("label"); if (lb) lb.style.display = "none";   // il nome `text1`... in testa: via
                    }
                    p.appendChild(u.bar); p.appendChild(u.grip);
                    u.grip.classList.toggle("vue", !!vt);
                }
                p.classList.add("wx-pr-row");
                p.dataset.wxPrRow = String(i);
                if (vt) measure(vt, 24);
                u.mounted = true;
            }

            function paint(i) {
                const u = ui[i];
                if (!u) return;
                const on = isOn(i), lk = linked("text" + i);
                u.tog.textContent = on ? "on" : "off";
                u.tog.className = "wx-pr-chip sw" + (on ? " on" : "");
                u.el.classList.toggle("off", !on);
                u.el.placeholder = lk ? "← linked text" : "prompt row " + i;
                // cavo attaccato: sola lettura col testo a monte (se il nodo sorgente lo mostra), il testo scritto resta nel widget
                const shown = lk ? String(upstream("text" + i) ?? "") : String(u.w.value ?? "");
                if (u.el.readOnly !== lk) u.el.readOnly = lk;
                u.el.style.fontStyle = lk ? "italic" : "";
                if (u.el.value !== shown) { u.el.value = shown; measure(u.el); node.setDirtyCanvas(true, true); }
                const vt = vueTextarea(i);   // Nodes 2.0: the same on the textarea of Vue
                if (vt) {
                    vt.dataset.wxRow = String(i); vt.placeholder = u.el.placeholder;
                    vt.classList.toggle("off", !on); vt.readOnly = lk; vt.style.fontStyle = lk ? "italic" : "";
                    if (lk && vt.value !== shown) vt.value = shown;
                }
            }

            function moveLink(from, to) {   // sposta il cavo di text{from} su text{to}
                const o = linkOf("text" + from);
                if (!o) return;
                node.disconnectInput(slotIdx("text" + from));
                connectTo(o, to);
            }
            function connectTo(o, row) {
                const t = slotIdx("text" + row);
                // LiteGraph's node-to-node cable, called from the prototype: the registry scanner reads the bare method call as a network socket
                if (o && o.src && t >= 0) LiteGraph.LGraphNode.prototype.connect.call(o.src, o.slot, node, t);
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
                reveal(i + 1);
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

            function moveRow(from, to) {   // la riga from va al posto di to, con testo, interruttore e cavo; quelle in mezzo scorrono di uno
                const n = count();
                if (from === to || from < 1 || to < 1 || from > n || to > n) return;
                const lo = Math.min(from, to), hi = Math.max(from, to), rows = [];
                for (let j = lo; j <= hi; j++) rows.push({ t: W("text" + j)?.value ?? "", on: isOn(j), link: linkOf("text" + j) });
                for (let j = lo; j <= hi; j++) if (linked("text" + j)) node.disconnectInput(slotIdx("text" + j));
                const [m] = rows.splice(from - lo, 1); rows.splice(to - lo, 0, m);
                rows.forEach((r, k) => {
                    const j = lo + k, t = W("text" + j), o = W("on" + j);
                    if (t) t.value = r.t;
                    if (o) o.value = r.on;
                    if (r.link) connectTo(r.link, j);
                });
                layout();
            }
            // il ≡: si preme, si va su un'altra riga (una linea blu sopra o sotto dice dove), si lascia
            function startDrag(e, from) {
                if (e.button !== 0) return;
                e.preventDefault(); e.stopPropagation();
                const rowEl = (i) => ui[i]?.grip.parentElement;
                rowEl(from)?.classList.add("drag"); document.body.classList.add("wx-pr-dragging");
                let to = -1;
                const clear = () => { for (let i = 1; i <= count(); i++) rowEl(i)?.classList.remove("drop-a", "drop-b"); };
                const box = (el, g) => {   // nel vecchio stile il contenitore e' alto pochi px (il margine di 15) e la riga gli esce sotto: fa fede il ≡
                    const a = el.getBoundingClientRect();
                    return { left: a.left, right: a.right, top: a.top, bottom: Math.max(a.bottom, g.getBoundingClientRect().bottom) };
                };
                // il posto si legge dall'altezza del puntatore, non dalla riga sotto di lui: lasciata nel varco fra due righe
                // (o un po' fuori dalla colonna) la riga va fra quelle due. g = le righe il cui centro sta sopra il puntatore
                const move = (ev) => {
                    clear(); to = -1;
                    const n = count(), R = [];
                    for (let i = 1; i <= n; i++) { const el = rowEl(i); if (el && inView(i)) R.push([i, box(el, ui[i].grip)]); }
                    if (R.length < 2) return;
                    const L = Math.min(...R.map(([, b]) => b.left)), Rt = Math.max(...R.map(([, b]) => b.right));
                    const T = Math.min(...R.map(([, b]) => b.top)), B = Math.max(...R.map(([, b]) => b.bottom));
                    if (ev.clientX < L - 40 || ev.clientX > Rt + 40 || ev.clientY < T - 40 || ev.clientY > B + 40) return;   // lontano: niente
                    last = ev; edge = ev.clientY < T + 8 ? -1 : ev.clientY > B - 8 ? 1 : 0;
                    const g = R[0][0] - 1 + R.filter(([, b]) => (b.top + b.bottom) / 2 < ev.clientY).length;   // il varco: dopo g righe (anche quelle sopra la finestra)
                    const dest = g >= from ? g : g + 1;   // tolta la riga, il suo posto nuovo
                    if (dest === from) return;
                    to = dest;
                    if (g < R[0][0]) rowEl(R[0][0])?.classList.add("drop-a"); else rowEl(g)?.classList.add("drop-b");   // la linea blu nel varco
                };
                let last = null, edge = 0;   // col puntatore sul bordo della finestra le righe scorrono da sole
                const auto = setInterval(() => { if (edge && folded() && last) { scrollTo(top + edge); move(last); } }, 170);
                const up = () => {
                    clearInterval(auto);
                    window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true);
                    document.body.classList.remove("wx-pr-dragging"); clear(); rowEl(from)?.classList.remove("drag");
                    if (to > 0) moveRow(from, to);
                };
                window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", up, true);
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
                top = Math.max(0, Math.min(n - WIN, top));
                divShow(); foldShow();
                for (let i = 1; i <= MAX; i++) {
                    const there = i <= n, on = there && inView(i);
                    const w = W("text" + i);
                    if (!w) continue;
                    setup(i);
                    if (ui[i]) ui[i].on = on;
                    w.hidden = !on;
                    w.options = w.options || {};
                    w.options.hidden = !on;
                    if (w.element) w.element.style.display = on ? "" : "none";
                    const s = slot("text" + i);
                    if (s) { if (!there && s.link != null) node.disconnectInput(slotIdx("text" + i)); }   // fuori vista il cavo resta
                    wxSlotHidden(node, w, !on);   // the puntino of a row that is not there: neither drawn nor a target
                    if (on) { mount(i); paint(i); }
                }
                pruneSlots();
                const sz = node.computeSize();
                node.setSize([Math.max(node.size[0], sz[0]), sz[1]]);
                node.setDirtyCanvas(true, true);
                if (LiteGraph.vueNodesMode) requestAnimationFrame(() => {   // Vue rifa' le righe tornate in vista: barrette e tinte subito, non al prossimo giro del timer
                    for (let i = 1; i <= n; i++) if (inView(i)) { mount(i); paint(i); }
                    vueBar();
                });
            }

            // il nodo si richiude sotto l'ultima riga. Nel vecchio stile il frontend alza il nodo da se' ma corto, e il testo
            // si misura solo dopo che il contenitore ha preso la larghezza nuova; in Nodes 2.0 un nodo piu' alto delle righe
            // le spalanca, e le righe il nodo se lo portano dietro: basta tenere size sotto di loro
            let fitting = false, box = null;   // box: cima e altezza all'ultimo giro
            function fit() {
                if (fitting || node.flags?.collapsed) return;
                fitting = true;
                if (LiteGraph.vueNodesMode) for (let i = 1; i <= count(); i++) { const vt = inView(i) && vueTextarea(i); if (vt) measure(vt, 24); }
                const h = node.computeSize()[1], y = node.pos[1];
                if (Math.abs(node.size[1] - h) > 0.5) {
                    // un angolo alto: il frontend sposta la cima e tiene il fondo, ma l'altezza la fanno le righe. Il nodo resta dov'era
                    const corner = box && y !== box.y && Math.abs(y + node.size[1] - box.y - box.h) < 1;
                    node.setSize([node.size[0], h]);
                    if (corner) node.pos = [node.pos[0], box.y];
                }
                box = { y: node.pos[1], h };
                fitting = false;
            }
            // lo stesso in Nodes 2.0, che sposta la cima dopo la misura: finche' il mouse tiene un angolo alto, la cima resta
            function holdTop(e) {
                const r = e.currentTarget.getBoundingClientRect();
                if (!getComputedStyle(e.target).cursor.includes("resize") || e.clientY > r.top + r.height / 2) return;
                const y = node.pos[1];
                let held = true;
                const drop = () => { held = false; window.removeEventListener("pointerup", drop, true); window.removeEventListener("pointercancel", drop, true); };
                window.addEventListener("pointerup", drop, true); window.addEventListener("pointercancel", drop, true);
                (function hold() { if (node.pos[1] !== y) node.pos = [node.pos[0], y]; if (held) requestAnimationFrame(hold); })();
            }
            const seen = new ResizeObserver(fit);   // la riga ha cambiato misura, o in Nodes 2.0 il nodo intero
            const onResize = node.onResize;
            node.onResize = function () {   // il mouse sul bordo: resta la larghezza
                const r = onResize ? onResize.apply(this, arguments) : undefined;
                fit();
                return r;
            };

            function keepRows() {   // il frontend rimette hidden sulla riga col cavo
                for (let i = 1; i <= MAX; i++) { const u = ui[i]; if (u && u.w.hidden === u.on) u.w.hidden = !u.on; }
            }

            function setCount(n) {
                const w = W("rows");
                if (w) w.value = Math.max(1, Math.min(MAX, n));
                layout();
            }

            // le barrette si montano quando Comfy ha creato i contenitori; lo stato dei cavi si ripassa a intervalli
            let seenRoot = null;
            const timer = setInterval(() => {
                const n = count();
                keepRows();
                for (let i = 1; i <= n; i++) if (inView(i)) { mount(i); paint(i); }
                if ((node.inputs || []).some(dead)) { pruneSlots(); node.setDirtyCanvas(true, true); }
                if (LiteGraph.vueNodesMode) { vueBar(); const root = wxVueNodeEl(node); if (root && root !== seenRoot) { seenRoot?.removeEventListener("pointerdown", holdTop, true); seenRoot = root; seen.observe(root); root.addEventListener("pointerdown", holdTop, true); } } else sb?.remove();
                if (divShow()) { const sz = node.computeSize(); node.setSize([Math.max(node.size[0], sz[0]), sz[1]]); node.setDirtyCanvas(true, true); }
            }, 400);
            const origRemoved = node.onRemoved;
            node.onRemoved = function () { clearInterval(timer); seen.disconnect(); window.removeEventListener("wheel", onAnyWheel, { capture: true }); sb?.remove(); return origRemoved ? origRemoved.apply(this, arguments) : undefined; };
            const origConn = node.onConnectionsChange;
            node.onConnectionsChange = function () { const r = origConn ? origConn.apply(this, arguments) : undefined; setTimeout(() => { const n = count(); keepRows(); for (let i = 1; i <= n; i++) if (inView(i)) paint(i); if (divShow()) layout(); else node.setDirtyCanvas(true, true); }, 0); return r; };
            const origConfigure = node.onConfigure;
            node.onConfigure = function () {
                const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                if (!slot("prompt_to_divide")) node.addInput("prompt_to_divide", "STRING");   // un nodo salvato prima del 30/10: gli ingressi vengono dal file
                setTimeout(layout, 0); setTimeout(layout, 250);
                return r;
            };

            wDiv.hidden = undefined; divShow();   // nasce nascosto: nessun cavo ancora
            wFold.hidden = false; foldShow();     // nasce nascosto: una riga sola
            layout();
            setTimeout(layout, 200);
            return ret;
        };
    },
});
