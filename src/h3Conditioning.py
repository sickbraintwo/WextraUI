"""MM H3 Conditioning (all-in-one) — first/last keyframes + a mid-video guide
(image and/or audio) + reference images/audio, in ONE conditioning.

Why: ComfyUI ships three separate heads for MiniMax H3 — `Image to Video`
(first/last, no refs), `Reference to Video` (refs, no first/last) and
`Add Guide` (an anchor at any frame, chained after either). The text encoder
presents keyframes and references the same way ("<Picture i>: " + vision
block, then the prompt) and the DiT's PackedLayout takes keyframes= AND refs=
together — only the node interfaces keep them apart. This node builds the
single list the runtime already accepts.

Every image/audio socket is optional: nothing connected = t2va; first/last
only = the native Image to Video, bit for bit; refs only = Reference to Video.
Whether the WEIGHTS like refs + anchors together is a test with eyes, not a
given (MiniMax documents t2va / fl2va / ref2va as separate modes).

Mirrors comfy_extras/nodes_minimax_h3.py (ComfyUI 0.33) and reuses its
helpers; if ComfyUI renames them this node says so at load.
"""
import math

import node_helpers

try:
    from comfy_extras.nodes_minimax_h3 import (
        _empty_av_latent, _resize, _encode_ref_audio,
        CANVAS_MULTIPLE, REF_IMAGE_SHORT_EDGE,
    )
    from comfy.ldm.minimax.model import FRAME_RESCALE
except Exception as e:  # pragma: no cover
    raise ImportError(
        "WextraX H3Conditioning: comfy_extras.nodes_minimax_h3 no longer exposes the helpers this node reuses "
        f"({e}). Update src/h3Conditioning.py to the current ComfyUI implementation."
    )

PICTURE_ORDER = ["keyframes_first", "refs_first"]
MAX_REFS = 9


def _guide_frame_count(image):
    n = image.shape[0]
    if n < 5:
        return 1
    while n % 17 != 5:
        n -= 1
    return n


