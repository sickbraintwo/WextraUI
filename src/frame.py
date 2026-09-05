"""WFrame — crop, resize and place on a canvas, in ONE node. Main use: outpaint.
  MASTER  new_width x new_height = the final resolution (0 = keep the picture's).
  CROP    crop_to: none / an aspect / custom (crop_width x crop_height, shown only for custom) + anchor = what stays.
  RESIZE  none / fit, cover, long side, short side (all relative to the new size, no number) / width, height, scale % (resize_value).
  PLACE   the picture goes on the new_width x new_height canvas at pad_anchor, shifted by offset_x / offset_y;
          what is missing is PADDED (colour), what sticks out is cut. The pad MASK comes out feathered inward
          like the core ImagePadForOutpaint. Also a short file-name-safe text of what was done."""
import torch
import comfy.utils

ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"]
ANCHORS = ["center", "top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"]
METHODS = ["lanczos", "bicubic", "bilinear", "area", "nearest-exact"]
RESIZE = ["none", "fit new size", "cover new size", "long side", "short side", "width", "height", "scale %"]


def _anchor_offset(anchor, room_x, room_y):
    ax = 0 if "left" in anchor else room_x if "right" in anchor else room_x // 2
    ay = 0 if "top" in anchor else room_y if "bottom" in anchor else room_y // 2
    return ax, ay


