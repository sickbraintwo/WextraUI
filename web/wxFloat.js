// WextraUI — WFloat / WInt🌱: a number that walks. After every queued run (afterQueued, like the seed) `value` moves by
// `step` in the direction of `control`, with no arrival and no floor: negative floats are legitimate.
// With a `carry` cable in or out (wxCarry.js, the odometer) the number becomes a wheel: from the value you set (kept in
// the hidden `start` box) to `until`, by `step`; at the end it comes round to the start and, if the cable goes out,
// sends its beat. Driven (cable in) it moves on the beat of the node at the other end instead of at every run.
// WInt🌱 on `increment-wrap` is the same wheel with no cable (Sick, 07/10): forward to `until`, then round to the start.
// Otherwise `until` does nothing: the walk is free, as it was.
// WInt🌱 also has `selection` under `value` (wxSelection.js, Sick 08/10): numbers of your own, in your order — seeds that
// are not one after the other. With any in it the walk goes through them, as a wheel, instead of by step: `step` and
// `until` do nothing then, and `value` is always one of them (a value outside goes to the first at once, Sick 09/10:
// the first run queued is the first seed picked, not the stray one). A PNG dropped on the node adds the seed that
// made it to the list (read from the prompt inside the file).
import { app } from "../../scripts/app.js";
import { getPngMetadata } from "../../scripts/pnginfo.js";
import { wxCarry } from "./wxCarry.js";
import { wxHideWidget } from "./wxStyle.js";
import { wxNumberList } from "./wxSelection.js";

const KIND = { wxFloat: "float", wxSeed: "int" };
const MAX_RANDOM = Number.MAX_SAFE_INTEGER;

/** The seed a run used, from the prompt saved in its PNG: the WInt🌱 with this node's id, else the first WInt🌱, else
 *  the first `seed` / `noise_seed` found (a KSampler's). Null when there is none. */
