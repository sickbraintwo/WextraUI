# RESONANCE — technical diary

**Watch it:** [RESONANCE on ArtStation](https://www.artstation.com/artwork/Y8BKm6)

Submission for the **Comfy H3 Sync Sound Community Challenge** (RTX 5060 Ti categories: Best Technical/Workflow + "built with Comfy MCP" bonus). A ~77 s music video, video and audio generated together, shot by shot, entirely with **MiniMax-H3** in ComfyUI on a local RTX 3090, driven by a custom node pack, **WextraX**, and by an AI agent (Claude Code) that wrote the prompts, patched the workflow, judged the clips and ran part of the pipeline through the Comfy MCP server.

## What it is

A world that exists only where sound touches it. Total darkness; every sound emits a thin ring of light that reveals, for an instant, whatever it passes over, then fades back to black. The protagonist is a black mirror-polished, riveted iron skull, alone in a shallow pool. Sound doesn't accompany the image here — it *causes* it: a genuine "sync sound" premise, read literally, where the video could not exist without the audio it was born with.

Five acts, one continuous shot chain: a single drop of water (**I — Drop**) wakes the skull; a mechanical, hammer-driven pulse (**II — Hammer**) fills a ruined hexagonal hall with light; a scream tears the world open (**III — Delirium**); a false ending in the dark (**IV — Silence**) hides embers behind the eyes; and a nu-metal detonation (**V — Discharge**, four segments) raises a skeleton crew of riveted-iron figures into a pogo that collapses back into the same pool the video opened on.

## How it was made

**References and keyframes, before any video.** The skull's design, the room and the four riveted-iron figures (Chiodo, Toppe, Cappuccio, Canotta) started as still images: **Krea 2** text-to-image generated the base characters and the room ("Dirock", a ruined hexagonal gothic hall lit only by a sliver of moonlight through a collapsed wall), then a **character-sheet LoRA** (DynamicCharacterSheet) turned the chosen stills into turnaround/pose sheets. Every keyframe that a scene needed as its exact opening or closing frame — the skull settled crooked in the pool, the eyes lighting up in macro, the first frame built for an earlier take of the delirium scene — was then built or corrected with **Qwen Image Edit (QEdit)** directly inside ComfyUI: one edit instruction per pass, image references only when an identity had to be copied pixel-for-pixel (never described in words), everything else composited or painted where the model kept drifting off-brief.

**The H3 loop.** The final workflow, `MM_H3_Loop_RESONANCE.json`, is a single ComfyUI graph with a real loop (`easy forLoopStart`/`forLoopEnd`, not external orchestration): one **MM H3 Scene** node per act, each holding its own prompt composer, seed, and the rule for how it joins the previous clip. A **Collect Scenes** node gathers all nine scenes into one list in order; **MM H3 Scene Conditioning** runs the loop body (first/last frame, guide frame, reference images, audio hand-off); **MM H3 Loop Range** picks which scenes to (re)render; **MM H3 Handoff Tail** cuts, at the end of each iteration, exactly the tail frames the *next* scene will need. Every hand-off carries both video and audio: the last N frames (and N/24 s of audio) of one clip are fed back in as the anchor of the next, so the cut falls invisibly inside a beat instead of at a hard splice.

Nine scenes, one act split into four takes for act V (to keep single failed renders cheap — roughly 10–20 minutes to redo a segment instead of 40 for the whole act):

| # | Scene | Duration (s) | Seed | Hand-off from previous (frames) | Starts from |
|---|-------|--------------:|-----:|----------------------------------:|-------------|
| 0 | I-a — Drop | 7 | 2 | — | darkness, ends on a fixed keyframe |
| 1 | I-b — Tac (the settle) | 5 | 4 | 22 | previous clip |
| 2 | II — Hammer | 10 | 6 | 22 | previous clip |
| 3 | III — Delirium | 11 | 6 | 22 | previous clip |
| 4 | IV — Silence | 8 | 1 | 22 | previous clip |
| 5 | V-a1 — Awakening | 10 | 12 | 22 | previous clip |
| 6 | V-a2 — Apparitions | 12 | 66 | 22 | previous clip |
| 7 | V-b1 — Pogo | 9 | 6 | 22 | previous clip |
| 8 | V-b2 — Collapse | 9 | 1 | 5 | previous clip |

All nine seeds are `fixed` in the delivered workflow: one Run regenerates the whole chain exactly as submitted. Every clip's file name encodes its scene index and seed (`scene_<n>_S_<seed>`), which is also how the montage script identifies and orders them.

Scene III was the one exception until the last night: for days it started from a hand-built first frame instead of the previous clip's tail, because that tail contradicted what the scene needed to show (a closed mouth where an open, screaming mouth was required). The delivered take continues from scene II like every other scene, its 22-frame hand-off actually used. The earlier exception is what taught the montage script to compare the candidate hand-off frames against the actual tail of the preceding clip and trim nothing where they don't match, rather than trusting the field blindly.

**Model stack** (all local, on the 3090): MiniMax-H3 diffusion and text-video model in **INT8** (`minimax_h3_fl2va_pruned_int8_convrot`), Qwen3-VL-32B text encoder in **INT8** (`qwen3vl_32b_minimax_h3_int8_convrot`), the official H3 turbo LoRA (8-step), `res_multistep` sampler with the `simple` scheduler, 8 steps, denoise 1. Canvas 21:9 anamorphic, ~0.6 megapixels per frame (about 1184×512). Text encoder and diffusion weights don't fit together in 24 GB of VRAM, so they swap in and out of system RAM at every scene — see "How to reproduce" for what that requires.

## The prompting of H3 that actually worked

**Sound first, image second, in every beat.** Every prompt is written as a table of timestamps where the sound event is described before the light event it causes — timbre, not adjectives ("a crystalline metallic ping with glassy harmonics and a two-second reverb tail", never "a strange sound"). The last beat of a scene (what should be happening on the very last frame) is written with the same care as the first: it is the frame the next scene inherits.

**Rename the object, don't negate it.** The single most useful lesson of the whole production. Asking H3 for a "skeleton, not bone, black iron, avoid white/silver/bone" produced chrome-white bone skeletons three separate times — the noun *skeleton* drags its training prior into the frame regardless of how many negations surround it. The fix that worked on the first try: never say skeleton, ribs, or bones at all. Describe a "man-shaped frame of black riveted iron plates, built like the skull" instead. Same principle carried the skull itself, which had to read as a character with a scowl and a "knowing grin" rather than an anatomical specimen — sculpted personality described directly, not implied through negation.

**Physical description beats a gesture's name.** "Headbang" reads to H3 as side-to-side head motion; only describing the actual physical motion ("chin to chest and back, only forward-down and back-up") plus a three-quarter camera angle that could actually read the gesture produced a real headbang.

**What H3 will not do.** A true strobe — a hard flash-then-black alternation, timed to the beat — could not be obtained through text after four different formulations (concert lighting, the literal words "STROBE LIGHT", one flash per hit dying to black, and a montage-style description of a few visible frames followed by more black ones): every attempt produced continuous, at most dimmer, light. Likewise a ritardando — the music actually slowing down and stopping mid-clip — never came out of H3's audio, whether asked as one beat or as one beat per hit with an explicit "the band stops, silence, then one hit": the wall of sound never breaks mid-clip. H3 will hard-cut into silence at the *start* of a clip (used for the act IV false ending) and let a tail die away at the *end* of a clip, but it will not insert a pause in the middle of a continuous piece. Both limits are declared as design constraints from that point on rather than fought further: strobe was accepted as a dark, neon-edged "concert lighting" look; ritardando-style pacing was handled by splitting a beat across a clip boundary instead of asking for it inside one clip.

**Contradiction, not weakness, breaks a prompt.** A skull described as "mirror-polished" under colored flashes rendered as chrome — the two ideas are physically the same thing (a mirror finish under colored strobing light *is* chrome), and no amount of "not chrome" in the avoid-list fixed it until the material description itself was changed to a matte, oiled black iron. The lesson generalizes: when H3 disobeys consistently, look for a physical contradiction inside the prompt before assuming the model is simply ignoring an instruction.

**The first frame commands.** When a scene's designated starting image contradicts its prompt — a closed mouth where the prompt describes a scream, ambient light already filling a frame meant to open on black — no amount of prompt rewriting reverses it; H3 continues what it sees. The working fix was to construct the correct starting frame with Qwen Image Edit before touching the prompt again (this is how an earlier take of scene III was rescued, above; the delivered take continues from the previous clip).

## The agent and Comfy MCP

Claude Code (working under the name "Fable" in this project) wrote every scene's sound-first prompt, built and patched the WextraX nodes and the loop workflow, wrote the reproducible launch scripts, and ran a `judge_clip.py` script that turns each rendered clip into a mechanical read before a human ever watches it: average luma and RMS audio loudness in 0.5 s windows, plus an 8-frame contact sheet, so a claim like "the light and the sound land on the same instant" becomes a number, not an impression, before it goes to Sick for the real verdict.

On 29/08 the agent connected directly to the local ComfyUI instance through the **Comfy MCP server** (the local, open-source variant — `comfy-mcp`/`comfy-cli` talking to `127.0.0.1:8188`, not the cloud one) and drove several rounds of act V end to end: `server_info` and `system_stats` to confirm the server and free VRAM/RAM, `validate_workflow` on the exported API JSON before every launch, `run_workflow(wait=False)` to queue a render without blocking, and `fetch_outputs` to pull back the finished clip and its temp frames. Being exact about the failure modes: the MCP `job` tool (status/wait polling) errored out consistently on this setup, so progress was tracked by polling ComfyUI's own `/queue` endpoint instead, and later sessions found `run_workflow` itself failing without a usable error message for some launches — those were sent through the same JSON via a local `ui_to_api.py --queue` script, with `/queue` again for status. So the honest summary is: MCP handled workflow validation and several full run/fetch cycles end to end (act V, 29/08, several iterations each judged and corrected before the next), while the rest of the production — most of acts I–IV and the later act V segments — was launched the same way but through the local queue API directly, either by the agent or by Sick from the ComfyUI UI, when MCP's own job-tracking tool wasn't reliable enough to depend on for the night.

## Non-node steps declared

Not everything in this piece happened inside the delivered `.json` graph:

- **Character sheets** — Krea 2 text-to-image plus the DynamicCharacterSheet LoRA, producing turnaround/pose sheets for the skull and the four riveted-iron figures.
- **Keyframes and image edits** — Qwen Image Edit (QEdit) inside ComfyUI, used scene by scene to build or correct exact opening/closing frames (the crooked-skull settle pose, the eyes-only macro for act IV, the first frame built for an earlier take of act III), plus targeted PIL compositing where QEdit's own edits drifted (object scale, reflections, darkening a frame it wouldn't turn fully black on its own).
- **Reference stills for the hall** — the ruined hexagonal room ("Dirock") was generated once as a Krea 2 text-to-image still and reused as a visual/reference anchor across the scenes that needed it, rather than redescribed from scratch every time.
- **Final concatenation** — `montage_risonanza.py` (ffmpeg): trims, from every clip after the first, only the hand-off frames it actually shares with the clip before it (auto-detected by comparing frames, not assumed from the field alone — this is what caught an earlier take of scene III that started from its own first frame), then concatenates the whole chain with a single re-encode. No external music, no upscaling: the audio in the final file is entirely what H3 generated, and the resolution is whatever each scene rendered at.

