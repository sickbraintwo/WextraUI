# WLoop End Foley

Inside the Foley loop, at the end of its body: the sound just made for one window goes into the mix, at its place, with its fades. At the last window the whole mix is brought under a ceiling, and after the loop the mix is the sound of the whole video.

## Inputs
- **plan**: from WLoop Start Foley.
- **index**: the For Loop's `index`.
- **audio**: the audio of this window, decoded.
- **mix**: the mix so far: the For Loop's `value1`.
- **ceiling_db**: at the last window, if the mix peaks above this the whole mix comes down until it does not. A volume change, not a limiter: nothing is squashed. 0 = off.

## The fades
- Between two windows of the same scene, and into a beat: the long cross-fade of `overlap` (set in WLoop Start Foley). Constant power, so the level does not dip in the middle.
- Between two scenes: the short `cut_fade`, so a cut in the picture is a cut in the sound.
- The first window of the video fades in from nothing; the last fades out at the end.
- On a redo (`redo_scenes`), the new windows fade in over the old sound exactly where it fades out.

## Outputs
- **mix**: the mix with this window in it, to the For Loop End's `initial_value1`. After the loop: the whole sound, as long as the video, 48 kHz stereo.
- **info**: what went in and where; at the last window, the peak of the mix and whether it was brought down. For a Show Anything node.

## Good to know
- The mix is kept at the length of the whole video from the first window, so every window lands at its own time, in any order.
- Save the mix with a Save Audio (flac): it is what `previous_audio` of WLoop Start Foley wants for a redo, and what WAonV puts on the video.

## The row of the loop
At the bottom of the node, `start`, `window` and `end` on a thread; the arc is the way back, one dash per window. The blue step is this node. During a Run the three nodes of the loop show the same moment: the step at work lights up, the thread towards `end` lights up while the body generates, the dash of the round fills with the sampler's steps and `3/9` counts the rounds. The result stays until the next Run; a Run where nothing changed runs nothing, and the row stays as it is. Interrupt leaves it where it stopped, in orange; an error shows in red. The node never changes size, so no cable moves. The three nodes know each other by the `plan` cable, also through Set/Get.

The `v1` chips on the two `mix` mark a value of the For Loop: the same number on the three nodes and on the For Loop's `value1`.
