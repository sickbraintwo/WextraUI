"""WSampler / WScheduler — the sampler_name and scheduler menus as nodes of their own, with the seed-style control after
generate. Cable the output into the KSampler's `sampler_name` (or `scheduler`) turned into an input; queue several runs
with `increment` and each one takes the next of the selection. The name also comes out as a string, for WSave Image.
`carry` in and out: the odometer cable (wxCarry.py) — every scheduler for every sampler, in one queue."""
import comfy.samplers
from .wxCarry import CARRY, CARRY_IN, CARRY_OUT_TOOLTIP

SELECTION = ("STRING", {"default": "", "tooltip": "The names ticked in the selection drop-down, in the order you gave them (JSON list, filled by the widget). Empty = all. Lives in the node: the backend ignores it."})


class Sampler:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            # Both in `optional`, `selection` first, so that the drop-down sits above the name (widgets are drawn in
            # declared order) and an API prompt written without `selection` is still valid as it is.
            "optional": {
                "selection": SELECTION,
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS, {"control_after_generate": "fixed", "tooltip": "The sampler. The control under it walks the list across queued runs (increment / decrement / randomize); the selection drop-down above narrows the menu and the walk to the names you tick, in the order you give them."}),
                "carry": CARRY_IN,
            },
        }

    RETURN_TYPES = (comfy.samplers.KSampler.SAMPLERS, "STRING", CARRY)
    RETURN_NAMES = ("sampler_name", "name", "carry")
    OUTPUT_TOOLTIPS = ("Into the KSampler's sampler_name (turned into an input).", "The same name as text: a part for WSave Image.", CARRY_OUT_TOOLTIP)
    FUNCTION = "pick"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("The sampler menu as a node, with the seed-style control after generate: cable it into the KSampler's sampler_name, "
                   "queue several runs with increment and each one takes the next sampler of the selection (the names you tick in the drop-down above, in their order). "
                   "The name also comes out as a string for the file name.")

    def pick(self, sampler_name=None, **_):   # **_ = selection and carry, which live in the node: accepted, ignored
        if not sampler_name:
            raise ValueError("WSampler: no sampler named (sampler_name is empty)")
        return (sampler_name, sampler_name, sampler_name)


class Scheduler:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "selection": SELECTION,
                "scheduler": (comfy.samplers.KSampler.SCHEDULERS, {"control_after_generate": "fixed", "tooltip": "The scheduler. The control under it walks the list across queued runs (increment / decrement / randomize); the selection drop-down above narrows the menu and the walk to the names you tick, in the order you give them."}),
                "carry": CARRY_IN,
            },
        }

    RETURN_TYPES = (comfy.samplers.KSampler.SCHEDULERS, "STRING", CARRY)
    RETURN_NAMES = ("scheduler", "name", "carry")
    OUTPUT_TOOLTIPS = ("Into the KSampler's scheduler (turned into an input).", "The same name as text: a part for WSave Image.", CARRY_OUT_TOOLTIP)
    FUNCTION = "pick"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("The scheduler menu as a node, with the seed-style control after generate: cable it into the KSampler's scheduler, "
                   "queue several runs with increment and each one takes the next scheduler of the selection (the names you tick in the drop-down above, in their order). "
                   "The name also comes out as a string for the file name.")

    def pick(self, scheduler=None, **_):   # **_ = selection and carry, which live in the node: accepted, ignored
        if not scheduler:
            raise ValueError("WScheduler: no scheduler named (scheduler is empty)")
        return (scheduler, scheduler, scheduler)
