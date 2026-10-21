"""WCutScene (wxCutScene) — where the shot changes in a video (Sick, 17/10/2026: one node per job, each one checked by
eye before the next builds on it). The frames of the video in, the start of every scene out (`cuts`, one time per
line), and on the node a sheet with the first and the last frame of each scene (and the middle one): a cut that was missed
shows as two different shots in one cell, a cut too many as the same shot in two.

How a cut is found: every frame, shrunk to 64x36, is compared with the one before (mean difference of colour, 0..255).
Inside a shot it stays low, even when things move fast; at a cut it jumps. A frame is a cut when its jump is large in
itself AND much larger than the two frames before and after it: fast motion raises all of them together, a flash
raises two close ones (into the flash and out of it) and so cancels itself, a fade from black climbs slowly. Two cuts
closer than a quarter of a second count as one. What it cannot see: a cross-dissolve or a morph, which never jump.

The `cuts` box: empty = found here, and the frontend (web/wxSceneBoxes.js) writes what was found into it; filled = the
times written there are used as they are (add a line for a cut that was missed, delete one that is too many).

The `beats` box (Sick, 19/10/2026): times where the shot goes on but the sound changes (a drop falls, a match is
struck). They are never found by the node, only written there by hand, one per line, and they are added to the cuts
of the box above whether those were found or written. A beat makes a scene like a cut does, shown on the sheet in
blue; on the `cuts` output its line starts with `+` (`+16.50`), which WAudio Prompts and the Foley timeline read."""
import os
import uuid

import torch
import torch.nn.functional as F
from PIL import Image, ImageDraw, ImageFont

import folder_paths

from .foley import FPS_DEFAULT, parse_mark, parse_time

SMALL = (36, 64)            # height, width of the copy that is compared
MIN_GAP = 0.25              # seconds: two cuts closer than this are one
COLS, THUMB_W, PAD, LABEL_H = 3, 160, 10, 22


def differences(images):
    """How much each frame differs from the one before, 0..255 (the first frame: 0). Read in chunks: a long video at
    full size does not fit twice in memory."""
    small = []
    for i in range(0, images.shape[0], 64):
        x = images[i:i + 64, :, :, :3].movedim(-1, 1).float()
        small.append(F.interpolate(x, size=SMALL, mode="area").cpu())
    s = torch.cat(small) * 255
    d = torch.zeros(s.shape[0])
    if s.shape[0] > 1:
        d[1:] = (s[1:] - s[:-1]).abs().mean(dim=(1, 2, 3))
    return d.tolist()


def find_cuts(d, fps, sensitivity=0.5):
    """The first frame of every scene (0 first) from the differences `d`. `sensitivity` 0..1: higher finds softer cuts
    (and risks false ones). At 0.5 a jump must be at least 25 and at least twice its neighbours + 4."""
    s = min(1.0, max(0.0, float(sensitivity)))
    least, ratio = 40 - 30 * s, 3 - 2 * s
    gap = max(1, int(round(MIN_GAP * fps)))
    n = len(d)
    cuts = [0]
    for i in range(1, n):
        near = [d[j] for j in (i - 2, i - 1, i + 1, i + 2) if 1 <= j < n]
        if d[i] >= least and d[i] >= ratio * max(near or [0]) + 4 and i - cuts[-1] >= gap:
            cuts.append(i)
    return cuts


def parse_marks(text, fps, total, all_beats=False, where="cuts"):
    """A box of times -> (the first frame of every scene, sorted, 0 always in; the set of those that are beats). One
    time per line (6 · 6.5 · 1:02.5 · 144f), `+` before it for a beat (`all_beats`: every line is one); `#` starts a
    comment. A frame written both ways is a cut; 0 is never a beat."""
    cuts, beats = {0}, set()
    for no, raw in enumerate(str(text or "").splitlines(), 1):
        line = raw.split("#")[0].strip()
        if not line:
            continue
        beat, tok = parse_mark(line)
        f = parse_time(tok, fps)
        if f is None:
            raise ValueError(f"WCutScene: {where}, line {no}, `{line}` is not a time (6 · 6.5 · 1:02.5 · 144f).")
        if f >= total:
            raise ValueError(f"WCutScene: {where}, line {no}, {line} is past the end of the video ({total / fps:.2f} s).")
        (beats if beat or all_beats else cuts).add(f)
    return sorted(cuts | beats), beats - cuts


def parse_cuts(text, fps, total):
    """The `cuts` box -> the first frame of every scene, sorted (cuts and beats alike), 0 always in."""
    return parse_marks(text, fps, total)[0]


def cuts_text(cuts, fps, total, beats=()):
    """The cuts as the box shows them: one time per line (`+` before a beat), and after # the scene number and how
    long it lasts."""
    ends = cuts[1:] + [total]
    return "\n".join(f"{'+' if a in beats else ''}{a / fps:.2f}    # {k} · {(b - a) / fps:.2f} s"
                     for k, (a, b) in enumerate(zip(cuts, ends)))


