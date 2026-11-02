# WScene Composer H3

Turns a storyboard into a **MiniMax H3 prompt with a time-code per beat**, so sound and picture are written together and land where you want them in the clip.

## Inputs
- **intro**: the part every beat shares. World, subject, camera, style. Goes first, untouched.
- **beats** (table / `beats_json`): one row per beat: `name`, `base_duration` (seconds on a 10 s reference), the lock, `text`; `✕` takes a beat out, `+ beat` adds one, the arrow in the corner of the head folds every text to one line. Write each text as `SOUND: … IMAGE: …`. H3 generates audio and video in the same pass, so the sound is described *with* the image, not after it.
- **total_duration**: seconds. Trained range ~5–15 s; 20 s verified on a 3090; longer untested.
- **sound**: global sound design, appended as `Sound: …`.
- **avoid**: appended as `Avoid: …`. It is *not* a negative prompt: naming a thing can evoke it. Keep it short.

## The bar of the clip
Over the table, a segment per beat as long as its real seconds, the seconds at each join under it: the lock on the locked beats, the flex beat in blue, hatched at the end the frames H3 adds rounding up. Drag an edge to change a length, by 0.1 s: it sets the beat before the flex beat, or the locked beat after it, and the flex beat absorbs the difference. A beat that scales takes the new length as its `base_duration`, so it can read `4.35`.

## How the timing works
- **Locked** beats keep their seconds whatever the total.
- The other beats are **scaled** from the 10 s reference to `total_duration`.
- The **last unlocked** beat is the *flex* beat: it absorbs whatever is left, so the `[start-end s]` tags always add up to the total.
- The frame count is snapped **up** to the 17k+5 grid H3 accepts (5, 22, 39 … 124 = 5.2 s, 481 = 20.04 s).

## Outputs
`prompt` (intro + `[0.0-1.0s] …` beats + Sound + Avoid) · `timing_table` (readable table with locked/scaled/flex flags) · `duration` · `frames` (the real H3 frame count).

## Limits
- One beat cannot be shorter than what H3 can actually render in it; sub-second beats are timing hints, not guarantees.
- H3 follows the *order* of the beats well and the exact seconds loosely.
