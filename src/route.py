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


# Wif and WIndex: the mirror of the two above, the switch that picks an INPUT (as Easy-Use If else and Any Index Switch).
# The inputs are lazy: only the one chosen is asked for, the branches behind the others do not run. A chosen input with
# no cable gives a blocker, not an error: nothing downstream runs (the node says so, web/wxRouteWire.js).
HIDDEN = {"prompt": "PROMPT", "unique_id": "UNIQUE_ID"}


def _cabled(prompt, unique_id, key):
    """True when input `key` of this node has a cable in the prompt (asking for one without a cable is an error of the core)."""
    node = (prompt or {}).get(str(unique_id))
    if node is None:
        return True   # an expanded node the original prompt does not know: ask, as Easy-Use does
    v = node.get("inputs", {}).get(key)
    return isinstance(v, list) and len(v) == 2


MAX_PAIRS = 20


class If:
    """Wif: `count` pairs (1..20) driven by one boolean, `true1..trueN` then `false1..falseN` in, `value1..valueN` out:
    output k gives `true k` or `false k`. The schema declares all 20; the script (web/wxif.js) shows the first `count`."""
    @classmethod
    def INPUT_TYPES(cls):
        opt = {f"true{k}": (ANY, {"lazy": True, "tooltip": f"Anything. It goes out of output {k} when `if` is true; "
                                                           "otherwise it does not run."}) for k in range(1, MAX_PAIRS + 1)}
        opt.update({f"false{k}": (ANY, {"lazy": True, "tooltip": f"Anything. It goes out of output {k} when `if` is "
                                                                 "false; otherwise it does not run."})
                    for k in range(1, MAX_PAIRS + 1)})
        return {
            "required": {
                "count": ("INT", {"default": 1, "min": 1, "max": MAX_PAIRS,
                                  "tooltip": "How many true / false pairs the same `if` drives (1..20): one output each."}),
                "if": ("BOOLEAN", {"default": True, "label_on": "true", "label_off": "false",
                                   "tooltip": "true = every `true` goes out of its output, the branches behind the `false` "
                                              "do not run; false = the other way round. Connect a BOOLEAN to decide at run time."}),
            },
            "optional": opt,
            "hidden": HIDDEN,
        }

    RETURN_TYPES = (ANY,) * MAX_PAIRS
    RETURN_NAMES = tuple(f"value{k}" for k in range(1, MAX_PAIRS + 1))
    OUTPUT_TOOLTIPS = ("The input of this pair chosen by `if`. With no cable on it, nothing downstream runs.",) * MAX_PAIRS
    FUNCTION = "pick"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("Picks, for each of up to twenty pairs, one of two inputs by the same boolean; only the chosen branches "
                   "run (the inputs are lazy). The mirror of WRoute: the 'if' that picks an input.")

    @staticmethod
    def _keys(kw):
        side = "true" if kw.get("if", True) else "false"
        n = max(1, min(MAX_PAIRS, int(kw.get("count", 1))))
        return [f"{side}{k}" for k in range(1, n + 1)]

    def check_lazy_status(self, prompt=None, unique_id=None, **kw):
        return [k for k in self._keys(kw) if kw.get(k) is None and _cabled(prompt, unique_id, k)]

    def pick(self, prompt=None, unique_id=None, **kw):
        keys = self._keys(kw)
        out = [kw[k] if k in kw else ExecutionBlocker(None) for k in keys]
        return tuple(out + [ExecutionBlocker(None)] * (MAX_PAIRS - len(out)))


class Index:
    """Same idea with a number: the input whose index is chosen (0..19) goes out. The script (web/wxIndex.js) shows the
    inputs in use plus one empty, like the outputs of WRoute Index."""
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "index": ("INT", {"default": 0, "min": 0, "max": MAX_OUTS - 1,
                                  "tooltip": "Which input goes out, counted from 0 (the index of WSwitch fits). "
                                             "The others do not run."}),
            },
            "optional": {f"value{i}": (ANY, {"lazy": True, "tooltip": f"Anything. It goes out when index is {i}."})
                         for i in range(MAX_OUTS)},
            "hidden": HIDDEN,
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("value",)
    OUTPUT_TOOLTIPS = ("The input chosen by `index`. With no cable on it, nothing downstream runs.",)
    FUNCTION = "pick"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("Picks one of up to twenty inputs by index, counted from 0; only the chosen branch runs (the inputs "
                   "are lazy). The inputs show as you use them. The mirror of WRoute Index.")

    def check_lazy_status(self, index=0, prompt=None, unique_id=None, **kw):
        key = f"value{max(0, min(MAX_OUTS - 1, int(index)))}"
        return [key] if kw.get(key) is None and _cabled(prompt, unique_id, key) else []

    def pick(self, index=0, prompt=None, unique_id=None, **kw):
        key = f"value{max(0, min(MAX_OUTS - 1, int(index)))}"
        return (kw[key] if key in kw else ExecutionBlocker(None),)