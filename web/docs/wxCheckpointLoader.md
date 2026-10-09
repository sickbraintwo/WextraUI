# WCheckpoint

The core **Load Checkpoint**, with a `folder` menu above the name, a `selection` drop-down under it and the seed-style **control after generate** under the name. The load is the same as the core node (`MODEL`, `CLIP`, `VAE`, same caching and formats). On top, the clean name as a string.

## Sockets
- `folder` (menu), `selection` (drop-down), `ckpt_name` (menu + control): the checkpoint.
- Outputs: `MODEL`, `CLIP`, `VAE`, `name` (the file name without folder and extension: a part for WSave Image, so every file says which model made it) and `carry` (the odometer cable, below). `carry` is also an input.

## folder
Above the name: the folders of your checkpoint list at every depth (`(all)`, `SDXL`, `SDXL / Realistic`, `SDXL / Realistic / Portraits`…). Pick one and the checkpoint menu, and the walk of `increment` / `decrement` / `randomize`, keep to that folder and what is under it; the checkpoint selected moves to the first one inside. The label shows where the checkpoint of now sits in the menu (`folder · 3/12`; with `(all)`, in the whole list). That number is how many runs to queue.

It lives in the node only: `ckpt_name` is still saved as a full path, and `folder` is an input of the node (optional, in `object_info`), so the saved workflow keeps it in place for whoever reads it by position. A folder that is gone never stops a run: the node opens with `(all)`.

## selection
Under `folder`: which checkpoints of that folder, in which order. The row reads `all · 12` (the menu as `folder` leaves it, and how long it is). Open it and every name of that menu has a tick box: tick the ones you want, close it (click outside or Esc), and the row reads `custom · 3`. From then on the ticked names **are the menu of the name**: the arrows, the list and the walk only meet them, in the order you give them. **Drag** the ticked rows by their handle `≡` to set that order (the number on the left is the place in the walk). If the checkpoint of now was outside the selection it moves to the first ticked one. Buttons: `clear` (no tick = the whole folder, the row reads `all · 12` again), `invert`, `list order` (the ticked names back in the order of the list).

The ticks follow the folder: change `folder` and only the ticked names inside the new one count; the others wait, and count again when their folder comes back (with `(all)`, every tick counts). The selection is saved in the workflow (`selection` is an input of the node, optional, ignored by the backend).

## control after generate
Under the name, like the seed: `fixed`, `increment`, `decrement`, `randomize`, `increment-wrap`. Queue several runs and each one takes the next checkpoint of the folder chosen, or of the selection, in the order the menu shows them. One prompt, one seed, every model of a family, in one go: with `name` in the file name you know which is which. The walk happens in the node between queued runs; the backend ignores it.

## carry: the odometer cable
Two things that walk, one inside the other: `carry` **out** of the fast one, **into** the slow one. Put the fast node on `increment-wrap`: it turns by itself, and each time it comes back from the last name to the first it sends one beat down the cable, and the slow node moves one step of its own. Keep the slow node's control on `fixed` (it reads `on carry`): a driven node no longer moves at every run, it moves on the beat. `fixed` / `increment` one step forward, `decrement` one step back, `randomize` a random name.

Both ends of a menu wrap, so the beat goes on down a chain: WScheduler → WSampler → WCheckpoint = every checkpoint of the folder × every sampler × every scheduler of the selection. The label of the input counts the runs: `carry · 3 × 4 = 12 runs`. Put 12 in the queue and the grid makes itself. The order is fixed by the cable (the slow wheel is downstream); to go the other way round, turn the cable round. The backend is not in it: the cable passes a string, the beats happen in the interface between one queued run and the next.

On the row of the `carry` output, when the node walks (alone with `increment`, or in a chain), two chips: **`⟲`** puts every wheel of the chain back to its first place (the first checkpoint of the folder or of the selection, the first sampler, the first seed), **`▶ 12`** does the same and queues the runs of the whole grid (a node alone: its folder or selection, `folder · 3/12` = 12 runs). The number goes in the **batch box next to Run** too: the next Run queues the grid again.

## Title
The node is called *WCheckpoint* until you **collapse** it for the first time: from then on the title is the checkpoint's name and follows `ckpt_name`. A collapsed node shows only its title, so that is where the name matters. Rename it by hand and it keeps your title.
