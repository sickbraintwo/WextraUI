"""WFrame — a stack of actions on a picture, in the order you put them, in ONE node: crop, pad (the picture on a bigger,
  or smaller, canvas) and resize. Main use: outpaint, and every framing job (crop a detail, then pad it to 1:1).
  OPS     a JSON list written by the stack under the node (web/wxFrame.js). Each action sees the picture as the actions
          before it left it, and its numbers are in that picture's pixels. Up to 8.
          crop   {"t":"crop","w":800,"h":800,"r":"","a":"center","dx":0,"dy":0}
                 the box that stays: w x h at the anchor, shifted by dx / dy. 0 = the whole side; with r (an aspect,
                 "1:1") and no size, the biggest box of that aspect inside the picture.
          pad    {"t":"pad","w":1024,"h":1024,"r":"","a":"center","dx":0,"dy":0,"color":"#000000","feather":0}
                 the picture goes on a w x h canvas at the anchor, shifted; what is missing is PADDED with the colour,
                 what sticks out is cut. 0 = keep that side; with r and no size, the smallest canvas of that aspect
                 around the picture. The pad MASK (1 where pixels were added, feathered inward like ImagePadForOutpaint)
                 adds up over the pads of the stack and follows the crops and resizes after them.
          resize {"t":"resize","mode":"width","v":1024,"w":1024,"h":1024}
                 aspect kept: width / height / long side / short side = that side to v px; scale % = v; fit in box /
                 cover box = the w x h box (0 = that side of the picture).
  PREVIEW the node sends the frontend the size of the picture it got and a small copy of it (temp folder): the stack
          under the node draws every action as a coloured rectangle on it, the final frame in red."""
import json
import os
import random

import numpy as np
import torch
from PIL import Image

import comfy.utils
import folder_paths

ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"]
ANCHORS = ["center", "top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"]
METHODS = ["lanczos", "bicubic", "bilinear", "area", "nearest-exact"]
RESIZE_MODES = ["width", "height", "long side", "short side", "scale %", "fit in box", "cover box"]
MAX_OPS = 8
DEFAULT_OPS = '[{"t":"pad","w":1024,"h":1024,"r":"","a":"center","dx":0,"dy":0,"color":"#000000","feather":0}]'
LAST_INFO = {}   # unique_id -> (ops, what was done) of the last run: WSave Image reads it for {#id} (src/saveWimage.py)


def pad_text(l, t, r, b):
    """The border a pad adds, short: p100 (the same on every side), p100x0 (left = right, top = bottom), p0-170-0-171."""
    if l == t == r == b:
        return f"p{l}"
    if l == r and t == b:
        return f"p{l}x{t}"
    return f"p{l}-{t}-{r}-{b}"


def frame_text(ops):
    """The stack as a short text with no picture: what `info` would say, from the numbers set, when the node has not
    run (a WSave Image part bound to a WFrame, before the first run, or a WFrame not on the road to the save)."""
    parts = []
    for op in _ops(ops):
        t, w, h, r = op["t"], _num(op.get("w")), _num(op.get("h")), str(op.get("r") or "").replace(":", "-")
        if t == "resize":
            mode, v = str(op.get("mode") or "width"), _num(op.get("v"))
            parts.append(f"r{w}x{h}" if "box" in mode else f"r{v}pct" if mode == "scale %" else f"r{v}")
        else:
            parts.append(t[0] + (f"{w}x{h}" if w and h else r))
    return "_".join(parts)


def _anchor_offset(anchor, room_x, room_y):
    """Top-left of a box of `room` to spare at the anchor. A negative room (the box is bigger) floors the same way, so
    `center` stays centred and `right` keeps the right edge, whichever is bigger."""
    anchor = str(anchor or "center")
    ax = 0 if "left" in anchor else room_x if "right" in anchor else room_x // 2
    ay = 0 if "top" in anchor else room_y if "bottom" in anchor else room_y // 2
    return ax, ay


def _num(v, d=0):
    try:
        return int(round(float(v)))
    except Exception:
        return d


def _ratio(s):
    try:
        a, b = str(s).split(":")
        r = float(a) / float(b)
        return r if r > 0 else None
    except Exception:
        return None


