# WLoop End H3

Closes one iteration of the loop: from the clip just rendered it cuts **the tail the NEXT scene asks for**.

## Inputs
- `scenes` + `scene_index`: the list and the absolute index of the scene JUST rendered.
- `images`: the decoded clip (all frames). `audio`: its decoded audio.

## What it does
Reads `handoff_frames` and `previous_from` of scene `scene_index + 1`:
- `loop` → last N frames + the matching N/24 s of audio of *this* clip.
- `file` → the same cut, taken from the file that next scene names (so a resumed scene ignores what was just rendered).

## Outputs
`last_frame` (→ loop value1) · `tail_clip` (→ value2) · `tail_audio` (→ value3) · `info`.
Wire the three to the For Loop end; *WLoop Scene Conditioning H3* reads them at the next iteration.

## The row of the loop
At the bottom of the node, `start`, `scene` and `end` on a thread; the arc is the way back, one dash per scene. The blue step is this node. During a Run the three nodes of the loop show the same moment: the step at work lights up, the thread towards `end` lights up while the body generates, the dash of the round fills with the sampler's steps and `3/9` counts the rounds. The result stays until the next Run; a Run where nothing changed runs nothing, and the row stays as it is. Interrupt leaves it where it stopped, in orange; an error shows in red. The node never changes size, so no cable moves. The three nodes know each other by the `scenes` cable, also through Set/Get; two H3 loops on the same list share the row.

The `v1` `v2` `v3` chips on `last_frame`, `tail_clip` and `tail_audio` mark a value of the For Loop: the same number on the three nodes and on the For Loop's `value1/2/3`.
