# WFloat

A float with a **seed-style control**, for any FLOAT input: a LoRA strength (cable it on `strength_model` of *WLoRA*, directly or through Set/Get), a denoise, a CFG…

## Use
- **value**: the number that goes out. Negative values are legitimate.
- **selection**: where the walk is, and numbers of your own (below). The value of now in the middle, lit; on the left the ones a step back, on the right the ones a step on: `0.8 0.9 [1] › 1.1 1.2`. The side the control goes to is lit, with its arrow (none on `fixed`); `↻` where your numbers or the wheel come round. At the right how many numbers are picked (blue) or how many places the wheel has, and a notch per place on the foot. A click on a value of a side makes it the value of now.
- **control**: `fixed`, nothing moves (with numbers in `selection`: the one you chose, else the first of them). `increment` / `decrement`: after every queued run `value` moves by `step`, in that direction, with no arrival and no floor. `increment-wrap`: forward by `step` from the value you set to `until`, then round to the start, with no cable (below).
- **step**: how much it moves per run (two decimals). The walk starts from the value you set: 0.15 with step 0.1 gives 0.15, 0.25, 0.35… (the arrows of `value` move by the same step). Out of the view while there are numbers of your own: they are the walk.
- **until**: the arrival of the wheel. It shows only on `increment-wrap`, with a `carry` cable in or out (below), or with a cable on it.

The node takes the height of the rows it shows: it grows when `until` comes in (place it with some room under it). The label of `control` reads `control`, or `on carry` when a cable drives it; the walk is read on the row `selection`. Queue as many runs as you like: each one gets the next value.

## Numbers of your own
Click the row **selection** under `value`, type a number in the box and press Enter, or several at once, apart by a comma or a space, as the box shows: `0.5, 0.75, 1, 1.2`; the number at the right reads `4`, in blue, and the sides are the numbers of the list. From then on the walk goes through those numbers, in that order, as a wheel: `increment` the next one, `decrement` the one before, round at the ends, and the `carry` cable beats at every round. **Drag** the numbers by their handle `≡` to set the order (the number on the left is the place in the walk), ✕ takes one out, `sort` puts them small to big, `clear` empties the list (the walk goes by `step` again). `step` and `until` do nothing while there are numbers in the list (they leave the view). `value` is always one of the numbers picked: a value outside the list goes to the first one at once; the arrows of `value` go to the next one and the one before. On `fixed` the value **is the number you chose**: the dot before every number of the drop-down (the full one is the value of now; a click on another makes it the value of now), a click on a number of a side of the row, or the arrows of `value`; none chosen, the first number of the list (the list is the walk, `fixed` is its start). The choice is saved in the workflow; a node driven by a `carry` cable moves on the beat as before. The list is saved in the workflow (`selection` is an input of the node, optional, ignored by the backend). Two decimals, as `value`.

## carry: the float as a wheel
On **`increment-wrap`**, or with a `carry` cable **in or out**, the float is a wheel: from the value you set (by hand: that is the start, kept in a hidden box) to **`until`**, by `step`; at the end it comes round to the start. `until` the same as the start = no arrival. Otherwise `until` does nothing, it is out of the view, and the walk is as free as before: `decrement` from 1.0 with `until` at 2.0 goes on down, nothing stops it.
- **Cable in** (`carry` of WSampler, WScheduler, WCheckpoint, WLoRA or WInt🌱, on `increment-wrap`): the float is driven, the label reads `on carry` and the row `selection` the steps it will take (`5 5.5 6 … ↻`). It no longer moves at every run: it moves by `step` each time that node comes back from the last name to the first, forward, or back with `decrement`. Every sampler at cfg 5, then every sampler at cfg 5.5… The label of the input counts the runs: `carry · 4 × 7 = 28 runs` (without `until`: `a step every 4 runs`).
- **Cable out**: the float is the fast wheel. On `increment` it moves at every run, comes round at `until` and beats the node at the other end. Every cfg for every sampler, the cfg inside.

## Title
Collapsed, the node reads its name and the number: *WFloat · 0.75*. The name is the node's own, or the one you typed; the number follows `value`, run after run. Open it again and the title is the name alone.

## Good to know
- The run you queue uses the value you see; the node moves **after** queuing, like the seed.
- The walk lives in the node, in the interface. Through the API (or an agent) nothing walks: set `value` directly at every run.
