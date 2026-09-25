# WLoRA

Loads the LoRA **and** puts the trigger words you click into your prompt, in one node, in line: the prompt cable goes in on one side and comes out on the other with the words already in it. One node instead of Lora Loader + Extract Lora Name + Extract Tag + text concat.

## Where the words come from
- **rgthree info** (`rgthree_info` on, default): the official trigger words, read from the `<lora>.rgthree-info.json` that rgthree-comfy saves next to the LoRA once you open its info dialog there. No such file for the LoRA selected → the switch shows grey/off and only training tags feed the chips.
- **Training tags**: the captions' tags with their counts from the file header (`ss_tag_frequency`), most frequent first. All of them, like `meta_tags_list` of lora-auto-trigger-words.

`where` = prefix (words, then your prompt) or suffix; `separator` = what goes between. `separator` is multi-line: put a newline in it to get each word on its own line.

## Sockets
- `model` / `clip` optional: without a model the node only builds the prompt (an in-line trigger injector); `clip` may be missing for model-only LoRAs.
- `prompt` (STRING input, optional) → `prompt` output merged.
- Outputs: `MODEL`, `CLIP`, `prompt`, `name`, `carry` (the odometer cable, below). `carry` is also an input.

Strengths at 0 = LoRA not applied (like the core loader). The load itself is the core Lora Loader's code, so caching and formats are the same.

## The chip picker
Under the widgets the node lists the **official words** (when the rgthree info file is there) and the **training tags** (with counts, filter box for long lists), plus a `base:` line: what the file header says, then what the rgthree file says. Click a chip to pick it: picked chips sit on top, **drag** them to reorder, **✕** removes. Buttons: *all official*, *top 5*, *clear*. Nothing picked = nothing added (plain loader). The choice is saved in the workflow.

## folder
Above the LoRA name: the folders of your LoRA list at every depth (`(all)`, `Krea2`, `Krea2 / Characters`, `Krea2 / Characters / Heroes`…). Pick one and the LoRA menu, and the walk of `increment` / `decrement` / `randomize`, keep to that folder and what is under it. The label shows where the LoRA selected now sits in that folder (`folder · 3/12`; with `(all)`, in the whole list: `folder · 3/240`). That number is how many runs to queue. It lives in the node only: the LoRA is still saved as a full path, and `folder` is an input of the node (optional, in `object_info`), so the saved workflow keeps it in place for whoever reads it by position.

## control after generate
Under the LoRA name, like the seed: `fixed`, `increment`, `decrement`, `randomize`, `increment-wrap`. Queue several runs and each one takes the next LoRA in the folder chosen, in the order the menu shows them. The walk happens in the node between queued runs; the backend ignores it.

## A strength that walks
The loader has no walk of its own for the strength. Cable a **WFloat** on `strength_model` (and on `strength_clip`, if it should walk too): after every queued run it moves by its `step`, with no arrival and no floor. Negative strengths are legitimate. Set the LoRA to `increment` at the same time and you get one strength per LoRA, not a grid. For the grid, every strength for every LoRA, use `carry`.

## carry: the odometer cable
Two things that walk, one inside the other: `carry` **out** of the fast one, **into** the slow one. Put the fast node on `increment-wrap`: it turns by itself, and each time it comes back from the last name to the first it sends one beat down the cable, and the slow node moves one step of its own. Keep the slow node's control on `fixed` (it reads `on carry`): a driven node no longer moves at every run, it moves on the beat. `fixed` / `increment` one step forward, `decrement` one step back, `randomize` a random name.

Both ends of a menu wrap, so the beat goes on down a chain: WLoRA → WCheckpoint = every checkpoint × every LoRA of the folder. Or a WFloat driven by the LoRA: `carry` of the loader into `carry` of a WFloat on `strength_model`, and the strength moves by its step once per round of LoRAs. The label of the input counts the runs: `carry · 3 × 4 = 12 runs`. Put 12 in the queue and the grid makes itself. The order is fixed by the cable (the slow wheel is downstream); to go the other way round, turn the cable round. The backend is not in it: the cable passes a string, the beats happen in the interface between one queued run and the next.

## Title
The node is called *WLoRA* until you **collapse** it for the first time: from then on the title is the LoRA's name and follows `lora_name`. A collapsed node shows only its title, so that is where the name matters. Rename it by hand and it keeps your title.
