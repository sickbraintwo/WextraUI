# WInt🌱

A **seed that walks**, and the seed of a grid: WFloat on an integer, with `randomize` too. For any INT input: the KSampler's `seed` turned into an input, a batch index, a frame number.

## Use
- **value**: the seed that goes out.
- **selection**: seeds of your own, in your order (below). `free` = none, the walk goes by `step`.
- **control**: `fixed`, nothing moves. `increment` / `decrement`: after every queued run `value` moves by `step`. `randomize`: any seed at every run. `increment-wrap`: forward by `step` to **`until`**, then round to the start, cable or no cable (below).
- **step**: how much it moves per run (1 by default). The walk starts from the value you set: 1 with step 2 gives 1, 3, 5… (the arrows of `value` move by the same step).
- **until**: the arrival of the wheel: on `increment-wrap`, or with a `carry` cable in or out (greyed out otherwise, below).

The label of `control` shows the step and its direction (`+1/run`, `random/run`, `+1/run · 1 → 4 ↻` on the wheel, `next/run · 4 picked ↻` over your seeds). Queue as many runs as you like: each one gets the next seed.

## Seeds of your own
Under `value`, **selection** reads `free`. Open it, type a seed in the box and press Enter, or several at once, apart by a comma or a space, as the box shows: `1, 3, 6, 90, 1234`; the row reads `custom · 4`. From then on the walk goes through those seeds, in that order, as a wheel: `increment` the next one, `decrement` the one before, `randomize` any of them, round at the ends, and the `carry` cable beats at every round. **Drag** the seeds by their handle `≡` to set the order (the number on the left is the place in the walk), ✕ takes one out, `sort` puts them small to big, `clear` empties the list (the walk goes by `step` again). `step` and `until` do nothing while there are seeds in the list (they are greyed out). `value` is always one of the seeds picked: a value outside the list goes to the first one at once, so the first run you queue is the first seed of the list, not a stray one; the arrows of `value` go to the next seed and the one before. The list is saved in the workflow (`selection` is an input of the node, optional, ignored by the backend).

**Drop a PNG saved by ComfyUI on the node** and the seed that made it joins the list: it is read from the prompt inside the file (this node's value, else the first WInt🌱 of that run, else the first `seed` found). A seed you liked a week later, back in the wheel; the file does not open as a workflow.

## ⟲ and ▶
On the row of the `carry` output, when the node walks: **`⟲`** puts the seed back to its first place (the first seed picked, the start of the wheel, the value you set) and, in a chain, every other wheel of the chain too; **`▶ 4`** does the same and queues the runs of the grid (4 seeds picked, or the wheel to `until`; in a chain, the sizes multiplied). A free walk by `step` has no size: only `⟲` then. The number goes in the **batch box next to Run** too: the next Run queues the grid again.

## The seed as a wheel
On **`increment-wrap`**, or with a `carry` cable **in or out**, the seed is a wheel: from the value you set (by hand: that is the start, kept in a hidden box) to **`until`**, by `step`; at the end it comes round to the start. `until` the same as the start = no arrival. On the other controls with no cable `until` does nothing, it is greyed out, and the walk is free.
- **No cable**, `increment-wrap`: `value` 1, `until` 4: seeds 1, 2, 3, 4, then 1 again. Four seeds, over and over, with nothing else moving.
- **Cable out** (into `carry` of WSampler, WScheduler, WCheckpoint, WLoRA or WFloat): the seed is the fast wheel. `value` 1, `until` 4, `increment`: seeds 1, 2, 3, 4 at every run, then round to 1 and one beat down the cable. Four seeds for every sampler, the seeds inside. The label of the input of the next node counts the runs: `carry · 4 × 7 = 28 runs`.
- **Cable in**: the seed is driven, the label reads `on carry`. It moves by `step` on the beat instead of at every run: forward, back with `decrement`, anywhere with `randomize` (a new seed for every full round of the wheel before it).

## Good to know
- The run you queue uses the value you see; the node moves **after** queuing, like the seed.
- The walk lives in the node, in the interface. Through the API (or an agent) nothing walks: set `value` directly at every run.
