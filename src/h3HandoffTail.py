"""MM H3 Handoff Tail — the node at the END of the loop body.

Takes the clip just rendered (decoded images + audio) and cuts the tail the
NEXT scene asks for: its handoff_frames, and — if that scene says
previous_from = file — the tail of the file it names instead of the clip
just made. Outputs go to the loop's carried values (last frame, tail clip,
tail audio) and are consumed at the next iteration by MM H3 Scene
Conditioning. Replaces ImageFromBatch(-22, 22) + TrimAudioDuration(0.92 s).
"""
from .h3_handoff import HANDOFF_DEFAULT, handoff_seconds, audio_tail, video_tail, tail_from_file


class H3HandoffTail:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "scenes": ("H3_SCENES", {"tooltip": "The list from MM H3 Collect Scenes."}),
                "scene_index": ("INT", {"forceInput": True, "tooltip": "Absolute index of the scene JUST rendered (loop index + start_scene)."}),
                "images": ("IMAGE", {"tooltip": "The decoded clip of this scene (all frames)."}),
            },
            "optional": {
                "audio": ("AUDIO", {"tooltip": "The decoded audio of this scene."}),
            },
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "AUDIO", "STRING")
    RETURN_NAMES = ("last_frame", "tail_clip", "tail_audio", "info")
    FUNCTION = "cut"
    CATEGORY = "WextraX"
    DESCRIPTION = ("Cuts the hand-off tail for the NEXT scene: its handoff_frames from the clip just rendered, "
                   "or from the file it names (previous_from = file). Wire to the loop end (value1/2/3).")

    def cut(self, scenes, scene_index, images, audio=None):
        i = int(scene_index)
        nxt = scenes[i + 1] if 0 <= i + 1 < len(scenes) else None
        n = int(nxt.get("handoff", HANDOFF_DEFAULT)) if nxt else HANDOFF_DEFAULT
        seconds = handoff_seconds(n)

        if nxt is not None and nxt.get("previous_from", "loop") == "file":
            clip, aud = tail_from_file(nxt, i + 1, "H3 Handoff Tail")
            info = f"scene {i} -> {i + 1}: {clip.shape[0]} frames ({seconds:.2f} s) from file {nxt.get('resume_path')}"
            return (clip[-1:], clip, aud, info)

        clip = video_tail(images, n)
        aud = audio_tail(audio, seconds)
        where = f"scene {i} -> {i + 1}" if nxt is not None else f"scene {i} (last one)"
        info = f"{where}: last {clip.shape[0]} frames ({seconds:.2f} s) of this clip"
        return (images[-1:], clip, aud, info)