def _box(W, H, w, h, r, grow):
    """The w x h of a crop (grow False: inside the picture) or a pad canvas (grow True: around it). A missing side comes
    from the aspect r when there is one, else from the picture."""
    r = _ratio(r)
    if r and not w and not h:
        if grow:
            w, h = (W, int(round(W / r))) if W / H >= r else (int(round(H * r)), H)
        else:
            w, h = (W, int(round(W / r))) if W / H <= r else (int(round(H * r)), H)
    elif r and not w:
        w = int(round(h * r))
    elif r and not h:
        h = int(round(w / r))
    w, h = (w or W), (h or H)
    if not grow:
        w, h = min(W, w), min(H, h)
    return max(1, w), max(1, h)


def _hex(color):
    c = str(color or "").strip().lstrip("#")
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


def _place(img, masks, cw, ch, x, y, color, feather):
    """Put the picture on a cw x ch canvas with its top-left at (x, y): pads what is missing, cuts what sticks out.
    Returns image, the masks moved the same way (zeros in the added area), the pad mask of this step (1 in the added
    area, feathered inward), the four borders added (l, t, r, b) and the pixels cut (x, y)."""
    B, H, W, C = img.shape
    sx0, sy0 = max(0, -x), max(0, -y)
    sx1, sy1 = min(W, cw - x), min(H, ch - y)
    vis = img[:, sy0:sy1, sx0:sx1] if (sx1 > sx0 and sy1 > sy0) else img[:, 0:0, 0:0]
    vh, vw = vis.shape[1], vis.shape[2]
    dx, dy = max(0, x), max(0, y)
    out = torch.empty((B, ch, cw, C), dtype=img.dtype, device=img.device)
    out[:] = torch.tensor((color + [1.0, 1.0])[:C], dtype=img.dtype, device=img.device)
    out[:, dy:dy + vh, dx:dx + vw] = vis
    moved = []
    for mask in masks:
        if mask is None:
            moved.append(None)
            continue
        m = torch.zeros((mask.shape[0], ch, cw), dtype=mask.dtype, device=mask.device)
        if vh and vw:
            m[:, dy:dy + vh, dx:dx + vw] = mask[:, sy0:sy1, sx0:sx1]
        moved.append(m)
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
    return out, moved, pm, (l, t, r, b), (W - vw, H - vh)


def _thumb(image, side=320):
    """A small copy of the first picture of the batch in the temp folder, for the preview under the node.
    Never fails the node: None when it cannot be written."""
    try:
        H, W = image.shape[1], image.shape[2]
        s = min(1.0, side / max(W, H))
        tw, th = max(1, int(round(W * s))), max(1, int(round(H * s)))
        t = image[0:1, :, :, :3].movedim(-1, 1).float()
        if (tw, th) != (W, H):
            t = torch.nn.functional.interpolate(t, size=(th, tw), mode="area")
        arr = (t[0].movedim(0, -1).clamp(0, 1).cpu().numpy() * 255).astype(np.uint8)
        d = folder_paths.get_temp_directory()
        os.makedirs(d, exist_ok=True)
        name = "wxframe_%08x.png" % random.getrandbits(32)
        Image.fromarray(arr).save(os.path.join(d, name), compress_level=1)
        return {"filename": name, "subfolder": "", "type": "temp"}
    except Exception:
        return None


def _ops(text):
    """The stack from its JSON: a list of dicts with a known type, at most MAX_OPS; anything else is no action."""
    try:
        lst = json.loads(text) if isinstance(text, str) else text
    except Exception:
        return []
    if not isinstance(lst, list):
        return []
    return [op for op in lst if isinstance(op, dict) and op.get("t") in ("crop", "pad", "resize")][:MAX_OPS]


def crop_box(W, H, op):
    """(x, y, w, h) of a crop on a W x H picture, inside it."""
    cw, ch = _box(W, H, _num(op.get("w")), _num(op.get("h")), op.get("r"), False)
    ax, ay = _anchor_offset(op.get("a"), W - cw, H - ch)
    x = max(0, min(W - cw, ax + _num(op.get("dx"))))
    y = max(0, min(H - ch, ay + _num(op.get("dy"))))
    return x, y, cw, ch


def pad_box(W, H, op):
    """(x, y, fw, fh) of a pad on a W x H picture: the canvas size and where the picture's top-left lands on it."""
    fw, fh = _box(W, H, _num(op.get("w")), _num(op.get("h")), op.get("r"), True)
    ax, ay = _anchor_offset(op.get("a"), fw - W, fh - H)
    return ax + _num(op.get("dx")), ay + _num(op.get("dy")), fw, fh


