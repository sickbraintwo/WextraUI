"""WSwitch — the switch with slots: N cables per slot, one switch per slot, only one slot on.

A slot is a group of `inputs_per_slot` cables (model + clip + vae with 3); the slot that is on goes out, position by
position (out_1 = the first cable of the slot, out_2 the second...). The cables of the other slots are lazy inputs:
ComfyUI does not run the branches behind them at all (no VRAM, no seconds), like the core Switch does.

The schema declares every possible cable (MAX_SLOTS x MAX_PER, optional, any type) and one boolean per slot; the
script (web/wxSwitch.js) shows only the slots in use plus one empty, learns the type of each position from the first
cable and draws the on/off pill next to each slot. widgets_values stays fixed: inputs_per_slot, on_1 .. on_20, control.

`control` and the `carry` cable (wxCarry.py): with control on increment / decrement / randomize the slot that is on moves
after every queued run, over the slots in use; on a carry cable it moves on the beat, and coming round from the last
slot to the first it beats the next node. All in the interface: here control and carry are accepted and ignored.

The first output, `index`, is the index of the slot that is on, counted like an array (0 = the first slot): for the nodes that must follow
the same choice (a text index, a route, another switch)."""
from .route import ANY
from .wxCarry import CARRY, CARRY_IN, CARRY_OUT_TOOLTIP

MAX_SLOTS = 20
MAX_PER = 4


def _in(i, k):
    return f"in{i}_{k}"


class WSwitch:
    @classmethod
    def INPUT_TYPES(cls):
        optional = {}
        for i in range(1, MAX_SLOTS + 1):
            optional[f"on_{i}"] = ("BOOLEAN", {"default": i == 1, "label_on": "on", "label_off": "off",
                                               "tooltip": f"Slot {i} on: its cables go out. Only one slot is on at a time."})
        for i in range(1, MAX_SLOTS + 1):
            for k in range(1, MAX_PER + 1):
                optional[_in(i, k)] = (ANY, {"lazy": True, "tooltip": f"Slot {i}, cable {k}. Runs only when slot {i} is on."})
        optional["control"] = (["fixed", "increment", "decrement", "randomize"], {"default": "fixed",
                               "tooltip": "The walk of the slot that is on, over the slots in use: fixed, or after every queued run "
                                          "the next one (increment), the one before (decrement), any (randomize), coming round at "
                                          "the ends. Driven by a carry cable it moves on the beat instead. Lives in the node."})
        optional["carry"] = CARRY_IN
        return {
            "required": {
                "inputs_per_slot": ("INT", {"default": 1, "min": 1, "max": MAX_PER,
                                            "tooltip": "How many cables each slot has (3 = model, clip, vae). "
                                                       "As many outputs. Changing it reshapes the slots: set it first."}),
            },
            "optional": optional,
        }

    RETURN_TYPES = ("INT",) + tuple(ANY for _ in range(MAX_PER)) + (CARRY,)
    RETURN_NAMES = ("index",) + tuple(f"out_{k}" for k in range(1, MAX_PER + 1)) + ("carry",)
    OUTPUT_TOOLTIPS = ("The index of the slot that is on, counted like an array: 0 = the first slot.",) + tuple(
        f"Cable {k} of the slot that is on." for k in range(1, MAX_PER + 1)) + (CARRY_OUT_TOOLTIP,)
    FUNCTION = "pick"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("A switch with slots: each slot holds inputs_per_slot cables of any type, one on/off per slot, only "
                   "one on. The slot that is on goes out position by position; the branches behind the other slots "
                   "do not run. The type of every position is learned from the first cable you connect. "
                   "`index` gives the slot that is on, counted from 0. With control on increment / decrement / randomize, "
                   "or on a carry cable, the slot that is on walks over the slots in use after every queued run.")

    @staticmethod
    def _active(kw):
        for i in range(1, MAX_SLOTS + 1):
            if kw.get(f"on_{i}"):
                return i
        return 1

    def check_lazy_status(self, inputs_per_slot=1, **kw):
        a = self._active(kw)
        need = [_in(a, k) for k in range(1, int(inputs_per_slot) + 1)]
        # a cable connected but not yet evaluated arrives as None; an empty socket is not in kw at all
        return [n for n in need if n in kw and kw[n] is None]

    def pick(self, inputs_per_slot=1, **kw):   # control and carry live in the node: accepted, ignored
        a = self._active(kw)
        return (a - 1,) + tuple(kw.get(_in(a, k)) for k in range(1, MAX_PER + 1)) + (str(a - 1),)
