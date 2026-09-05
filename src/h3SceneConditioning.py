"""WLoop Scene Conditioning H3 — the ONE node inside the loop.

Takes the scene list + the current scene index + what the loop carries
(previous scene's last frame, hand-off tail clip and audio) and
builds the H3 conditioning for that scene: first frame (previous frame or
the scene's start_image), last frame, mid-clip guide, references, and the
motion/audio hand-off anchored at frame 0 (only when start = previous and
there is a previous scene). Canvas size comes from the first frame's aspect
at `megapixels` (like ImageScaleToTotalPixels, rounded to 32), or from
width/height when there is no first frame or megapixels = 0.

Replaces, in the loop body: 5-7 indexAnything, imageSwitch,
ImageScaleToTotalPixels, GetImageSize, the H3 image-to-video node,
Add Guide and the Hand-off Gate.
"""
import math

from .h3_timing import seconds_to_h3_frames, h3_frames_to_seconds, H3_FPS
from .h3Conditioning import build_h3_conditioning, PICTURE_ORDER

CANVAS_MULTIPLE = 32


def canvas_for(image, megapixels, width, height):
    """Width/height for the generation: the image's aspect at `megapixels`, rounded to 32;
    megapixels = 0 -> the image's own size (rounded to 32); no image -> width/height."""
    if image is None:
        return int(width), int(height)
    h, w = image.shape[1], image.shape[2]
    scale = math.sqrt(megapixels * 1_000_000 / (w * h)) if megapixels > 0 else 1.0
    tw = max(CANVAS_MULTIPLE, round(w * scale / CANVAS_MULTIPLE) * CANVAS_MULTIPLE)
    th = max(CANVAS_MULTIPLE, round(h * scale / CANVAS_MULTIPLE) * CANVAS_MULTIPLE)
    return int(tw), int(th)


