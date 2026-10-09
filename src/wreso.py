"""WReso (wxReso) — the resolution, written large (Sick, 09/10/2026: a Resolution Selector's width and height read with no
string nodes in between, and the size of a picture at a glance). Of the picture on the `image` cable, else of the two
INT cables `width` and `height`; the same two numbers go out as INT. The frontend (web/wxReso.js) shows them before the
run, read from the graph; after the run, the ones used here (`wx_reso`)."""


class WReso:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "image": ("IMAGE", {"tooltip": "A picture: its width and height are the resolution shown and passed on (the two numbers below are then left aside)."}),
                "width": ("INT", {"forceInput": True, "min": 0, "max": 1 << 24,
                                  "tooltip": "The width, from any INT output (a resolution node, a WInt🌱), when there is no picture."}),
                "height": ("INT", {"forceInput": True, "min": 0, "max": 1 << 24,
                                   "tooltip": "The height, from any INT output, when there is no picture."}),
            },
        }

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    OUTPUT_TOOLTIPS = ("The width shown, as INT.", "The height shown, as INT.")
    FUNCTION = "read"
    OUTPUT_NODE = True   # it runs with nothing on its outputs, like a Preview: the line must fill even when the node is the end of the cable
    CATEGORY = "WextraUI"
    DESCRIPTION = ("The resolution, written large on the node: of the picture on the image cable, else of the two numbers on "
                   "width and height (a resolution node, a WInt🌱). The same two numbers go out as INT. Nothing else: the "
                   "size of what passes, read at a glance, with no string nodes in between.")

    def read(self, image=None, width=None, height=None):
        if image is not None:
            w, h = int(image.shape[2]), int(image.shape[1])
        else:
            w, h = int(width or 0), int(height or 0)
        return {"ui": {"wx_reso": [[w, h]]}, "result": (w, h)}
