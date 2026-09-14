# WSimple Prompt H3

A MiniMax H3 prompt **without time-codes**: the old way, where you describe what happens and the order of the sentences is the timeline. It keeps the things that must always be there in an H3 prompt, learned on the 3090 in August 2026.

## Fields (empty ones are skipped)
- **scene** — what we see before anything happens: place, subject, materials, light, look. Goes first, as written.
- **action** — what happens, in chronological order, with connectives (*first… then… finally…*). No numbers.
- **camera** — one idea for the whole clip. A still camera is said in full: `no camera movement whatsoever`; a single push-in on one beat made H3 drift on the whole clip.
- **sound** — born with the picture: timbre and texture (`crystalline harmonics, glassy resonance`), never by absence (`a strange sound`). Say what stays silent too.
- **stays_fixed** — what must not move or change. H3 assumes the human scheme (head still, body still) unless told otherwise.
- **what_moves** — what moves, and how. Non-standard anatomies and mechanics (a jaw that stays while the skull bounces) are not deduced from the geometry: say them.
- **final_state** — how the clip ends. With a last frame on the socket, declare the return: `everything back to the exact pose of Image 1`.
- **avoid 1-3** — one thing each, short. Naming a thing can evoke it: three at most.

## Output
`prompt` — `scene`, `action`, then `Camera:`, `Sound:`, `What stays fixed:`, `What moves:`, `Final state:`, `Avoid: a; b; c.` as separate paragraphs.

## When to use the other one
When a beat must land at an exact second (sync, a flash at 4.0 s) or the clip is long enough to turn into a slideshow: that is *WScene Composer H3*, with a time-code per beat.
