"""WDifference — what changed since the previous run of this workflow.
ComfyUI hands every node that asks for them two hidden inputs: PROMPT (the API graph with every value the run uses)
and EXTRA_PNGINFO (the UI workflow, titles included) — the same two things Save Image embeds in the PNG, which is why
dropping an output onto ComfyUI reopens the workflow that made it. This node reads them one step BEFORE saving,
compares the values with the previous run (kept on disk, per workflow), and returns the differences as text.
Files: output/_Wextra/rundiff/<key>.json (last prompt) and <key>.log (one block per run, appended)."""
import json
import os
import re
import hashlib
import datetime

import folder_paths


class AnyType(str):
    def __ne__(self, other):
        return False


ANY = AnyType("*")
STORE = os.path.join(folder_paths.get_output_directory(), "_Wextra", "rundiff")


def _is_link(v):
    return isinstance(v, list) and len(v) == 2 and isinstance(v[0], str) and isinstance(v[1], int)


def _short(v, n=60):
    s = json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
    s = s.replace("\n", "⏎")
    return s if len(s) <= n else s[:n - 1] + "…"


def _titles(extra_pnginfo):
    """node id -> title (or type) from the UI workflow."""
    out = {}
    try:
        for n in extra_pnginfo["workflow"]["nodes"]:
            out[str(n["id"])] = n.get("title") or n.get("type") or str(n["id"])
    except Exception:
        pass
    return out


# Display-only widgets: they store what the node SHOWED last run (a preview of the file name, the text of a
# Show Anything…), so they change at every run without anyone touching them. Not a change: skipped.
NOISE = {"saveWimage": {"preview"}}
NOISE_CLASS = re.compile(r"show|display|preview|debug|monitor|console", re.I)


def _noise(class_type, widget, value):
    if _is_link(value):
        return False
    if widget in NOISE.get(class_type or "", ()):
        return True
    return bool(NOISE_CLASS.search(class_type or ""))


def _auto_key(prompt):
    """A key that identifies the workflow by its structure (node ids + class types), not by its values."""
    sig = sorted((k, v.get("class_type", "")) for k, v in prompt.items())
    return hashlib.sha1(json.dumps(sig).encode()).hexdigest()[:10]


def parse_ignore(text):
    """'ignore' widget -> (node ids, (node id, widget) pairs). Items separated by commas, spaces or new lines:
    `74` = the whole node, `74.seed` = that widget only. Anything else is dropped."""
    ids, pairs = set(), set()
    for item in re.split(r"[,\s]+", str(text or "")):
        item = item.strip().lstrip("#")
        if not item:
            continue
        nid, _, widget = item.partition(".")
        if not nid.isdigit():
            continue
        (pairs.add((nid, widget)) if widget else ids.add(nid))
    return ids, pairs


def diff_prompts(old, new, titles, skip_ids=(), records=None, skip_widgets=()):
    """Human lines: values changed, wiring changed, nodes added/removed. Links are compared as wiring.
    records (optional list) receives tuples (kind, node_id, node_title, widget, new_value) for the short tag.
    skip_ids: whole nodes left out; skip_widgets: (node id, widget) pairs left out."""
    lines = []
    rec = records if records is not None else []
    def name(nid):
        return f"{titles.get(nid, new.get(nid, old.get(nid, {})).get('class_type', '?'))} (#{nid})"
    for nid in sorted(set(old) | set(new), key=lambda x: int(x) if x.isdigit() else 0):
        if nid in skip_ids:
            continue
        o, n = old.get(nid), new.get(nid)
        if o is None:
            lines.append(f"+ {name(nid)} added"); rec.append(("add", nid, titles.get(nid, n.get("class_type", "?")), "", "")); continue
        if n is None:
            lines.append(f"- {name(nid)} removed"); rec.append(("del", nid, titles.get(nid, o.get("class_type", "?")), "", "")); continue
        if o.get("class_type") != n.get("class_type"):
            lines.append(f"~ {name(nid)}: type {o.get('class_type')} → {n.get('class_type')}"); continue
        oi, ni = o.get("inputs", {}), n.get("inputs", {})
        for k in sorted(set(oi) | set(ni)):
            a, b = oi.get(k), ni.get(k)
            if (nid, k) in skip_widgets:
                continue
            if a == b or (_noise(n.get("class_type"), k, a) and _noise(n.get("class_type"), k, b)):
                continue
            if _is_link(a) or _is_link(b):
                fa = f"←{name(a[0])}[{a[1]}]" if _is_link(a) else _short(a)
                fb = f"←{name(b[0])}[{b[1]}]" if _is_link(b) else _short(b)
                lines.append(f"~ {name(nid)} · {k}: {fa} → {fb}  (wiring)")
                rec.append(("wire", nid, titles.get(nid, n.get("class_type", "?")), k, ""))
            else:
                lines.append(f"~ {name(nid)} · {k}: {_short(a)} → {_short(b)}")
                rec.append(("val", nid, titles.get(nid, n.get("class_type", "?")), k, b))
    return lines


