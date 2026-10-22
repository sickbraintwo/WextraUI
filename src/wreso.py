"""WReso (wxReso) — the size of a picture, read or defined, in two sections with a ▸ / ▾ head, one open at a time (Sick, 09/10/2026
the reading, 16/10 the defining and the ratio in a node of their own, WResoDefine, 19/10 all three here, 22/10 the ratio out
again, to WRatio in wratio.py, so its two numbers can go out). The outputs are the numbers of the section open, or of the
last one opened; the frontend (web/wxReso.js) writes them large under the node. Every number of the node takes a cable.
- **Read**: the size of the picture on the `image` cable, else of the two INT cables `width` and `height`.
  The three sockets are the node's first three, as in 0.8.0 (drawn inside the section, one row each): a saved WReso opens with this section open and does the same.
- **Define**: type the width or the height, the other stays 0 and is the one worked out, to the nearest
  multiple of `multiple` (8 to start: 1 = the nearest pixel, as GIMP; 2 = even, as video codecs want); the ratio from the
  menu (every landscape one in use, or `custom` with two numbers of your own); `invert` turns the result round
  (1480 × 832 becomes 832 × 1480), the upright frame. Its boxes are `define_width` / `define_height` (`width` and
  `height` are the reading's cables), shown as width and height. `multiple` is one of 1, 2, 4, 8, 16, 32, 64, in a number box
  (a menu until 22/10, which a cable could not reach): a number in between, typed or from a cable, goes to the nearest of
  them (multiple_of); a saved "8" is read as 8.
- **Multiply** (Sick 22/10): a width and a height times `multiply_by` (one decimal, 1.0 to start), each side to the
  nearest pixel (Python's round, as the frontend). Its boxes are `multiply_width` / `multiply_height`, shown as width and
  height; they come after `invert`, so a WReso saved before keeps every value where it was."""
from math import log2


# every landscape ratio in use, squarest first (Sick, 19/10/2026: «all of them but the upright ones»; upright = `invert`):
# square, photo and print (5:4, 7:5, 3:2, A4 = 1.414), screens (16:10, 16:9, 19.5:9 phones, 21:9 and 64:27 ultrawide, 32:9),
# cinema (1.37 Academy, 1.43 IMAX film, 1.66, 1.85, 1.9 DCI, 2:1, 2.2 Todd-AO, 2.35 / 2.39 / 2.4 scope, 2.76 Ultra Panavision),
# 1.91:1 link previews.
RATIOS = ["1:1", "5:4", "4:3", "1.37:1", "7:5", "1.414:1", "1.43:1", "3:2", "16:10", "1.66:1", "16:9", "1.85:1", "1.9:1",
          "1.91:1", "2:1", "19.5:9", "2.2:1", "21:9", "2.35:1", "64:27", "2.39:1", "2.4:1", "2.76:1", "32:9", "custom"]
MULTIPLES = (1, 2, 4, 8, 16, 32, 64)
SECTIONS = ["reading", "defining", "multiply"]   # "ratio" until 22/10: a WReso saved on it reads (the frontend opens Read)
BIG = 1 << 14


def ratio_of(text, custom_width=16, custom_height=9):
    """`16:9` -> (16.0, 9.0); `custom` -> the two numbers given; anything unreadable -> (1.0, 1.0)."""
    if str(text) == "custom":
        a, b = float(custom_width or 0), float(custom_height or 0)
        return (a, b) if a > 0 and b > 0 else (1.0, 1.0)
    try:
        a, b = str(text).split(":", 1)
        a, b = float(a), float(b)
        return (a, b) if a > 0 and b > 0 else (1.0, 1.0)
    except (ValueError, TypeError):
        return 1.0, 1.0


def snap(x, m=8):
    """The nearest multiple of m (Python's round: half to even, the frontend does the same), never under m."""
    m = max(1, int(m or 1))
    return max(m, int(round(x / m)) * m) if x > 0 else 0


def multiple_of(m):
    """The one of MULTIPLES nearest to m, on a doubling scale (12 -> 16, 6 -> 8, 3 -> 4, 100 -> 64); 8 for nothing."""
    try:
        m = float(m)
    except (TypeError, ValueError):
        return 8
    if not m > 0:
        return 8
    return min(MULTIPLES, key=lambda x: abs(log2(m / x)))


def define(width, height, aspect_ratio, custom_width=16, custom_height=9, invert=False, multiple=8):
    """The two sides: the one typed as it is, the other from the ratio; turned round with `invert`. The width wins when
    both are set (a cable on each, an API prompt); both at 0 give 0 × 0."""
    rw, rh = ratio_of(aspect_ratio, custom_width, custom_height)
    w, h = max(0, int(width or 0)), max(0, int(height or 0))
    if w > 0:
        w, h = w, snap(w * rh / rw, multiple)
    elif h > 0:
        w, h = snap(h * rw / rh, multiple), h
    else:
        w, h = 0, 0
    return (h, w) if invert else (w, h)