def _font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:       # Pillow older than 10.1
        return ImageFont.load_default()


def _thumb(images, i, w, h):
    a = (images[i, :, :, :3].clamp(0, 1) * 255).byte().cpu().numpy()
    return Image.fromarray(a).resize((w, h), Image.BILINEAR)


def sheet(images, cuts, fps, beats=()):
    """One cell per scene, three per row: its number and times, its first, middle and last frame side by side (a fade
    from black leaves the first one dark: the middle one shows the shot). A beat: `+` before its time, in blue."""
    total, H, W = images.shape[0], images.shape[1], images.shape[2]
    tw = THUMB_W
    th = max(40, min(int(round(tw * H / W)), 2 * tw))
    cw, ch = 3 * tw + 8, LABEL_H + th
    rows = (len(cuts) + COLS - 1) // COLS
    img = Image.new("RGB", (COLS * cw + (COLS + 1) * PAD, rows * ch + (rows + 1) * PAD), (24, 24, 24))
    dr, font = ImageDraw.Draw(img), _font(15)
    ends = cuts[1:] + [total]
    for k, (a, b) in enumerate(zip(cuts, ends)):
        x = PAD + (k % COLS) * (cw + PAD)
        y = PAD + (k // COLS) * (ch + PAD)
        short = (b - a) / fps < 0.5
        beat = a in beats
        colour = (255, 120, 90) if short else (120, 190, 255) if beat else (235, 220, 120)
        dr.text((x + 2, y + 2), f"{k}   {'+' if beat else ''}{a / fps:.2f} - {b / fps:.2f} s", fill=colour, font=font)
        for j, f in enumerate((a, (a + b - 1) // 2, b - 1)):
            img.paste(_thumb(images, f, tw, th), (x + j * (tw + 4), y + LABEL_H))
    return img


class WCutScene:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {"tooltip": "The whole video (a Load Video): the same frames that go on to the Foley nodes."}),
                "fps": ("FLOAT", {"default": FPS_DEFAULT, "min": 1, "max": 240, "step": 0.001,
                                  "tooltip": "The frames per second of the frames on the cable, to turn frames into seconds."}),
                "sensitivity": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.05,
                                          "tooltip": "Higher finds softer cuts (and risks false ones); lower keeps only the clear ones. "
                                                     "Used only while the cuts box is empty."}),
                "cuts": ("STRING", {"default": "", "multiline": True,
                                    "placeholder": "Found at the Run, one time per line. Add or delete lines; empty the box to find them again.",
                                    "tooltip": "Empty = the cuts are found by the node and written here after the Run. Filled = these "
                                               "times are used as they are: one per line (6 · 6.5 · 1:02.5 · 144f), # = a comment. "
                                               "Add a line for a cut that was missed, delete one that is too many; empty it to find them again."}),
            },
            "optional": {
                "beats": ("STRING", {"default": "", "multiline": True,
                                     "placeholder": "One time per line where the sound changes but the shot goes on. By hand only.",
                                     "tooltip": "Beats: times where the shot goes on but the sound changes (a drop falls, a match is "
                                                "struck), one per line. Never found by the node: written here by hand, and added to "
                                                "the cuts above. Each one starts a scene of its own prompt, which fades in slowly "
                                                "instead of cutting in."}),
            },
        }

    RETURN_TYPES = ("STRING", "INT")
    RETURN_NAMES = ("cuts", "scenes")
    OUTPUT_TOOLTIPS = ("The start of every scene, one time per line (the first is 0; `+` before a beat), with its number and "
                       "length after #.",
                       "How many scenes.")
    FUNCTION = "cut"
    OUTPUT_NODE = True   # the sheet shows even with nothing on its outputs
    CATEGORY = "WextraUI/Video"
    DESCRIPTION = ("Where the shot changes in a video: the start of every scene, and on the node the first and the last "
                   "frame of each scene, to check by eye. A cut is a sudden jump of the picture; a cross-dissolve or a "
                   "morph does not jump and is not found: write its time in the cuts box.")

    def cut(self, images, fps, sensitivity, cuts="", beats=""):
        total = int(images.shape[0])
        found = not str(cuts or "").strip()
        frames, marked = (find_cuts(differences(images), fps, sensitivity), set()) if found else parse_marks(cuts, fps, total)
        _, extra = parse_marks(beats, fps, total, all_beats=True, where="beats")
        hard = set(frames) - marked
        marked = (marked | extra) - hard
        frames = sorted(hard | marked)
        text = cuts_text(frames, fps, total, marked)
        name = f"wxcutscene_{uuid.uuid4().hex[:10]}.jpg"
        sheet(images, frames, fps, marked).save(os.path.join(folder_paths.get_temp_directory(), name), quality=88)
        # into the cuts box only the cuts found: the beats stay in their own box
        box = "\n".join(l for l in text.splitlines() if not l.startswith("+"))
        ui = {"images": [{"filename": name, "subfolder": "", "type": "temp"}], "wx_cuts": [box if found else ""]}
        return {"ui": ui, "result": (text, len(frames))}
