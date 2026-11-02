"""WFloat — a float that walks: the strength walk of WLoRA as a node of its own (Sick, 17/09).
After every queued run `value` moves by `step` in the direction of `control`, with no arrival and no floor: negative
values are legitimate. The walk lives in the frontend (web/wxFloat.js, afterQueued like the seed): the backend only
hands the number over. `carry` in and out: the odometer cable (wxCarry.py) — with a cable the value is a wheel from the value
you set to `until`, by `step`, that comes round and beats; driven, it moves on the beat of another node, not at every run.
On `increment-wrap` (Sick, 30/10, as WInt🌱) the same wheel with no cable: forward to `until`, then round to the start.
Otherwise `until` does nothing: the walk is free (Sick, 24/09). With numbers in `selection` (Sick, 25/10: the same
row WInt has under `value`) the walk is a wheel over them instead, in the order given, and `step` / `until` do nothing."""
from .wxCarry import CARRY, CARRY_IN, CARRY_OUT_TOOLTIP


class WFloat:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": ("FLOAT", {"default": 1.0, "min": -100.0, "max": 100.0, "step": 0.01, "round": 0.01,
                                    "tooltip": "The number that goes out. With control on increment / decrement it moves after every queued run."}),
                "control": (["fixed", "increment", "decrement", "increment-wrap"], {"default": "fixed", "tooltip": "The walk: after every queued run value moves by step, in the direction of control, with no arrival and no floor; increment-wrap: forward to until, then round to the start, cable or no cable. Lives in the node: through the API set value directly."}),
                "step": ("FLOAT", {"default": 0.1, "min": 0.01, "max": 1000.0, "step": 0.1, "round": 0.01,
                                   "tooltip": "How much value changes at every queued run (lives in the node)."}),
            },
            "optional": {
                "until": ("FLOAT", {"default": 1.0, "min": -100.0, "max": 100.0, "step": 0.01, "round": 0.01,
                                    "tooltip": "The arrival of the wheel, with a carry cable in or out or with control on increment-wrap: from the value you set to until, by step, then round to the start. The same as the start = no arrival. Otherwise it does nothing and the walk is free."}),
                "start": ("STRING", {"default": "", "tooltip": "Where the wheel starts: the value as you set it by hand (filled by the node)."}),
                # after the boxes of before (a workflow saved without it, read by position, still lines up); the frontend puts its row under `value`
                "selection": ("STRING", {"default": "", "tooltip": "Numbers of your own, in your order (JSON list, filled by the drop-down under value): with any in it the walk goes through them instead of by step, and step / until do nothing; on fixed the value is the first of them. Empty = the walk by step. Lives in the node: the backend ignores it."}),
                "carry": CARRY_IN,
            },
        }

    RETURN_TYPES = ("FLOAT", CARRY)
    RETURN_NAMES = ("float", "carry")
    OUTPUT_TOOLTIPS = ("The number.", CARRY_OUT_TOOLTIP + " (With until set, the value comes round at the end and beats.)")
    FUNCTION = "give"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("A float with a seed-style control that also takes the carry cable: fixed, or increment / decrement by step at every queued run, "
                   "no arrival, no floor (negative values are legitimate); on increment-wrap, or with a carry cable, a wheel from the value you set to until, "
                   "that comes round and beats the next node; with numbers of your own in the selection under value, a wheel over those. "
                   "Queue as many runs as you like and each one gets the next value.")

    def give(self, value, control="fixed", step=0.1, until=None, start="", **_):  # control / step / until / start / selection / carry live in the node (an `until` from a 0.4.x API prompt is the same name, still ignored)
        return (float(value), str(value))
