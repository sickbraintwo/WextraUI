# WCutScene

Where the shot changes in a video. The frames go in, the start of every scene comes out, one time per line; on the node, a sheet with the first, middle and last frame of each scene, to check the cuts by eye.

## How a cut is found
- Every frame, shrunk small, is compared with the one before: inside a shot the difference stays low, even with fast motion; at a cut it jumps. A frame is a cut when its jump is large in itself and much larger than the two frames before and after it, so fast motion (which raises all of them together), a flash (two jumps close together) and a fade from black (a slow climb) are not cuts.
- Two cuts closer than a quarter of a second count as one.
- **sensitivity**: higher finds softer cuts (and risks false ones), lower keeps only the clear ones. Used only while the `cuts` box is empty.
- What it cannot see: a cross-dissolve or a morph, which never jump. Write their time in the `cuts` box.

## The cuts box
- **Empty**: the cuts are found by the node and written here after the Run, one per line, with the scene number and its length after `#`.
- **Filled**: these times are used as they are, one per line: `6`, `6.5`, `1:02.5`, `144f` (frames). `#` starts a comment. Add a line for a cut that was missed, delete one that is too many; empty the box to have them found again.
- The box grows with its text, so every line is in view.

## The beats box
Times where the shot goes on but the sound changes: a drop falls, a match is struck. They are never found by the node, only written here by hand, one per line, and they are added to the cuts above. A beat makes a scene of its own, shown on the sheet in blue; on the `cuts` output its line starts with `+` (`+16.50`), which WAudio Prompts and WLoop Start Foley read as the same shot going on: the prompt keeps the place, and the sound fades in slowly instead of cutting in.

## The sheet
One cell per scene: its number and times, then its first, middle and last frame side by side. A cut that was missed shows as two different shots in one cell; a cut too many as the same shot in two. A fade from black leaves the first frame dark: the middle one shows the shot. A scene shorter than half a second is written in orange, a beat in blue.

## Inputs and outputs
- **images**: the whole video (a Load Video): the same frames that go on to WAudio Prompts and the Foley nodes.
- **fps**: the frames per second of the frames on the cable, to turn frames into seconds.
- **cuts** (output): the start of every scene, one time per line (the first is 0; `+` before a beat), with its number and length after `#`. For WAudio Prompts.
- **scenes**: how many scenes.

## Good to know
- The node runs with nothing on its outputs, like a Preview: the sheet shows anyway.
- The comparison is made on a small copy of the frames, read in chunks: a long video at full size does not fill the memory.
