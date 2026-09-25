# WLoop Scene Conditioning H3

The **whole conditioning for `scenes[scene_index]` in one node**: text, canvas, first/last frame, guide, references and the motion/audio hand-off from the previous scene.

## Widgets
- **scene_index**: absolute index (loop index + start_scene), from the *mathInt* node.
- **megapixels**: canvas area. The aspect comes from the first frame (or the last frame when there is no first frame). `0` = the image's own size rounded to 32. `width`/`height` are used only when the scene has neither.
- **handoff**: anchor the previous scene's tail (`handoff_frames` of the scene) + its audio at frame 0, only when the scene continues from the previous one and `scene_index > 0`.
- **ref_image_size**: `match` = references scaled (down only) to the generation's pixel area · `max` = 2048 px short edge, best identity, several times slower.
- **picture_order**: how the text encoder numbers the pictures. `keyframes_first` = `<Picture 1/2>` are first/last frame, references after (the fl2va training order) · `refs_first` = references are `<Picture 1…n>`.

## Sockets
`scenes`, `clip`, `vae`, `audio_vae` (needed for the audio hand-off, guide_audio and ref_audio) · `previous_frame` = loop value1 · `previous_clip` = loop value2 (from *WLoop End H3*) · `previous_audio` = loop value3.

## Outputs
`positive` and `LATENT` for the sampler · `seed` (→ RandomNoise) · `prompt`, `frames`, `duration`, `width`, `height` · `first_image` (the frame actually used: preview it) · `info` (→ *Show Anything*).

## Notes
- The hand-off re-renders the tail: those frames are repeated at the start of the new clip. Trim them when you concatenate.
- Higher `megapixels` on a 24 GB card: 0.6 MP is the working point for 10–12 s clips with the int8 model; the text encoder alone needs ~25 GB of **system RAM**.