class H3SceneConditioning:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "scenes": ("H3_SCENES",),
                "scene_index": ("INT", {"forceInput": True, "tooltip": "Absolute scene index (loop index + start_scene)."}),
                "clip": ("CLIP",),
                "vae": ("VAE",),
                "megapixels": ("FLOAT", {"default": 0.6, "min": 0.0, "max": 4.0, "step": 0.05,
                                         "tooltip": "Canvas area from the first frame's aspect (or the last frame's when there is no first frame); 0 = the image's own size, rounded to 32."}),
                "width": ("INT", {"default": 1344, "min": 32, "max": 16384, "step": 32,
                                  "tooltip": "Used only when the scene has neither a first nor a last frame."}),
                "height": ("INT", {"default": 768, "min": 32, "max": 16384, "step": 32}),
                "handoff": ("BOOLEAN", {"default": True,
                                        "tooltip": "Anchor the previous scene's tail (handoff_frames of the scene) + audio at frame 0 "
                                                   "(only when start = previous and scene_index > 0)."}),
                "ref_image_size": (["match", "max"], {"default": "match"}),
                "picture_order": (PICTURE_ORDER, {"default": "keyframes_first"}),
            },
            "optional": {
                "audio_vae": ("VAE", {"tooltip": "Needed for the audio hand-off, guide_audio and ref_audio."}),
                "previous_frame": ("IMAGE", {"tooltip": "Loop value1: last frame of the previous scene."}),
                "previous_clip": ("IMAGE", {"tooltip": "Loop value2: hand-off tail of the previous scene (WLoop End H3)."}),
                "previous_audio": ("AUDIO", {"tooltip": "Loop value3: hand-off audio of the previous scene."}),
            },
        }

    RETURN_TYPES = ("CONDITIONING", "LATENT", "INT", "STRING", "INT", "FLOAT", "INT", "INT", "IMAGE", "STRING")
    RETURN_NAMES = ("positive", "LATENT", "seed", "prompt", "frames", "duration", "width", "height", "first_image", "info")
    FUNCTION = "condition"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("Builds the H3 conditioning for scene[scene_index]: first/last frame, guide, references and the "
                   "motion/audio hand-off from the previous scene, in one node.")

    def condition(self, scenes, scene_index, clip, vae, megapixels, width, height, handoff, ref_image_size,
                  picture_order, audio_vae=None, previous_frame=None, previous_clip=None, previous_audio=None):
        i = int(scene_index)
        if i < 0 or i >= len(scenes):
            raise ValueError(f"H3 Scene Conditioning: scene_index {i} out of range (0..{len(scenes) - 1}).")
        s = scenes[i]

        if s["start"] == "previous":
            if previous_frame is None:
                raise ValueError(f"H3 Scene Conditioning: scene {i} starts from the previous frame but previous_frame "
                                 "is not connected (loop value1 / Loop Range start_frame).")
            first_image = previous_frame[-1:]
        elif s["start"] == "image":
            first_image = s["start_image"]
        else:
            first_image = None

        # canvas from the first frame's aspect, else from the end frame's, else width/height
        w, h = canvas_for(first_image if first_image is not None else s.get("end_image"), megapixels, width, height)
        frames = seconds_to_h3_frames(s["duration"])
        guide_at = s.get("guide_at", 0.0)
        guide_frame = int(round(guide_at * H3_FPS)) if guide_at >= 0 else -max(1, int(round(-guide_at * H3_FPS)))

        cond, latent, pictures = build_h3_conditioning(
            clip, vae, s["prompt"], w, h, frames, audio_vae=audio_vae,
            first_image=first_image, last_image=s.get("end_image"),
            guide_image=s.get("guide_image"), guide_audio=s.get("guide_audio"), guide_frame=guide_frame,
            ref_images=s.get("ref_images") or (), ref_audio=s.get("ref_audio"),
            ref_image_size=ref_image_size, picture_order=picture_order)

        handoff_used = False
        if handoff and s["start"] == "previous" and i > 0 and previous_clip is not None:
            # like the native Add Guide at frame 0: the previous scene's tail as a clip anchor (+ its audio)
            cond, _, _ = _anchor_handoff(cond, latent, vae, audio_vae, previous_clip, previous_audio, w, h)
            handoff_used = True

        info = (f"scene {i}/{len(scenes) - 1}: {s['duration']:g}s -> {frames} frames ({h3_frames_to_seconds(frames):.2f}s) "
                f"@ {w}x{h}, seed {s['seed']}, first_frame={ {'previous': 'previous_scene', 'image': 'first_frame'}.get(s['start'], s['start']) }, last_frame={'image' if s.get('end_image') is not None else 'none'}, "
                f"handoff={'on' if handoff_used else 'off'}\n{pictures}")
        first_out = first_image if first_image is not None else _black(h, w)
        return (cond, latent, int(s["seed"]), s["prompt"], frames, h3_frames_to_seconds(frames), w, h, first_out, info)


def _black(h, w):
    import torch
    return torch.zeros((1, h, w, 3))


def _anchor_handoff(cond, latent, vae, audio_vae, clip_frames, audio, width, height):
    """Append a frame-0 keyframe made of the previous scene's tail (video + audio), as Add Guide does."""
    import node_helpers
    from comfy_extras.nodes_minimax_h3 import _resize, _encode_ref_audio
    from comfy.ldm.minimax.model import FRAME_RESCALE

    n = clip_frames.shape[0]
    if n < 5:
        n = 1
    else:
        while n % 17 != 5:
            n -= 1
    kf = {"resolved_frame_index": 0, "latent": vae.encode(_resize(clip_frames[-n:] if n > 1 else clip_frames[-1:], width, height, "center"))}
    if audio is not None:
        if audio_vae is None:
            raise ValueError("H3 Scene Conditioning: the audio hand-off needs audio_vae connected.")
        audio_latent, audio_rt = _encode_ref_audio(audio_vae, audio)
        max_rt = math.floor(latent["samples"].tensors[1].shape[-1])
        if audio_rt > max_rt:
            audio_latent = audio_latent[..., :max_rt].clone()
        kf["audio_latent"] = audio_latent
    keyframes = list(cond[0][1].get("minimax_keyframes", [])) + [kf]
    return node_helpers.conditioning_set_values(cond, {"minimax_keyframes": keyframes}), None, None