function seedInPrompt(prompt, nodeId) {
    const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
    const nodes = Object.entries(prompt || {}).filter(([, n]) => n && typeof n === "object");
    const mine = prompt?.[String(nodeId)];
    if (mine?.class_type === "wxSeed" && num(mine.inputs?.value) != null) return num(mine.inputs.value);
    for (const [, n] of nodes) if (n.class_type === "wxSeed" && num(n.inputs?.value) != null) return num(n.inputs.value);
    for (const [, n] of nodes) for (const k of ["seed", "noise_seed"]) if (num(n.inputs?.[k]) != null) return num(n.inputs[k]);
    return null;
}
const toast = (severity, summary, detail) => { try { app.extensionManager?.toast?.add?.({ severity, summary, detail, life: 3500 }); } catch (e) { /* no toast: nothing to say */ } };

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
            const wVal = W("value"), wCtl = W("control"), wStep = W("step"), wUntil = W("until"), wStart = W("start"), wSel = W("selection");
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
            // ---- the numbers of your own (WInt🌱: `selection` under `value`): with any, the walk is a wheel over them ----
            const parse = (t) => { const n = Number(t); return Number.isFinite(n) ? clamp(rnd(n)) : null; };
            const picker = isInt && wSel ? wxNumberList(node, wSel, wVal, { after: wVal, parse, onChange: () => { snap(); relabel(); } }) : null;
            const picks = () => { const l = picker?.list(); return l && l.length ? l : null; };
            // with numbers picked, `value` is one of them: a value outside goes to the first at once (the run you queue
            // next is the first seed picked, not the stray one)
            const snap = () => { const p = picks(); if (p && !p.includes(rnd(wVal.value))) setVal(p[0]); };
            // ---- the wheel: start → until by step, with a carry cable in or out or on increment-wrap; until = start means no arrival ----
            const startV = () => { const s = Number(wStart?.value); return wStart && wStart.value !== "" && Number.isFinite(s) ? rnd(s) : rnd(wVal.value); };
            const wheelOn = () => !!(carry?.linked() || wrapOn());
            const wheel = () => {
                if (!wUntil || !wheelOn() || picks()) return null;
                const s = startV(), u = rnd(wUntil.value), st = step();
                if (!Number.isFinite(u) || u === s) return null;
                return { s, u, st, d: u > s ? 1 : -1, n: Math.floor(Math.abs(u - s) / st + 1e-9) + 1 };
            };
            const at = () => {
                const p = picks();
                if (p) { const i = p.indexOf(rnd(wVal.value)); return i < 0 ? null : i; }
                const w = wheel(); if (!w) return null; const i = Math.round((rnd(wVal.value) - w.s) * w.d / w.st); return i >= 0 && i < w.n ? i : null;
            };
            const size = () => picks()?.length ?? wheel()?.n ?? null;
            let walking = false;   // our own moves do not reset the start
            // the walk back to its first place (the chips ⟲ / ▶ of wxCarry.js): the first number picked, the start of the wheel, the value set by hand
            const first = () => { const p = picks(), w = wheel(); setVal(p ? p[0] : w ? w.s : startV()); relabel(); };
            const setVal = (v) => { walking = true; try { if (v !== rnd(wVal.value)) { wVal.value = v; wVal.callback?.(v); } } finally { walking = false; } };
            const random = () => clamp(Math.floor(Math.random() * Math.min(hi(), MAX_RANDOM)));
            // one step: over the numbers picked, or on the wheel, "+" forward / "-" back / "rand" any place, coming round at
            // the ends (true when it comes round); off both, free — no arrival, no floor
            const move = (dir) => {
                const p = picks();
                if (p) {   // a value outside the numbers picked goes to the first of them
                    const n = p.length, i = at();
                    const next = i == null ? 0 : dir === "-" ? (i <= 0 ? n - 1 : i - 1) : dir === "rand" ? Math.floor(Math.random() * n) : (i + 1) % n;
                    setVal(p[next]);
                    relabel();
                    return n > 1 && i != null && (dir === "+" ? next === 0 : dir === "-" ? next === n - 1 : false);
                }
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
                const c = ctl(), p = picks(), w = wheel(), d = !!carry?.driven();
                // over the numbers picked: `next/run · 4 picked ↻`; on the wheel: `+1/run · 1 → 4 ↻`; free: `+1/run`
                const by = p ? (c === "randomize" ? "random" : c === "decrement" ? "back" : "next") : c === "randomize" ? "random" : (c === "decrement" ? "−" : "+") + step();
                const arc = p ? ` · ${p.length} picked` + (!d ? " ↻" : "") : w ? ` · ${fmt(w.s)} → ${fmt(w.u)}` + (c === "increment-wrap" && !d ? " ↻" : "") : "";
                wCtl.label = d ? "on carry · " + by + arc : c === "fixed" ? "control" : by + "/run" + arc;
                wStep.disabled = !!p;   // the numbers picked are the walk: step and until do nothing then
                if (wUntil) wUntil.disabled = !!p || !wheelOn();   // greyed out with no cable and not on increment-wrap: the walk is free then
                node.setDirtyCanvas(true, false);
            };
            // the value you set by hand is where the wheel starts.
            // The frontend's own callback of a number box snaps what it gets: an INT to min + k × step2 (so with the arrows
            // on `step` 2, 1 typed became 2 and the walk went 2, 4, 6 instead of 1, 3, 5), a FLOAT to the rounding of the
            // settings. Here the number is only rounded (an integer; two decimals) and clamped: the walk starts from the
            // value you set and moves by `step` from there.
            // With numbers picked the box is theirs: the arrows (± one step) go to the next / the one before in the list, any
            // other value typed goes to the first.
            let lastVal = rnd(wVal.value);
            const cbVal = wVal.callback;
            wVal.callback = function (v) {
                const rr = cbVal?.apply(this, arguments);
                const n = Number(v);
                if (Number.isFinite(n)) wVal.value = clamp(rnd(n));
                if (!walking && wStart) wStart.value = String(rnd(wVal.value));
                const p = picks();
                if (p && !walking && !p.includes(rnd(wVal.value))) {
                    const i = p.indexOf(lastVal), cur = rnd(wVal.value), st = step();
                    if (i >= 0 && cur === lastVal + st) setVal(p[(i + 1) % p.length]);
                    else if (i >= 0 && cur === lastVal - st) setVal(p[(i - 1 + p.length) % p.length]);
                    else setVal(p[0]);
                }
                lastVal = rnd(wVal.value);
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
            carry = wxCarry(node, { control: () => wCtl, at, size, move, first, labelControl: false });
            // two decimals shown on step (the arrows still move by 0.1)
            if (!isInt) { wStep.options = wStep.options || {}; wStep.options.precision = 2; }
            // a PNG saved by ComfyUI dropped on the node (WInt🌱): the seed of the run that made it goes into the list (the
            // prompt inside the file: this node's value, else the first WInt🌱, else the first seed found). The drop is taken
            // either way, so the file does not open as a workflow over the one on the canvas.
            if (picker) {
                node.onDragOver = (e) => !!e?.dataTransfer?.types?.includes?.("Files");
                node.onDragDrop = async function (e) {
                    const f = e?.dataTransfer?.files?.[0];
                    if (!f) return false;
                    if (!/\.png$/i.test(f.name || "") && f.type !== "image/png") { toast("warn", "WInt🌱", "Drop a PNG saved by ComfyUI: the seed that made it goes into the list."); return true; }
                    let seed = null;
                    try { const meta = await getPngMetadata(f); seed = seedInPrompt(JSON.parse(meta?.prompt || "null"), node.id); } catch (err) { seed = null; }
                    if (seed == null) { toast("warn", "WInt🌱", "No seed in this file (no prompt inside it, or no seed in the prompt)."); return true; }
                    const added = picker.add(String(seed));
                    toast("success", "WInt🌱", added ? `Seed ${seed} added: ${picker.list().length} picked.` : `Seed ${seed} was in the list already.`);
                    snap(); relabel();
                    return true;
                };
            }
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
