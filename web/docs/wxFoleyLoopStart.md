# WLoop Start Foley

The sound of a whole video in one Run, with a prompt for every scene. The video goes in whole with a timeline of scenes; out comes the plan of the windows a video-to-audio model can take (LTX-2.3 with the Foley V2A LoRA: at most 7 s each), for an Easy-Use For Loop. Inside the loop, WLoop Window Foley hands out one window at a time and WLoop End Foley puts its sound into the mix; after the loop, the mix is the sound of the video.

## The loop
- **WLoop Start Foley** (outside the loop): the video + the timeline → `plan`, `windows` (the For Loop's `total`) and the empty `mix` (its `initial_value1`).
- **WLoop Window Foley** (inside): `plan` + the loop's `index` → the frames of this window, how many, the prompt and the seed of its scene.
- **WLoop End Foley** (inside, at the end): the audio just made goes into the mix at its place, with its fades.
- **WAonV** (after the loop): the whole sound on a video file, the picture copied as it is.

## The timeline
One line per scene: `time | prompt`, or `time | prompt | seed`. The time in seconds (`6`, `6.5`), minutes (`1:02.5`) or frames (`144f`). A line without `|` goes on with the prompt of the scene above; `#` = a comment. The first scene always starts at 0. It comes from WAudio Prompts, or by hand. The box grows with its text.
- **`+` before the time** (`+16.5 | ...`): a beat. The sound changes but the shot goes on, so the new sound fades in over `overlap`, the long fade of the windows of one scene, not over `cut_fade`. For the rest a beat counts as a scene (it has its number for `redo_scenes`).
- **common**: added at the end of every scene's prompt (`No speech is present. No music is present.` by default).

## The windows
- **window**: the longest window, in frames (1+8n). 169 = 7 s at 24 fps, the longest clip the Foley LoRA was trained on; longer ones drift. A scene longer than that is cut into windows of equal length that overlap.
- **overlap**: the seconds two windows of the same scene share: the cross-fade between them, and into a beat.
- **cut_fade**: the seconds of cross-fade between two scenes. On a cut, short (0.1): a cut in the picture is a cut in the sound; 0 = a hard cut. When one material melts into the next, longer (0.5 or more).
- **fps**: the frame rate the video is loaded at (Load Video: `force_rate` 24); the audio latent and the mask must say the same.
- **seed**: the seed of the scenes that do not write their own; each window of a scene adds 1.

## Redoing some scenes
- **redo_scenes**: empty = every scene. `4` · `4, 7` · `4-6` = only those scenes (numbered from 0, as in the info). Change their prompt or seed in the timeline first.
- **previous_audio**: the whole sound of an earlier run (a Load Audio of its flac). The loop makes only the windows of the scenes to redo and puts them into the old sound, which fades out there with the same fades the new ones fade in with. It must be the sound of this same video (same length within a second).

## Outputs
- **plan**: the windows: where each starts, how long it is, its prompt, seed and fades. For WLoop Window Foley and WLoop End Foley.
- **windows**: how many, for the For Loop's `total`.
- **mix**: the empty mix (or the old sound with holes, for a redo), for the For Loop's `initial_value1`.
- **info**: the scenes and the windows, one line each, for a Show Anything node.

## Good to know
- Load the video small (a custom width of 512 or so): the windows are scaled by WLoop Window Foley anyway, and a long video in high definition fills the memory.
- The sound of every window is made from the picture and the prompt of its scene; the hand-off between windows is in the sound only (the cross-fade), the picture is never changed.
