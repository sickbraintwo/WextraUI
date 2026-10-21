"""WReso (wxReso) — every question about a size, in three sections with a ▸ / ▾ head, one open at a time (Sick, 09/10/2026
the reading, 16/10 the defining and the ratio in a node of their own, WResoDefine, 19/10 all three here). The outputs are
the numbers of the section open, or of the last one opened; the frontend (web/wxReso.js) writes them large under the node.
- **Resolution Reading**: the size of the picture on the `image` cable, else of the two INT cables `width` and `height`.
  The three sockets are the node's first three, as in 0.8.0 (drawn inside the section, one row each): a saved WReso opens with this section open and does the same.
- **Resolution Defining**: type the width or the height, the other stays 0 and is the one worked out, to the nearest
  multiple of `multiple` (8 to start: 1 = the nearest pixel, as GIMP; 2 = even, as video codecs want); the ratio from the
  menu (every landscape one in use, or `custom` with two numbers of your own); `invert` turns the result round
  (1480 × 832 becomes 832 × 1480), the upright frame. Its boxes are `define_width` / `define_height` (`width` and
  `height` are the reading's cables), shown as width and height.
- **Ratio Finding**: a width and a height, given back as they are; the frontend writes their ratio under them (≈ 16:9)."""

# every landscape ratio in use, squarest first (Sick, 19/10/2026: «all of them but the upright ones»; upright = `invert`):
# square, photo and print (5:4, 7:5, 3:2, A4 = 1.414), screens (16:10, 16:9, 19.5:9 phones, 21:9 and 64:27 ultrawide, 32:9),
# cinema (1.37 Academy, 1.43 IMAX film, 1.66, 1.85, 1.9 DCI, 2:1, 2.2 Todd-AO, 2.35 / 2.39 / 2.4 scope, 2.76 Ultra Panavision),
# 1.91:1 link previews.
RATIOS = ["1:1", "5:4", "4:3", "1.37:1", "7:5", "1.414:1", "1.43:1", "3:2", "16:10", "1.66:1", "16:9", "1.85:1", "1.9:1",
          "1.91:1", "2:1", "19.5:9", "2.2:1", "21:9", "2.35:1", "64:27", "2.39:1", "2.4:1", "2.76:1", "32:9", "custom"]
SECTIONS = ["reading", "defining", "ratio"]
MULTIPLES = ["1", "2", "8", "16", "32", "64"]
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


class WReso:
    @classmethod
    def INPUT_TYPES(cls):
        side = lambda tip: ("INT", {"default": 0, "min": 0, "max": BIG, "step": 1, "tooltip": tip})
        # all optional, the reading's three cables first: a WReso saved by 0.8.0 keeps its sockets where they were
        return {
            "required": {},
            "optional": {
                "image": ("IMAGE", {"tooltip": "Resolution Reading: a picture; its width and height go out (the two numbers below are then left aside)."}),
                "width": ("INT", {"forceInput": True, "min": 0, "max": 1 << 24,
                                  "tooltip": "Resolution Reading: the width, from any INT output (a resolution node, a WInt🌱), when there is no picture."}),
                "height": ("INT", {"forceInput": True, "min": 0, "max": 1 << 24,
                                   "tooltip": "Resolution Reading: the height, from any INT output, when there is no picture."}),
                "section": (SECTIONS, {"default": "reading",
                                       "tooltip": "Which section gives the outputs: the one open, or the last one opened."}),
                "define_width": side("The width you know. Leave it at 0 when you know the height: it is the side worked out."),
                "define_height": side("The height you know. Leave it at 0 when you know the width: it is the side worked out."),
                "aspect_ratio": (RATIOS, {"default": "16:9",
                                          "tooltip": "Width : height. `custom`: two numbers of your own. For the upright frame, `invert`."}),
                "custom_width": ("INT", {"default": 16, "min": 1, "max": BIG, "step": 1, "tooltip": "The first number of a custom ratio (width)."}),
                "custom_height": ("INT", {"default": 9, "min": 1, "max": BIG, "step": 1, "tooltip": "The second number of a custom ratio (height)."}),
                "multiple": (MULTIPLES, {"default": "8",
                                         "tooltip": "The side worked out goes to the nearest multiple of this: 8 for models (16, 32, 64 for some video "
                                                    "models), 2 for an even size, 1 for the nearest pixel."}),
                "invert": ("BOOLEAN", {"default": False,
                                       "tooltip": "Turns the result round: 1480 × 832 becomes 832 × 1480, the upright frame."}),
                "ratio_width": side("Ratio Finding: a width, given back as it is."),
                "ratio_height": side("Ratio Finding: a height, given back as it is."),
            },
        }

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    OUTPUT_TOOLTIPS = ("The width of the section open (or the last one opened).", "The height of the section open (or the last one opened).")
    FUNCTION = "read"
    OUTPUT_NODE = True   # it runs with nothing on its outputs, like a Preview: the line must fill even when the node is the end of the cable
    CATEGORY = "WextraUI"
    DESCRIPTION = ("Every question about a size, three sections, one open at a time. Resolution Reading: the size of the "
                   "picture on the image cable, else of the two numbers on width and height, written large. Resolution "
                   "Defining: one side and a ratio give the other side (to the nearest multiple you pick), `invert` turns "
                   "it upright. Ratio Finding: a width and a height, and their ratio written under them. The outputs are "
                   "the numbers of the section open.")

    def read(self, image=None, width=None, height=None, section="reading", define_width=0, define_height=0,
             aspect_ratio="16:9", custom_width=16, custom_height=9, multiple="8", invert=False, ratio_width=0, ratio_height=0):
        if section == "defining":
            w, h = define(define_width, define_height, aspect_ratio, custom_width, custom_height, invert, int(multiple))
        elif section == "ratio":
            w, h = max(0, int(ratio_width or 0)), max(0, int(ratio_height or 0))
        elif image is not None:
            w, h = int(image.shape[2]), int(image.shape[1])
        else:
            w, h = int(width or 0), int(height or 0)
        return {"ui": {"wx_reso": [[w, h]]}, "result": (w, h)}