_UNSAFE = re.compile(r'[\\/:*?"<>|%\x00-\x1f]+')


_FNAME_BAD = set('<>:"/\\|?*~ ')


def fname_safe(text):
    """`changes` a prova di nome file (Sick, 12/09): via i caratteri vietati da Windows, le tilde e TUTTI gli spazi;
    i ritorni a capo diventano '_' cosi' le righe restano distinte. Il .log su disco tiene il testo leggibile."""
    rows = ["".join(c for c in row if c not in _FNAME_BAD and ord(c) >= 32) for row in str(text).splitlines()]
    out = ""
    for r in rows:
        if not r:
            continue
        out += r if (not out or r[0] in "+-") else "_" + r   # +Nodo / -Nodo portano gia' il loro segno
    return out


def _safe(s, n):
    s = _UNSAFE.sub("", str(s)).strip()
    s = re.sub(r"\s+", "-", s)
    return s if len(s) <= n else s[:n]


def _wnames(records):
    """widget name cut at its first '_' (strength_model -> strength) unless two changed widgets of that node clash"""
    shorts = {}
    for r in records:
        if r[0] in ("val", "wire"):
            shorts.setdefault((r[1], r[3].split("_")[0]), set()).add(r[3])
    def wname(nid, w):
        sh = w.split("_")[0]
        return sh if len(shorts.get((nid, sh), ())) <= 1 else w
    return wname


_MODEL_EXT = (".safetensors", ".sft", ".ckpt", ".pt", ".pth", ".bin", ".gguf")


def _model_name(value):
    """A model / LoRA file name loses its extension and its folder: loras/Style/foo.safetensors -> foo (Sick, 12/09)."""
    if isinstance(value, str) and value.lower().endswith(_MODEL_EXT):
        base = value.replace("\\", "/").rsplit("/", 1)[-1]
        return base.rsplit(".", 1)[0]
    return value


def cap(text, max_len):
    """Longest allowed `changes`: beyond max_len the string is cut at the last '_' that fits and ends with +N (N changes left out)."""
    if max_len <= 0 or len(text) <= max_len:
        return text
    parts, out = [], ""
    for ptxt in [x for x in text.split("_") if x]:
        cand = (out + "_" if out else "") + ptxt
        if len(cand) + 4 > max_len:
            break
        out = cand
        parts.append(ptxt)
    left = max(1, text.count("_") + 1 - len(parts))
    return (out or text[:max_len - 4]) + f"+{left}"


def make_changes(records):
    """`changes` for the file name (Sick, 12/09): node id, no title, widget cut at its first '_', arrow + new value
    only: `74.seed→6_12.strength→0.6+Upscale-Save`. No spaces, no forbidden characters; +Node / -Node carry their
    own sign, everything else is separated by '_'. The readable diff (titles, old → new) stays in the .log."""
    wname = _wnames(records)
    out = ""
    for kind, nid, title, widget, value in records:
        if kind == "val":
            if isinstance(value, bool):
                v = "on" if value else "off"
            else:
                v = _short(_model_name(value))
            ptxt = f"{nid}.{wname(nid, widget)}→{v}"
        elif kind == "wire":
            ptxt = f"{nid}.{wname(nid, widget)}→wire"
        elif kind == "add":
            ptxt = "+" + str(title)
        elif kind == "del":
            ptxt = "-" + str(title)
        else:
            continue
        ptxt = fname_safe(ptxt)
        if not ptxt:
            continue
        out += ptxt if (not out or ptxt[0] in "+-") else "_" + ptxt
    return out


def make_tag(records, max_len=60, text_len=14):
    """File-name-safe summary of the changes: `246.strength=0.0_57.seed=77_12.text~_+Upscale`.
    <node id>.<widget>=<new value>; the widget name is cut at its first '_' (strength_model → strength) unless
    that would clash with another changed widget of the same node."""
    wname = _wnames(records)
    parts = []
    for kind, nid, title, widget, value in records:
        if kind == "val":
            if isinstance(value, bool):
                v = "on" if value else "off"
            elif isinstance(value, (int, float)):
                v = str(value)
            else:
                v = str(_model_name(value))
                v = None if len(v) > text_len else _safe(v, text_len)
            parts.append(f"{nid}." + _safe(wname(nid, widget), 16) + ("=" + v if v is not None else "~"))
        elif kind == "wire":
            parts.append(f"{nid}.wire-" + _safe(wname(nid, widget), 16))
        elif kind == "add":
            parts.append("+" + _safe(title, 14))
        elif kind == "del":
            parts.append("-" + _safe(title, 14))
    out = ""
    for i, ptxt in enumerate(parts):
        cand = (out + "_" if out else "") + ptxt
        if len(cand) > max_len:
            out = (out or ptxt[:max_len - 3]) + f"+{len(parts) - i}"
            break
        out = cand
    return out.rstrip(". ")


