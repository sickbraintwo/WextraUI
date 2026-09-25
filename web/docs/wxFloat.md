# WFloat

A float with a **seed-style control**, for any FLOAT input: a LoRA strength (cable it on `strength_model` of *WLoRA*, directly or through Set/Get), a denoise, a CFG…

## Use
- **value**: the number that goes out. Negative values are legitimate.
- **control**: `fixed`, nothing moves. `increment` / `decrement`: after every queued run `value` moves by `step`, in that direction, with no arrival and no floor.
- **step**: how much it moves per run (two decimals).
- **until**: the arrival of the wheel, and only with a `carry` cable in or out (greyed out without one, below).

The label of `control` shows the step and its direction, e.g. `+0.1/run` or `−0.1/run`. Queue as many runs as you like: each one gets the next value.

## carry: the float as a wheel
With a `carry` cable **in or out** the float is a wheel: from the value you set (by hand: that is the start, kept in a hidden box) to **`until`**, by `step`; at the end it comes round to the start. `until` the same as the start = no arrival. Without a cable `until` does nothing, it is greyed out, and the walk is as free as before: `decrement` from 1.0 with `until` at 2.0 goes on down, nothing stops it.
- **Cable in** (`carry` of WSampler, WScheduler, WCheckpoint, WLoRA or WInt🌱, on `increment-wrap`): the float is driven, the label reads `on carry · +0.5 · 5 → 8`. It no longer moves at every run: it moves by `step` each time that node comes back from the last name to the first, forward, or back with `decrement`. Every sampler at cfg 5, then every sampler at cfg 5.5… The label of the input counts the runs: `carry · 4 × 7 = 28 runs` (without `until`: `a step every 4 runs`).
- **Cable out**: the float is the fast wheel. On `increment` it moves at every run, comes round at `until` and beats the node at the other end. Every cfg for every sampler, the cfg inside.

## Good to know
- The run you queue uses the value you see; the node moves **after** queuing, like the seed.
- The walk lives in the node, in the interface. Through the API (or an agent) nothing walks: set `value` directly at every run.
