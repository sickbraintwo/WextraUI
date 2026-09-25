# WInt🌱

A **seed that walks**, and the seed of a grid: WFloat on an integer, with `randomize` too. For any INT input: the KSampler's `seed` turned into an input, a batch index, a frame number.

## Use
- **value**: the seed that goes out.
- **control**: `fixed`, nothing moves. `increment` / `decrement`: after every queued run `value` moves by `step`. `randomize`: any seed at every run.
- **step**: how much it moves per run (1 by default).
- **until**: the arrival of the wheel, and only with a `carry` cable in or out (greyed out without one, below).

The label of `control` shows the step and its direction (`+1/run`, `random/run`). Queue as many runs as you like: each one gets the next seed.

## carry: the seed as a wheel
With a `carry` cable **in or out** the seed is a wheel: from the value you set (by hand: that is the start, kept in a hidden box) to **`until`**, by `step`; at the end it comes round to the start. `until` the same as the start = no arrival. Without a cable `until` does nothing, it is greyed out, and the walk is free.
- **Cable out** (into `carry` of WSampler, WScheduler, WCheckpoint, WLoRA or WFloat): the seed is the fast wheel. `value` 1, `until` 4, `increment`: seeds 1, 2, 3, 4 at every run, then round to 1 and one beat down the cable. Four seeds for every sampler, the seeds inside. The label of the input of the next node counts the runs: `carry · 4 × 7 = 28 runs`.
- **Cable in**: the seed is driven, the label reads `on carry`. It moves by `step` on the beat instead of at every run: forward, back with `decrement`, anywhere with `randomize` (a new seed for every full round of the wheel before it).

## Good to know
- The run you queue uses the value you see; the node moves **after** queuing, like the seed.
- The walk lives in the node, in the interface. Through the API (or an agent) nothing walks: set `value` directly at every run.
