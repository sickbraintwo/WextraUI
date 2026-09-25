"""LoRA Info node — retired 04/09/2026, replaced by Lora Loader Trigger (same helpers, words straight into the prompt).
Helpers (read_header, tag_frequency, rg3_info) live in src/loraInfo.py."""
import json
import os

import folder_paths
from ..loraInfo import read_header, tag_frequency, rg3_info


class LoraInfo:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "lora_name": (folder_paths.get_filename_list("loras"), {"tooltip": "The same list as the LoRA loader."}),
                "top_tags": ("INT", {"default": 10, "min": 1, "max": 50,
                                     "tooltip": "How many training tags to list as trigger-word candidates (most frequent first)."}),
                "rgthree_info": ("BOOLEAN", {"default": False, "label_on": "rgthree info", "label_off": "file only",
                                        "tooltip": "Also read the official trigger words from the .rgthree-info.json that "
                                                   "rgthree-comfy saves next to the LoRA. Nothing when that file is not there."}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "LIST", "LIST")
    RETURN_NAMES = ("name", "base_model", "trigger_words", "tags", "info", "metadata_json", "civitai_list", "tags_list")
    OUTPUT_TOOLTIPS = ("Clean name (file name without folder and extension).",
                       "Base model as declared by the trainer (ss_base_model_version / modelspec.architecture), or Civitai's.",
                       "Civitai trainedWords when looked up, else the most frequent training tags — comma separated.",
                       "Training tags with counts, one per line (from ss_tag_frequency).",
                       "Readable summary: base, dim/alpha, steps, images, resolution, date, comment, Civitai model.",
                       "The whole metadata header as JSON.",
                       "LIST: the official trigger words from Civitai (empty when not looked up / unknown).",
                       "LIST: ALL training tags, most frequent first (nothing dropped) — like lora-auto-trigger-words' meta_tags_list.")
    FUNCTION = "info"
    CATEGORY = "WextraX"
    DESCRIPTION = ("Reads the .safetensors header of a LoRA: name, base model, dim/alpha, steps, training tags "
                   "(= trigger-word candidates) and, optionally, the official trigger words from Civitai.")

    def info(self, lora_name, top_tags=10, rgthree_info=False):
        path = folder_paths.get_full_path("loras", lora_name)
        name = os.path.splitext(os.path.basename(lora_name.replace("\\", "/")))[0]
        if not path or not os.path.exists(path):
            return (name, "", "", "", f"{lora_name}: file not found", "{}", [], [])
        md, _ = read_header(path)
        g = lambda *ks: next((str(md[k]) for k in ks if md.get(k) not in (None, "", "None")), "")
        base = g("ss_base_model_version", "modelspec.architecture", "ss_sd_model_name")
        tags = tag_frequency(md, top_tags)
        all_tags = [t for t, _ in tag_frequency(md, None, False)]
        rg = rg3_info(path) if rgthree_info else None
        civ = {"trainedWords": rg["words"], "baseModel": rg["base"]} if rg else {}
        trig = civ.get("trainedWords") or [t for t, _ in tags]
        rows = [f"{name}", f"base: {base or '?'}"]
        for label, keys in (("trained on", ("ss_sd_model_name",)), ("dim/alpha", ("ss_network_dim",)),
                            ("steps", ("ss_steps", "ss_max_train_steps")), ("images", ("ss_num_train_images",)),
                            ("resolution", ("ss_resolution", "modelspec.resolution")), ("date", ("modelspec.date", "ss_training_started_at")),
                            ("comment", ("ss_training_comment",))):
            v = g(*keys)
            if label == "dim/alpha" and v:
                v = f"{v}/{g('ss_network_alpha') or '?'}"
            if v:
                rows.append(f"{label}: {v}")
        if civ:
            rows.append(f"rgthree info: base {civ.get('baseModel')}")
            if civ.get("trainedWords"):
                rows.append("trigger words (rgthree info): " + ", ".join(civ["trainedWords"]))
        if tags:
            rows.append("top training tags: " + ", ".join(f"{t} ({c})" for t, c in tags[:5]))
        if len(md) <= 3 and not civ:
            rows.append(f"(header has {len(md)} keys: this trainer wrote almost nothing — try rgthree info)")
        return (name, base or civ.get("baseModel", ""), ", ".join(trig), "\n".join(f"{t}\t{c}" for t, c in tags),
                "\n".join(rows), json.dumps(md, ensure_ascii=False, indent=1), list(civ.get("trainedWords") or []), all_tags)
