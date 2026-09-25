# WLoop Start H3

Decides **which scenes this Run renders** and what the first of them starts from.

## Widgets
- **start_scene**: `0` = the whole chain from `first_keyframe`. `N` = skip scenes 0…N-1 and resume at scene N, from the clip that scene names (`previous_from = file` + `resume_from_video` on its *WScene H3* node).
- **scene_count**: how many scenes from `start_scene`. `0` = all the remaining ones, `1` = just that scene.

## Sockets
- `scenes`: the list from *WScenes Collection H3*.
- `first_keyframe`: the start image for scene 0 when it does not resume from a file.

## Outputs
`run_count` (→ the For Loop's iteration count) · `start_scene` (→ *scene index = loop index + start_scene*) · `start_frame`, `resuming`, `start_clip`, `start_audio` (→ the loop's initial value1/2/3: the last frame, hand-off tail and audio the first scene of the run continues from).

## Typical settings
- Final film in one Run: `0 / <number of scenes>`.
- Re-render one scene only: on its Scene node set `previous_from = file` and `resume_from_video = <previous clip>`, then `start_scene = its index`, `scene_count = 1`.
