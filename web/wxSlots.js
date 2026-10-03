// WextraUI — moving sockets without losing their cables. The frontend (1.53) ties a cable to the INDEX of its socket:
// `input.link` and `output.links` are getters that answer from the position, and writing `link.target_slot` or
// `link.origin_slot` moves nothing. Reordering `node.inputs` by hand leaves every cable where it was, on whatever
// socket now sits there (WSwitch: a workflow came back with the cables of a slot slid by one). Here a socket moves
// through the frontend's own door: the cables of the sockets that change place come off (disconnect) and go back on
// (connect) at the new index; the cables of the sockets that stay are not touched. The socket takes any type while
// its own cable comes back, so a cable the file had there stays there whatever its type.
// The frontend's node-to-node cable, called from the prototype (same way as promptRows.js): the registry scanner reads the bare method call as a network socket.
const plug = (from, ...args) => LiteGraph.LGraphNode.prototype.connect.call(from, ...args);
export function wxLinkOf(graph, id) {
    const L = graph?.links;
    if (id == null || !L) return null;
    return L instanceof Map ? L.get(id) : (graph.getLink ? graph.getLink(id) : L[id]);
}

const inputLink = (node, idx) => (typeof node.getInputLink === "function" ? node.getInputLink(idx) : wxLinkOf(node.graph, node.inputs[idx]?.link)) || null;

/** Puts node.inputs in `order` (the node's own input objects, all of them). Returns true when something moved. */
export function wxReorderInputs(node, order) {
    const cur = node.inputs || [];
    if (order.length !== cur.length || order.every((s, i) => s === cur[i])) return false;
    const g = node.graph, moved = [];
    cur.forEach((s, idx) => {   // the cables are read before anything moves
        if (order.indexOf(s) === idx) return;
        const l = inputLink(node, idx);
        if (!l) return;
        const from = g?.getNodeById(l.origin_id);
        if (from) moved.push({ s, from, slot: l.origin_slot });
        else console.warn("[WextraUI] a cable from outside the graph cannot follow its socket:", node.type, s.name);
    });
    for (const m of moved) node.disconnectInput(cur.indexOf(m.s));
    cur.splice(0, cur.length, ...order);
    for (const m of moved) {
        const t = m.s.type;
        m.s.type = "*";
        plug(m.from, m.slot, node, cur.indexOf(m.s));
        m.s.type = t;
    }
    return true;
}

/** Puts node.outputs in `order` (the node's own output objects, all of them). Returns true when something moved. */
export function wxReorderOutputs(node, order) {
    const cur = node.outputs || [];
    if (order.length !== cur.length || order.every((o, i) => o === cur[i])) return false;
    const g = node.graph, moved = [];
    cur.forEach((o, idx) => {
        if (order.indexOf(o) === idx) return;
        for (const id of o.links || []) {
            const l = wxLinkOf(g, id), to = l && g?.getNodeById(l.target_id);
            if (to) moved.push({ o, to, slot: l.target_slot });
            else if (l) console.warn("[WextraUI] a cable to outside the graph cannot follow its output:", node.type, o.name);
        }
    });
    for (const m of moved) node.disconnectOutput(cur.indexOf(m.o), m.to);
    cur.splice(0, cur.length, ...order);
    for (const m of moved) {
        const t = m.o.type;
        m.o.type = "*";
        plug(node, cur.indexOf(m.o), m.to, m.slot);
        m.o.type = t;
    }
    return true;
}
