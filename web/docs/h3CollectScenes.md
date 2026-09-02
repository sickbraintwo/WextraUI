# MM H3 Collect Scenes

Lines up *MM H3 Scene* objects **in socket order** into the list the loop runs over. Socket `scene1` is scene 0, `scene2` is scene 1, and so on: that order is the film.

## Outputs
- **scenes** — the list (feed it to *Loop Range*, *Scene Conditioning* and *Handoff Tail*).
- **total_scenes**.
- **summary** — one line per scene (index, title of the prompt, seconds, seed, start, hand-off) — wire it to a *Show Anything* node to check the chain before pressing Run.

Empty sockets are skipped, so you can leave gaps while building.
