"""LoRA Info — what a LoRA file can tell you.
The loader gives you MODEL and CLIP only; the information lives in the .safetensors header, written by the trainer:
sd-scripts / kohya files carry ~80-90 keys (ss_output_name, ss_base_model_version, dim/alpha, steps, images, resolution,
modelspec.*), and ss_tag_frequency = the training captions' tags with their counts — the best local hint of the trigger
words. Other trainers write almost nothing. The OFFICIAL trigger words are not in the file: they are on Civitai,
looked up by SHA-256 (optional here, cached in output/_Wextra/lora/)."""
import json
import os
import struct
import hashlib
import urllib.request

import folder_paths

CACHE = os.path.join(folder_paths.get_output_directory(), "_Wextra", "lora")
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


def sha256_cached(path):
    os.makedirs(CACHE, exist_ok=True)
    st = os.stat(path)
    idx = os.path.join(CACHE, "hashes.json")
    try:
        table = json.load(open(idx, encoding="utf-8"))
    except Exception:
        table = {}
    k = f"{os.path.abspath(path)}|{st.st_size}|{int(st.st_mtime)}"
    if k in table:
        return table[k]
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 22), b""):
            h.update(chunk)
    table[k] = h.hexdigest()
    json.dump(table, open(idx, "w", encoding="utf-8"))
    return table[k]


def civitai_lookup(path):
    """Civitai model-version by hash: trainedWords, model name, base model. Cached per hash; {} when offline/unknown."""
    try:
        sha = sha256_cached(path)
        cf = os.path.join(CACHE, sha + ".json")
        if os.path.exists(cf):
            return json.load(open(cf, encoding="utf-8"))
        req = urllib.request.Request(f"https://civitai.com/api/v1/model-versions/by-hash/{sha}",
                                     headers={"User-Agent": "WextraUI/0.3"})
        with urllib.request.urlopen(req, timeout=12) as r:
            data = json.loads(r.read().decode("utf-8"))
        keep = {"name": data.get("name"), "model": (data.get("model") or {}).get("name"),
                "baseModel": data.get("baseModel"), "trainedWords": data.get("trainedWords") or [],
                "id": data.get("id"), "modelId": data.get("modelId")}
        json.dump(keep, open(cf, "w", encoding="utf-8"), ensure_ascii=False)
        return keep
    except Exception:
        return {}
