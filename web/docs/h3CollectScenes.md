# WScenes Collection H3

Lines up *WScene H3* objects **in socket order** into the list the loop runs over. The label of a socket is the number the loop gives that scene: `0 · scene` is scene 0, `1 · scene` is scene 1, and so on. That order is the film.

## The sockets
- Connect a scene to the last socket and an empty one appears below (up to 20), like the slots of WSwitch.
- Unplug a scene in the middle and the ones after it move up: the film closes the gap.
- The **`+`** chip after the label of a scene opens an empty socket right below it, to slip a scene in between; the ones after it move down. It stays until the next unplug.

## Outputs
- **scenes**: the list. Feed it to *WLoop Start H3*, *WLoop Scene Conditioning H3* and *WLoop End H3*.
- **total_scenes**.
- **summary**: one line per scene (index, seconds, seed, start, hand-off). Wire it to a *Show Anything* node to check the chain before pressing Run.
