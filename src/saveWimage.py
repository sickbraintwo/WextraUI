"""WSave Image - salva le immagini componendo il nome da solo (FileName Builder + Save Image in un nodo).
Nome = <folder>/<subject><text1><value1><text2><value2>... + contatore _NNN a 'digits' cifre (default 3; 0 = nessuno,
il file viene sovrascritto). Ogni parte = testo fisso + tipo (int/float/bool/string) + UN campo 'value' il cui puntino
accetta qualsiasi link (INT/FLOAT/BOOLEAN/STRING); il valore, scritto o collegato, e' convertito secondo il tipo.
Float: sempre 2 decimali fissi. Bool -> true/false. Le parti si aggiungono col "+" (web/saveWimage.js); il numero di
parti vive nel widget nascosto 'parts'. Salva i metadati (prompt + workflow) nel PNG come il SaveImage di Comfy.
Uscite: prefix (folder/nome senza contatore), name (solo il nome) - utili per altri salvataggi (video, json) -
e images (le stesse immagini in ingresso, passthrough: si salva E si continua la catena senza un Reroute).
Segnaposto in qualsiasi campo di testo (folder, subject, text{i}): {batch} = immagini nel giro, {index} = numero di
QUESTA immagine (da 1, riempito di zeri alla larghezza di {batch}: batch 4 -> 1..4, batch 12 -> 01..12).
Es. parte "_{batch}{index}" a valore vuoto -> image_S_0_41 (prima di quattro). L'interruttore write_batch (default on)
aggiunge da solo "_B{batch}{index}" in coda al nome (image_S_0_B41); vale solo quando ci sono immagini.
prefix/name restituiscono il nome della prima immagine; senza immagini i segnaposto restano nel testo.
image_preview (default off): mostra le miniature delle immagini salvate dentro il nodo, come il SaveImage di Comfy.
Rete di sicurezza: se cartella + nome + contatore + .png supera i 259 caratteri di Windows, il nome viene tagliato
(il contatore resta, i file restano distinti) invece di far fallire il salvataggio.
'images' e' opzionale: senza immagini il nodo non scrive nulla e serve solo a comporre il nome (prefix/name)."""
import json
import os
import re

import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo

import folder_paths

MAX_PARTS = 8
MAX_PATH = 259  # Windows: percorso completo, terminatore escluso
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


def batch_tokens(text, size, index):
    """{batch} -> immagini nel giro; {index} -> numero di questa immagine (da 1), largo quanto {batch}."""
    if "{" not in text:
        return text
    return text.replace("{batch}", str(size)).replace("{index}", f"{index:0{len(str(size))}d}")


