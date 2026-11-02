# WScheduler

The **scheduler menu as a node of its own**, with the seed-style **control after generate**. Turn the KSampler's `scheduler` into an input, cable this node into it, and the scheduler is chosen here.

## Sockets
- `selection` (above the name): where the walk is, and which schedulers, in which order. `scheduler` (menu + control): the scheduler.
- Outputs: `scheduler` (into the KSampler's `scheduler` turned into an input), `name` (the same as text: a part for WSave Image, so every file says which scheduler made it) and `carry` (the odometer cable, below). `carry` is also an input.

## The walk
Under the menu: `fixed`, `increment`, `decrement`, `randomize`, `increment-wrap`, like the seed. Queue several runs and each one takes the next scheduler of the list, in the order the menu shows them. One prompt, one seed (`fixed`), one sampler, every scheduler.

The walk happens in the node between queued runs; the backend only passes the name on.

## The selection
**selection**, the row above the name, reads the walk: the name of now in the middle, lit, the one before it on the left and the one after on the right, in the order of the menu, e.g. `sgm_uniform  [karras]  › exponential   9 ▾`. The side the control goes to is lit, with its arrow (`›` increment, `‹` decrement; none on `fixed` and `randomize`); at the ends of the menu the side is empty, unless the control is `increment-wrap`. A notch per name on the foot of the row marks the place of now. At the right, before `▾`, how many names the walk goes through (blue when they are your selection); under Nodes 2.0, where the frontend closes the control in a wand, the word of the control instead (`fixed`, `increment`…): a click turns it. A click on a name of a side makes it the name of now. A click anywhere else opens the drop-down: every name of the list has a tick box: tick the ones you want, close it (click outside or Esc), and the number at the right turns blue. From then on the ticked names **are the menu of the name**: the arrows, the list and the walk only meet them, in the order you give them. **Drag** the ticked rows to set that order (the number on the left is the place in the walk). If the name of now was outside the selection it moves to the first ticked one. Buttons: `clear` (no tick = the whole list again), `invert`, `list order` (the ticked names back in the order of the list). In the drop-down a dot sits before every name of the walk (the ticked ones; every name when none is ticked): the full one is the name of now, a click on another makes it the name of now, and on `fixed` it stays. The selection is saved in the workflow (`selection` is an input of the node, optional, ignored by the backend).

## carry: the odometer cable
Two things that walk, one inside the other: `carry` **out** of the fast one, **into** the slow one. Put the fast node on `increment-wrap`: it turns by itself, and each time it comes back from the last name to the first it sends one beat down the cable, and the slow node moves one step of its own. Keep the slow node's control on `fixed` (it reads `on carry`): a driven node no longer moves at every run, it moves on the beat. `fixed` / `increment` one step forward, `decrement` one step back, `randomize` a random name.

Both ends of a menu wrap, so the beat goes on down a chain: WScheduler → WSampler → WCheckpoint = every checkpoint of the folder × every sampler × every scheduler of the selection. The label of the input counts the runs: `carry · 3 × 4 = 12 runs`. Put 12 in the queue and the grid makes itself. The order is fixed by the cable (the slow wheel is downstream); to go the other way round, turn the cable round. The backend is not in it: the cable passes a string, the beats happen in the interface between one queued run and the next.

On the row of the `carry` output, when the node walks (alone with `increment`, or in a chain), two chips: **`⟲`** puts every wheel of the chain back to its first place, **`▶ 12`** does the same and queues the runs of the whole grid (a node alone: its selection). The number goes in the **batch box next to Run** too: the next Run queues the grid again.

## Title
Collapsed, the node reads its name and the scheduler: *WScheduler · karras*. The name is the node's own, or the one you typed; the scheduler follows the menu. Open it again and the title is the name alone. (Before 0.11.0 the title became the scheduler's name itself; a workflow saved that way gets its name back.)

See also **WSampler**, the same for the sampler.