def resize_size(W, H, op):
    """(w, h) after a resize of a W x H picture, aspect kept."""
    mode, v = str(op.get("mode") or "width"), float(_num(op.get("v"), 0))
    bw, bh = (_num(op.get("w")) or W), (_num(op.get("h")) or H)
    if mode == "width":        s = v / W
    elif mode == "height":     s = v / H
    elif mode == "long side":  s = v / max(W, H)
    elif mode == "short side": s = v / min(W, H)
    elif mode == "scale %":    s = v / 100.0
    elif mode == "fit in box": s = min(bw / W, bh / H)
    elif mode == "cover box":  s = max(bw / W, bh / H)
    else:                      s = 1.0
    if s <= 0:
        return W, H
    rw, rh = max(1, int(round(W * s))), max(1, int(round(H * s)))
    if mode == "fit in box":   rw, rh = min(rw, bw), min(rh, bh)
    if mode == "cover box":    rw, rh = max(rw, bw), max(rh, bh)
    return rw, rh


class Frame:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {"tooltip": "The picture the stack works on."}),
                "ops": ("STRING", {"default": DEFAULT_OPS, "multiline": False,
                                   "tooltip": "The stack of actions, as the panel under the node writes it (JSON): crop, pad, resize, in order."}),
                "method": (METHODS, {"default": "lanczos", "tooltip": "Resampling of the resize actions."}),
            },
            "optional": {
                "mask": ("MASK", {"tooltip": "Optional mask that follows the same crops, pads and resizes."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "pad_mask")
    OUTPUT_TOOLTIPS = ("The picture after the stack.", "1 where the stack added pixels, feathered inward: ready for outpaint. All zeros when nothing was added.")
    FUNCTION = "run"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("A stack of actions on the picture, in the order you put them: crop (the box that stays), pad (the picture on a "
                   "bigger or smaller canvas: what is missing is padded, what sticks out is cut) and resize (aspect kept). Each one "
                   "is a coloured rectangle in the preview under the node: drag it, pull its corners. Pad mask for outpaint. What it "
                   "did goes in a WSave Image name with {#id} (from Wnodes on graph): c800x800_p112x0.")

    def run(self, image, ops, method, mask=None, unique_id=None):
        img, steps = image, []
        B, H, W, C = img.shape
        ui = {"wx_frame": [{"w": W, "h": H, "thumb": _thumb(image)}]}   # what the preview under the node draws from
        pad_mask = torch.zeros((1, H, W), dtype=torch.float32)

        for op in _ops(ops):
            B, H, W, C = img.shape
            t = op["t"]
            if t == "crop":
                x, y, cw, ch = crop_box(W, H, op)
                if (cw, ch) == (W, H):
                    continue
                img = img[:, y:y + ch, x:x + cw]
                pad_mask = pad_mask[:, y:y + ch, x:x + cw]
                if mask is not None:
                    mask = mask[:, y:y + ch, x:x + cw]
                steps.append(f"c{cw}x{ch}")
            elif t == "pad":
                x, y, fw, fh = pad_box(W, H, op)
                if (fw, fh) == (W, H) and x == 0 and y == 0:
                    continue
                img, (mask, pad_mask), pm, (l, tt, r, b), (cutx, cuty) = _place(
                    img, [mask, pad_mask], fw, fh, x, y, _hex(op.get("color")), max(0, _num(op.get("feather"))))
                pad_mask = torch.maximum(pad_mask, pm)
                if l or tt or r or b: steps.append(pad_text(l, tt, r, b))
                if cutx or cuty:      steps.append(f"-{cutx}x{cuty}")   # a leading − = cut, like the sides in the panel
            else:
                rw, rh = resize_size(W, H, op)
                if (rw, rh) == (W, H):
                    continue
                img = _resize(img, rw, rh, method)
                mask = _resize_mask(mask, rw, rh)
                pad_mask = _resize_mask(pad_mask, rw, rh)
                steps.append(f"r{rw}x{rh}")

        if unique_id is not None:   # what was done, for a WSave Image part bound with {#id}: c800x800_p112x0 (c = crop, p = pad, r = resize, - = cut)
            LAST_INFO[str(unique_id)] = (ops, "_".join(steps))
        return {"ui": ui, "result": (img, pad_mask)}
