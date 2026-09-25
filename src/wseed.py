"""WInt🌱 (wxSeed; born WSeed, renamed before 0.6.0 went out) — an integer that walks, a seed first of all: WFloat on an integer, step 1 by default, `randomize` too (Sick, 24/09). After every queued
run `value` moves by `step` in the direction of `control`. With a `carry` cable in or out (wxCarry.py, the odometer) the
seed is a wheel from the value you set to `until`, and comes round; without a cable `until` does nothing. The walk lives
in the frontend (web/wxFloat.js): the backend only hands the number over."""
from .wxCarry import CARRY, CARRY_IN, CARRY_OUT_TOOLTIP

MAX_SEED = 0xffffffffffffffff


class WSeed:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": ("INT", {"default": 0, "min": 0, "max": MAX_SEED,
                                  "tooltip": "The integer that goes out (a seed, a count). With control on increment / decrement / randomize it moves after every queued run; with a carry cable it is a wheel from this value to until."}),
                "control": (["fixed", "increment", "decrement", "randomize"], {"default": "fixed", "tooltip": "The walk: after every queued run value moves by step in the direction of control (randomize: any seed). Driven by a carry cable it moves on the beat instead. Lives in the node: through the API set value directly."}),
                "step": ("INT", {"default": 1, "min": 1, "max": 1 << 32,
                                 "tooltip": "How much value changes at every queued run, or at every beat of the carry (lives in the node)."}),
            },
            "optional": {
                "until": ("INT", {"default": 0, "min": 0, "max": MAX_SEED,
                                  "tooltip": "The arrival of the wheel, only with a carry cable in or out: from the value you set to until, by step, then round to the start. The same as the start = no arrival. Without a cable it does nothing and the walk is free."}),
                "start": ("STRING", {"default": "", "tooltip": "Where the wheel starts: the value as you set it by hand (filled by the node)."}),
                "carry": CARRY_IN,
            },
        }

    RETURN_TYPES = ("INT", CARRY)
    RETURN_NAMES = ("INT", "carry")
    OUTPUT_TOOLTIPS = ("The integer: a seed, a count, a frame number.", CARRY_OUT_TOOLTIP + " (With until set, the seed comes round at the end and beats.)")
    FUNCTION = "give"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("An integer — a seed first of all — with a seed-style control that also takes the carry cable: fixed, or increment / decrement / "
                   "randomize by step at every queued run; with a carry cable a wheel from the value you set to until, "
                   "that comes round and beats the next node. The seed of every image in a grid, without a node per seed.")

    def give(self, value, control="fixed", step=1, until=0, start="", **_):   # control / step / until / start / carry live in the node
        return (int(value), str(value))
