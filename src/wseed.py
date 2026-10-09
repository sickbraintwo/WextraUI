"""WInt🌱 (wxSeed; born WSeed, renamed before 0.6.0 went out) — an integer that walks, a seed first of all: WFloat on an integer, step 1 by default, `randomize` too (Sick, 24/09). After every queued
run `value` moves by `step` in the direction of `control`. With a `carry` cable in or out (wxCarry.py, the odometer), or
with `control` on `increment-wrap` (Sick, 07/10), the seed is a wheel from the value you set to `until`, and comes round;
otherwise `until` does nothing. With numbers in `selection` (Sick, 08/10: seeds that are not one after the other, in the
order given) the walk is a wheel over them instead, and `step` / `until` do nothing. The walk lives in the frontend
(web/wxFloat.js): the backend only hands the number over."""
from .wxCarry import CARRY, CARRY_IN, CARRY_OUT_TOOLTIP

MAX_SEED = 0xffffffffffffffff


class WSeed:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": ("INT", {"default": 0, "min": 0, "max": MAX_SEED,
                                  "tooltip": "The integer that goes out (a seed, a count). With control on increment / decrement / randomize it moves after every queued run; with a carry cable it is a wheel from this value to until."}),
                "control": (["fixed", "increment", "decrement", "randomize", "increment-wrap"], {"default": "fixed", "tooltip": "The walk: after every queued run value moves by step in the direction of control (randomize: any seed; increment-wrap: forward to until, then round to the start, cable or no cable). Driven by a carry cable it moves on the beat instead. Lives in the node: through the API set value directly."}),
                "step": ("INT", {"default": 1, "min": 1, "max": 1 << 32,
                                 "tooltip": "How much value changes at every queued run, or at every beat of the carry (lives in the node)."}),
            },
            "optional": {
                "until": ("INT", {"default": 0, "min": 0, "max": MAX_SEED,
                                  "tooltip": "The arrival of the wheel, with a carry cable in or out or with control on increment-wrap: from the value you set to until, by step, then round to the start. The same as the start = no arrival. Otherwise it does nothing and the walk is free."}),
                "start": ("STRING", {"default": "", "tooltip": "Where the wheel starts: the value as you set it by hand (filled by the node)."}),
                # after the boxes of before (a workflow saved without it, read by position, still lines up); the frontend puts its row under `value`
                "selection": ("STRING", {"default": "", "tooltip": "Numbers of your own, in your order (JSON list, filled by the drop-down under value): with any in it the walk goes through them instead of by step, and step / until do nothing. Empty = the walk by step. Lives in the node: the backend ignores it."}),
                "carry": CARRY_IN,
            },
        }

    RETURN_TYPES = ("INT", CARRY)
    RETURN_NAMES = ("INT", "carry")
    OUTPUT_TOOLTIPS = ("The integer: a seed, a count, a frame number.", CARRY_OUT_TOOLTIP + " (With until set, the seed comes round at the end and beats.)")
    FUNCTION = "give"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("An integer — a seed first of all — with a seed-style control that also takes the carry cable: fixed, or increment / decrement / "
                   "randomize by step at every queued run; on increment-wrap, or with a carry cable, a wheel from the value you set to until, "
                   "that comes round and beats the next node; with numbers of your own in the selection under value, a wheel over those. "
                   "The seed of every image in a grid, without a node per seed.")

    def give(self, value, control="fixed", step=1, until=0, start="", **_):   # control / step / until / start / selection / carry live in the node
        return (int(value), str(value))
