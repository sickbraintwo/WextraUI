# WLoop End H3

Closes one iteration of the loop: from the clip just rendered it cuts **the tail the NEXT scene asks for**.

## Inputs
- `scenes` + `scene_index` — the list and the absolute index of the scene JUST rendered.
- `images` — the decoded clip (all frames), `audio` — its decoded audio.

## What it does
Reads `handoff_frames` and `previous_from` of scene `scene_index + 1`:
- `loop` → last N frames + the matching N/24 s of audio of *this* clip.
- `file` → the same cut, taken from the file that next scene names (so a resumed scene ignores what was just rendered).

## Outputs
`last_frame` (→ loop value1) · `tail_clip` (→ value2) · `tail_audio` (→ value3) · `info`.
Wire the three to the For Loop end; *Scene Conditioning* reads them at the next iteration.
