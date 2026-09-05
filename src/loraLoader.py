"""LoRA Loader + Trigger — load the LoRA and put its trigger words into the prompt, in one node, in line.
Replaces Lora Loader + Extract Lora Name + Extract Tag + text concat. The prompt cable goes in on one side and comes
out on the other with the words you clicked already in it."""
import json

import nodes
from .loraInfo import read_header, tag_frequency, civitai_lookup
import folder_paths

class LoraLoaderTrigger:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "lora_name": (folder_paths.get_filename_list("loras"), {"tooltip": "The LoRA to load."}),
                "strength_model": ("FLOAT", {"default": 1.0, "min": -100.0, "max": 100.0, "step": 0.01}),
                "strength_clip": ("FLOAT", {"default": 1.0, "min": -100.0, "max": 100.0, "step": 0.01}),
                "civitai": ("BOOLEAN", {"default": True, "label_on": "look up", "label_off": "file only",
                                        "tooltip": "Ask Civitai (SHA-256 of the file, cached) for the official trigger words."}),
                "where": (["prefix", "suffix"], {"default": "prefix",
                                                 "tooltip": "prefix = trigger words, then your prompt; suffix = your prompt, then the words."}),
                "separator": ("STRING", {"default": ", ", "multiline": True, "tooltip": "Between the words, and between the words and your prompt. Multi-line: a newline is a valid separator."}),
            },
            "optional": {
                "picked": ("STRING", {"default": "", "multiline": True, "tooltip": "Words chosen in the chip picker (JSON list, filled by the widget)."}),
                "model": ("MODEL", {"tooltip": "Optional: without it the node only builds the prompt."}),
                "clip": ("CLIP", {"tooltip": "Optional (models without CLIP, or model-only LoRAs)."}),
                "prompt": ("STRING", {"forceInput": True, "tooltip": "Your prompt; comes out with the trigger words merged in."}),
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "STRING", "STRING", "LIST", "LIST", "STRING", "STRING")
    RETURN_NAMES = ("MODEL", "CLIP", "prompt", "trigger_words", "civitai_list", "tags_list", "name", "info")
    OUTPUT_TOOLTIPS = ("Model with the LoRA applied (same code as the core Lora Loader).", "CLIP with the LoRA applied.",
                       "Your prompt with the picked words merged in (prefix or suffix).",
                       "ALL the trigger words of the LoRA (Civitai's, else the 5 most frequent training tags), whatever you picked.",
                       "LIST: official trigger words from Civitai.", "LIST: all training tags, most frequent first.",
                       "Clean LoRA name.", "Readable summary of the LoRA.")
    FUNCTION = "load"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("Loads a LoRA and merges its trigger words into the prompt in the same node: Civitai words or "
                   "training tags, chosen by clicking chips in the node. One node instead of loader + name + tags + concat.")

    def load(self, lora_name, strength_model=1.0, strength_clip=1.0, civitai=True, where="prefix",
             separator=", ", picked="", model=None, clip=None, prompt=None):
        path = folder_paths.get_full_path("loras", lora_name)
        name = lora_name.replace("\\", "/").rsplit("/", 1)[-1].rsplit(".", 1)[0]
        md, _ = read_header(path)
        top = [t for t, _ in tag_frequency(md, 40, True)]
        all_tags = [t for t, _ in tag_frequency(md, None, False)]
        civ = civitai_lookup(path) if civitai else {}
        civ_words = list(civ.get("trainedWords") or [])
        words = []
        if (picked or "").strip():
            try:
                words = [str(w) for w in json.loads(picked) if str(w).strip()]
            except Exception:
                words = [w.strip() for w in picked.splitlines() if w.strip()]
        trig = separator.join(words)
        all_words = separator.join(civ_words if civ_words else top[:5])
        user = (prompt or "").strip()
        if trig and user:
            merged = trig + separator + user if where == "prefix" else user + separator + trig
        else:
            merged = trig or user
        info = [name, f"base: {md.get('ss_base_model_version') or md.get('modelspec.architecture') or civ.get('baseModel') or '?'}"]
        if civ: info.append(f"civitai: {civ.get('model')} · {civ.get('name')} · trigger: {', '.join(civ_words) or '(none declared)'}")
        info.append(f"training tags: {len(all_tags)}" + (f" · top: {', '.join(top[:5])}" if top else ""))
        info.append(f"picked: {trig or '(nothing — click the chips)'}")
        if model is not None and (strength_model != 0 or strength_clip != 0):
            model, clip = nodes.LoraLoader().load_lora(model, clip, lora_name, strength_model, strength_clip)
        return (model, clip, merged, all_words, civ_words, all_tags, name, "\n".join(info))


# ---- HTTP route for the chip picker: GET /wextraui/lora_tags?name=<lora_name>&civitai=1 ----------------------------
try:
    from server import PromptServer
    from aiohttp import web

    @PromptServer.instance.routes.get("/wextraui/lora_tags")
    async def _wx_lora_tags(request):
        name = request.query.get("name", "")
        want_civ = request.query.get("civitai", "1") not in ("0", "false", "")
        path = folder_paths.get_full_path("loras", name) if name else None
        if not path:
            return web.json_response({"error": "not found", "civitai": [], "tags": []}, status=404)
        md, _ = read_header(path)
        civ = civitai_lookup(path) if want_civ else {}
        return web.json_response({
            "name": name.replace("\\", "/").rsplit("/", 1)[-1].rsplit(".", 1)[0],
            "civitai": list(civ.get("trainedWords") or []),
            "civitai_model": civ.get("model"),
            "tags": [[t, c] for t, c in tag_frequency(md, None, False)],
        })
except Exception:
    pass
