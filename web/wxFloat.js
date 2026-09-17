// WextraUI — WFloat: the strength walk of WLoad Lora & Trigger on a plain float. After every queued run (afterQueued,
// like the seed) value moves by step towards until and stops there; the label of `control` says how many runs are left.
import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "WextraUI.float",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "wxFloat") return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            const W = (nm) => node.widgets.find((w) => w.name === nm);
            const r2 = (x) => Math.round(Number(x) * 100) / 100;
            const wVal = W("value"), wCtl = W("control"), wStep = W("step"), wUntil = W("until");
            if (!(wVal && wCtl && wStep && wUntil)) return r;
            const CTL = ["fixed", "increment", "decrement"];
            const ctl = () => (CTL.includes(wCtl.value) ? wCtl.value : "fixed");
            const step = () => Math.abs(r2(wStep.value)) || 0.1;
            const until = () => (Number.isFinite(Number(wUntil.value)) ? r2(wUntil.value) : 1);
            // how many runs to reach until, from the value of now
            const runsLeft = () => {
                const cur = r2(wVal.value), stp = step(), u = until();
                if (ctl() === "increment" && u > cur) return Math.ceil((u - cur) / stp - 1e-9) + 1;
                if (ctl() === "decrement" && u < cur) return Math.ceil((cur - u) / stp - 1e-9) + 1;
                return 1;
            };
            // the arrows of value move by the step chosen here (step2 = the frontend's real step, step = LiteGraph's, ten times it)
            const syncArrows = () => { wVal.options = wVal.options || {}; wVal.options.step2 = step(); wVal.options.step = step() * 10; };
            const relabel = () => {
                syncArrows();
                wCtl.label = ctl() === "fixed" ? "control"
                    : (node.size[0] >= 260 ? r2(wVal.value) + " → " + until() + " · " : "") + runsLeft() + " run";   // narrow node: only the runs fit
                node.setDirtyCanvas(true, false);
            };
            for (const w of [wVal, wCtl, wStep, wUntil]) { const cb = w.callback; w.callback = function () { const rr = cb?.apply(this, arguments); relabel(); return rr; }; }
            wCtl.afterQueued = () => {
                if (ctl() === "fixed") return;
                const cur = r2(wVal.value), stp = step(), u = until();
                let next = cur;
                if (ctl() === "increment" && cur < u) next = Math.min(u, cur + stp);
                if (ctl() === "decrement" && cur > u) next = Math.max(u, cur - stp);
                next = r2(next);
                if (next !== cur) { wVal.value = next; wVal.callback?.(next); }
                relabel();
            };
            // two decimals shown on step and until (the arrows still move by 0.1)
            for (const w of [wStep, wUntil]) { w.options = w.options || {}; w.options.precision = 2; }
            relabel();
            // born at its minimum width (a saved node keeps the size of its file: configure comes after)
            const min = node.computeSize();
            node.setSize([min[0], min[1]]);
            const tick = setInterval(relabel, 500);
            const origRemoved = node.onRemoved;
            node.onRemoved = function () { clearInterval(tick); return origRemoved ? origRemoved.apply(this, arguments) : undefined; };
            const origConfigure = node.onConfigure;
            node.onConfigure = function () { const rr = origConfigure ? origConfigure.apply(this, arguments) : undefined; setTimeout(relabel, 0); return rr; };
            return r;
        };
    },
});
