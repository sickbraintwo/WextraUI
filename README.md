# WextraX
ComfyUI custom nodes.
For now just 2 nodes.

Lora Helper

<img width="1023" height="680" alt="Wextra_Lora_Helper" src="https://github.com/user-attachments/assets/1f947e7b-12e5-472d-a432-ea1145f9cb95" />


EXTRACT LORA NAME
I personally use this node to extract only the Lora name from the path.

EXTRACT TAG FROM LIST
Giving in input the Lora's tag list, you can choose by index the single tag to extract in output to easily insert in the prompt.
There is also a Console Log output to easily see, and so choose, the complete tag list divided by indexes.

🤝 Acknowledgements

This project is built upon the following excellent open-source projects:

[ComfyUI-Lora-Auto-Trigger-Words](https://github.com/idrirap/ComfyUI-Lora-Auto-Trigger-Words)


Hope could be usefull for you as it is for me.

## Hand-off per scene (01/09/2026)
Each **MM H3 Scene** says how it joins the previous one: `handoff_frames` (last N frames + N/24 s of audio of the previous clip anchored at frame 0; valid H3 lengths 5/22/39/56…, 22 = 0.92 s default — longer = more music continuity across the join, more of the previous clip repeated), `previous_from` = `loop` (the clip rendered just before in the same run) or `file` + `resume_from_video` (scene-by-scene work: any clip as the previous one — works on scene 0 too, so a piece can start from the tail of any video). **MM H3 Handoff Tail** sits at the end of the loop body and cuts the tail the NEXT scene asks for (from the clip just rendered, or from that scene's file); **MM H3 Loop Range** only chooses `start_scene` / `scene_count` and reads the scene list. A run can therefore mix hand-off lengths per scene and resume anywhere.

## RESONANCE — Comfy H3 Sync Sound Challenge (09/2026)
A ~77 s music video, video and audio generated together shot by shot with MiniMax-H3, driven by these nodes and by an AI agent (Claude Code) working part of the loop through Comfy MCP: a world that exists only where sound touches it, five acts around one black riveted-iron skull. Nine `MM H3 Scene` nodes chained end to end with per-scene hand-off, all seeds fixed for reproduction.
- Full technical diary (pipeline, seed table, what H3's prompting will and won't do, the agent/MCP session): [`workflows/RESONANCE.md`](workflows/RESONANCE.md)
- Delivered workflow: [`workflows/MM_H3_Loop_RESONANCE.json`](workflows/MM_H3_Loop_RESONANCE.json)
- Keyframes and reference images the workflow loads (same file names as the Load Image nodes, drop them in `ComfyUI/input`): [`workflows/references/`](workflows/references/)
