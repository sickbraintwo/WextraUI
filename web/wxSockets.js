// WextraUI — every value of every node takes a cable, also on a node loaded from a file (Sick, 22/10/2026: «tutti i valori
// di tutti i nodi devono sempre accettare i cavi»). A new node gets a socket for each box from the schema, in the schema's
// order; a node loaded from a workflow gets the sockets the file saved, slot by slot over the new ones (LGraphNode.configure
// copies the saved list onto the fresh one by index). So a box added after the save has no socket when a retired input sat
// at its place (WReso's Multiply under the old ratio_width / ratio_height), and a box whose type changed keeps the socket of
// the old type (`multiple`, a menu until 22/10: an INT cable is refused).
// The repair is made on the saved list, BEFORE the frontend reads it, and only for what is listed here by name: a saved
// socket of a RETIRED input with no cable becomes, at the same index, the socket the fresh node has there; a socket of a
// CHANGED box with no cable gets its new type. The indexes do not move, so every cable keeps its slot. Nothing else is
// touched: some nodes leave boxes without a socket on purpose (WSwitch, WPrompt Rows: the rows are the node's own) and
// some sockets have a type of their own (`*` on the values of WSave Image). A first version (22/10, 22:16) fixed every
// box by the schema and broke both: never again a repair by rule, only by list.
import { app } from "../../scripts/app.js";

const TYPES = new Set(["INT", "FLOAT", "BOOLEAN", "STRING", "COMBO"]);
// inputs taken out of a node after a release: their saved socket gives its place back when it has no cable
const RETIRED = { wxReso: ["ratio_width", "ratio_height"] };
// boxes whose type changed after a release: the saved socket of the old type gets the new one when it has no cable
const CHANGED = { wxReso: { multiple: "INT" } };

const PACK = new RegExp("^(" + Object.keys(RETIRED).concat(Object.keys(CHANGED)).join("|") + ")$");

/** The boxes of the schema that must have a socket: Map name -> type. */
function boxesOf(node) {
    const spec = node.constructor?.nodeData?.input || {}, out = new Map();
    for (const sec of ["required", "optional"]) {
        for (const [name, sp] of Object.entries(spec[sec] || {})) {
            const t = Array.isArray(sp?.[0]) ? "COMBO" : sp?.[0], o = sp?.[1] || {};
            if (!TYPES.has(t) || o.forceInput || o.socketless) continue;
            if (!(node.widgets || []).some((w) => w.name === name)) continue;
            out.set(name, t);
        }
    }
    return out;
}

/** The saved sockets put right in place, before the configure: `info.inputs` is changed; returns what changed. */
export function wxRepairSaved(node, info) {
    const saved = info?.inputs, done = [];
    if (!Array.isArray(saved)) return done;
    const made = node.inputs || [], boxes = boxesOf(node), gone = RETIRED[node.type] || [], changed = CHANGED[node.type] || {};
    const savedNames = new Set(saved.map((s) => s?.widget?.name).filter(Boolean));
    for (let i = 0; i < saved.length; i++) {
        const s = saved[i];
        if (!s) continue;
        const wn = s.widget?.name ?? null;
        if (wn && changed[wn] && s.type !== changed[wn] && s.link == null) { s.type = changed[wn]; done.push(wn + ":" + s.type); continue; }
        if (!(gone.includes(wn ?? s.name) && s.link == null)) continue;
        const m = made[i], mn = m?.widget?.name;
        if (mn && boxes.has(mn) && !savedNames.has(mn)) {
            saved[i] = { name: mn, localized_name: m.localized_name ?? mn, type: boxes.get(mn), link: null, widget: { name: mn } };
            if (m.shape != null) saved[i].shape = m.shape;
            savedNames.add(mn);
            done.push(wn + ">" + mn);
        }
    }
    return done;
}

app.registerExtension({
    name: "WextraUI.sockets",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!PACK.test(nodeData.name)) return;
        const configure = nodeType.prototype.configure;
        nodeType.prototype.configure = function (info) {
            let done = [];
            try { done = wxRepairSaved(this, info); } catch (e) { console.warn("[WextraUI] sockets", e); }
            const r = configure.apply(this, arguments);
            if (done.length) console.info(`[WextraUI] ${this.type} #${this.id}: sockets ${done.join(" ")}`);
            return r;
        };
    },
});
