"""MM H3 Image To Video (switchable) — the native MiniMaxH3ImageToVideo logic
with two booleans deciding whether the connected first/last images are USED.

Why: inside a loop every socket is always connected, so the native node cannot
do 'this scene starts from an image, that scene only lands on one'. Here the
per-scene flags (from H3 Collect Scenes: first_frame_on / last_frame_on) pick
the mode: first only, last only, both (start from previous, land on keyframe),
or none (text only).

Mirrors comfy_extras/nodes_minimax_h3.py (ComfyUI 0.33): the text encoder
SEES the used images (clip.tokenize(prompt, images=...)) and each one becomes
a VAE keyframe. If ComfyUI renames those helpers, this node says so at load.
"""
import node_helpers

try:
    from comfy_extras.nodes_minimax_h3 import _empty_av_latent, _resize
except Exception as e:  # pragma: no cover
    raise ImportError(
        "WextraX H3ImageToVideo: comfy_extras.nodes_minimax_h3 no longer exposes _empty_av_latent/_resize "
        f"({e}). Update the mirror in src/h3ImageToVideo.py to the current ComfyUI implementation."
    )


class H3ImageToVideoSwitchable:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP",),
                "vae": ("VAE",),
                "prompt": ("STRING", {"multiline": True, "dynamicPrompts": True, "default": ""}),
                "width": ("INT", {"default": 1344, "min": 32, "max": 16384, "step": 32}),
                "height": ("INT", {"default": 768, "min": 32, "max": 16384, "step": 32}),
                "length": ("INT", {"default": 124, "min": 5, "max": 3600, "step": 17,
                                   "tooltip": "Frames at 24 fps on the 17k+5 grid (use the `frames` output of Composer/Collect)."}),
                "use_first": ("BOOLEAN", {"default": True, "tooltip": "Use first_image as the clip's first frame."}),
                "use_last": ("BOOLEAN", {"default": False, "tooltip": "Use last_image as the clip's last frame (the clip lands on it)."}),
            },
            "optional": {
                "first_image": ("IMAGE",),
                "last_image": ("IMAGE",),
            },
        }

    RETURN_TYPES = ("CONDITIONING", "LATENT")
    RETURN_NAMES = ("positive", "LATENT")
    FUNCTION = "encode"
    CATEGORY = "WextraX"

    def encode(self, clip, vae, prompt, width, height, length, use_first, use_last, first_image=None, last_image=None):
        latent, frame_count = _empty_av_latent(width, height, length)

        images, keyframes = [], []
        if use_first:
            if first_image is None:
                raise ValueError("H3ImageToVideo: use_first is on but first_image is not connected.")
            img = _resize(first_image[:1], width, height, "disabled")   # geometry anchor: plain stretch
            images.append(img)
            keyframes.append({"resolved_frame_index": 0, "image": img})
        if use_last:
            if last_image is None:
                raise ValueError("H3ImageToVideo: use_last is on but last_image is not connected.")
            img = _resize(last_image[:1], width, height, "center")      # follower: aspect-preserving cover-crop
            images.append(img)
            keyframes.append({"resolved_frame_index": frame_count - 1, "image": img})

        tokens = clip.tokenize(prompt, images=images)
        cond = clip.encode_from_tokens_scheduled(tokens)

        if keyframes:
            for kf in keyframes:
                kf["latent"] = vae.encode(kf.pop("image"))
            cond = node_helpers.conditioning_set_values(cond, {"minimax_keyframes": keyframes})
        return (cond, latent)
