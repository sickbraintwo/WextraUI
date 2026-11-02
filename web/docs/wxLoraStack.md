# WLoRA Stack

Up to **twenty LoRAs loaded together in one run**, as twenty LoRA loaders in a row: the model and the clip go through every block that is on, from the top, and the words picked in those blocks go in front of your prompt, in the order of the blocks. One node instead of a column of loaders.

## Folder and selection
One **`folder`** and one **selection** on top, for every block: they narrow the LoRA menu of all the blocks at once (the label reads how many files the folder holds; the selection works as in WLoRA, `all · 27` or `custom · 3`). They only shorten the menus: the LoRAs already chosen in the blocks stay where they are. With `(all)` the blocks can take LoRAs from different folders.

A new block reads **`None`**: it is empty, loads nothing and adds no words. `None` is always first in the menu, so a block can go back to empty, and it is in no count: nor is a LoRA a block keeps from another folder.

While the selection reads `all` (nothing ticked), a button sits between the two: **load every LoRA into the blocks**. It puts the LoRAs of the folder in the blocks, in the order of the menu, from block 1 up to 20 (a locked block keeps its LoRA and is skipped), switches them on and sets `loras` to how many it loaded; each block reads the words of its new LoRA. The blocks below keep what they had. Tick something in the selection and the button goes away.

## Step
**`step`**, under the selection, is how much the arrows (and a drag) move **every strength** of the node, and how much each `control` moves them: `0.50` to start, two decimals, from `0.01` to `1.00`. It only changes the move: the strengths keep the value they hold, and a number typed in a strength stays as typed. It takes a cable like every number of the pack.

## How many blocks
`loras` (1 to 20) says how many blocks the node shows and loads, from the top. The blocks below keep their values: raise `loras` again and they come back as you left them. `loras` takes a cable like every number of the pack.

## The row `all`
Under `separator`, in the columns of the head rows: the **on / off** of every block in use at once (all on; when they are all on, all off; the switch stands in the middle when some are off), the **lock** of all of them (all locked, each keeping its on / off; when they are all locked, all unlocked), and the **`✕`** that takes every LoRA out: one new block is left. The `✕` is not there with one block only, nor while `loras` is on a cable. A click anywhere else on the row folds every block in use one step, as the fold button of a block: open, then without `rgthree info` and the picker, then one line, then open again; when the blocks are folded in different ways, the first click opens them all. The arrow on the right shows the fold they share.

## The head row of a block
From the left:
- **`≡`**, the handle: drag it onto another block and the block takes that place, the ones between move up or down. Its LoRA, strengths, `rgthree info`, picked words, on / off, fold and the cables on its strengths go with it.
- **on / off**, the switch: off = the LoRA is not loaded and its words stay out of the prompt. The block keeps its values and they stay editable, drawn faint, its card reduced to an outline.
- the **lock** (full and light blue when closed, a faint outline when open): a locked block keeps its on / off, on or off as you leave it, and stays out of the walk of `solo`, which moves among the other blocks. Lock the LoRAs that must be in every run (a style, a character), and `solo` tries the others one by one with them. The lock goes with the block when you drag it, and the load button leaves locked blocks as they are.
- the block's number, then, folded to one line, what it holds, in columns from block to block: the name, `1.00 / 1.00`, `3 words`.
- the fold button. A click on the row turns through three states: **open** `▾` (every row, the chip picker included), **without the tags** `▿` (the LoRA, its strengths and its control: `rgthree info` and the picker out of the view), **one line** `▸` (only the head).
- **`✕`**, after the lock: takes the block out of the stack. The blocks under it move up one place, with everything of theirs (as with the handle), and `loras` goes down by one. The block taken out goes to the bottom, out of view, as a new one, so raising `loras` again does not bring that LoRA back. Not there with one block only, nor while `loras` is on a cable.

A block not folded to one line is a **card**, a shade darker than the node from its head to its last row, so you see where it ends; the blocks folded to one line read as a list. Each block folds by itself: opening one never closes the others. A folded block still loads and still gives its words: folding only takes rows out of the view. The folds are saved with the workflow, in the node's properties, not among its values.

## The control of a block
Under the two strengths, **`control`** (`fixed`, `increment`, `decrement`), as the seed's: after every queued run the two strengths of that block move by `step`, up or down. Queue six runs on `increment` with the step at `0.10` and the block goes 1.00, 1.10, 1.20… A block that is off or beyond `loras` stays still, and so does a strength on a cable. The control goes with the block when you drag it.

Inside the row of each strength, before the number (in Nodes 2.0 inside the box, before the `+`), sits a **lock**: closed, the lock and the number turn light blue and the control leaves that strength where it is; open, a faint outline, the control moves it. By hand a locked strength still moves. A new block starts with `strength_clip` locked at 1.00 and `strength_model` open, so `increment` walks the model strength alone; click a lock to change it. The locks go with the block when you drag it, and are saved with the workflow.

## Solo
Under every block, **`solo`** (`fixed`, `increment`, `decrement`, `randomize`, `increment-wrap`) walks **one LoRA at a time**: after every queued run only the next block is on, the others off. It walks the blocks in use that hold a LoRA and are not locked, in their order (the locked ones stay on at every run): `increment` goes down to the last and stays there, `increment-wrap` comes round to the first, `decrement` goes up, `randomize` takes one at random, never the same twice in a row. Where the walk is = the first block that is on: switch `solo` off `fixed` with several blocks on and the first of them stays on, alone, so the next run already loads one LoRA. Queue five runs on `increment` with five blocks and each run loads one of them, top to bottom. The `control` of each block still works: the block of that run moves its strengths, then `solo` moves on.

On the row of the `carry` output, as on the other nodes that walk: **`▶ 5`** puts the walk back on the first block and queues one run per block (and the number in the batch box next to Run), **`⟲`** only puts it back. They show when `solo` is not on `fixed`. The **`carry`** cable works as on WLoRA: on `increment-wrap` the stack sends a beat to the next node each time it comes round from the last block to the first (every LoRA of the stack for every checkpoint, in one queue), and with a cable in its `carry` input it moves one block on the beat.

## Words and prompt
The words of every block that is on, block 1 first, then your prompt, with the **`separator`** between them: `, ` to start, written as typed. `\n` in the box is a new line. Each block's picker works as in WLoRA: official words from the rgthree info file next to the LoRA, training tags from its header, click to pick, drag to reorder, ✕ to remove.

## Sockets
- `model` / `clip` optional: without a model the node only builds the prompt.
- `prompt` (STRING input, optional) → `prompt` output with the words in front.
- `carry` in and out: the odometer cable (see Solo).
- Outputs: `MODEL`, `CLIP`, `prompt`, `name`, `carry`.

A block with both strengths at 0 is not applied, as in the core loader; its words still go in. Every strength takes a cable (a WFloat that walks on `strength_model_2`, for instance).

## name
The clean names of the blocks that are on, joined by ` + `: `hero_v2 + watercolor`. Cable it into WSave Image for the file name.

## A LoRA that walks
The strengths walk (the control of each block), and `solo` walks from one block to the next; the LoRA of a block stays the same at every run. For a LoRA that walks a whole folder, put a WLoRA before or after the stack, with its control and its `carry`.