def multiply(width, height, by=1.0):
    """Both sides times `by`, each to the nearest pixel, never under 0: (1024, 1024, 1.5) -> (1536, 1536)."""
    f = max(0.0, float(by if by is not None else 1.0))
    return max(0, int(round(int(width or 0) * f))), max(0, int(round(int(height or 0) * f)))


class WReso:
    @classmethod
    def INPUT_TYPES(cls):
        side = lambda tip: ("INT", {"default": 0, "min": 0, "max": BIG, "step": 1, "tooltip": tip})
        # all optional, the reading's three cables first: a WReso saved by 0.8.0 keeps its sockets where they were
        return {
            "required": {},
            "optional": {
                "image": ("IMAGE", {"tooltip": "Read: a picture; its width and height go out (the two numbers below are then left aside)."}),
                "width": ("INT", {"forceInput": True, "min": 0, "max": 1 << 24,
                                  "tooltip": "Read: the width, from any INT output (a resolution node, a WInt🌱), when there is no picture."}),
                "height": ("INT", {"forceInput": True, "min": 0, "max": 1 << 24,
                                   "tooltip": "Read: the height, from any INT output, when there is no picture."}),
                "section": (SECTIONS, {"default": "reading",
                                       "tooltip": "Which section gives the outputs: the one open, or the last one opened."}),
                "define_width": side("The width you know. Leave it at 0 when you know the height: it is the side worked out."),
                "define_height": side("The height you know. Leave it at 0 when you know the width: it is the side worked out."),
                "aspect_ratio": (RATIOS, {"default": "16:9",
                                          "tooltip": "Width : height. `custom`: two numbers of your own. For the upright frame, `invert`."}),
                "custom_width": ("INT", {"default": 16, "min": 1, "max": BIG, "step": 1, "tooltip": "The first number of a custom ratio (width)."}),
                "custom_height": ("INT", {"default": 9, "min": 1, "max": BIG, "step": 1, "tooltip": "The second number of a custom ratio (height)."}),
                "multiple": ("INT", {"default": 8, "min": 1, "max": 64, "step": 1,
                                     "tooltip": "The side worked out goes to the nearest multiple of this: 1, 2, 4, 8, 16, 32 or 64. 8 for models (16, 32, 64 for some video models), 2 for an even size, 1 for the nearest pixel. A number typed or from a cable goes to the nearest of the seven (12 -> 16)."}),
                "invert": ("BOOLEAN", {"default": False,
                                       "tooltip": "Turns the result round: 1480 × 832 becomes 832 × 1480, the upright frame."}),
                "multiply_width": side("Multiply: the width to multiply."),
                "multiply_height": side("Multiply: the height to multiply."),
                "multiply_by": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 100.0, "step": 0.1, "round": 0.1,
                                          "tooltip": "Multiply: both sides times this (1.5: 1024 × 1024 becomes 1536 × 1536), each to the nearest pixel."}),
            },
        }

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    OUTPUT_TOOLTIPS = ("The width of the section open (or the last one opened).", "The height of the section open (or the last one opened).")
    FUNCTION = "read"
    OUTPUT_NODE = True   # it runs with nothing on its outputs, like a Preview: the line must fill even when the node is the end of the cable
    CATEGORY = "WextraUI"
    DESCRIPTION = ("The size of a picture, three sections, one open at a time. Read: the size of the picture "
                   "on the image cable, else of the two numbers on width and height, written large. Define: "
                   "one side and a ratio give the other side (to the nearest multiple you pick), `invert` turns it upright. "
                   "Multiply: a width and a height times a number (1.5, 0.5). "
                   "The outputs are the numbers of the section open. The ratio of a size: WRatio.")

    def read(self, image=None, width=None, height=None, section="reading", define_width=0, define_height=0,
             aspect_ratio="16:9", custom_width=16, custom_height=9, multiple=8, invert=False,
             multiply_width=0, multiply_height=0, multiply_by=1.0, **_old):
        # **_old: ratio_width / ratio_height of a WReso saved before 22/10 (an API prompt), left aside
        if section == "defining":
            w, h = define(define_width, define_height, aspect_ratio, custom_width, custom_height, invert, multiple_of(multiple))
        elif section == "multiply":
            w, h = multiply(multiply_width, multiply_height, multiply_by)
        elif image is not None:
            w, h = int(image.shape[2]), int(image.shape[1])
        else:
            w, h = int(width or 0), int(height or 0)
        return {"ui": {"wx_reso": [[w, h]]}, "result": (w, h)}