## How to reproduce

Open `MM_H3_Loop_RESONANCE.json` in ComfyUI with the WextraX custom node pack installed. All nine seeds are fixed. Set **MM H3 Loop Range** to `start_scene 0`, `scene_count 9` and press Run once: the whole nine-scene chain regenerates in order, each scene's Handoff Tail feeding the next. A single scene can be redone in isolation by changing only its own **MM H3 Scene** node and pointing Loop Range at that scene index — the hand-off can resume from the clip a loop run just made, or from any existing video file on disk, which is what let individual acts be redone without re-rendering the whole chain.

One hardware note worth keeping if this is rerun on a similar rig: the text encoder (about 25 GB) and the diffusion model (about 19.5 GB) don't fit together in 24 GB of VRAM, so they swap through system RAM at every scene change — on a 64 GB machine this leaves only a few GB free during a run, and a third reload in the same session has been seen to crash the loader. A clean ComfyUI restart before a long batch, and never clearing the GPU cache mid-loop, is what kept a full nine-scene run stable.

## Credits / licence

WextraX (this repository) is released under the Apache License 2.0. MiniMax-H3 is used under its Community License (unlocked for the EU as of 22/08/2026, verified against the model's own licensing page rather than press coverage of it); Krea 2 is used under the Krea 2 Community License Agreement. Built by Sick (`sickbrain2`) with an AI agent (Claude Code) driving prompting, workflow patching and part of the render loop through Comfy MCP.

**Replicating it.** The delivered workflow loads 12 stills — the two opening keyframes, the eyes-only keyframe of act IV, the skull and band character sheets, the hall and the two wave-phase storyboards. They are in `workflows/references/` with the exact file names the Load Image nodes expect: copy them into `ComfyUI/input`, load the JSON, press Run.
