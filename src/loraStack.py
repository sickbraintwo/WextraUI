"""WLoRA Stack — up to twenty LoRAs loaded together in one run, as twenty LoRA loaders in a row, their trigger words in front of the prompt.

The schema is fixed (every block declared, `loras` says how many show and load): a saved workflow keeps its values in
place whatever the count. One `folder` and one `selection` on top narrow the LoRA menu of every block; they live in the
interface (web/wxLoraStack.js) and are accepted and ignored here, as in WLoRA; so is `step`, the move of the arrows
on every strength, and `control_i`, the walk of the two strengths of block i after every queued run (afterQueued,
like the seed), and `solo`, under every block, which after every queued run leaves only the next block on (one LoRA
at a time), with `carry` in and out and the chips ⟲ / ▶ n of the nodes that walk (web/wxCarry.js). Each block has its own on/off (`on_i`,
switched from the pill on its head row), its order is changed by dragging the head row, and it folds to its rows
without rgthree info and the tags, or to one line: none of that changes what is loaded but the on/off and the order of the values.
A block on `None`, what a new one reads, is empty: nothing loaded, no words, no name.
Words, cleaning and the merge with the prompt come from loraLoader.py."""
import nodes
import folder_paths
from .loraLoader import lora_folders, picked_words, merge_prompt, read_separator
from .wxFolders import ALL_FOLDERS, SELECTION, clean_name
from .wxCarry import CARRY, CARRY_IN, CARRY_OUT_TOOLTIP

MAX_LORAS = 20
NO_LORA = "None"   # the empty block: first in every menu, what a new block reads (web/wxFolder.js, WX_NONE)


def _block(i, loras):
    """The boxes of block i, in the order they are drawn."""
    return {
        f"on_{i}": ("BOOLEAN", {"default": True, "label_on": "on", "label_off": "off",
                                "tooltip": f"Block {i}: off = its LoRA is not loaded and its words stay out of the prompt. The pill on the head row of the block."}),
        f"lora_{i}": (loras, {"default": NO_LORA, "tooltip": f"Block {i}: the LoRA to load; None = an empty block. Its menu is narrowed by the folder and the selection on top of the node."}),
        f"strength_model_{i}": ("FLOAT", {"default": 1.0, "min": -100.0, "max": 100.0, "step": 0.01,
                                          "tooltip": f"Block {i}: how strongly the LoRA changes the model (UNet). 0 on both strengths = not applied."}),
        f"strength_clip_{i}": ("FLOAT", {"default": 1.0, "min": -100.0, "max": 100.0, "step": 0.01,
                                         "tooltip": f"Block {i}: how strongly the LoRA changes the CLIP (text encoder)."}),
        f"control_{i}": (["fixed", "increment", "decrement"], {"default": "fixed",
                         "tooltip": f"Block {i}: the walk of its two strengths: after every queued run both move by the step on top of the node, up or down. A strength on a cable is left alone. Lives in the node: through the API set the strengths directly."}),
        f"rgthree_info_{i}": ("BOOLEAN", {"default": True, "label_on": "rgthree info", "label_off": "header only",
                                          "tooltip": f"Block {i}: the official trigger words, from the .rgthree-info.json next to the LoRA. Off (and greyed out) when that file is not there: the chips come from the training tags of the header."}),
        f"picked_{i}": ("STRING", {"default": "", "multiline": True, "tooltip": f"Block {i}: the words chosen in its chip picker (JSON list, filled by the widget)."}),
    }


