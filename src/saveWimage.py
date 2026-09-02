"""Save Wimage - salva le immagini componendo il nome da solo (FileName Builder + Save Image in un nodo).
Nome = <folder>/<subject><text1><value1><text2><value2>... + contatore _NNN a 'digits' cifre (default 3; 0 = nessuno,
il file viene sovrascritto). Ogni parte = testo fisso + tipo (int/float/bool/string) + UN campo 'value' il cui puntino
accetta qualsiasi link (INT/FLOAT/BOOLEAN/STRING); il valore, scritto o collegato, e' convertito secondo il tipo.
Float: sempre 2 decimali fissi. Bool -> true/false. Le parti si aggiungono col "+" (web/saveWimage.js); il numero di
parti vive nel widget nascosto 'parts'. Salva i metadati (prompt + workflow) nel PNG come il SaveImage di Comfy.
Uscite: prefix (folder/nome senza contatore) e name (solo il nome) - utili per altri salvataggi (video, json)."""
import json
import os
import re

import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo

import folder_paths

MAX_PARTS = 8
TYPES = ["int", "float", "bool", "string"]


def to_str(value, kind):
    if value is None:
        return ""
    if isinstance(value, (list, tuple)) and len(value) == 1:
        value = value[0]
    if kind == "int":
        try:
            return str(int(round(float(value))))
        except (TypeError, ValueError):
            return str(value)
    if kind == "float":
        try:
            return f"{float(value):.2f}"  # sempre due decimali fissi (Sick, 30/08)
        except (TypeError, ValueError):
            return str(value)
    if kind == "bool":
        if isinstance(value, str):
            return "true" if value.strip().lower() in ("1", "true", "yes", "on") else "false"
        return "true" if bool(value) else "false"
    return str(value)


def compose(folder, subject, parts, kw):
    name = subject or ""
    for i in range(1, min(int(parts), MAX_PARTS) + 1):
        kind = kw.get(f"type{i}", "int")
        raw = kw.get(f"value{i}", "")
        value = "" if raw is None else raw
        if isinstance(value, str) and value.strip() == "":
            name += kw.get(f"text{i}") or ""
            continue
        name += (kw.get(f"text{i}") or "") + to_str(value, kind)
    folder = (folder or "").strip().replace("\\", "/").strip("/")
    return folder, name


class SaveWimage:
    @classmethod
    def INPUT_TYPES(cls):
        req = {
            "images": ("IMAGE", {"tooltip": "Le immagini da salvare."}),
            "preview": ("STRING", {"default": "", "multiline": True, "read_only": True, "tooltip": "Nome risultante (sola lettura)."}),
            "folder": ("STRING", {"default": "", "tooltip": "Sottocartella di output (vuoto = radice)."}),
            "subject": ("STRING", {"default": "", "tooltip": "Nome del soggetto / dell'opera."}),
            "digits": ("INT", {"default": 3, "min": 0, "max": 8, "tooltip": "Cifre del contatore dopo il nome (0 = nessun contatore)."}),
            "parts": ("INT", {"default": 1, "min": 0, "max": MAX_PARTS, "hidden": True, "tooltip": "Numero di parti attive (gestito dai tasti + / -)."}),
        }
        opt = {}
        for i in range(1, MAX_PARTS + 1):
            opt[f"text{i}"] = ("STRING", {"default": "_", "tooltip": "Testo fisso davanti al valore (es. _S_)."})
            opt[f"type{i}"] = (TYPES, {"default": "int", "tooltip": "Come convertire il valore in testo."})
            opt[f"value{i}"] = ("STRING", {"default": "", "tooltip": "Valore: scrivilo qui o collega al puntino un INT/FLOAT/BOOLEAN/STRING."})
        return {"required": req, "optional": opt, "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"}}

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prefix", "name")
    FUNCTION = "save"
    OUTPUT_NODE = True
    CATEGORY = "WextraX"
    DESCRIPTION = "Saves PNGs composing the file name (folder/subject + parts) with a counter of chosen width and the usual ComfyUI metadata."

    @classmethod
    def VALIDATE_INPUTS(cls, input_types):
        return True  # i value{i} accettano link di qualsiasi tipo

    def save(self, images, preview="", folder="", subject="", digits=3, parts=1, prompt=None, extra_pnginfo=None, **kw):
        folder, name = compose(folder, subject, parts, kw)
        base = name or "Wimage"
        out_root = folder_paths.get_output_directory()
        target = os.path.join(out_root, folder) if folder else out_root
        os.makedirs(target, exist_ok=True)

        counter = 1
        if digits > 0:
            rx = re.compile("^" + re.escape(base) + r"_(\d+)\.png$", re.IGNORECASE)
            nums = [int(m.group(1)) for f in os.listdir(target) for m in [rx.match(f)] if m]
            counter = (max(nums) + 1) if nums else 1

        results = []
        for image in images:
            arr = (255.0 * image.cpu().numpy()).clip(0, 255).astype(np.uint8)
            img = Image.fromarray(arr)
            meta = PngInfo()
            if prompt is not None:
                meta.add_text("prompt", json.dumps(prompt))
            if extra_pnginfo:
                for k, v in extra_pnginfo.items():
                    meta.add_text(k, json.dumps(v))
            fname = f"{base}_{counter:0{digits}d}.png" if digits > 0 else f"{base}.png"
            img.save(os.path.join(target, fname), pnginfo=meta, compress_level=4)
            results.append({"filename": fname, "subfolder": folder, "type": "output"})
            counter += 1
        prefix = (folder + "/" if folder else "") + base
        return {"ui": {"images": results, "preview": [prefix]}, "result": (prefix, base)}