class RunDiff:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "key": ("STRING", {"default": "auto",
                                   "tooltip": "Which 'previous run' to compare with. auto = the workflow is recognised by its structure "
                                              "(same nodes = same key); or write a name, e.g. the project, to compare across variants."}),
                "log": ("BOOLEAN", {"default": True, "label_on": "append .log", "label_off": "no log",
                                    "tooltip": "Also append every run's changes, with a timestamp, to output/_Wextra/rundiff/<key>.log."}),
                "tag_max": ("INT", {"default": 60, "min": 10, "max": 200,
                                    "tooltip": "Longest 'tag' (the file-name version of the changes). Beyond it: +N = N more changes."}),
                "changes_max": ("INT", {"default": 240, "min": 20, "max": 255,
                                        "tooltip": "Longest 'changes' string: a Windows file name holds 255 characters, minus the rest of the name. Beyond it: +N = N more changes."}),
                "ignore": ("STRING", {"default": "", "multiline": True,
                                      "tooltip": "Nodes not to track, by id, separated by commas: 74, 12. Or a single widget: 74.seed. "
                                                 "They leave changes, tag, count and the .log."}),
            },
            "optional": {
                "passthrough": (ANY, {"tooltip": "Optional: wire the thing you are about to save through here, so the diff is computed "
                                                 "right before saving. It comes out unchanged."}),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO", "unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = (ANY, "STRING", "STRING", "INT", "STRING")
    RETURN_NAMES = ("passthrough", "tag", "changes", "count", "key")
    OUTPUT_TOOLTIPS = ("The passthrough input, unchanged.", "The changes as a short file-name-safe string: 246.strength=0.0_57.seed=77_12.text~ ('first' on the first run, 'same' when nothing changed). Wire it into the file name of your Save node.", "The changes, short and file-name safe: <node id>.<widget>\u2192<new value>, one per _ (74.seed\u21926_12.strength\u21920.6+Upscale). Empty on the first run and when nothing changed. The .log keeps the readable version (titles, old \u2192 new).", "Number of changes.", "The key actually used.")
    FUNCTION = "run"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("Compares this run's values (the hidden PROMPT every Save node embeds in the file) with the previous run "
                   "of the same workflow and returns what changed — seeds, prompts, wiring, nodes — as text. "
                   "Wire 'changes' to a Show Anything, a Note, or into the saved file's name/metadata.")

    @classmethod
    def IS_CHANGED(cls, **kw):
        return float("nan")   # always run: comparing is cheap, and the log must record every run

    def run(self, key="auto", log=True, tag_max=60, changes_max=240, ignore="", passthrough=None, prompt=None, extra_pnginfo=None, unique_id=None):
        prompt = prompt or {}
        titles = _titles(extra_pnginfo or {})
        k = _auto_key(prompt) if key.strip().lower() in ("", "auto") else "".join(c if c.isalnum() or c in "-_." else "_" for c in key.strip())
        os.makedirs(STORE, exist_ok=True)
        pj, pl = os.path.join(STORE, k + ".json"), os.path.join(STORE, k + ".log")
        old = {}
        if os.path.exists(pj):
            try:
                old = json.load(open(pj, encoding="utf-8"))
            except Exception:
                old = {}
        ign_ids, ign_widgets = parse_ignore(ignore)
        skip = ign_ids | ({str(unique_id)} if unique_id is not None else set())
        records = []
        lines = diff_prompts(old, prompt, titles, skip, records, ign_widgets) if old else []
        if not old:
            text, tag = "", "first"
        else:
            text = "\n".join(lines)
            tag = make_tag(records, tag_max) if records else "same"
        json.dump(prompt, open(pj, "w", encoding="utf-8"), ensure_ascii=False)
        if log:
            stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            with open(pl, "a", encoding="utf-8") as f:
                f.write(f"## {stamp} · {len(lines)} change(s)" + (" · first run" if not old else "") + "\n")
                f.write((text + "\n") if text else "")
        return (passthrough, tag, cap(make_changes(records), changes_max) if old else "", len(lines), k)
