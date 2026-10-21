# WAudio Prompts

The sound prompt of every scene, written by a vision model looking at the frames. After WCutScene: its `cuts` say where each scene starts; for each one a few frames, in time order, go to Qwen3-VL together with the rules of a foley prompt (only sounds whose source is seen, material and timbre, what changes on screen, no invented events, no speech, no music). Out comes the timeline `time | prompt` for WLoop Start Foley.

## The model
- **clip**: Qwen3-VL from a Load CLIP (a `qwen3vl` file in `text_encoders`, type the default one), the same way the core node Generate Text uses it. Nothing outside ComfyUI, no server.
- **frames_per_scene**: how many frames of each scene the model looks at, spread over the scene and away from its edges (a fade or a cut frame says little). 6 by default.
- **seed**: only for the scenes written in this Run; another seed, another text.
- **context**: optional, a few words about the whole video (`a showreel of strange creatures`), given to the model with every scene.

## The prompts box
- **Empty**: every scene is written by the model and put here after the Run, as `time | prompt`, with a comment above each line that says the scene number and its times.
- **Filled**: the lines are kept as they are. A scene with no line, or with nothing after the `|`, is written again; so to redo one scene, empty its line and Run. A line whose time is no longer the start of a scene is kept at the bottom as a comment: nothing typed is lost.
- The lines are the ones WLoop Start Foley reads: `time | prompt`, or `time | prompt | seed` for a seed of your own; `#` = a comment.
- The box grows with its text, so every line is in view.

## The custom box
Prompts written by hand, the same `time | prompt` lines. A scene with a line here takes it, and the model is not asked for it; its own line in the `prompts` box, if any, stays there unused. The node never writes into this box: empty a line and the scene goes back to the model's text.

## Beats
A `+` time from WCutScene is not a new shot: the model is told the same shot goes on and is given the prompt of the stretch before, so the place and its sounds stay the same and only what changes is added. Its line keeps the `+` (`+16.50 | ...`), which WLoop Start Foley reads as a long fade instead of a cut.

## The sheet
On the node, after the Run: each scene's middle frame with its prompt. A scene written in this Run is marked; a scene taken from the custom box is marked as yours.

## Inputs and outputs
- **images**: the whole video, the same frames that went into WCutScene.
- **cuts**: the `cuts` output of WCutScene.
- **fps**: the frames per second of the frames on the cable.
- **timeline** (output): `time | prompt` per scene, for the timeline of WLoop Start Foley. The custom lines win over the model's.

## Good to know
- The frames are shrunk before they go to the model (the longer side 448 px): fewer image tokens, same content.
- The node runs with nothing on its outputs, like a Preview.
