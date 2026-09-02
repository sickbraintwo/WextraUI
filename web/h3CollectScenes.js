import { app } from "../../scripts/app.js";

const MAX_SCENES = 20;

app.registerExtension({
    name: "WextraX.H3CollectScenes.DynamicInputs",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "h3CollectScenes") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const ret = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            const node = this;

            const findInputIdx = (name) => node.inputs ? node.inputs.findIndex((i) => i.name === name) : -1;

            // Only "scene1" starts visible; scene2..sceneN are declared
            // optional on the backend but hidden here until the "+" button
            // reveals them, one at a time.
            for (let i = 2; i <= MAX_SCENES; i++) {
                const idx = findInputIdx("scene" + i);
                if (idx !== -1) node.removeInput(idx);
            }
            const s1 = findInputIdx("scene1");
            if (s1 !== -1) node.inputs[s1].label = "Scene 1";

            let sceneCount = 1;

            // A saved workflow restores its own scene1..sceneN inputs after
            // this hook has run — pick the count up from there, otherwise
            // "+ Add scene" would try to add a "scene2" that already exists.
            const origOnConfigure = node.onConfigure;
            node.onConfigure = function () {
                const r = origOnConfigure ? origOnConfigure.apply(this, arguments) : undefined;
                const n = (node.inputs || []).filter((i) => /^scene\d+$/.test(i.name)).length;
                if (n > 0) sceneCount = n;
                return r;
            };

            node.addWidget("button", "+ Add scene", null, () => {
                if (sceneCount >= MAX_SCENES) return;
                sceneCount += 1;
                node.addInput("scene" + sceneCount, "H3_SCENE");
                const idx = findInputIdx("scene" + sceneCount);
                if (idx !== -1) node.inputs[idx].label = "Scene " + sceneCount;
                node.setDirtyCanvas(true, true);
            });

            node.addWidget("button", "− Remove last scene", null, () => {
                if (sceneCount <= 1) return;
                const idx = findInputIdx("scene" + sceneCount);
                if (idx !== -1) node.removeInput(idx);
                sceneCount -= 1;
                node.setDirtyCanvas(true, true);
            });

            return ret;
        };
    },
});
