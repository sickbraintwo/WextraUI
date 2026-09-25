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


MAX_OUTS = 20


class RouteIndex:
    """Same idea with a number: value goes out of the output whose index is chosen (0..19). The script
    (web/wxRouteIndex.js) shows the outputs in use plus one empty, like the slots of WSwitch."""
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": (ANY, {"tooltip": "Anything."}),
                "index": ("INT", {"default": 0, "min": 0, "max": MAX_OUTS - 1,
                                  "tooltip": "Which output carries the value, counted from 0 (the index of WSwitch fits). "
                                             "The others are skipped."}),
            },
        }

    RETURN_TYPES = tuple(ANY for _ in range(MAX_OUTS))
    RETURN_NAMES = tuple(f"out{i}" for i in range(MAX_OUTS))
    OUTPUT_TOOLTIPS = tuple(f"value when index is {i}; otherwise this branch is skipped." for i in range(MAX_OUTS))
    FUNCTION = "route_it"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("Routes one value to one of up to twenty outputs by index, counted from 0; the other branches are "
                   "skipped. The outputs show as you use them.")

    def route_it(self, value, index):
        outs = [ExecutionBlocker(None)] * MAX_OUTS
        outs[max(0, min(MAX_OUTS - 1, int(index)))] = value
        return tuple(outs)