def _hex(color):
    c = color.strip().lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    try:
        return [int(c[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    except Exception:
        return [0.0, 0.0, 0.0]


def _resize(img, w, h, method):
    if img.shape[2] == w and img.shape[1] == h:
        return img
    return comfy.utils.common_upscale(img.movedim(-1, 1), w, h, method, "disabled").movedim(1, -1)


def _resize_mask(m, w, h):
    if m is None or (m.shape[-1] == w and m.shape[-2] == h):
        return m
    return torch.nn.functional.interpolate(m.unsqueeze(1), size=(h, w), mode="bilinear", align_corners=False).squeeze(1)


def _place(img, mask, cw, ch, x, y, color, feather):
    """Put the picture on a cw x ch canvas with its top-left at (x, y): pads what is missing, cuts what sticks out.
    Returns image, mask, pad mask (1 in the added area, feathered inward), and the four borders actually added."""
    B, H, W, C = img.shape
    # visible part of the picture
    sx0, sy0 = max(0, -x), max(0, -y)
    sx1, sy1 = min(W, cw - x), min(H, ch - y)
    vis = img[:, sy0:sy1, sx0:sx1] if (sx1 > sx0 and sy1 > sy0) else img[:, 0:0, 0:0]
    vh, vw = vis.shape[1], vis.shape[2]
    dx, dy = max(0, x), max(0, y)
    out = torch.empty((B, ch, cw, C), dtype=img.dtype, device=img.device)
    out[:] = torch.tensor((color + [1.0, 1.0])[:C], dtype=img.dtype, device=img.device)
    out[:, dy:dy + vh, dx:dx + vw] = vis
    if mask is not None:
        m = torch.zeros((mask.shape[0], ch, cw), dtype=mask.dtype, device=mask.device)
        m[:, dy:dy + vh, dx:dx + vw] = mask[:, sy0:sy1, sx0:sx1]
        mask = m
    l, t, r, b = dx, dy, cw - dx - vw, ch - dy - vh
    pm = torch.ones((1, ch, cw), dtype=torch.float32)
    inner = torch.zeros((vh, vw), dtype=torch.float32)
    if feather > 0 and vh and vw:
        ys = torch.arange(vh, dtype=torch.float32).unsqueeze(1).expand(vh, vw)
        xs = torch.arange(vw, dtype=torch.float32).unsqueeze(0).expand(vh, vw)
        d = torch.full((vh, vw), float("inf"))
        if l: d = torch.minimum(d, xs)
        if r: d = torch.minimum(d, vw - 1 - xs)
        if t: d = torch.minimum(d, ys)
        if b: d = torch.minimum(d, vh - 1 - ys)
        v = torch.clamp((feather - d) / feather, 0.0, 1.0)
        inner = v * v
    pm[0, dy:dy + vh, dx:dx + vw] = inner
    return out, mask, pm, (l, t, r, b), (W - vw, H - vh)


def _ratio(s):
    try:
        a, b = s.split(":")
        return float(a) / float(b)
    except Exception:
        return None


class Frame:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                # ---- MASTER ----
                "new_width": ("INT", {"default": 1024, "min": 0, "max": 16384, "step": 8, "tooltip": "The final width. 0 = keep the picture's."}),
                "new_height": ("INT", {"default": 1024, "min": 0, "max": 16384, "step": 8, "tooltip": "The final height. 0 = keep the picture's."}),
                # ---- CROP ----
                "crop_to": (["none"] + ASPECTS + ["custom"], {"default": "none", "tooltip": "CROP · none, an aspect (the node computes the box), or custom = crop_width x crop_height."}),
                "crop_width": ("INT", {"default": 1024, "min": 1, "max": 16384, "step": 8, "tooltip": "CROP · custom: width after the crop."}),
                "crop_height": ("INT", {"default": 1024, "min": 1, "max": 16384, "step": 8, "tooltip": "CROP · custom: height after the crop."}),
                "crop_anchor": (ANCHORS, {"default": "center", "tooltip": "CROP · which part of the picture stays."}),
                # ---- RESIZE ----
                "resize_to": (RESIZE, {"default": "none", "tooltip": "RESIZE · aspect kept. Relative to the new size, no number needed: fit = whole picture inside it, cover = picture fills it, long side / short side = that side matches the new size's. With resize_value: width, height (px), scale % (50 = half)."}),
                "resize_value": ("INT", {"default": 1024, "min": 1, "max": 16384, "tooltip": "Only for width / height (px) and scale % (50 = half, 200 = double)."}),
                "method": (METHODS, {"default": "lanczos", "tooltip": "RESIZE · resampling."}),
                # ---- PLACE / PAD ----
                "pad_anchor": (ANCHORS, {"default": "center", "tooltip": "PAD · where the picture sits on the new_width x new_height canvas; the border goes on the other sides."}),
                "offset_x": ("INT", {"default": 0, "min": -16384, "max": 16384, "tooltip": "PAD · shift the picture from the anchor, in px (+ = right)."}),
                "offset_y": ("INT", {"default": 0, "min": -16384, "max": 16384, "tooltip": "PAD · shift the picture from the anchor, in px (+ = down)."}),
                "pad_color": ("STRING", {"default": "#000000", "tooltip": "PAD · colour of the added area (picker below)."}),
                "feathering": ("INT", {"default": 0, "min": 0, "max": 1024, "tooltip": "PAD · soft edge of the pad MASK, in px inward, like ImagePadForOutpaint. 0 = hard."}),
            },
            "optional": {
                "mask": ("MASK", {"tooltip": "Optional mask that follows the same crop / resize / placement."}),
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK", "INT", "INT", "STRING")
    RETURN_NAMES = ("image", "pad_mask", "width", "height", "info")
    OUTPUT_TOOLTIPS = ("The picture on the new canvas.", "1 where the node added pixels, feathered inward: ready for outpaint. All zeros when nothing was added.",
                       "Final width.", "Final height.", "What was done, short and file-name-safe: crop16-9_pad18-12-18-12_1536x1024.")
    FUNCTION = "run"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("New width x height on top as the master; then crop (aspect or custom), resize, and the picture placed on the canvas by anchor "
                   "and offset: what is missing is padded, what sticks out is cut. Pad mask for outpaint, and a text of what it did.")

    def run(self, image, new_width, new_height, crop_to, crop_width, crop_height, crop_anchor, resize_to, resize_value, method,
            pad_anchor, offset_x, offset_y, pad_color, feathering, mask=None):
        img, steps = image, []
        B, H, W, C = img.shape
        fw, fh = (new_width or W), (new_height or H)

        # 1. CROP
        cw, ch = W, H
        if crop_to == "custom":
            cw, ch = min(W, crop_width), min(H, crop_height)
        elif crop_to != "none":
            r = _ratio(crop_to)
            if r:
                cw = W if W / H <= r else int(round(H * r))
                ch = H if W / H >= r else int(round(W / r))
                cw, ch = max(1, min(W, cw)), max(1, min(H, ch))
        if (cw, ch) != (W, H):
            ox, oy = _anchor_offset(crop_anchor, W - cw, H - ch)
            img = img[:, oy:oy + ch, ox:ox + cw]
            if mask is not None:
                mask = mask[:, oy:oy + ch, ox:ox + cw]
            steps.append("crop" + (f"{cw}x{ch}" if crop_to == "custom" else crop_to.replace(":", "-")))
            W, H = cw, ch

        # 2. RESIZE, aspect kept
        s = None
        if resize_to == "fit new size":     s = min(fw / W, fh / H)
        elif resize_to == "cover new size": s = max(fw / W, fh / H)
        elif resize_to == "long side":      s = max(fw, fh) / max(W, H)
        elif resize_to == "short side":     s = min(fw, fh) / min(W, H)
        elif resize_to != "none":
            v = float(resize_value)
            s = {"width": v / W, "height": v / H, "scale %": v / 100.0}[resize_to]
        if s is not None:
            rw, rh = max(1, int(round(W * s))), max(1, int(round(H * s)))
            if resize_to == "fit new size":   rw, rh = min(rw, fw), min(rh, fh)
            if resize_to == "cover new size": rw, rh = max(rw, fw), max(rh, fh)
            if (rw, rh) != (W, H):
                img = _resize(img, rw, rh, method); mask = _resize_mask(mask, rw, rh)
                steps.append({"fit new size": "fit", "cover new size": "cover", "long side": "long", "short side": "short"}.get(resize_to, f"rs{rw}x{rh}"))
                W, H = rw, rh

        # 3. PLACE on the canvas: pad what is missing, cut what sticks out
        if (fw, fh) != (W, H) or offset_x or offset_y:
            ax, ay = _anchor_offset(pad_anchor, fw - W, fh - H)
            img, mask, pad_mask, (l, t, r, b), (cutx, cuty) = _place(img, mask, fw, fh, ax + offset_x, ay + offset_y, _hex(pad_color), feathering)
            if l or t or r or b: steps.append(f"pad{l}-{t}-{r}-{b}")
            if cutx or cuty:     steps.append(f"cut{cutx}x{cuty}")
        else:
            pad_mask = torch.zeros((1, fh, fw), dtype=torch.float32)
        steps.append(f"{fw}x{fh}")
        return (img, pad_mask, fw, fh, "_".join(steps))
