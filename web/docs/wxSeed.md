# WInt🌱

A **seed that walks**, and the seed of a grid: WFloat on an integer, with `randomize` too. For any INT input: the KSampler's `seed` turned into an input, a batch index, a frame number.

## Use
- **value**: the seed that goes out.
- **selection**: where the walk is, and seeds of your own (below). The seed of now in the middle, lit; on the left the ones a step back, on the right the ones a step on: `40 41 [42] › 43 44`. The side the control goes to is lit, with its arrow (none on `fixed`); `random` on `randomize`; `↻` where the wheel comes round. At the right how many seeds are picked (blue) or how many places the wheel has, and a notch per place on the foot. A click on a seed of a side makes it the seed of now.
- **control**: `fixed`, nothing moves (with seeds in `selection`: the one you chose, else the first of them). `increment` / `decrement`: after every queued run `value` moves by `step`. `randomize`: any seed at every run. `increment-wrap`: forward by `step` to **`until`**, then round to the start, cable or no cable (below).
- **step**: how much it moves per run (1 by default). The walk starts from the value you set: 1 with step 2 gives 1, 3, 5… (the arrows of `value` move by the same step). Out of the view while there are seeds of your own: they are the walk.
- **until**: the arrival of the wheel. It shows only when it counts: on `increment-wrap`, or with a `carry` cable in or out (below). A box with a cable on it always shows.

The node takes the height of the rows it shows: it grows when `until` comes in (place it with some room under it). The label of `control` reads `control`, or `on carry` when a cable drives it; the walk is read on the row `selection`. Queue as many runs as you like: each one gets the next seed.

## Seeds of your own
Click the row **selection** under `value`, type a seed in the box and press Enter, or several at once, apart by a comma or a space, as the box shows: `1, 3, 6, 90, 1234`; the number at the right reads `4`, in blue, and the sides are the seeds of the list. From then on the walk goes through those seeds, in that order, as a wheel: `increment` the next one, `decrement` the one before, `randomize` any of them, round at the ends, and the `carry` cable beats at every round. **Drag** the seeds by their handle `≡` to set the order (the number on the left is the place in the walk), ✕ takes one out, `sort` puts them small to big, `clear` empties the list (the walk goes by `step` again). `step` and `until` do nothing while there are seeds in the list (they leave the view). `value` is always one of the seeds picked: a value outside the list goes to the first one at once, so the first run you queue is the first seed of the list, not a stray one; the arrows of `value` go to the next seed and the one before. On `fixed` the value **is the seed you chose**: the dot before every seed of the drop-down (the full one is the value of now; a click on another makes it the value of now), a click on a seed of a side of the row, or the arrows of `value`; none chosen, the first seed of the list (the list is the walk, `fixed` is its start). The choice is saved in the workflow; a node driven by a `carry` cable moves on the beat as before. The list is saved in the workflow (`selection` is an input of the node, optional, ignored by the backend).

**Drop a PNG saved by ComfyUI on the node** and the seed that made it joins the list: it is read from the prompt inside the file (this node's value, else the first WInt🌱 of that run, else the first `seed` found). A seed you liked a week later, back in the wheel; the file does not open as a workflow.

## ⟲ and ▶
On the row of the `carry` output, when the node walks: **`⟲`** puts the seed back to its first place (the first seed picked, the start of the wheel, the value you set) and, in a chain, every other wheel of the chain too; **`▶ 4`** does the same and queues the runs of the grid (4 seeds picked, or the wheel to `until`; in a chain, the sizes multiplied). A free walk by `step` has no size: only `⟲` then. The number goes in the **batch box next to Run** too: the next Run queues the grid again.

## The seed as a wheel
On **`increment-wrap`**, or with a `carry` cable **in or out**, the seed is a wheel: from the value you set (by hand: that is the start, kept in a hidden box) to **`until`**, by `step`; at the end it comes round to the start. `until` the same as the start = no arrival. On the other controls with no cable `until` does nothing, it is out of the view, and the walk is free.
- **No cable**, `increment-wrap`: `value` 1, `until` 4: seeds 1, 2, 3, 4, then 1 again. Four seeds, over and over, with nothing else moving.
- **Cable out** (into `carry` of WSampler, WScheduler, WCheckpoint, WLoRA or WFloat): the seed is the fast wheel. `value` 1, `until` 4, `increment`: seeds 1, 2, 3, 4 at every run, then round to 1 and one beat down the cable. Four seeds for every sampler, the seeds inside. The label of the input of the next node counts the runs: `carry · 4 × 7 = 28 runs`.
- **Cable in**: the seed is driven, the label reads `on carry`. It moves by `step` on the beat instead of at every run: forward, back with `decrement`, anywhere with `randomize` (a new seed for every full round of the wheel before it).

## Title
Collapsed, the node reads its name and the seed: *WInt🌱 · 1234*. The name is the node's own, or the one you typed; the seed follows `value`, run after run. Open it again and the title is the name alone.

## Good to know
- The run you queue uses the value you see; the node moves **after** queuing, like the seed.
- The walk lives in the node, in the interface. Through the API (or an agent) nothing walks: set `value` directly at every run.
