"""WScene H3 — one scene of a multi-scene H3 piece, as ONE object.

Everything the loop needs to condition this scene travels in the H3_SCENE
dict: prompt, duration, seed, where the clip STARTS, where it LANDS, an
optional mid-clip guide (image / audio at a time), and the references
(character sheet, storyboard, style, audio) the model should look at.

first_frame_from — where the clip's FIRST frame comes from:
  previous_scene = the last frame of the previous scene (carried by the
                   loop; the motion/audio hand-off applies).
handoff_frames — how much of the previous clip this scene inherits (last N
             frames + their audio, anchored at frame 0): 5, 22 (0.92 s,
             default), 39, 56 ... longer = more music continuity across the
             join, more of the previous clip repeated.
previous_from — where that previous clip is: loop = the clip rendered just
             before in the same run; file = resume_from_video (absolute, or
             relative to ComfyUI/output) — scene-by-scene work, or any clip
             as the starting point of the piece (works on scene 0 too).
  first_frame    = the image connected to first_frame (a finished still in
                   the final look, NOT a storyboard sketch).
  none           = no first frame (text only, or land only on last_frame).
last_frame:  the clip lands on it.
guide_*:     anchored at guide_frame_at seconds (negative = from the end),
             latent only, like the native Add Guide.
ref_*:       not anchored in time; cite them in the prompt as <Picture n>
             (the conditioning node prints the numbering).
"""
from .h3_handoff import HANDOFF_CHOICES, HANDOFF_DEFAULT, PREVIOUS_FROM

FIRST_FRAME_FROM = ["previous_scene", "first_frame", "none"]
_START = {"previous_scene": "previous", "first_frame": "image", "none": "none"}  # internal keys stay stable


class H3Scene:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"forceInput": True}),
                "duration": ("FLOAT", {"forceInput": True}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),
                "first_frame_from": (FIRST_FRAME_FROM, {
                    "default": "previous_scene",
                    "tooltip": "Where the clip's FIRST frame comes from: previous_scene = the last frame of the previous "
                               "scene (carried by the loop, motion/audio hand-off applies); first_frame = the image "
                               "connected to first_frame; none = no first frame (free start from text, or land only on last_frame).",
                }),
                "guide_frame_at": ("FLOAT", {
                    "default": 0.0, "min": -3600.0, "max": 3600.0, "step": 0.05,
                    "tooltip": "Seconds where guide_frame / guide_audio is anchored (negative = from the end). "
                               "Ignored when no guide is connected.",
                }),
                # Appended after the older widgets on purpose (saved workflows map
                # widgets_values by position; trailing widgets take their default).
                "handoff_frames": (HANDOFF_CHOICES, {
                    "default": str(HANDOFF_DEFAULT),
                    "tooltip": "Hand-off from the previous scene: its last N frames (+ N/24 s of audio) anchored at frame 0. "
                               "Valid H3 lengths only: 5 = 0.2 s, 22 = 0.92 s (default), 39 = 1.6 s, 56 = 2.3 s ... 124 = 5.2 s. "
                               "Longer = more music continuity across the join, more of the previous clip repeated. "
                               "Ignored on scene 0 unless it resumes from a file.",
                }),
                "previous_from": (PREVIOUS_FROM, {
                    "default": "loop",
                    "tooltip": "Where the previous clip comes from: loop = the scene rendered just before in this run; "
                               "file = the clip in resume_from_video (scene-by-scene work, or any clip as starting point).",
                }),
                "resume_from_video": ("STRING", {
                    "default": "",
                    "tooltip": "Used when previous_from = file: the previous clip, absolute path or relative to "
                               "ComfyUI/output (e.g. MM_H3_Loop/scene_4_S_1_00003-audio.mp4).",
                }),
            },
            "optional": {
                "first_frame": ("IMAGE", {"tooltip": "First frame, used when first_frame_from = first_frame."}),
                "last_frame": ("IMAGE", {"tooltip": "Last frame: the clip lands on it."}),
                "guide_frame": ("IMAGE", {"tooltip": "Image (or 5/22/39… frame clip) anchored at guide_frame_at."}),
                "guide_audio": ("AUDIO", {"tooltip": "Audio anchored at guide_frame_at."}),
                "ref_image_1": ("IMAGE", {"tooltip": "Reference (character sheet, storyboard, style) — cite as <Picture n>."}),
                "ref_image_2": ("IMAGE",),
                "ref_image_3": ("IMAGE",),
                "ref_image_4": ("IMAGE",),
                "ref_image_5": ("IMAGE",),
                "ref_image_6": ("IMAGE",),
                "ref_image_7": ("IMAGE",),
                "ref_image_8": ("IMAGE",),
                "ref_image_9": ("IMAGE",),
                "ref_audio": ("AUDIO", {"tooltip": "Standalone reference audio (<Audio 1>)."}),
            },
        }

    RETURN_TYPES = ("H3_SCENE",)
    RETURN_NAMES = ("scene",)
    FUNCTION = "build"
    CATEGORY = "WextraUI"
    DESCRIPTION = "One H3 scene as a single object: prompt, duration, seed, start/end frames, mid-clip guide, references."

    def build(self, prompt, duration, seed, first_frame_from, guide_frame_at, handoff_frames=str(HANDOFF_DEFAULT),
              previous_from="loop", resume_from_video="", first_frame=None, last_frame=None,
              guide_frame=None, guide_audio=None, ref_image_1=None, ref_image_2=None, ref_image_3=None,
              ref_image_4=None, ref_image_5=None, ref_image_6=None,
              ref_image_7=None, ref_image_8=None, ref_image_9=None,
              ref_audio=None):
        if first_frame_from == "first_frame" and first_frame is None:
            raise ValueError("H3 Scene: first_frame_from = first_frame but no image is connected to first_frame "
                             "(connect one, or choose previous_scene / none).")
        return ({
            "prompt": prompt,
            "duration": float(duration),
            "seed": int(seed),
            "start": _START[first_frame_from],
            "start_image": first_frame,
            "end_image": last_frame,
            "guide_image": guide_frame,
            "guide_audio": guide_audio,
            "guide_at": float(guide_frame_at),
            "handoff": int(handoff_frames),
            "previous_from": previous_from,
            "resume_path": resume_from_video.strip(),
            "ref_images": [r for r in (ref_image_1, ref_image_2, ref_image_3, ref_image_4, ref_image_5, ref_image_6, ref_image_7, ref_image_8, ref_image_9) if r is not None],
            "ref_audio": ref_audio,
        },)
