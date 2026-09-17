# WFloat

A float with a **seed-style control**: the strength walk of *WLoad Lora & Trigger*, on its own, for any FLOAT input (a LoRA strength through Set/Get, a denoise, a CFG…).

## Use
- **value** — the number that goes out.
- **control** — `fixed`: nothing moves. `increment` / `decrement`: after every queued run `value` moves by `step` towards `until`, then stays there.
- **step** — how much it moves per run (two decimals).
- **until** — where the walk stops.

With the walk on, the label of `control` reads `0.2 → 1 · 9 run`: where it is, where it goes, how many runs to queue to get there. Queue that many and each run gets the next value.

## Good to know
- The run you queue uses the value you see; the node moves **after** queuing, like the seed.
- The walk lives in the node, in the interface. Through the API (or an agent) nothing walks: set `value` directly at every run.
