# WSampler

The **sampler menu as a node of its own**, with the seed-style **control after generate**. Turn the KSampler's `sampler_name` into an input, cable this node into it, and the sampler is chosen here.

## Sockets
- `selection` (drop-down, above): which samplers, in which order. `sampler_name` (menu + control): the sampler.
- Outputs: `sampler_name` (into the KSampler's `sampler_name` turned into an input), `name` (the same as text: a part for WSave Image, so every file says which sampler made it) and `carry` (the odometer cable, below). `carry` is also an input.

## The walk
Under the menu: `fixed`, `increment`, `decrement`, `randomize`, `increment-wrap`, like the seed. Queue several runs and each one takes the next sampler of the list, in the order the menu shows them. One prompt, one seed (`fixed`), every sampler: the images differ only by the sampler.

The walk happens in the node between queued runs; the backend only passes the name on.

## The selection
**selection**, the drop-down above the name, reads `all`. Open it and every name of the list has a tick box: tick the ones you want, close it (click outside or Esc), and the row reads `custom · 3`. From then on the ticked names **are the menu of the name**: the arrows, the list and the walk only meet them, in the order you give them. **Drag** the ticked rows to set that order (the number on the left is the place in the walk). If the name of now was outside the selection it moves to the first ticked one. Buttons: `clear` (no tick = the whole list, the row reads `all` again), `invert`, `list order` (the ticked names back in the order of the list). The selection is saved in the workflow (`selection` is an input of the node, optional, ignored by the backend).

## carry: the odometer cable
Two things that walk, one inside the other: `carry` **out** of the fast one, **into** the slow one. Put the fast node on `increment-wrap`: it turns by itself, and each time it comes back from the last name to the first it sends one beat down the cable, and the slow node moves one step of its own. Keep the slow node's control on `fixed` (it reads `on carry`): a driven node no longer moves at every run, it moves on the beat. `fixed` / `increment` one step forward, `decrement` one step back, `randomize` a random name.

Both ends of a menu wrap, so the beat goes on down a chain: WScheduler → WSampler → WCheckpoint = every checkpoint of the folder × every sampler × every scheduler of the selection. The label of the input counts the runs: `carry · 3 × 4 = 12 runs`. Put 12 in the queue and the grid makes itself. The order is fixed by the cable (the slow wheel is downstream); to go the other way round, turn the cable round. The backend is not in it: the cable passes a string, the beats happen in the interface between one queued run and the next.

## Title
The node is called *WSampler* until you **collapse** it for the first time: from then on the title is the sampler's name and follows the menu. Rename it by hand and it keeps your title.

See also **WScheduler**, the same for the scheduler. Set both to `increment` and they move together (sampler 3 with scheduler 3), not as a grid: for the grid, put a `carry` cable between them.
