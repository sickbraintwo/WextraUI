# WScene H3

**One scene as a single object**: the prompt, its duration, the seed, where the clip starts and lands, an optional mid-clip guide, the references. Chain the objects with *WScenes Collection H3* and the loop renders them one after the other.

## The strip
Between the sockets and the rows, the scene on its time: on the left what it inherits from the scene before (hatched, as long as `handoff` in seconds), or a square if it starts on `first_frame` (an empty red square: the socket has no image, the Run would stop), or an empty circle if it starts from the text; a notch `guide` at `guide at`, when a guide is connected; a diamond `lands` at the end, when `last_frame` is connected. Under it, in words, where the scene starts, and the duration. The duration is read from the node on the cable when that node holds it; when the Run makes it, the strip says `no duration` and keeps its proportions on five seconds. The references are not on the strip: they are not anchored in time.

## Widgets
The rows read short names; the tooltip, the file and this page keep the names of the schema: `control` = `control_after_generate`, `start` = `first_frame_from`, `guide at` = `guide_frame_at`, `handoff` = `handoff_frames`, `previous` = `previous_from`, `resume clip` = `resume_from_video`.

- **seed**: set `control_after_generate` to *fixed* for a reproducible film.
- **first_frame_from**: `previous_scene`, the loop hands over the last frame of the previous clip (motion and audio hand-off apply) · `first_frame`, the image on the `first_frame` socket · `none`, free start from text (or land only on `last_frame`).
- **guide_frame_at**: seconds where `guide_frame` / `guide_audio` is anchored (negative = from the end).
- **handoff_frames**: how much of the previous clip's tail is re-rendered at the join, anchored at frame 0. 5 = 0.2 s, **22 = 0.92 s** (default), 39 = 1.6 s … 124 = 5.2 s. Longer = more music continuity across the join, more of the previous clip repeated. Ignored on scene 0 unless it resumes from a file.
- **previous_from**: `loop`, the scene rendered just before in this run · `file`, the clip in `resume_from_video` (work scene by scene, or start the chain from any clip).
- **resume_from_video**: relative to `ComfyUI/output` (or `ComfyUI/input`; an absolute path only inside them), e.g. `MM_H3_Loop/scene_4_S_1_00003-audio.mp4`.

## Sockets
- `prompt`, `duration`: from the Composer.
- `first_frame` (used only with `first_frame_from = first_frame`), `last_frame` (the clip lands on it).
- `guide_frame`, `guide_audio`: anchored at `guide_frame_at`.
- `ref_image_1…9`: character sheets, storyboards, style. Not anchored in time; cite them in the prompt as `<Picture n>` (see `picture_order` on the conditioning node).
- `ref_audio`: standalone reference audio (`<Audio 1>`).

## Watch out
- **A connected socket beats the prompt.** A scene with `first_frame` connected and `first_frame_from = first_frame` starts from that image, not from the previous clip: no hand-off, no audio continuity. Check the sockets before calling a scene "in the chain".
- Whatever is in the hand-off frames gets continued: if a character is still on screen in the previous tail, H3 keeps it.
