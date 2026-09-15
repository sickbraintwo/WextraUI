# WLoad Lora & Trigger

Loads the LoRA **and** puts the trigger words you click into your prompt, in one node, in line: the prompt cable goes in on one side and comes out on the other with the words already in it. Replaces Lora Loader + Extract Lora Name + Extract Tag + text concat.

## Where the words come from
- **Civitai** (`civitai` on, default): the official trigger words of the model version, found by SHA-256 of the file (hashed once, cached in `output/_Wextra/lora/`).
- **Training tags**: the captions' tags with their counts from the file header (`ss_tag_frequency`), most frequent first — all of them, like `meta_tags_list` of lora-auto-trigger-words.

`where` = prefix (words, then your prompt) or suffix; `separator` = what goes between.

## Sockets
- `model` / `clip` optional: without a model the node only builds the prompt (an in-line trigger injector); `clip` may be missing for model-only LoRAs.
- `prompt` (STRING input, optional) → `prompt` output merged.
- `trigger_words` (ALL the LoRA's trigger words, whatever you picked), `civitai_list` and `tags_list` (LIST, for *Extract Tag*), `name`, `info`.

Strengths at 0 = LoRA not applied (like the core loader). The load itself is the core Lora Loader's code, so caching and formats are the same.

## The chip picker
Under the widgets the node lists the **Civitai trigger words** and the **training tags** (with counts, filter box for long lists). Click a chip to pick it: picked chips sit on top, **drag** them to reorder, **✕** removes. Buttons: *all civitai*, *top 5*, *clear*. Nothing picked = nothing added (plain loader). The choice is saved in the workflow.

`separator` is multi-line: put a newline in it to get each word on its own line.

## Title
The node is called *WLoad Lora & Trigger* until you **collapse** it for the first time: from then on the title is the LoRA's name and follows `lora_name` — a collapsed node shows only its title, so that is where the name matters. Rename it by hand and it keeps your title.

**control after generate** under the LoRA name, like the seed: `fixed`, `increment`, `decrement`, `randomize`, `increment-wrap` — queue several runs and each one takes the next LoRA in the list (in the order the menu shows them). The **lora scope** menu under it says which LoRAs the walk goes through: `any` = the whole list, `folder` = the folder of the LoRA selected now (it follows the LoRA as it moves). The label shows where you are in that list (`lora scope · 3/12`): that is how many runs to queue.

**Strength walk** under `strength_model`: `strength control` (`fixed` / `increment` / `decrement`), `strength step` (default 0.1) and `strength until` (default 1.0). After every queued run `strength_model` moves by one step towards `until` and stops there: 0.4, increment, until 1.0 = seven runs, and the label says so (`strength 0.4 → 1 · 7 run`). `strength_clip` is left alone. Set the LoRA to `increment` at the same time and you get one strength per LoRA, not a grid. `lora scope` and the three strength boxes are inputs of the node (optional, in `object_info`): the walks happen in the node between queued runs, the backend ignores their values, and the saved workflow keeps them in place for whoever reads it by position.