class SaveWimage:
    @classmethod
    def INPUT_TYPES(cls):
        req = {
            "preview": ("STRING", {"default": "", "multiline": True, "read_only": True, "tooltip": "Nome risultante (sola lettura)."}),
            "folder": ("STRING", {"default": "", "tooltip": "Sottocartella di output (vuoto = radice)."}),
            "subject": ("STRING", {"default": "", "tooltip": "Nome del soggetto / dell'opera. Segnaposto: {batch} = immagini nel giro, {index} = numero di questa immagine."}),
            "digits": ("INT", {"default": 3, "min": 0, "max": 8, "tooltip": "Cifre del contatore dopo il nome (0 = nessun contatore)."}),
            "parts": ("INT", {"default": 0, "min": 0, "max": MAX_PARTS, "hidden": True, "tooltip": "Numero di parti attive (gestito dai tasti + / -)."}),
        }
        opt = {"images": ("IMAGE", {"tooltip": "Le immagini da salvare (opzionale: senza, il nodo compone solo il nome)."})}
        for i in range(1, MAX_PARTS + 1):
            opt[f"text{i}"] = ("STRING", {"default": "_", "tooltip": "Testo fisso davanti al valore (es. _S_). Segnaposto: {batch} = immagini nel giro, {index} = numero di questa immagine (es. _{batch}{index} -> _41)."})
            opt[f"type{i}"] = (TYPES, {"default": "int", "tooltip": "Come convertire il valore in testo."})
            opt[f"value{i}"] = ("STRING", {"default": "", "tooltip": "Valore: scrivilo qui o collega al puntino un INT/FLOAT/BOOLEAN/STRING."})
        opt["write_batch"] = ("BOOLEAN", {"default": True, "label_on": "on", "label_off": "off", "tooltip": "Aggiunge in coda al nome _B{batch}{index}: quante immagini nel giro e quale e' questa (es. _B41)."})
        opt["image_preview"] = ("BOOLEAN", {"default": False, "label_on": "on", "label_off": "off", "tooltip": "Mostra le miniature delle immagini salvate dentro il nodo (off = nodo compatto)."})
        return {"required": req, "optional": opt, "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"}}

    RETURN_TYPES = ("IMAGE", "STRING", "STRING")
    RETURN_NAMES = ("images", "prefix", "name")
    FUNCTION = "save"
    OUTPUT_NODE = True
    CATEGORY = "WextraUI"
    DESCRIPTION = "Saves PNGs composing the file name (folder/subject + parts) with a counter of chosen width and the usual ComfyUI metadata; passes the images through."

    @classmethod
    def VALIDATE_INPUTS(cls, input_types):
        return True  # i value{i} accettano link di qualsiasi tipo

    def save(self, images=None, preview="", folder="", subject="", digits=3, parts=1, write_batch=True, image_preview=False, prompt=None, extra_pnginfo=None, **kw):
        folder, name = compose(folder, subject, parts, kw)
        base = name or "Wimage"
        prefix = (folder + "/" if folder else "") + base
        if images is None:  # solo composizione del nome: niente cartella, niente file
            return {"ui": {"images": [], "preview": [prefix]}, "result": (None, prefix, base)}
        out_root = folder_paths.get_output_directory()
        size = len(images)
        if write_batch:
            base += "_B{batch}{index}"
        counters = {}  # (cartella, base) -> prossimo contatore; le immagini di un giro con lo stesso nome si seguono

        def next_counter(target, ibase):
            key = (target, ibase)
            if key not in counters:
                rx = re.compile("^" + re.escape(ibase) + r"_(\d+)\.png$", re.IGNORECASE)
                nums = [int(m.group(1)) for f in os.listdir(target) for m in [rx.match(f)] if m]
                counters[key] = (max(nums) + 1) if nums else 1
            counters[key] += 1
            return counters[key] - 1

        results = []
        for index, image in enumerate(images, start=1):
            ifolder, ibase = batch_tokens(folder, size, index), batch_tokens(base, size, index)
            target = os.path.join(out_root, ifolder) if ifolder else out_root
            os.makedirs(target, exist_ok=True)
            if index == 1:  # prefix/name = nome della prima immagine
                prefix, base_out = (ifolder + "/" if ifolder else "") + ibase, ibase
            arr = (255.0 * image.cpu().numpy()).clip(0, 255).astype(np.uint8)
            img = Image.fromarray(arr)
            meta = PngInfo()
            if prompt is not None:
                meta.add_text("prompt", json.dumps(prompt))
            if extra_pnginfo:
                for k, v in extra_pnginfo.items():
                    meta.add_text(k, json.dumps(v))
            tail_len = (digits + 1 if digits > 0 else 0) + 4        # _NNN + .png
            room = MAX_PATH - len(os.path.abspath(target)) - 1 - tail_len
            if len(ibase) > room > 0:
                ibase = ibase[:room].rstrip("_ .")                     # nome troppo lungo: si taglia, non si fallisce
            fname = f"{ibase}_{next_counter(target, ibase):0{digits}d}.png" if digits > 0 else f"{ibase}.png"
            img.save(os.path.join(target, fname), pnginfo=meta, compress_level=4)
            results.append({"filename": fname, "subfolder": ifolder, "type": "output"})
        return {"ui": {"images": results if image_preview else [], "preview": [prefix]}, "result": (images, prefix, base_out)}
