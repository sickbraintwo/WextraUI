# WSave Image

Saves the PNGs and writes into the name of every file what made it. The name is yours to compose: a folder and a subject, then the parts you want, a counter of the width you prefer. Inside the file go the usual metadata (prompt and workflow), as in ComfyUI's Save Image.

## The parts
A new node is born with no part: `+` opens the first one (the button is there only while there are none). From then on every part has a slim bar above it (`part 1`, `part 2`…) with a handle **`≡`** on the left and two chips on the right: `−` removes that part and the ones after it move up, `+` opens an empty part right below and the ones after it move down. **Drag a part by its handle** to move it: it takes the place of the part you drop it on (that one lights up), the ones between move up or down. Values and cables follow their part: nothing to rewire.

## Save, or only name
`images` is optional. With nothing plugged in the node writes no file and only composes the name (`prefix` and `name` outputs): handy to feed a video or JSON save.

The `images` output (the first pin) passes the batch through as it is: save here and keep going (upscale, video, a second save) without a Reroute. Empty input, empty output.

## Batch and index
Two placeholders work in any text field (`folder`, `subject`, the text of a part): `{batch}` is how many images this run has, `{index}` is the number of *this* image, from 1, with as many zeros in front as it takes to reach `{batch}` (batch 4 → 1…4, batch 12 → 01…12). The **write batch** switch under the buttons (on by default) appends `_B{batch}{index}` for you: `image_S_0` → `image_S_0_B41`, `_B42`… Switch it off and place the placeholders where you prefer. The `preview` shows them as you wrote them; after a run it shows the first image's name, and so do `prefix` and `name`.

## The preview
The `preview` box follows every field while you type or rewire. A field driven by a cable shows the upstream value when the source node keeps it in a widget (Primitive, String, Int…), otherwise a placeholder like `{subject}` or `{int}`; after a run it shows the exact name the backend used. You know what you are about to save before pressing Run, not after.

## Long names
If folder, name and counter would exceed what Windows accepts (259 characters of full path), the name is cut and the counter keeps the files apart: a save never fails for a long name.

## Seeing the images in the node
**image preview** (the last switch, off by default) shows the saved images inside the node after the run, like Comfy's Save Image; off, the node stays compact. Either way the files are declared in `/history` as `images` (`filename`, `subfolder`, `type`), like the standard Save Image: a script fetches them through `/view`.

## {#id}: the value of a node at this run
Write `{#14}` in the value of a part (or in any text box: `_s{#9}`) and it becomes the value node 14 used in this run: the sampler's name for WSampler, the scheduler for WScheduler, the bare checkpoint or LoRA name for WCheckpoint and WLoRA, the number for WFloat and WInt🌱, the slot that is on (from 0) for WSwitch. The backend reads it from the run's PROMPT, so the name always tells the value the run really used; the preview reads it from the graph, so you see the name change as the nodes walk. A node that is not in the run (muted, bypassed, deleted) gives nothing, and the preview shows `{#14?}`. The bar above the part says which node it is bound to (`part 3 · WSampler`, or the title you gave it).

This is where the time comes back: a grid of trials, and every file telling on its own what made it. You reopen nothing to see what you had tried.

## from Wnodes on graph: the proposal
The button lists the WextraUI nodes found in the workflow, **by type**, the type above its group (`— WSampler`, `— WInt🌱`…). Each by its name (the name of the type, or the title you gave it, never the title a node writes by itself), with its value of now (`WSampler = euler`) and, small on the right, the tag it will have in the name (below), its id and whether it walks. Ticked by default: the ones that walk (`walks`) or move on a carry cable (`on carry`); a node on `fixed` does not change, so it is not in the name unless you tick it. The ticked ones are in the order of the name, **slow → fast along the carry chain** (checkpoint, sampler, scheduler): drag a row by its handle `≡` to move it. `add` makes one part for each, after the parts you have: type set, value `{#id}`, and the text:
- `_sa_` for a WSampler, `_sc_` for a WScheduler, `_fr_` for a WFrame (its value is what it did, `c800x1000_p100x0`: the line above its stack);
- `_S_` for a WInt🌱 or WFloat whose value goes into a `seed` (or `noise_seed`), `_st_` for one that goes into `steps`, `_cfg_` for one that goes into a `cfg`: the node follows its cable to the input it feeds, through Reroute and Set / Get;
- otherwise the node's name (yours or the official one, no icon).

That value is **locked**: a bound part cannot lose its node by a slip; to let it go, remove the part with `−`. A node already bound reads `part 3` and cannot be added twice. The text is an ordinary text: change it if the tag is not the one you want.

## Good to know
- The parts made are ordinary parts: change the text, the type, the order, remove them with `−` (only the value is locked).
- WDifference stays on a cable: its `tag` is computed, not a value of the PROMPT.
- Pasting the nodes into another workflow gives them new ids: press `from Wnodes on graph` again.
- Inside a subgraph `{#12}` is the node 12 of that subgraph (the run names it `7:12`; the node looks there first, then at the root).
- The preview shows the name of the **next** run as soon as the nodes have walked (they move after queuing, like the seed); the file on disk has the name of the run that made it.
