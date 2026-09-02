# MM H3 Scene

**One scene as a single object**: the prompt, its duration, the seed, where the clip starts and lands, an optional mid-clip guide, the references. Chain the objects with *MM H3 Collect Scenes* and the loop renders them one after the other.

## Widgets
- **seed** — set `control_after_generate` to *fixed* for a reproducible film.
- **first_frame_from** — `previous_scene`: the loop hands over the last frame of the previous clip (motion and audio hand-off apply) · `first_frame`: the image on the `first_frame` socket · `none`: free start from text (or land only on `last_frame`).
- **guide_frame_at** — seconds where `guide_frame` / `guide_audio` is anchored (negative = from the end).
- **handoff_frames** — how much of the previous clip's tail is re-rendered at the join, anchored at frame 0: 5 = 0.2 s, **22 = 0.92 s** (default), 39 = 1.6 s … 124 = 5.2 s. Longer = more music continuity across the join, more of the previous clip repeated. Ignored on scene 0 unless it resumes from a file.
- **previous_from** — `loop`: the scene rendered just before in this run · `file`: the clip in `resume_from_video` (work scene by scene, or start the chain from any clip).
- **resume_from_video** — absolute path or relative to `ComfyUI/output`, e.g. `MM_H3_Loop/scene_4_S_1_00003-audio.mp4`.

## Sockets
- `prompt`, `duration` — from the Composer.
- `first_frame` (used only with `first_frame_from = first_frame`), `last_frame` (the clip lands on it).
- `guide_frame`, `guide_audio` — anchored at `guide_frame_at`.
- `ref_image_1…9` — character sheets, storyboards, style: not anchored in time, cite them in the prompt as `<Picture n>` (see `picture_order` on the conditioning node).
- `ref_audio` — standalone reference audio (`<Audio 1>`).

## Watch out
- **A connected socket beats the prompt.** A scene with `first_frame` connected and `first_frame_from = first_frame` starts from that image, not from the previous clip — no hand-off, no audio continuity. Check the sockets before calling a scene "in the chain".
- Whatever is in the hand-off frames gets continued: if a character is still on screen in the previous tail, H3 keeps it.
