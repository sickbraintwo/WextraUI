"""LoRA Loader + Trigger — load the LoRA and put its trigger words into the prompt, in one node, in line.
Replaces Lora Loader + Extract Lora Name + Extract Tag + text concat. The prompt cable goes in on one side and comes
out on the other with the words you clicked already in it."""
import json

import nodes
from .loraInfo import read_header, tag_frequency, rg3_info
import folder_paths
from .wxFolders import ALL_FOLDERS, folders_of, clean_name
from .wxCarry import CARRY, CARRY_IN, CARRY_OUT_TOOLTIP


def lora_folders():
    """The folders of the LoRA list at every depth, as the `folder` menu shows them (shared with WCheckpoint: wxFolders.py)."""
    return folders_of("loras")


class LoraLoaderTrigger:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            # `folder` sits above the name and only narrows what the name menu shows and what the walk goes through
            # (frontend only: lora_name stays a full path, checked against the whole list). Both live in `optional`,
            # in this order, so that an API prompt written before `folder` existed is still valid as it is.
            "optional": {
                "folder": (lora_folders(), {"default": ALL_FOLDERS, "tooltip": "Narrows the LoRA menu, and the walk of increment / decrement / randomize, to one folder and what is under it. The label shows where you are in that folder (3/12): the runs to queue. Lives in the node: the backend ignores it."}),
                "lora_name": (folder_paths.get_filename_list("loras"), {"tooltip": "The LoRA to load.", "control_after_generate": "fixed"}),   # fixed / increment / decrement / randomize, like the seed (Sick, 14/09)
                # Everything below the name is `optional`, in the order the boxes are drawn: the saved widgets_values line
                # up with object_info, so whoever reads the workflow by position (comfy-cli, MCP) pairs the right values.
                # The walk of the LoRA list is done by the frontend between one queued run and the next; a strength that
                # walks comes from a WFloat cabled on strength_model (and strength_clip, if you want it to walk too).
                "strength_model": ("FLOAT", {"default": 1.0, "min": -100.0, "max": 100.0, "step": 0.01,
                                             "tooltip": "How strongly the LoRA changes the model (UNet). "
                                                        "0 = not applied, like the core loader; "
                                                        "negative values are legitimate."}),
                "strength_clip": ("FLOAT", {"default": 1.0, "min": -100.0, "max": 100.0, "step": 0.01,
                                            "tooltip": "How strongly the LoRA changes the CLIP (text encoder). "
                                                       "0 = not applied, like the core loader; "
                                                       "negative values are legitimate."}),
                "rgthree_info": ("BOOLEAN", {"default": True, "label_on": "rgthree info", "label_off": "header only",
                                        "tooltip": "The official trigger words, read from the .rgthree-info.json that rgthree-comfy saves next to the LoRA. Off (and greyed out) when that file is not there: the chips then come from the training tags of the header."}),
                "where": (["prefix", "suffix"], {"default": "prefix",
                                                 "tooltip": "prefix = trigger words, then your prompt; suffix = your prompt, then the words."}),
                "separator": ("STRING", {"default": ", ", "multiline": True, "tooltip": "Between the words, and between the words and your prompt. Multi-line: a newline is a valid separator."}),
                "picked": ("STRING", {"default": "", "multiline": True, "tooltip": "Words chosen in the chip picker (JSON list, filled by the widget)."}),
                "model": ("MODEL", {"tooltip": "Optional: without it the node only builds the prompt."}),
                "clip": ("CLIP", {"tooltip": "Optional (models without CLIP, or model-only LoRAs)."}),
                "prompt": ("STRING", {"forceInput": True, "tooltip": "Your prompt; comes out with the trigger words merged in."}),
                "carry": CARRY_IN,
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "STRING", "STRING", CARRY)
    RETURN_NAMES = ("MODEL", "CLIP", "prompt", "name", "carry")
    OUTPUT_TOOLTIPS = ("Model with the LoRA applied (same code as the core Lora Loader).", "CLIP with the LoRA applied.",
                       "Your prompt with the picked words merged in (prefix or suffix).", "Clean LoRA name.", CARRY_OUT_TOOLTIP)
    FUNCTION = "load"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("Loads a LoRA and merges its trigger words into the prompt in the same node: the official words (rgthree info file) or "
                   "training tags, chosen by clicking chips in the node. One node instead of loader + name + tags + concat. "
                   "The seed-style control walks the LoRA list (all of it, or one folder) across queued runs; for a strength that walks, cable a WFloat.")

    @classmethod
    def VALIDATE_INPUTS(cls, folder=ALL_FOLDERS):   # naming `folder` here takes it out of the menu check: a folder that is gone must not stop a run
        return True

    def load(self, lora_name=None, strength_model=1.0, strength_clip=1.0, where="prefix",
             separator=", ", picked="", model=None, clip=None, prompt=None, **_):
        # **_ = what lives in the node (folder, rgthree_info, carry) and what an older API prompt may still send
        # (lora_scope, strength_control, strength_step, strength_until, civitai): accepted, ignored
        if not lora_name:   # no LoRA named (a hand-written API prompt): everything goes through untouched
            return (model, clip, prompt or "", "", "")
        name = clean_name(lora_name)
        words = []
        if (picked or "").strip():
            try:
                words = [str(w) for w in json.loads(picked) if str(w).strip()]
            except Exception:
                words = [w.strip() for w in picked.splitlines() if w.strip()]
        trig = separator.join(words)
        user = (prompt or "").strip()
        if trig and user:
            merged = trig + separator + user if where == "prefix" else user + separator + trig
        else:
            merged = trig or user
        if model is not None and (strength_model != 0 or strength_clip != 0):
            model, clip = nodes.LoraLoader().load_lora(model, clip, lora_name, strength_model, strength_clip)
        return (model, clip, merged, name, name)


# ---- HTTP route for the chip picker: GET /wextraui/lora_tags?name=<lora_name> --------------------------------------
try:
    from server import PromptServer
    from aiohttp import web

    @PromptServer.instance.routes.get("/wextraui/lora_tags")
    async def _wx_lora_tags(request):
        name = request.query.get("name", "")
        # only a LoRA ComfyUI itself lists: the name is looked up, never used as a path
        known = name in folder_paths.get_filename_list("loras")
        path = folder_paths.get_full_path("loras", name) if known else None
        if not path:
            return web.json_response({"error": "not found", "rgthree_info": [], "has_rg3": False, "base": "", "tags": []}, status=404)
        md, _ = read_header(path)
        rg3 = rg3_info(path)
        base = [md.get("ss_base_model_version") or md.get("modelspec.architecture") or "", (rg3 or {}).get("base") or ""]
        return web.json_response({
            "name": name.replace("\\", "/").rsplit("/", 1)[-1].rsplit(".", 1)[0],
            "rgthree_info": (rg3 or {}).get("words") or [],
            "has_rg3": rg3 is not None,
            "base": " · ".join(b for b in base if b),   # what the header says, then what the rgthree file says
            "tags": [[t, c] for t, c in tag_frequency(md, None, False)],
        })
except Exception:
    pass
