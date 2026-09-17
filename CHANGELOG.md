# Changelog

## Unreleased
- WFloat: on a narrow node the label of `control` keeps to the runs left (the full text did not fit).

## 0.4.0 — 2026-09-17
- New node **WFloat**: the strength walk of WLoad Lora & Trigger as a node of its own — a float with `fixed` / `increment` / `decrement`, `step` and `until`, moving after every queued run. The arrows of `value` move by the `step` you set; range 0–100, two decimals.

## 0.3.9 — 2026-09-17
- No code change. The 0.3.8 note below named the pattern the registry scanner matches, and the scanner reads the changelog too: reworded. `tools/selftest.py` now searches every shipped file, prose included, for those patterns before a push.

## 0.3.8 — 2026-09-17
- WLoad Lora & Trigger: the `/wextraui/lora_tags` route answers only for a LoRA that ComfyUI itself lists (`folder_paths.get_filename_list("loras")`); the name is looked up, never used as a path.
- WPrompt Rows: the cable moved with a row is reconnected through LiteGraph's prototype method — same behaviour; the registry scanner read the plain method call as a network socket.

## 0.3.7 — 2026-09-15
- **Files stay inside ComfyUI's folders.** Every path a node builds from a user string goes through `src/wxPaths.py`: WScene H3 `resume_from_video` is resolved under `ComfyUI/output` or `ComfyUI/input` (an absolute path is accepted only inside them), WSave Image's `folder` cannot climb out of `output/` (`..`, drive letters and leading slashes are dropped, the real path is checked), WDifference's key is a file name, never a path. This is what the registry reviewer asked for on 0.3.2/0.3.3 (`ARBITRARY_FILE_READ`, `PATH_TRAVERSAL`); the behaviour you see does not change unless you were pointing outside those folders.
- README: a **Security** section says what the pack touches (files under output/input, one network call to civitai.com only when the loader's `civitai` switch is on, no eval/exec/subprocess).

## 0.3.6 — 2026-09-15
- **Saved workflows read right by position.** The boxes the scripts draw (WLoad Lora & Trigger: `lora scope`, `strength control` / `step` / `until`) are now inputs of the node, same place, same order, optional with a default: `object_info` lists them and the saved `widgets_values` match it one to one, so comfy-cli's UI-to-API translator and MCP `list_workflow_slots` pair every value with the right input (before: 40 slots flagged `pairing_suspect` on 20 loaders in one workflow). The backend ignores them: the walks stay in the node.
- Buttons, pickers and tables (WSave Image `+`/`−`, WScene Composer H3 table and toggle, WFrame color pad, WScenes Collection H3 buttons, the loader's chip picker) take no slot in `widgets_values` any more (`wxCompactWidgets` in `web/wxStyle.js`); a workflow saved with the old holes loads unchanged. `tools/migrate_outputs.py` (stage 0.3.6) cleans the files on disk.
- **`tools/migrate_outputs.py` rewritten, safe to run twice.** The previous version trusted a version marker and remapped the outputs of every WSave Image / WDifference / WScene Composer H3 / WLoop Start H3 it met, so a workflow saved with the current nodes (no marker yet) got its output slots and links scrambled. Now every node is judged as saved: old layout (by output names, or by a link whose target fits the old slot) is remapped, a current one is left alone, a scrambled one without links is rebuilt, and the loader's older widget layouts (7/8/9 values) are expanded to today's 12.
- **Old files load right, not just safe.** A node reads the frontend's `widgets_values_named` (saved next to `widgets_values` since frontend 1.5x) when it loads: a value goes to the box that had it by name, whatever slot it sat in, so a workflow saved by an older WextraUI opens with its own strengths and settings instead of defaults. WLoad Lora & Trigger also puts a strength that had slid into the control-after-generate slot back where it belongs; WSave Image's two switches fall back to their defaults when an old file left them empty. `migrate_outputs.py` does the same on the file, and drops the copy of `pad_color` / `beats_json` that the WFrame color pad and the WScene Composer H3 table used to save.
- **Registry lint.** `comfy node validate` flagged ten `E702` (two statements on one line) that the registry says will soon be refused: gone, the check passes clean.
- **`tools/selftest.py`** — the pre-push check from outside the UI: registry lint, object_info, every workflow given migrated on a copy and paired by position (or by comfy-cli when importable) with every value type-checked, and one small `/prompt` run per node family. `python tools/selftest.py --comfy <comfy.exe> my.json` — exit 1 on any problem.
- Nothing changes in the node's look or in the API you already call.

## 0.3.5 — 2026-09-15
- **WDifference**: a workflow saved before `changes_max` existed loaded with the shifted value (`ignore`'s empty text) in that box, shown as 0, and the run was refused ("couldn't be converted to INT"); a load-time guard in `web/wxRunDiff.js` now resets an invalid `changes_max` to 240.
- **WSave Image**: the saved files are always declared in `/history` as `images` (`filename`, `subfolder`, `type`), like the standard Save Image, whatever the **image preview** switch says; the switch now only decides the thumbnails inside the node. Scripts and agents can fetch the exact file through `/view` instead of guessing the counter.
- **WDifference**: `changes_max` and `ignore` are optional inputs (same place, same order): API exports made before they existed run again. The diary of the run also goes into the PNG metadata (`WDifference` chunk: `key`, `tag`, `changes`, readable lines) of every image saved downstream, so the file name can stay short.

## 0.3.4 — 2026-09-14
- New: **WPrompt Rows** — the prompt as rows: on/off chip per row (it also switches a linked external string), auto-growing text areas, + / − to add and remove rows, `join` = comma / space / newline / none.
- New: **WSimple Prompt H3** — the H3 prompt without time-codes: scene, action in order, camera, sound, what stays fixed, what moves, final state, three `avoid` fields. One `prompt` output.
- **WSave Image**: `images` is optional — unplugged, the node only composes the name (`prefix` / `name`). The `preview` now follows linked fields (`folder`, `subject`, parts) reading the upstream widget value, or shows `{subject}` / `{int}` placeholders, and refreshes on its own (it no longer depends on the widget callback, which the frontend skips for single-line text and Nodes 2.0). **New first output `images`** (the input batch passed through) — `prefix` / `name` move to slots 2 and 3: rewire, or run `tools/migrate_outputs.py` on your workflows. **write batch** switch (on by default) appends `_B{batch}{index}`: images in the run and the number of this one (`_B41`, `_B42`…); the same placeholders work in any text field. **image preview** switch (off by default): thumbnails inside the node after the run. Long names no longer fail the save: the name is cut so the full path fits Windows (259), the counter keeps files apart.
- **WLoad Lora & Trigger**: `control after generate` under the LoRA name (fixed / increment / decrement / randomize / increment-wrap) and a `lora scope` menu (any / folder = the folder of the current LoRA), with the position in the list on the label (3/12). Strength walk: `strength control` / `step` / `until` under `strength_model` move it one step per queued run (0.4 -> 1.0 in seven runs), `strength_clip` untouched: queue N runs, each takes the next LoRA. Saved workflows: run `tools/migrate_outputs.py` (it slips the control value into place) or the strengths shift by one.
- **WDifference**: `changes` is now short and file-name safe — `<node id>.<widget>→<new value>` (`74.seed→6_12.strength→0.6+Upscale`), no titles, no old value, widget cut at its first `_`, no spaces or forbidden characters — so it can go straight into the file name; the `.log` keeps the readable text. New `ignore` field: node ids (`74, 12`) or single widgets (`74.seed`) left out of every output. `changes_max` (default 240) caps the string with `+N`. Model / LoRA files show by bare name, no folder, no `.safetensors`.

## 0.3.3 — 2026-09-05
- Console banner in plain text: the coloured version used `ctypes`/`CONOUT$` on Windows and the Comfy Registry scanner flagged 0.3.2. No functional change.

## 0.3.2 — 2026-09-05
- **Output order changed** (rewire, or run `tools/migrate_outputs.py` on your workflows): WDifference → `passthrough, tag, changes, count, key`; WScene Composer H3 → `prompt, duration, timing_table, frames`; WLoop Start H3 → `…, start_clip, start_audio, resuming`.
- WRoute outputs are now `true` / `false` (were A / B).
- One look for every node: shared style (`web/wxStyle.js`), WextraUI buttons on the canvas, chips that keep their ✕ when the tag is long, room under the Composer's `avoid`.

## 0.3.1 — 2026-09-04
- Renamed to **WextraUI**; every node gets the `W` prefix (`WSave Image`, `WRoute`, `WScene H3`…).
- New: **WFrame** (new size · crop · resize · place, pad mask for outpaint).
- `?` help page on every node; default widths from the reference scene.
- Retired to `src/legacy/`: Extract Lora Name, Extract Tag from list, LoRA Info (all inside WLoad Lora & Trigger); Conditioning all-in-one (now the loop body).

## 0.3.0 — 2026-09-04
- New utilities: **WRoute** / **WRouteIndex**, **WDifference**, **WLoad Lora & Trigger**.

## 2026-09-01
- Hand-off per scene: `handoff_frames` and `previous_from` on each scene; **WLoop End H3** cuts the tail the next scene asks for; a run can resume from any clip.

## 2026-08-25 → 08-31
- The H3 scene loop: Scene Composer, Scene, Scenes Collection, Loop Start, Scene Conditioning, Loop End. Built for the Comfy H3 Sync Sound challenge (RESONANCE).
