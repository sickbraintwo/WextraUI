# WCheckpoint

The core **Load Checkpoint**, with a `folder` menu above the name and the seed-style **control after generate** under it. The load is the same as the core node (`MODEL`, `CLIP`, `VAE`, same caching and formats). On top, the clean name as a string.

## Sockets
- Outputs: `MODEL`, `CLIP`, `VAE`, `name` (the file name without folder and extension: a part for WSave Image, so every file says which model made it) and `carry` (the odometer cable, below). `carry` is also an input.

## folder
Above the name: the folders of your checkpoint list at every depth (`(all)`, `SDXL`, `SDXL / Realistic`, `SDXL / Realistic / Portraits`…). Pick one and the checkpoint menu, and the walk of `increment` / `decrement` / `randomize`, keep to that folder and what is under it; the checkpoint selected moves to the first one inside. The label shows where the checkpoint of now sits in that folder (`folder · 3/12`; with `(all)`, in the whole list). That number is how many runs to queue.

It lives in the node only: `ckpt_name` is still saved as a full path, and `folder` is an input of the node (optional, in `object_info`), so the saved workflow keeps it in place for whoever reads it by position. A folder that is gone never stops a run: the node opens with `(all)`.

## control after generate
Under the name, like the seed: `fixed`, `increment`, `decrement`, `randomize`, `increment-wrap`. Queue several runs and each one takes the next checkpoint of the folder chosen, in the order the menu shows them. One prompt, one seed, every model of a family, in one go: with `name` in the file name you know which is which. The walk happens in the node between queued runs; the backend ignores it.

## carry: the odometer cable
Two things that walk, one inside the other: `carry` **out** of the fast one, **into** the slow one. Put the fast node on `increment-wrap`: it turns by itself, and each time it comes back from the last name to the first it sends one beat down the cable, and the slow node moves one step of its own. Keep the slow node's control on `fixed` (it reads `on carry`): a driven node no longer moves at every run, it moves on the beat. `fixed` / `increment` one step forward, `decrement` one step back, `randomize` a random name.

Both ends of a menu wrap, so the beat goes on down a chain: WScheduler → WSampler → WCheckpoint = every checkpoint of the folder × every sampler × every scheduler of the selection. The label of the input counts the runs: `carry · 3 × 4 = 12 runs`. Put 12 in the queue and the grid makes itself. The order is fixed by the cable (the slow wheel is downstream); to go the other way round, turn the cable round. The backend is not in it: the cable passes a string, the beats happen in the interface between one queued run and the next.

## Title
The node is called *WCheckpoint* until you **collapse** it for the first time: from then on the title is the checkpoint's name and follows `ckpt_name`. A collapsed node shows only its title, so that is where the name matters. Rename it by hand and it keeps your title.
