"""LoRA Info — what a LoRA file can tell you.
The loader gives you MODEL and CLIP only; the information lives in the .safetensors header, written by the trainer:
sd-scripts / kohya files carry ~80-90 keys (ss_output_name, ss_base_model_version, dim/alpha, steps, images, resolution,
modelspec.*), and ss_tag_frequency = the training captions' tags with their counts — the best local hint of the trigger
words. Other trainers write almost nothing. The OFFICIAL trigger words are not in the file: here they are read, when
it is there, from the `<lora>.rgthree-info.json` that rgthree-comfy saves next to a LoRA once you open its info dialog.
Nothing here leaves the disk."""
import json
import os
import struct

BORING = {"masterpiece", "best quality", "highres", "official art", "absurdres", "high quality", "very aesthetic",
          "1girl", "1boy", "solo"}


def read_header(path):
    with open(path, "rb") as h:
        n = struct.unpack("<Q", h.read(8))[0]
        hdr = json.loads(h.read(n))
    md = hdr.get("__metadata__") or {}
    return md, hdr


def tag_frequency(md, top=None, drop_boring=True):
    """[(tag, count)] merged over datasets, most frequent first; top=None = all; quality boilerplate optionally dropped."""
    raw = md.get("ss_tag_frequency")
    if not raw:
        return []
    try:
        tf = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return []
    tot = {}
    for ds in tf.values():
        for t, c in ds.items():
            t = t.strip()
            if t and (not drop_boring or t.lower() not in BORING):
                tot[t] = tot.get(t, 0) + int(c)
    out = sorted(tot.items(), key=lambda x: -x[1])
    return out if top is None else out[:top]


def rg3_info(path):
    """The `<lora>.rgthree-info.json` next to the LoRA: {"words": the official trigger words, in the order of the file,
    "base": its baseModel}; None when the file is not there or cannot be read. In that file `trainedWords` is a list of
    {word, civitai?, metadata?, count?}: the official words are the ones marked `civitai`, the ones marked `metadata`
    are the header's training tags over again."""
    try:
        with open(path + ".rgthree-info.json", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    words = []
    for it in data.get("trainedWords") or []:
        w = (it.get("word") if isinstance(it, dict) and it.get("civitai") else it if isinstance(it, str) else None)
        w = str(w).strip() if w else ""
        if w and w not in words:
            words.append(w)
    return {"words": words, "base": data.get("baseModel") or ""}
