# WLoop Window Foley

Inside the Foley loop: one window of the plan, the one the For Loop's `index` points at. Out come its frames, how many they are, the prompt and the seed of its scene, ready for the video-to-audio sampler.

## Inputs
- **plan**: from WLoop Start Foley.
- **index**: the For Loop's `index`.
- **images**: the whole video, the same that goes into WLoop Start Foley. The window is cut from it; if the video is not the same, the node says so.
- **megapixels**: the window's size: the video's aspect at this area, sides to multiples of 32. 0.5 is about 960 × 544, the size the Foley LoRA was trained at; 0 = the size the video was loaded at (rounded to 32).

## Outputs
- **images**: the frames of this window, for the VAE Encode of the frozen video.
- **frames**: how many (1+8n), for the audio latent's `frames_number`.
- **prompt**: the prompt of this window's scene, with the common text after it, for the positive text encoder.
- **seed**: this window's seed (the scene's seed plus the window's number in it), for RandomNoise.
- **info**: where this window is (scene, start, length, size), for a Show Anything node.

## Good to know
- A long scene is several windows with the same prompt, overlapping by `overlap` seconds: the sound of each is made on its own and cross-faded into the next by WLoop End Foley.
- The frames are scaled with the same code Comfy's Upscale Image uses (bilinear, centred).
