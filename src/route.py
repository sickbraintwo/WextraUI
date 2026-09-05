"""Route — the 'if' the other way round: ONE input, TWO outputs, a boolean decides which output carries it.
The other output returns an ExecutionBlocker: every node downstream of it is silently skipped (Save nodes included).
ComfyUI is pull-based (a node runs only when something downstream asks for its output), which is why nearly every
switch in the ecosystem picks an INPUT; picking an OUTPUT needs the blocker the core provides for exactly this."""
from comfy_execution.graph import ExecutionBlocker


class AnyType(str):
    """Matches any socket type (the usual '*' trick)."""
    def __ne__(self, other):
        return False


ANY = AnyType("*")


class Route:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": (ANY, {"tooltip": "Anything: image, latent, model, string… It comes out of A or of B."}),
                "route": ("BOOLEAN", {"default": True, "label_on": "true", "label_off": "false",
                                      "tooltip": "true = value goes out of A, the B branch does not run; false = the other way round. "
                                                 "Connect a BOOLEAN to decide at run time."}),
            },
        }

    RETURN_TYPES = (ANY, ANY)
    RETURN_NAMES = ("true", "false")
    OUTPUT_TOOLTIPS = ("value when route is true; otherwise this branch is skipped.",
                       "value when route is false; otherwise this branch is skipped.")
    FUNCTION = "route_it"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("Routes one value to output A or B by a boolean. The branch not chosen does not execute at all "
                   "(its nodes are skipped, no error) — the 'if' that picks an output instead of an input.")

    def route_it(self, value, route):
        if route:
            return (value, ExecutionBlocker(None))
        return (ExecutionBlocker(None), value)


class RouteIndex:
    """Same idea with a number: value goes out of the output whose index is chosen (0..3)."""
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": (ANY, {"tooltip": "Anything."}),
                "index": ("INT", {"default": 0, "min": 0, "max": 3,
                                  "tooltip": "Which output carries the value (0-3). The others are skipped."}),
            },
        }

    RETURN_TYPES = (ANY, ANY, ANY, ANY)
    RETURN_NAMES = ("out0", "out1", "out2", "out3")
    FUNCTION = "route_it"
    CATEGORY = "WextraUI"
    DESCRIPTION = "Routes one value to one of four outputs by index; the other three branches are skipped."

    def route_it(self, value, index):
        return tuple(value if i == index else ExecutionBlocker(None) for i in range(4))
