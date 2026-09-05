# WDifference

Tells you **what you changed since the previous run** of this workflow: seeds, prompts, widget values, rewiring, nodes added or removed — as text, one line per change, right before saving.

## How it works
Every Save node embeds two hidden things in the file — the **PROMPT** (the API graph with every value the run used) and the **workflow** (the UI JSON, titles included); that is why dropping an output onto ComfyUI reopens the workflow that made it. This node receives the same two hidden inputs, keeps the previous run's PROMPT on disk and compares.

## Widgets
- **key** — `auto` = the workflow is recognised by its structure (same nodes and types = same key), so each workflow keeps its own history. Or write a name to compare across variants of a project.
- **log** — also append every run (timestamp + changes) to `output/_Wextra/rundiff/<key>.log`: a run diary for free.
- **tag_max** — longest `tag` (default 60 characters); beyond it the tag ends with `+N` = N more changes.

## Sockets
- `passthrough` (optional) — wire the thing you are about to save through here so the diff is computed at the right moment; it comes out unchanged.
- `changes` — the text. Empty on the first run and when nothing changed. Wire it to *Show Anything*, into a file-name part of *WSave Image*, or into a Note.
- `tag` — the same changes as a **short, file-name-safe** string: `246.strength=0.4_57.seed=77_12.text~_+Upscale`. `<node id>.<widget>=<new value>` (turn on node ids in the ComfyUI settings to read them); the widget name is cut at its first `_` (`strength_model` → `strength`) unless two changed widgets of that node would collide; `~` = a text longer than 14 characters changed (a prompt); `<id>.wire-x` = input x re-plugged; `+Title` / `-Title` = node added / removed. `first` on the first run, `same` when nothing changed. **Add it as a *string* part in WSave Image**: the file name tells you a week later what that run changed.
- `count`, `key`.

## Reading the lines
- `~ Composer I-a (#74) · seed: 2 → 6` — a value changed (node title, widget, old → new).
- `~ … (wiring)` — an input is now connected to a different node/slot.
- `+ … added` / `- … removed` — node appeared / disappeared.
The node always runs (cheap), so the log records every run, also the identical ones.

## Good to know
- The comparison is with the previous **run** of the same key, not with the previous saved file: a run that fails after WDifference still counts as 'previous'.
- The PROMPT holds the whole graph, also the branch a Route did not execute: a widget changed there is reported too.
- `passthrough` is optional: wiring `tag` or `changes` into the Save node is enough to make it run.
- **Display-only widgets are ignored**: the file-name preview of WSave Image, the text of Show Anything and the like (node types containing show / display / preview / debug) store what they showed last run and would change at every run.
