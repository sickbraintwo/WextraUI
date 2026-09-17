"""WFloat — a float that walks: the strength walk of WLoad Lora & Trigger as a node of its own (Sick, 17/09).
After every queued run `value` moves by `step` towards `until`, then stays there. The walk lives in the frontend
(web/wxFloat.js, afterQueued like the seed): the backend only hands the number over."""


class WFloat:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 100.0, "step": 0.01, "round": 0.01,
                                    "tooltip": "The number that goes out. With control on increment / decrement it moves after every queued run."}),
                "control": (["fixed", "increment", "decrement"], {"default": "fixed", "tooltip": "The walk: after every queued run value moves by step towards until, then stays there. Lives in the node: through the API set value directly."}),
                "step": ("FLOAT", {"default": 0.1, "min": 0.01, "max": 1000.0, "step": 0.1, "round": 0.01,
                                   "tooltip": "How much value changes at every queued run (lives in the node)."}),
                "until": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 100.0, "step": 0.1, "round": 0.01,
                                    "tooltip": "Where the walk stops (lives in the node)."}),
            },
        }

    RETURN_TYPES = ("FLOAT",)
    RETURN_NAMES = ("float",)
    FUNCTION = "give"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("A float with a seed-style control: fixed, or increment / decrement by step at every queued run "
                   "until it reaches until. Queue as many runs as the label says and each one gets the next value.")

    def give(self, value, control="fixed", step=0.1, until=1.0):  # control / step / until are UI knobs: accepted, ignored
        return (float(value),)
