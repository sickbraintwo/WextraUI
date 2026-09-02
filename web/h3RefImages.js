import { app } from "../../scripts/app.js";

// ref_image_1..9 a cascata: parte visibile solo il primo; quando lo colleghi
// compare il successivo, quando scolleghi spariscono le code vuote.
const MAX_REFS = 9;
const NODES = ["h3Scene", "h3Conditioning"];
const NAME = (i) => "ref_image_" + i;

app.registerExtension({
    name: "WextraX.H3RefImages.Cascade",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!NODES.includes(nodeData.name)) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const ret = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;

            const idxOf = (name) => node.inputs ? node.inputs.findIndex((i) => i.name === name) : -1;
            const isLinked = (name) => {
                const idx = idxOf(name);
                return idx !== -1 && node.inputs[idx].link != null;
            };

            const sync = () => {
                // ultimo ref collegato
                let last = 0;
                for (let i = 1; i <= MAX_REFS; i++) if (isLinked(NAME(i))) last = i;
                const want = Math.min(last + 1, MAX_REFS); // visibili: 1..want
                for (let i = 1; i <= want; i++) {
                    if (idxOf(NAME(i)) === -1) {
                        // reinserisce l'input mancante subito dopo il ref precedente
                        node.addInput(NAME(i), "IMAGE");
                        const from = idxOf(NAME(i));
                        let to = i === 1 ? -1 : idxOf(NAME(i - 1)) + 1;
                        if (i === 1) {
                            const ra = idxOf("ref_audio");
                            to = ra !== -1 ? ra : from;
                        }
                        if (to !== -1 && to !== from) {
                            const [inp] = node.inputs.splice(from, 1);
                            node.inputs.splice(to, 0, inp);
                        }
                    }
                }
                for (let i = MAX_REFS; i > want; i--) {
                    const idx = idxOf(NAME(i));
                    if (idx !== -1 && node.inputs[idx].link == null) node.removeInput(idx);
                }
                node.setSize(node.computeSize());
            };

            // all'avvio: nasconde i ref oltre il primo slot libero
            sync();

            // un wf salvato ripristina i propri input dopo onNodeCreated
            const origOnConfigure = node.onConfigure;
            node.onConfigure = function () {
                const r = origOnConfigure ? origOnConfigure.apply(this, arguments) : undefined;
                sync();
                return r;
            };

            const origOnConnectionsChange = node.onConnectionsChange;
            node.onConnectionsChange = function (type, index, connected, link_info) {
                const r = origOnConnectionsChange ? origOnConnectionsChange.apply(this, arguments) : undefined;
                const inp = node.inputs && node.inputs[index];
                if (type === 1 && inp && /^ref_image_\d+$/.test(inp.name)) sync();
                return r;
            };

            return ret;
        };
    },
});
