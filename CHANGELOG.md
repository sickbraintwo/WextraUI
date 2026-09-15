# Changelog

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
