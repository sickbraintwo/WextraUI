# MM H3 Conditioning (all-in-one)

Stand-alone MiniMax H3 conditioning — the same machinery *Scene Conditioning* uses inside the loop, for single clips outside it: first/last keyframes, a **mid-video guide** (image or short clip and/or audio anchored at `guide_frame`), reference images and audio, all in one node. Unconnected sockets are simply not used.

## Widgets
- **length** — frames on the 17k+5 grid (use the `frames` output of the Composer).
- **guide_frame** — frame index where `guide_image` / `guide_audio` is anchored (negative = from the end).
- **ref_image_size**, **picture_order** — as in *Scene Conditioning*.

## Sockets
`first_image` (the clip starts from it, stretched to the canvas, seen by the text encoder) · `last_image` (the clip lands on it, cover-cropped) · `guide_image` (5/22/39… frame clip or a still, latent only — like *Add Guide*) · `guide_audio` (cropped to the remaining duration) · `ref_image_1…9` (`<Picture n>`), `ref_audio` (`<Audio 1>`) · `audio_vae` needed only for audio inputs.

## Outputs
`positive`, `LATENT`, plus `pictures`: the `<Picture n>` map the text encoder actually sees — read it before writing the prompt.
