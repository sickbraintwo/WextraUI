# WSwitch

A switch with **slots**: several groups of cables come in, one group goes out. A slot holds `inputs_per_slot` cables of any type (3 = model, clip, vae).

## Use
- **The slots**: every slot is a box around its rows, the one that is on in blue. In the box, next to the first cable, its on/off **pill**: click one and the others go off. One slot is always on. After the pill, a pencil **`✎`**: the name of the slot (below); then a handle **`≡`**: the order of the slots.
- **The order**: drag a slot by its handle `≡` and drop it on another one (that one lights up): it takes that place, the ones between move up or down. Cables, pill and name go with the slot: nothing to unplug. `index` counts the new order.
- **The outputs**: the slot that is on goes out position by position. `out_1` is the first cable of the slot, `out_2` the second…
- **`index`** (first output): the number of the slot that is on, counted like an array, 0 = the first slot. Cable it to whatever must follow the same choice (a text, a second switch, a file name). The slot labels carry the same number (`0 · MODEL`, `1 · MODEL`…).
- **inputs_per_slot**: how many cables a slot holds (1 to 4). Set it **before wiring**: changing it reshapes the slots, and the cables of the positions that disappear are dropped.

Connect a cable to the last slot and an empty one appears below (2 to 20 slots).

## The names of the slots
**Click the pencil `✎`** after a pill (or double-click the pill) and type a name for its slot (`krea`); Enter keeps it, Esc leaves. A slot whose first cable comes from a checkpoint, LoRA or UNet loader has a name by itself: the bare file name, no folder, no extension (type one to replace it, empty the box to have it back). The row reads `0 · krea` instead of `0 · MODEL`. The names are for **WSave Image**: `{#id}` of the switch is the name of the slot that is on, its number from 0 when it has none (below). They live in `labels`, an optional input of the node, filled by the node and ignored by the backend.

## The walk
- **control**: `fixed`, or after every queued run the slot that is on moves over the slots in use (up to the last one with a cable). `increment` the next, `decrement` the one before, `randomize` any; it comes round at the ends. Queue as many runs as slots and each run takes the next branch.
- **carry**: the odometer cable, in and out, like every node that walks. Driven by a cable it moves on the beat (its control reads `on carry`); coming round from the last slot to the first it beats the node at the other end of its `carry` output. See *carry* in the README. On the row of the `carry` output, when the switch walks, **`⟲`** puts the first slot on (and every wheel of the chain back to its first place) and **`▶ 3`** does the same and queues the runs of the grid (the slots in use; in a chain, the sizes multiplied). The number goes in the **batch box next to Run** too: the next Run queues the grid again.
- In WSave Image, `{#id}` of a WSwitch is the name of the slot that is on (above), else its number counted from 0: `from Wnodes on graph` lists it.

## Good to know
- **The type of every position is learned from the first cable** you connect there: the same position of every slot and the output take it, the socket gets its colour and refuses another type. Unplug every cable of a position and it goes back to any type.
- The cables of the slots that are off are lazy: **the branches behind them do not run**. No VRAM, no seconds.
- Through the API the pills are the inputs `on_1` … `on_20` (booleans); the first one that is true wins. `control` and `carry` live in the interface and are ignored.
