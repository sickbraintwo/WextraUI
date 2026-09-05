import torch

from .h3_handoff import HANDOFF_DEFAULT, handoff_seconds, silence, tail_from_file


class H3LoopRange:
    """Turns the scene list into the range the loop should actually run.

    start_scene = 0 -> run every scene, starting from the first keyframe.
    start_scene = N -> skip scenes 0..N-1 (already generated) and resume at
    scene N. Where scene N resumes FROM is written on the scene itself
    (WScene H3: previous_from = file + resume_from_video, handoff_frames);
    a scene that says `loop` cannot be the first of a run (nothing was
    rendered before it), except scene 0, which starts from first_keyframe.
    A scene 0 with previous_from = file starts the whole piece from the
    tail of any clip.

    Outputs for the loop start: run_count -> total; start_frame (last frame)
    -> initial_value1; start_clip (the hand-off tail) -> initial_value2;
    start_audio -> initial_value3. Add start_scene to the loop index (easy
    mathInt) before indexing the scene lists.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "scenes": ("H3_SCENES", {"tooltip": "The list from WScenes Collection H3."}),
                "start_scene": ("INT", {
                    "default": 0, "min": 0, "max": 99,
                    "tooltip": "0 = run all scenes from first_keyframe. N = skip 0..N-1 and resume at scene N, "
                               "from the clip that scene names (previous_from = file, resume_from_video).",
                }),
                "scene_count": ("INT", {
                    "default": 0, "min": 0, "max": 99,
                    "tooltip": "How many scenes to run from start_scene. 0 = all the remaining ones. "
                               "1 = just that one scene.",
                }),
            },
            "optional": {
                "first_keyframe": ("IMAGE", {"tooltip": "Start image for scene 0 when it does not resume from a file."}),
            },
        }

    RETURN_TYPES = ("INT", "INT", "IMAGE", "IMAGE", "AUDIO", "BOOLEAN")
    RETURN_NAMES = ("run_count", "start_scene", "start_frame", "start_clip", "start_audio", "resuming")
    FUNCTION = "compute"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("Loop range + what the first scene of the run starts from: the keyframe (scene 0) or the tail of "
                   "the clip written on that scene (previous_from = file).")

    def compute(self, scenes, start_scene, scene_count=0, first_keyframe=None):
        total = len(scenes)
        if total < 1:
            raise ValueError("H3 Loop Range: no scenes.")
        if start_scene >= total:
            raise ValueError(
                f"H3 Loop Range: start_scene={start_scene} but there are only {total} scenes (0..{total - 1})."
            )
        run_count = total - start_scene
        if scene_count > 0:
            run_count = min(run_count, scene_count)
        s = scenes[start_scene]
        n = int(s.get("handoff", HANDOFF_DEFAULT))

        if s.get("previous_from", "loop") == "file":
            clip, audio = tail_from_file(s, start_scene, "H3 Loop Range")
            return (run_count, start_scene, clip[-1:], clip, audio, True)

        if start_scene == 0:
            frame = first_keyframe if first_keyframe is not None else torch.zeros((1, 64, 64, 3))
            # No previous clip: the "clip" anchor degrades to the keyframe itself
            # (a batch shorter than 5 frames anchors only its first image) and
            # the audio anchor is silence.
            return (run_count, 0, frame, frame, silence(handoff_seconds(n)), False)

        raise ValueError(
            f"H3 Loop Range: start_scene={start_scene}, but scene {start_scene} has previous_from = loop and nothing "
            f"is rendered before it in this run. On that WScene H3 set previous_from = file and resume_from_video = "
            f"the clip of scene {start_scene - 1}, or start from 0."
        )
