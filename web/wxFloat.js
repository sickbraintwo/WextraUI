// WextraUI — WFloat / WInt🌱: a number that walks. After every queued run (afterQueued, like the seed) `value` moves by
// `step` in the direction of `control`, with no arrival and no floor: negative floats are legitimate.
// With a `carry` cable in or out (wxCarry.js, the odometer) the number becomes a wheel: from the value you set (kept in
// the hidden `start` box) to `until`, by `step`; at the end it comes round to the start and, if the cable goes out,
// sends its beat. Driven (cable in) it moves on the beat of the node at the other end instead of at every run.
// WInt🌱 on `increment-wrap` is the same wheel with no cable (Sick, 07/10): forward to `until`, then round to the start.
// Otherwise `until` does nothing: the walk is free, as it was.
import { app } from "../../scripts/app.js";
import { wxCarry } from "./wxCarry.js";
import { wxHideWidget } from "./wxStyle.js";

const KIND = { wxFloat: "float", wxSeed: "int" };
const MAX_RANDOM = Number.MAX_SAFE_INTEGER;

app.registerExtension({
    name: "WextraUI.float",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        const kind = KIND[nodeData.name];
        if (!kind) return;
        const isInt = kind === "int";
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            const node = this;
            const W = (nm) => node.widgets?.find((w) => w.name === nm);
            const rnd = isInt ? (x) => Math.round(Number(x)) : (x) => Math.round(Number(x) * 100) / 100;
            const wVal = W("value"), wCtl = W("control"), wStep = W("step"), wUntil = W("until"), wStart = W("start");
            if (!(wVal && wCtl && wStep)) return r;
            if (wStart) wxHideWidget(wStart, node);
            const CTL = ["fixed", "increment", "decrement", "randomize", "increment-wrap"];
            const ctl = () => (CTL.includes(wCtl.value) ? wCtl.value : "fixed");
            const wrapOn = () => ctl() === "increment-wrap";   // the wheel with no cable (WInt🌱: the menu offers it)
            const step = () => Math.abs(rnd(wStep.value)) || (isInt ? 1 : 0.1);
            const lo = () => (typeof wVal.options?.min === "number" ? wVal.options.min : -Infinity);
            const hi = () => (typeof wVal.options?.max === "number" ? wVal.options.max : Infinity);
            const clamp = (v) => Math.min(hi(), Math.max(lo(), v));
            const fmt = (v) => (isInt ? String(v) : String(rnd(v)));
            let carry = null;   // set below, once the control's afterQueued is in place
            // ---- the wheel: start → until by step, with a carry cable in or out or on increment-wrap; until = start means no arrival ----
            const startV = () => { const s = Number(wStart?.value); return wStart && wStart.value !== "" && Number.isFinite(s) ? rnd(s) : rnd(wVal.value); };
            const wheelOn = () => !!(carry?.linked() || wrapOn());
            const wheel = () => {
                if (!wUntil || !wheelOn()) return null;
                const s = startV(), u = rnd(wUntil.value), st = step();
                if (!Number.isFinite(u) || u === s) return null;
                return { s, u, st, d: u > s ? 1 : -1, n: Math.floor(Math.abs(u - s) / st + 1e-9) + 1 };
            };
            const at = () => { const w = wheel(); if (!w) return null; const i = Math.round((rnd(wVal.value) - w.s) * w.d / w.st); return i >= 0 && i < w.n ? i : null; };
            let walking = false;   // our own moves do not reset the start
            const setVal = (v) => { walking = true; try { if (v !== rnd(wVal.value)) { wVal.value = v; wVal.callback?.(v); } } finally { walking = false; } };
            const random = () => clamp(Math.floor(Math.random() * Math.min(hi(), MAX_RANDOM)));
            // one step: on the wheel "+" forward / "-" back / "rand" any place, coming round at the ends (true when it
            // comes round); off the wheel, free — no arrival, no floor
            const move = (dir) => {
                const w = wheel();
                if (!w) {
                    const cur = rnd(wVal.value), st = step();
                    setVal(dir === "rand" ? random() : clamp(rnd(dir === "-" ? cur - st : cur + st)));
                    relabel();
                    return false;
                }
                const i = at() ?? 0;
                const next = dir === "-" ? (i <= 0 ? w.n - 1 : i - 1) : dir === "rand" ? Math.floor(Math.random() * w.n) : (i + 1) % w.n;
                setVal(rnd(w.s + next * w.st * w.d));
                relabel();
                return w.n > 1 && (dir === "+" ? next === 0 : dir === "-" ? next === w.n - 1 : false);
            };
            // the arrows of value move by the step chosen here (step2 = the frontend's real step, step = LiteGraph's, ten times it)
            const syncArrows = () => { wVal.options = wVal.options || {}; wVal.options.step2 = step(); wVal.options.step = step() * 10; };
            const relabel = () => {
                syncArrows();
                const c = ctl(), w = wheel(), d = !!carry?.driven();
                const by = c === "randomize" ? "random" : (c === "decrement" ? "−" : "+") + step();
                const arc = w ? ` · ${fmt(w.s)} → ${fmt(w.u)}` + (c === "increment-wrap" && !d ? " ↻" : "") : "";
                wCtl.label = d ? "on carry · " + by + arc : c === "fixed" ? "control" : by + "/run" + arc;
                if (wUntil) wUntil.disabled = !wheelOn();   // greyed out with no cable and not on increment-wrap: the walk is free then
                node.setDirtyCanvas(true, false);
            };
            // the value you set by hand is where the wheel starts.
            // The frontend's own callback of a number box snaps what it gets: an INT to min + k × step2 (so with the arrows
            // on `step` 2, 1 typed became 2 and the walk went 2, 4, 6 instead of 1, 3, 5), a FLOAT to the rounding of the
            // settings. Here the number is only rounded (an integer; two decimals) and clamped: the walk starts from the
            // value you set and moves by `step` from there.
            const cbVal = wVal.callback;
            wVal.callback = function (v) {
                const rr = cbVal?.apply(this, arguments);
                const n = Number(v);
                if (Number.isFinite(n)) wVal.value = clamp(rnd(n));
                if (!walking && wStart) wStart.value = String(rnd(wVal.value));
                relabel();
                return rr;
            };
            for (const w of [wCtl, wStep, wUntil]) { if (!w) continue; const cb = w.callback; w.callback = function () { const rr = cb?.apply(this, arguments); relabel(); return rr; }; }
            wCtl.afterQueued = () => {
                const c = ctl();
                if (c === "fixed") return;
                move(c === "decrement" ? "-" : c === "randomize" ? "rand" : "+");
            };
            // the odometer cable: wrapped around afterQueued (coming round = a beat down the cable; driven = still, it
            // moves on the beat: forward, back with decrement, anywhere with randomize)
            carry = wxCarry(node, { control: () => wCtl, at, size: () => wheel()?.n ?? null, move, labelControl: false });
            // two decimals shown on step (the arrows still move by 0.1)
            if (!isInt) { wStep.options = wStep.options || {}; wStep.options.precision = 2; }
            relabel();
            // born at its minimum width (a saved node keeps the size of its file: configure comes after)
            const min = node.computeSize();
            node.setSize([min[0], min[1]]);
            const tick = setInterval(relabel, 500);
            const origRemoved = node.onRemoved;
            node.onRemoved = function () { clearInterval(tick); return origRemoved ? origRemoved.apply(this, arguments) : undefined; };
            const origConfigure = node.onConfigure;
            node.onConfigure = function () {
                const rr = origConfigure ? origConfigure.apply(this, arguments) : undefined;
                if (wStart && typeof wStart.value !== "string") wStart.value = "";   // a file from before the wheel: the start is the value as loaded
                setTimeout(relabel, 0);
                return rr;
            };
            return r;
        };
    },
});