def build_h3_conditioning(clip, vae, prompt, width, height, length, audio_vae=None,
                          first_image=None, last_image=None,
                          guide_image=None, guide_audio=None, guide_frame=0,
                          ref_images=(), ref_audio=None,
                          ref_image_size="match", picture_order="keyframes_first"):
    """Core, reusable by loop-side nodes. Returns (conditioning, latent, picture_map_text)."""
    latent, frame_count = _empty_av_latent(width, height, length)

    # --- keyframes (anchored in time): first / last / guide ---------------------
    keyframes, kf_pictures = [], []          # kf_pictures: what Qwen sees, in fl2va order
    if first_image is not None:
        img = _resize(first_image[:1], width, height, "disabled")   # geometry anchor: plain stretch
        kf_pictures.append(("first frame", img))
        keyframes.append({"resolved_frame_index": 0, "latent": vae.encode(img)})
    if last_image is not None:
        img = _resize(last_image[:1], width, height, "center")      # follower: aspect-preserving cover-crop
        kf_pictures.append(("last frame", img))
        keyframes.append({"resolved_frame_index": frame_count - 1, "latent": vae.encode(img)})

    if guide_image is not None or guide_audio is not None:
        guide_frames = _guide_frame_count(guide_image) if guide_image is not None else 1
        resolved = guide_frame if guide_frame >= 0 else frame_count + guide_frame
        if resolved < 0 or resolved + guide_frames > frame_count:
            raise ValueError(f"H3Conditioning: guide_frame {guide_frame} ({guide_frames} frame(s)) "
                             f"does not fit in the video's {frame_count} frames")
        kf = {"resolved_frame_index": resolved}
        if guide_image is not None:
            frames = _resize(guide_image[:guide_frames], width, height, "center")
            kf["latent"] = vae.encode(frames)
        if guide_audio is not None:
            if audio_vae is None:
                raise ValueError("H3Conditioning: guide_audio needs audio_vae connected")
            audio_latent, audio_rt = _encode_ref_audio(audio_vae, guide_audio)
            max_rt = math.floor(latent["samples"].tensors[1].shape[-1] - FRAME_RESCALE * resolved)
            if max_rt < 1:
                raise ValueError(f"H3Conditioning: guide_frame {guide_frame} is past the end of the audio track")
            if audio_rt > max_rt:
                audio_latent = audio_latent[..., :max_rt].clone()
            kf["audio_latent"] = audio_latent
        keyframes.append(kf)   # like Add Guide: anchored in the latent, not shown to the text encoder

    # --- references (identity / style, not anchored) ----------------------------
    ref_pictures, ref_blocks = [], []
    for i, img in enumerate(ref_images):
        if img is None:
            continue
        h, w = img.shape[1], img.shape[2]
        if ref_image_size == "match":
            scale = min(1.0, math.sqrt((width * height) / (w * h)))
        else:
            scale = min(1.0, REF_IMAGE_SHORT_EDGE / min(w, h))
        tw = max(CANVAS_MULTIPLE, round(w * scale / CANVAS_MULTIPLE) * CANVAS_MULTIPLE)
        th = max(CANVAS_MULTIPLE, round(h * scale / CANVAS_MULTIPLE) * CANVAS_MULTIPLE)
        resized = _resize(img[:1], tw, th, "disabled")
        ref_pictures.append((f"ref_image_{i + 1}", resized))
        ref_blocks.append({"kind": "image", "latent_h": th // 16, "latent_w": tw // 16, "latent": vae.encode(resized)})
    ref_audio_item = None
    if ref_audio is not None:
        if audio_vae is None:
            raise ValueError("H3Conditioning: ref_audio needs audio_vae connected")
        audio_latent, ref_audio_t = _encode_ref_audio(audio_vae, ref_audio)
        ref_audio_item = {"type": "audio"}
        ref_blocks.append({"kind": "audio", "ref_audio_t": ref_audio_t, "audio_latent": audio_latent})

    # --- one presentation for the text encoder ---------------------------------
    ordered = kf_pictures + ref_pictures if picture_order == "keyframes_first" else ref_pictures + kf_pictures
    ref_items = [{"type": "image", "data": img} for _, img in ordered]
    if ref_audio_item is not None:
        ref_items.append(ref_audio_item)
    picture_map = "\n".join(f"<Picture {i + 1}> = {label}" for i, (label, _) in enumerate(ordered))
    if ref_audio_item is not None:
        picture_map += ("\n" if picture_map else "") + "<Audio 1> = ref_audio"
    if not picture_map:
        picture_map = "(text only)"

    if ref_items:
        tokens = clip.tokenize(prompt, minimax_ref_items=ref_items)
    else:
        tokens = clip.tokenize(prompt)
    cond = clip.encode_from_tokens_scheduled(tokens)

    values = {}
    if keyframes:
        values["minimax_keyframes"] = keyframes
    if ref_blocks:
        values["minimax_refs"] = ref_blocks
    if values:
        cond = node_helpers.conditioning_set_values(cond, values)
    return cond, latent, picture_map


class H3ConditioningAllInOne:
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
                "guide_frame": ("INT", {"default": 0, "min": -9999, "max": 9999,
                                        "tooltip": "Frame index where guide_image / guide_audio is anchored (negative = from the end). Ignored when no guide is connected."}),
                "ref_image_size": (["match", "max"], {"default": "match",
                                    "tooltip": "match = refs scaled (down only) to the generation's pixel area; max = 2048px short edge, best identity, several times slower."}),
                "picture_order": (PICTURE_ORDER, {"default": "keyframes_first",
                                  "tooltip": "How the text encoder numbers the pictures: keyframes_first = <Picture 1/2> are first/last frame (fl2va training order), refs after; refs_first = refs are <Picture 1..n>. See the `pictures` output."}),
            },
            "optional": {
                "audio_vae": ("VAE", {"tooltip": "Needed only when guide_audio or ref_audio is connected."}),
                "first_image": ("IMAGE", {"tooltip": "The clip starts from it (stretched to the canvas, seen by the text encoder)."}),
                "last_image": ("IMAGE", {"tooltip": "The clip lands on it (cover-cropped, seen by the text encoder)."}),
                "guide_image": ("IMAGE", {"tooltip": "Image (or 5/22/39… frame clip) anchored at guide_frame, latent only — like Add Guide."}),
                "guide_audio": ("AUDIO", {"tooltip": "Soundtrack anchored at guide_frame, cropped to the remaining duration."}),
                "ref_image_1": ("IMAGE", {"tooltip": "Reference (character sheet, storyboard, style): not anchored in time, cite it in the prompt as <Picture n> (see `pictures`)."}),
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

    RETURN_TYPES = ("CONDITIONING", "LATENT", "STRING")
    RETURN_NAMES = ("positive", "LATENT", "pictures")
    FUNCTION = "encode"
    CATEGORY = "WextraX"
    DESCRIPTION = ("MiniMax H3 conditioning with first/last keyframes, a mid-video guide (image/audio at guide_frame) "
                   "and reference images/audio, all in one. Unconnected sockets are simply not used.")

    def encode(self, clip, vae, prompt, width, height, length, guide_frame, ref_image_size, picture_order,
               audio_vae=None, first_image=None, last_image=None, guide_image=None, guide_audio=None,
               ref_image_1=None, ref_image_2=None, ref_image_3=None,
               ref_image_4=None, ref_image_5=None, ref_image_6=None,
               ref_image_7=None, ref_image_8=None, ref_image_9=None, ref_audio=None):
        cond, latent, picture_map = build_h3_conditioning(
            clip, vae, prompt, width, height, length, audio_vae=audio_vae,
            first_image=first_image, last_image=last_image,
            guide_image=guide_image, guide_audio=guide_audio, guide_frame=guide_frame,
            ref_images=(ref_image_1, ref_image_2, ref_image_3, ref_image_4, ref_image_5, ref_image_6, ref_image_7, ref_image_8, ref_image_9), ref_audio=ref_audio,
            ref_image_size=ref_image_size, picture_order=picture_order)
        return (cond, latent, picture_map)