class LoraStack:
    @classmethod
    def INPUT_TYPES(cls):
        loras = [NO_LORA] + folder_paths.get_filename_list("loras")
        optional = {
            "folder": (lora_folders(), {"default": ALL_FOLDERS, "tooltip": "Narrows the LoRA menu of every block to one folder and what is under it. The LoRAs already chosen stay. Lives in the node: the backend ignores it."}),
            "selection": SELECTION,
            "step": ("FLOAT", {"default": 0.5, "min": 0.01, "max": 1.0, "step": 0.01, "round": 0.01,
                               "tooltip": "How much the arrows (and a drag) move every strength of the node, and how much the control of a block moves its two strengths at every queued run. Lives in the node: the backend ignores it."}),
            "separator": ("STRING", {"default": ", ", "multiline": False,
                                     "tooltip": "Between the words, between the blocks, and between the words and your prompt, as written. \\n in the box = a new line."}),
        }
        for i in range(1, MAX_LORAS + 1):
            optional.update(_block(i, loras))
        optional.update({
            "solo": (["fixed", "increment", "decrement", "randomize", "increment-wrap"], {"default": "fixed",
                     "tooltip": "One LoRA at a time: after every queued run only the next block is on (the one after, the one before, one at random, or round again from the first), among the blocks in use with a LoRA. Switched off fixed, the first block on stays alone. Lives in the node: through the API set on_i directly."}),
            "model": ("MODEL", {"tooltip": "Optional: without it the node only builds the prompt."}),
            "clip": ("CLIP", {"tooltip": "Optional (models without CLIP, or model-only LoRAs)."}),
            "prompt": ("STRING", {"forceInput": True, "tooltip": "Your prompt; comes out after the words of every block that is on."}),
            "carry": CARRY_IN,
        })
        return {
            "required": {
                "loras": ("INT", {"default": 1, "min": 1, "max": MAX_LORAS,
                                  "tooltip": f"How many blocks the node shows and loads, from the top (1 to {MAX_LORAS}). The blocks below keep their values for when you come back."}),
            },
            "optional": optional,
        }

    RETURN_TYPES = ("MODEL", "CLIP", "STRING", "STRING", CARRY)
    RETURN_NAMES = ("MODEL", "CLIP", "prompt", "name", "carry")
    OUTPUT_TOOLTIPS = ("Model with the LoRA of every block that is on applied, from the top (same code as the core Lora Loader).",
                       "CLIP with the LoRA of every block that is on applied.",
                       "The picked words of every block that is on, in the order of the blocks, then your prompt.",
                       "The clean names of the blocks that are on, joined by ` + `: for the file name.", CARRY_OUT_TOOLTIP)
    FUNCTION = "load"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("Up to twenty LoRAs loaded together in one run, as twenty LoRA loaders in a row. One folder and one selection on "
                   "top narrow the menu of every block; each block has its name, two strengths, rgthree info and the chip "
                   "picker of WLoRA, an on/off pill and a handle to change its place. The words of the blocks that are on go "
                   "in front of the prompt, in the order of the blocks. Each block folds to its rows without rgthree info and the tags, or to one line. "
                   "`solo`, under every block, walks one LoRA at a time, run after run.")

    @classmethod
    def VALIDATE_INPUTS(cls, loras=None, **kw):   # loras None = on a cable: every block is checked
        # the folder out of the menu check (a folder that is gone must not stop a run); the names checked only for the
        # blocks in use and on: a hidden or switched-off block whose LoRA left the disk must not stop it either
        n = max(0, min(MAX_LORAS, loras if isinstance(loras, int) else MAX_LORAS))
        known = set(folder_paths.get_filename_list("loras"))
        for i in range(1, n + 1):
            name = kw.get(f"lora_{i}")
            if kw.get(f"on_{i}", True) is False:
                continue
            if name and name != NO_LORA and name not in known:
                return f"block {i}: LoRA not found: {name}"
        return True

    def load(self, loras=1, separator=", ", model=None, clip=None, prompt=None, **kw):
        # **kw = the boxes of the blocks; what lives in the node (folder, selection, step, control_i, solo, carry) is accepted and ignored
        n = max(1, min(MAX_LORAS, int(loras or 1)))
        known = set(folder_paths.get_filename_list("loras"))
        words, names = [], []
        for i in range(1, n + 1):
            lora = kw.get(f"lora_{i}")
            if kw.get(f"on_{i}", True) is False or not lora or lora not in known:
                continue
            names.append(clean_name(lora))
            words += picked_words(kw.get(f"picked_{i}", ""))
            sm, sc = kw.get(f"strength_model_{i}", 1.0), kw.get(f"strength_clip_{i}", 1.0)
            if model is not None and (sm != 0 or sc != 0):
                model, clip = nodes.LoraLoader().load_lora(model, clip, lora, sm, sc)
        merged = merge_prompt(words, read_separator(separator), "prefix", prompt)
        name = " + ".join(names)
        return (model, clip, merged, name, name)
