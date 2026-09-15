# Developing WextraUI — rules for every change and every new node

Learned on 2026-09-15, when an agent read a saved workflow by position and found 40 boxes out of place, and the registry
refused three releases without a word. Each rule below cost a bug. Read it before touching a node, run the checks before a push.

## 1. The saved workflow is read by position — by ComfyUI and by everyone else

`widgets_values` is an array. ComfyUI restores it by position, comfy-cli / comfy-mcp / any script pair it by position against
`object_info` (required inputs, then optional, in declared order; one extra slot after a `seed` or a `control_after_generate`
input). So:

- **Every box the node shows is an input of `INPUT_TYPES`** (in `optional` when the backend ignores it), never a widget added
  by the JS alone. The JS attaches behaviour to the widget the frontend created from the schema (`node.widgets.find(name)`).
- **Widgets with no state of their own** (buttons, a picker that mirrors another box, a table that mirrors a JSON box) get
  `widget.serialize = false` **and** the node calls `wxCompactWidgets(node)` at the end of `nodeCreated`. Passing
  `{ serialize: false }` in the options is not enough: the frontend leaves a `null` (or a copy of the value) in the array.
- **New inputs go at the end of `optional`.** Inserting one in the middle shifts every value after it in old files.
- **Never rename an input, never reorder outputs** without (a) a rule in `tools/migrate_outputs.py` and (b) a load guard in
  the JS. The name is the key old files are restored by (`widgets_values_named`, saved by frontend ≥ 1.5x).

## 2. Loading an old file: right, not just safe

`wxCompactWidgets` restores every serializable widget **by name** from `widgets_values_named` after the frontend's positional
pass, and falls back to a full-index pass when the array still carries the old holes. On top of that each node keeps its own
guard in `onConfigure`:

- judge a value by **the widget's type** (`wxFits(widget, value)`: combo member, number, boolean, string) — never by the type
  of the value the widget holds now, which may be rubbish from the old file;
- when no name is available, recognise the old layout from the array itself (the loader does: control slot holding a number =
  the old `strength_model`), never from a version marker.

## 3. The migration script judges the node as saved

`tools/migrate_outputs.py` looks at output names, at the type of the link target, at the shape of `widgets_values`; it is safe
to run twice; it rewrites `widgets_values_named` when it rewrites `widgets_values`. The marker it leaves is information, not a
condition. Test it on **copies** of real files, never on the user's file, and check the second pass changes nothing.

## 4. Registry lint

`comfy node validate` runs ruff with the registry's rules: no two statements on one line (`a; b`), no `exec` / `eval`.
It refused ten `;` in 0.3.5 and says they will become errors. Keep it clean — it is step 1 of the selftest.

## 5. Before a push

```
python tools/selftest.py --comfy <path\to\comfy.exe> <one or more saved workflows.json>
```
registry lint · object_info · each file migrated on a copy and paired by position (or by comfy-cli when importable), every
value type-checked · one `/prompt` run per node family (needs ComfyUI up). Then, in the browser console of ComfyUI, paste
`tools/browser_check.js`: every node type is created fresh and compared with its schema, and nodes taken from old files are
loaded through `configure()` to see what the guards make of them. Test old files this way — a tab restored after F5 carries
the previous session's state, not the file.

## 6. The live install is a copy

`custom_nodes\WextraUI` is not the repo: copy each changed file (`cp` + `cmp`). JS → F5 in the browser; Python → restart
ComfyUI. Nodes that were bypassed in a workflow are dropped by comfy-cli's translator: the selftest pairs them by position too.
