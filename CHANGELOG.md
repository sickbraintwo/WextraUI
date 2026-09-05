# Changelog

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
