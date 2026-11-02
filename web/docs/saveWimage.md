# WSave Image

Saves the PNGs and writes into the name of every file what made it. The name is yours to compose: a folder and a subject, then the parts you want, a counter of the width you prefer. Inside the file go the usual metadata (prompt and workflow), as in ComfyUI's Save Image.

## The name is the editor
Under the outputs the node shows the name as it goes on disk: the folder on its own line, quiet; the subject; every part as a piece in a dashed box; the tail, faint (`_01.png` by the counter, `_B{batch}{index}` with batch on). Example: `Krea2/Characters/` over `lighthouse` `_v3` `_cfg3.50` `_01.png`.

The rows **folder** and **subject** are always there, under the chips: type there, or plug a cable into their socket; the name shows the value it brings.

**Click a part in the name to pick it**: it turns into a blue box and opens below, one at a time, as a head row (`≡`, `part 2 ▴`, `−` `+`) over its three rows `text2`, `type2`, `value2`, each with its socket: this is where a cable goes in. Click it again, or `part 2 ▴`, to shut it.

What is open is kept with the node (its properties), not in the values: a workflow saved before opens with nothing open, its values and cables as they were.

## The counter, batch, thumbnails
Three chips under the name: `‹ _01 ›` is the counter (the arrows set its digits, 0 to 8; 0 = `no counter`, the file is overwritten), **batch** appends `_B{batch}{index}`, **thumbnails** shows the saved images inside the node after the run. Blue when on. The counter in the name reads `_01` for two digits: it is the shape of the number, the real one is the first free in the folder.

## The parts
A new node is born with no part: `+ part` opens the first one; up to 10 parts. A part that is not open is **one row**: the handle **`≡`**, one box `text · type · value`, then `−` and `+`.
- Click the text or the value to type it (Enter or a click elsewhere keeps it, Escape drops it). Click the type to turn it: int → float → bool → string.
- `−` removes that part and the ones after it move up; `+` opens an empty part right below (the ones after it move down).
- **Drag a part by its handle** onto another part (its row or its piece in the name): it takes that place, the ones between move up or down.
- A text or a value on a cable keeps its socket on the row (two, one above the other, when both have one) and says the node it comes from, in blue: to unplug it, open the part.

Values and cables follow their part: nothing to rewire.

## Save, or only name
`images` is optional. With nothing plugged in the node writes no file and only composes the name (`prefix` and `name` outputs): handy to feed a video or JSON save.

The `images` output (the first pin) passes the batch through as it is: save here and keep going (upscale, video, a second save) without a Reroute. Empty input, empty output.

## Batch and index
Two placeholders work in any text field (`folder`, `subject`, the text of a part): `{batch}` is how many images this run has, `{index}` is the number of *this* image, from 1, with as many zeros in front as it takes to reach `{batch}` (batch 4 → 1…4, batch 12 → 01…12). The **batch** chip under the name (off by default) appends `_B{batch}{index}` for you: `image_S_0` → `image_S_0_B41`, `_B42`… Leave it off and place the placeholders where you prefer. The name shows them as you wrote them; after a run it tells, on hover, the first image's name, and so do `prefix` and `name`.

## The name follows you
The name follows every field while you type or rewire. A field driven by a cable shows the upstream value when the source node keeps it in a widget (Primitive, String, Int…), also through Reroute and Set / Get; a value another node builds only in the run (a text joined by a node, for instance) shows after the run, what it brought then, until the next one; before any run a placeholder like `{subject}` or `{int}`; after a run, the name on hover is the exact one the backend used. You know what you are about to save before pressing Run, not after.

## Long names
If folder, name and counter would exceed what Windows accepts (259 characters of full path), the name is cut and the counter keeps the files apart: a save never fails for a long name.

## Seeing the images in the node
**thumbnails** (the last chip, off by default) shows the saved images inside the node after the run, like Comfy's Save Image; off, the node stays compact. Either way the files are declared in `/history` as `images` (`filename`, `subfolder`, `type`), like the standard Save Image: a script fetches them through `/view`.

## {#id}: the value of a node at this run
Write `{#14}` in the value of a part (or in any text box: `_s{#9}`) and it becomes the value node 14 used in this run: the sampler's name for WSampler, the scheduler for WScheduler, the bare checkpoint or LoRA name for WCheckpoint and WLoRA, the number for WFloat and WInt🌱, the name of the slot that is on for WSwitch (the one you typed on its pill, or the loader's bare file name; its number from 0 when it has none). The backend reads it from the run's PROMPT, so the name always tells the value the run really used; the name on the node reads it from the graph, so you see it change as the nodes walk. A node that is not in the run (muted, bypassed, deleted) gives nothing, and the name shows `{#14?}`. The row of the part says which node it is bound to, in blue (`WSampler`, or the title you gave it).

This is where the time comes back: a grid of trials, and every file telling on its own what made it. You reopen nothing to see what you had tried.

## from Wnodes on graph: the proposal
The button lists the WextraUI nodes found in the workflow, **by type**, the type above its group (`— WSampler`, `— WInt🌱`…). Each by its name (the name of the type, or the title you gave it, never the title a node writes by itself), with its value of now (`WSampler = euler`) and, small on the right, the tag it will have in the name (below), its id and whether it walks. Ticked by default: the ones that walk (`walks`) or move on a carry cable (`on carry`); a node on `fixed` does not change, so it is not in the name unless you tick it. The ticked ones are in the order of the name, **slow → fast along the carry chain** (checkpoint, sampler, scheduler): drag a row by its handle `≡` to move it. `add` makes one part for each, after the parts you have: type set, value `{#id}`, and the text:
- `_sa_` for a WSampler, `_sc_` for a WScheduler, `_C_` for a WCheckpoint, `_L_` for a WLoRA (their value is the file name, no folder, no extension), `_fr_` for a WFrame (its value is what it did, `c800x1000_p100x0`: the line above its stack);
- `_S_` for a WInt🌱 or WFloat whose value goes into a `seed` (or `noise_seed`), `_st_` for one that goes into `steps`, `_cfg_` for one that goes into a `cfg`: the node follows its cable to the input it feeds, through Reroute and Set / Get;
- otherwise the node's name (yours or the official one, no icon).

That value is **locked**: a bound part cannot lose its node by a slip; to let it go, remove the part with `−`. A node already bound reads `part 3` and cannot be added twice. The text is an ordinary text: change it if the tag is not the one you want.

## Good to know
- The parts made are ordinary parts: change the text, the type, the order, remove them with `−` (only the value is locked).
- WDifference stays on a cable: its `tag` is computed, not a value of the PROMPT.
- Pasting the nodes into another workflow gives them new ids: press `from Wnodes on graph` again.
- Inside a subgraph `{#12}` is the node 12 of that subgraph (the run names it `7:12`; the node looks there first, then at the root).
- The name on the node is the one of the **next** run as soon as the nodes have walked (they move after queuing, like the seed); the file on disk has the name of the run that made it.
