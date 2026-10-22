"""WRatio (wxRatio) — the ratio of a size, its two numbers out as INT (Sick, 22/10/2026: the Ratio Finding of WReso in a node
of its own, «ho bisogno dei 2 valori del ratio come output»). A width and a height in, the boxes or two cables; out the two
numbers of the ratio written large on the node (web/wxRatio.js): a known ratio when it is exact or within 1% (1480 × 832
is ≈ 16:9: out 16 and 9), else the reduced fraction (1100 × 700: 11 and 7). A known ratio with a decimal goes out made
whole: 1.85:1 is 37 and 20, 19.5:9 is 13 and 6, the same ratio. They fit WReso's `custom` ratio as they are."""
from fractions import Fraction
from math import log

from .wreso import BIG, RATIOS

NEAR = 0.01   # within 1%: `≈ 16:9` (web/wxRatio.js NEAR)


def find_ratio(width, height):
    """(a, b), the whole numbers of the ratio of width × height as the node writes it; (0, 0) when a side is 0. The known
    ratios are tried either way round (9:16 is 16:9 turned), in the order of the menu, the nearest wins (the frontend
    does the same sum, so the line and the outputs agree)."""
    w, h = max(0, int(width or 0)), max(0, int(height or 0))
    if not (w and h):
        return 0, 0
    r, best, dist = w / h, None, float("inf")
    for t in RATIOS:
        if t == "custom":
            continue
        a, b = (Fraction(x) for x in t.split(":"))
        for x, y in ((a, b), (b, a)):
            d = abs(log(r / float(x / y)))
            if d < dist:
                best, dist = x / y, d
    f = best if dist < NEAR else Fraction(w, h)
    return f.numerator, f.denominator


class WRatio:
    @classmethod
    def INPUT_TYPES(cls):
        side = lambda tip: ("INT", {"default": 0, "min": 0, "max": BIG, "step": 1, "tooltip": tip})
        return {
            "required": {
                "width": side("A width: typed, or from any INT cable (a WReso, a WInt🌱, a resolution node)."),
                "height": side("A height: typed, or from any INT cable."),
            },
        }

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("ratio_width", "ratio_height")
    OUTPUT_TOOLTIPS = ("The first number of the ratio written on the node (16 of 16:9; a decimal one made whole: 37 of 1.85:1 = 37:20).",
                       "The second number of the ratio written on the node (9 of 16:9).")
    FUNCTION = "find"
    OUTPUT_NODE = True   # it runs with nothing on its outputs, like a Preview: the line fills at every Run
    CATEGORY = "WextraUI"
    DESCRIPTION = ("The ratio of a size. A width and a height in; their ratio written large (16:9 when it is exact, ≈ 16:9 "
                   "within 1%, the reduced fraction otherwise), the fraction and the decimal small under it, and the nearest "
                   "sizes that are that ratio exactly with both sides multiples of 8. Out, the two numbers of the ratio as INT, "
                   "ready for the custom ratio of WReso.")

    def find(self, width=0, height=0):
        w, h = max(0, int(width or 0)), max(0, int(height or 0))
        a, b = find_ratio(w, h)
        return {"ui": {"wx_ratio": [[w, h, a, b]]}, "result": (a, b)}
