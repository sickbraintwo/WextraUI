"""WextraUI — the checks to run before a push, from outside the UI (the way a script, comfy-cli or an agent sees the nodes).
Usage:  python tools/selftest.py [--comfy <path to comfy.exe>] [--url http://127.0.0.1:8188] [--no-run] [workflow.json ...]
  1. registry  — `comfy node validate` on this repo (ruff + the registry's security rules), when comfy-cli is at hand
                 (--comfy, or `comfy` on PATH);
  2. schema    — the server's object_info lists every node of this pack, and every input has a widget-readable type;
  3. files     — each workflow given: a copy goes through tools/migrate_outputs.py (the file itself is not touched),
                 then every WextraUI node is paired by position against object_info, the way comfy-cli does it, and every
                 value must fit its input (combo member, number, bool, string); with comfy-cli importable the pairing is
                 comfy-cli's own;
  4. run       — one small API graph per node family is queued on /prompt with default values and must end in
                 `success` (WLoRA needs a checkpoint and a LoRA: the first of each found in the model
                 folders; skipped when there is none).
Exit code 1 when anything fails. Nothing is written in the ComfyUI output folder (the runs preview, they do not save)."""
import ast
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
PREFIXES = ("wx", "h3", "saveWimage")
CTRL = {"fixed", "increment", "decrement", "randomize", "increment-wrap"}
FAILS = []


def fail(msg):
    FAILS.append(msg)
    print("  FAIL", msg)


def get(url):
    return json.load(urllib.request.urlopen(url, timeout=30))


# ---------- 1. registry ----------
def check_registry(comfy):
    exe = comfy or shutil.which("comfy")
    if not exe:
        print("1. registry: comfy-cli not found (pass --comfy), skipped")
        return
    p = subprocess.run([exe, "--skip-prompt", "node", "validate"], cwd=REPO, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    out = (p.stdout or "") + (p.stderr or "")
    ok = "All validation checks passed" in out
    print("1. registry: comfy node validate ->", "ok" if ok else "PROBLEMS")
    if not ok:
        codes = [l for l in out.splitlines() if l[:1].isalpha() and l[1:4].isdigit()]
        fail("comfy node validate: " + " | ".join(codes)[:600])

# what the registry's yara scan reads as network code. It scans EVERY shipped text file, prose included: 0.3.8 was flagged
# for naming the pattern in CHANGELOG.md. Known and declared: the one civitai call in src/loraInfo.py.
SCANNER_WORDS = (".connect(", "urlopen(", "requests.get(", "requests.post(", "socket.socket", "http.client")
SCANNER_KNOWN = set()


def check_scanner():
    ignored = [l.strip() for l in open(os.path.join(REPO, ".comfyignore"), encoding="utf-8")
               if l.strip() and not l.startswith("#")]
    hits = []
    for root, dirs, names in os.walk(REPO):
        dirs[:] = [d for d in dirs if d != ".git"]
        for name in names:
            rel = os.path.relpath(os.path.join(root, name), REPO).replace(os.sep, "/")
            if any(rel.startswith(i) or (i.endswith("/") and "/" + i in "/" + rel) or
                   (i.startswith("*") and rel.endswith(i[1:])) or rel == i for i in ignored):
                continue
            try:
                text = open(os.path.join(root, name), encoding="utf-8").read()
            except (UnicodeDecodeError, OSError):
                continue
            for n, line in enumerate(text.splitlines(), 1):
                hits += [f"{rel}:{n} {w}" for w in SCANNER_WORDS if w in line and (rel, w) not in SCANNER_KNOWN]
    print("   scanner words in shipped files:", "none" if not hits else "FOUND")
    for h in hits:
        fail("registry scanner would flag " + h + " (code, comment or prose: reword it)")


def check_times():
    """The same lines through the boxes as the backend reads them and as the page does (web/wxTimes.js): the strip of
    WCutScene and the rows of WAudio Prompts must see what the Run will see."""
    node = shutil.which("node")
    if not node:
        print("   times: no node on PATH, skipped")
        return
    ns = {"re": re}
    for rel, names in ((("src", "foley.py"), ("TIME", "parse_time", "parse_mark")), (("src", "cutscene.py"), ("parse_marks",))):
        tree = ast.parse(open(os.path.join(REPO, *rel), encoding="utf-8").read())
        keep = [n for n in tree.body if (isinstance(n, ast.FunctionDef) and n.name in names) or
                (isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") in names)]
        exec(compile(ast.Module(keep, []), rel[-1], "exec"), ns)
    fps, total = 24, 144
    cases = [("", ""), ("2.5\n4", "3.2"), ("2.5\n+3", ""), ("+2.5\n2.5", ""), ("2.5", "2.5"), ("0", "0"), ("1:02.5", ""), ("0:03,5", "72f"),
             ("144f", ""), ("143f", ""), ("6", ""), ("5.99", ""), ("abc", ""), ("2 # two\n# nothing\n\n3", ""), ("2.0625", ""), ("2.02083333", "+ 4"),
             ("1:2f", ""), ("2", "x"), ("7\nabc", "9")]

    def backend(cuts, beats):
        try:
            found = not cuts.strip()
            frames, marked = ([0], set()) if found else ns["parse_marks"](cuts, fps, total)
            extra = ns["parse_marks"](beats, fps, total, all_beats=True, where="beats")[1]
            hard = set(frames) - marked
            marked = (marked | extra) - hard
            return {"starts": sorted(hard | marked), "beats": sorted(marked), "err": False}
        except ValueError:
            return {"err": True}
    url = "file:///" + os.path.join(REPO, "web", "wxTimes.js").replace(os.sep, "/")
    js = (f"import {{ scenesOf }} from {json.dumps(url)};\n"
          f"for (const [c, b] of {json.dumps(cases)}) {{ const r = scenesOf(c, b, {fps}, {total});\n"
          "console.log(JSON.stringify(r.err ? { err: true } : { starts: r.starts, beats: [...r.beats].sort((x, y) => x - y), err: false })); }\n")
    out = subprocess.run([node, "--input-type=module", "-e", js], capture_output=True, text=True, encoding="utf-8")
    lines = out.stdout.strip().splitlines()
    if out.returncode or len(lines) != len(cases):
        fail("times: the page's reading did not run: " + out.stderr[:200])
        return
    bad = [c for c, l in zip(cases, lines) if json.loads(l) != backend(*c)]
    print(f"   times: {len(cases) - len(bad)}/{len(cases)} lines read the same in the page and in the backend")
    for c in bad:
        fail(f"times: {c} reads differently in the page and in the backend")


# ---------- 2. schema ----------
def widget_inputs(spec):
    """(name, type, options) of every input that is a widget, in comfy-cli's order (required then optional)."""
    out = []
    i = spec["input"]
    for section in ("required", "optional"):
        for name, sp in (i.get(section) or {}).items():
            t = sp[0]
            o = sp[1] if len(sp) > 1 and isinstance(sp[1], dict) else {}
            if o.get("forceInput"):
                continue
            if isinstance(t, list) or t in ("INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"):
                out.append((name, t, o))
    return out


def check_schema(oi):
    nodes = sorted(k for k in oi if k.startswith(PREFIXES))
    print(f"2. schema: {len(nodes)} WextraUI nodes in object_info")
    if len(nodes) < 34:
        fail(f"expected 34 nodes, found {len(nodes)}: {nodes}")
    for k in nodes:
        for name, t, o in widget_inputs(oi[k]):
            if isinstance(t, list) and not t and "default" not in o:
                fail(f"{k}.{name}: empty combo without default")
    return nodes


# ---------- 3. files ----------
def fits(val, t, o):
    if isinstance(val, list) and len(val) == 2 and isinstance(val[1], int):
        return True                                             # a link
    if isinstance(t, list):
        return (val in t) or (not t)
    if t in ("INT", "FLOAT"):
        return isinstance(val, (int, float)) and not isinstance(val, bool)
    if t == "BOOLEAN":
        return isinstance(val, bool)
    if t == "STRING":
        return isinstance(val, str)
    return True


def pair_positionally(node, oi):
    """widgets_values -> {input: value}, like comfy-cli: schema order, the control-after-generate marker skipped."""
    spec = oi[node["type"]]
    wv = list(node.get("widgets_values") or [])
    out, i = {}, 0
    for name, t, o in widget_inputs(spec):
        if i >= len(wv):
            break
        out[name] = wv[i]
        i += 1
        follows_control = o.get("control_after_generate") or name in ("seed", "noise_seed")
        if follows_control and i < len(wv) and wv[i] in CTRL:
            i += 1
    return out, wv[i:]


def try_comfy_cli():
    try:
        from comfy_cli import workflow_to_api as W
        return W
    except Exception:
        return None


def check_cli_patch(W):
    """In the comfy-mcp venv the translator runs with our two patches (tools/comfy_cli_patch.py): after a comfy-cli
    update they may stop hooking without a word, and an agent goes back to broken graphs in silence."""
    if W is None:
        return
    try:
        import wx_comfy_cli_patch as p
    except Exception:
        print("   comfy-cli here runs without the WextraUI patch (fine outside the comfy-mcp venv)")
        return
    flags = (getattr(p, "WEXTRAUI_PATCHED", False), getattr(p, "WEXTRAUI_PATCH2", False))
    if all(flags):
        print("   comfy-cli patch: both hooks active")
    else:
        fail(f"comfy-cli patch not hooked: PATCHED={flags[0]} PATCH2={flags[1]} (see comfy-mcp/PATCH.md)")


def check_file(path, oi, W):
    tmp = os.path.join(tempfile.gettempdir(), "wx_selftest_" + os.path.basename(path))
    shutil.copy(path, tmp)
    migrate = [sys.executable, os.path.join(HERE, "migrate_outputs.py"), tmp]
    mig = subprocess.run(migrate, capture_output=True, text=True, encoding="utf-8", errors="replace")
    mig2 = subprocess.run(migrate, capture_output=True, text=True, encoding="utf-8", errors="replace")
    first = ((mig.stdout or "").strip().splitlines() or [""])[-1]
    if "already in line" not in (mig2.stdout or ""):
        fail(f"{os.path.basename(path)}: migrate_outputs is not idempotent (second pass changed the file)")
    d = json.load(open(tmp, encoding="utf-8"))
    bad, seen = 0, 0
    if W:
        api = W.convert_ui_to_api(d, oi)
        items = [(nid, v["class_type"], dict(v["inputs"])) for nid, v in api.items()]
    else:
        items = []
        for n in d["nodes"]:
            if n.get("type") in oi:
                vals, rest = pair_positionally(n, oi)
                if rest:
                    vals["__extra__"] = rest
                items.append((n["id"], n["type"], vals))
    for nid, t, vals in items:
        if not t.startswith(PREFIXES):
            continue
        seen += 1
        spec = oi[t]["input"]
        allin = {**(spec.get("required") or {}), **(spec.get("optional") or {})}
        probs = []
        if "__extra__" in vals:
            probs.append(f"{len(vals.pop('__extra__'))} value(s) beyond the schema")
        for k, v in vals.items():
            sp = allin.get(k)
            if sp is None:
                probs.append(f"{k}: not an input")
                continue
            if not fits(v, sp[0], sp[1] if len(sp) > 1 else {}):
                probs.append(f"{k}={v!r}")
        if probs:
            bad += 1
            fail(f"{os.path.basename(path)} node {nid} ({t}): " + "; ".join(probs)[:300])
    print(f"3. file {os.path.basename(path)}: {first[:90]}")
    print(f"   {seen} WextraUI node(s) paired {'by comfy-cli' if W else 'by position'}, {bad} with values out of place")
    for p in (tmp, tmp + ".bak"):
        if os.path.exists(p):
            os.remove(p)


# ---------- 4. run ----------
def N(t, **inp):
    return {"class_type": t, "inputs": inp}


def L(nid, slot=0):
    return [str(nid), slot]


def first_model(oi, node, field):
    try:
        inp = oi[node]["input"]
        vals = (inp.get("required", {}).get(field) or inp.get("optional", {})[field])[0]
        return vals[0] if vals else None
    except Exception:
        return None


def run_graphs(oi):
    beats = '[{"name": "BEAT1", "base_duration": 10.0, "locked": false, "text": "a wave"}]'
    g = {
        "wxPromptRows+wxRunDiff+wxRoute+wxRouteIndex": {
            "1": N("wxPromptRows", join="comma", rows=2, on1=True, text1="a cat", on2=False, text2="a dog"),
            "2": N("wxRunDiff", key="auto", log=False, tag_max=60, changes_max=240, ignore="", passthrough=L(1)),
            "3": N("wxRoute", value=L(2, 0), route=True),
            "4": N("wxRouteIndex", value=L(3, 0), index=0),
            "5": N("PreviewAny", source=L(4, 0)),
        },
        # Wif / WIndex (29/10): the input chosen goes out, lazily; a chosen input with no cable blocks (no output, no error).
        # Wif with count 2: each pair has its own output, the same `if` decides both; pair 2 has no `true`, so out 2 blocks
        "wxif+wxIndex": {"1": N("wxFloat", value=0.25, control="fixed", step=0.1),
                         "2": N("wxFloat", value=0.75, control="fixed", step=0.1),
                         "3": N("wxif", count=1, **{"if": False}, true1=L(1, 0), false1=L(2, 0)),
                         "4": N("wxIndex", index=1, value0=L(1, 0), value1=L(3, 0)),
                         "5": N("PreviewAny", source=L(4, 0)),
                         "6": N("wxIndex", index=3, value0=L(1, 0)),
                         "7": N("PreviewAny", source=L(6, 0)),
                         "8": N("wxif", count=1, **{"if": True}, false1=L(2, 0)),
                         "9": N("PreviewAny", source=L(8, 0)),
                         "10": N("wxif", count=2, **{"if": True}, true1=L(2, 0), false1=L(1, 0), false2=L(1, 0)),
                         "11": N("PreviewAny", source=L(10, 0)),
                         "12": N("PreviewAny", source=L(10, 1)),
                         "_expect": {"5": "0.75", "7": None, "9": None, "11": "0.75", "12": None}},
        "wxFloat": {"1": N("wxFloat", value=0.5, control="increment", step=0.1),
                    "2": N("PreviewAny", source=L(1, 0)),
                    "3": N("wxFloat", value=1.0, control="fixed", step=0.5, until=2.0, start="1", carry=L(1, 1)),   # the odometer cable: a type of its own, a string
                    "4": N("PreviewAny", source=L(3, 0)),
                    "5": N("wxFloat", value=0.75, control="increment", step=0.1, selection="[0.5, 0.75, 1.2]"),   # the numbers of your own (25/10): accepted, ignored by the backend
                    "6": N("PreviewAny", source=L(5, 0))},
        "wxSeed": {"1": N("wxSeed", value=7, control="increment", step=1, until=9, start="7"),
                   "2": N("wxSeed", value=100, control="fixed", step=10, until=100, start="", carry=L(1, 1)),
                   "3": N("PreviewAny", source=L(2, 0))},
        # slot 2 on: out_1 carries the second float; the branch behind slot 1 (node 1) is lazy and must not run
        "wxFloat+wxSwitch": {"1": N("wxFloat", value=0.25, control="fixed", step=0.1),
                             "2": N("wxFloat", value=0.75, control="fixed", step=0.1),
                             "3": N("wxSwitch", inputs_per_slot=1, on_1=False, on_2=True, in1_1=L(1, 0), in2_1=L(2, 0)),
                             "4": N("PreviewAny", source=L(3, 1)),
                             "5": N("PreviewAny", source=L(3, 0))},   # index = 1 (the second slot, counted from 0)
        # ten cables per slot (26/10): the tenth cable of the slot that is on comes out of out_10 (output 10: index, out_1..out_10, carry)
        "wxSwitch 10 per slot": {"1": N("wxFloat", value=0.25, control="fixed", step=0.1),
                                 "2": N("wxSwitch", inputs_per_slot=10, on_1=True, in1_10=L(1, 0)),
                                 "3": N("PreviewAny", source=L(2, 10)),
                                 "_expect": {"3": "0.25"}},
        "h3SimplePrompt": {"1": N("h3SimplePrompt", scene="a room", action="a man walks", camera="static", sound="rain",
                                  stays_fixed="", what_moves="", final_state="", avoid1="", avoid2="", avoid3="")},
        "h3PromptComposer": {"1": N("h3PromptComposer", intro="", beats_json=beats, total_duration=10.0, sound="", avoid="")},
        "saveWimage": {"1": N("saveWimage", preview="", folder="wxtest", subject="probe", digits=3, parts=1,
                              text1="_S_", type1="int", value1="1")},
        "saveWimage+{#id}": {"1": N("wxSeed", value=7, control="fixed", step=1),
                           "2": N("saveWimage", preview="", folder="wxtest", subject="probe", digits=3, parts=2,
                                  text1="_s", type1="int", value1="{#1}", text2="_x", type2="string", value2="{#99}")},
        "EmptyImage+wxFrame": {
            "1": N("EmptyImage", width=256, height=192, batch_size=1, color=0),
            "2": N("wxFrame", image=L(1), method="lanczos",
                   ops='[{"t":"resize","mode":"fit in box","v":0,"w":320,"h":320},'
                       '{"t":"pad","w":320,"h":320,"r":"","a":"center","dx":0,"dy":0,"color":"#ff0000","feather":8}]'),
            "3": N("PreviewAny", source=L(2, 1)),
        },
        "EmptyImage+wxFrame (no action: the size that came in)": {   # with no action, width and height = the picture's
            "1": N("EmptyImage", width=256, height=192, batch_size=2, color=0),
            "2": N("wxFrame", image=L(1), method="lanczos", ops="[]"),
            "3": N("PreviewAny", source=L(2, 2)),
            "4": N("PreviewAny", source=L(2, 3)),
            "5": N("PreviewAny", source=L(2, 1)),
            "6": N("wxFrame", image=L(1), method="lanczos",   # a crop that keeps it all: still no change
                   ops='[{"t":"crop","w":0,"h":0,"r":"","a":"center","dx":0,"dy":0}]'),
            "7": N("PreviewAny", source=L(6, 2)),
            "8": N("wxFrame", image=L(1), method="lanczos",   # the picture shifted off a 100 x 100 canvas
                   ops='[{"t":"pad","w":100,"h":100,"r":"","a":"center","dx":5000,"dy":0,"color":"#000000","feather":0}]'),
            "9": N("PreviewAny", source=L(8, 3)),
            "_expect": {"3": "256", "4": "192", "7": "256", "9": "100"},
        },
        "EmptyImage+wxReso": {
            "1": N("EmptyImage", width=256, height=192, batch_size=1, color=0),
            "2": N("wxReso", image=L(1)),                      # from the picture: 256 × 192
            "3": N("wxSeed", value=640, control="fixed", step=1),
            "4": N("wxReso", width=L(3, 0), height=L(2, 1)),   # from two cables: 640 × 192
            "5": N("PreviewAny", source=L(4, 0)),
            "6": N("PreviewAny", source=L(4, 1)),
        },
        "wxReso defining+reading": {
            "1": N("wxReso", section="defining", define_width=0, define_height=832, aspect_ratio="16:9", custom_width=16,
                   custom_height=9, multiple=8, invert=True),                                     # 832 at 16:9, turned: 832 × 1480
            "2": N("wxReso", width=L(1, 0), height=L(1, 1)),                                    # a WReso of 0.8.0: reading only
            "3": N("PreviewAny", source=L(1, 0)),
        },
        "wxReso multiply": {
            "1": N("wxReso", section="multiply", multiply_width=1024, multiply_height=576, multiply_by=1.5),   # 1536 × 864
            "2": N("PreviewAny", source=L(1, 0)),
        },
        "wxRatio+wxReso custom": {
            "1": N("wxRatio", width=1480, height=832),                                         # ≈ 16:9: out 16 and 9
            "2": N("wxReso", section="defining", define_width=0, define_height=1080, aspect_ratio="custom",
                   custom_width=L(1, 0), custom_height=L(1, 1), multiple=8, invert=False),      # 1080 at 16:9: 1920 × 1080
            "3": N("PreviewAny", source=L(2, 0)),
            "4": N("PreviewAny", source=L(1, 1)),
        },
        # WRatio's aspect_ratio on WReso's menu: an upright picture goes out as 9:16 and WReso reads it upright, no invert;
        # Read with its two boxes typed (28/10)
        "wxRatio aspect upright": {
            "1": N("wxRatio", width=1088, height=1920),                                        # ≈ 9:16
            "2": N("wxReso", section="defining", define_width=1080, define_height=0, aspect_ratio=L(1, 2), custom_width=16,
                   custom_height=9, multiple=8, invert=False),                                  # 1080 at 9:16: 1080 × 1920
            "3": N("PreviewAny", source=L(2, 1)),
            "4": N("PreviewAny", source=L(1, 2)),
            "5": N("wxReso", width=640, height=480),                                           # Read, typed: 640 × 480
            "6": N("PreviewAny", source=L(5, 1)),
            "_expect": {"3": "1920", "4": "9:16", "6": "480"},
        },
        "h3Scene+h3CollectScenes+h3LoopRange+h3HandoffTail": {
            "1": N("h3Scene", prompt="scene one", duration=5.0, seed=1, first_frame_from="previous_scene", guide_frame_at=0.0,
                   handoff_frames="22", previous_from="loop", resume_from_video=""),
            "2": N("h3CollectScenes", scene1=L(1)),
            "3": N("h3LoopRange", scenes=L(2, 0), start_scene=0, scene_count=0),
            "4": N("EmptyImage", width=64, height=64, batch_size=4, color=0),
            "5": N("h3HandoffTail", scenes=L(2, 0), scene_index=0, images=L(4)),
            "6": N("PreviewAny", source=L(2, 2)),
            "7": N("PreviewAny", source=L(3, 0)),
            "8": N("PreviewAny", source=L(5, 3)),
        },
    }
    # WPrompt Rows (02/11): no row with text = the text on prompt_to_divide as it is; a row with text, even off, stops it
    g["wxPromptRows empty"] = {
        "1": N("PrimitiveStringMultiline", value="a cat,\n on a roof,"),
        "2": N("wxPromptRows", join="comma", rows=2, text1="", text2="  ", prompt_to_divide=L(1, 0)),
        "3": N("PreviewAny", source=L(2, 0)),
        "4": N("wxPromptRows", join="comma", rows=1, on1=False, text1="off", prompt_to_divide=L(1, 0)),
        "5": N("PreviewAny", source=L(4, 0)),
        "6": N("wxPromptRows", join="comma", rows=1, text1="mine", prompt_to_divide=L(1, 0)),
        "7": N("PreviewAny", source=L(6, 0)),
        "_expect": {"3": "a cat,\n on a roof,", "5": "", "7": "mine"},
    }
    ckpt = first_model(oi, "CheckpointLoaderSimple", "ckpt_name")
    lora = first_model(oi, "wxLoraLoaderTrigger", "lora_name")
    if ckpt and lora:
        g["CheckpointLoaderSimple+wxLoraLoaderTrigger"] = {
            "1": N("CheckpointLoaderSimple", ckpt_name=ckpt),
            "2": N("wxLoraLoaderTrigger", lora_name=lora, strength_model=0.7, strength_clip=0.7, rgthree_info=True,
                   where="prefix", separator=", ", picked="", model=L(1, 0), clip=L(1, 1), prompt="a portrait"),
            "3": N("PreviewAny", source=L(2, 2)),   # the merged prompt
        }
        # WLoRA Stack: three blocks in use, the second one off (not loaded, its words left out), the fourth hidden by
        # `loras`; then `loras` by cable; then a separator typed as backslash-n. `_expect`: what the previews must read.
        clean = re.split(r"[\\/]", lora)[-1].rsplit(".", 1)[0]
        g["CheckpointLoaderSimple+wxLoraStack"] = {
            "1": N("CheckpointLoaderSimple", ckpt_name=ckpt),
            "2": N("wxLoraStack", loras=3, separator=", ",
                   on_1=True, lora_1=lora, strength_model_1=0.7, strength_clip_1=0.7, rgthree_info_1=True, picked_1='["first word"]',
                   on_2=False, lora_2=lora, strength_model_2=0.5, strength_clip_2=0.5, rgthree_info_2=True, picked_2='["second word"]',
                   on_3=True, lora_3=lora, strength_model_3=0.0, strength_clip_3=0.0, rgthree_info_3=True, picked_3='["third word"]',
                   lora_4=lora, picked_4='["hidden word"]', model=L(1, 0), clip=L(1, 1), prompt="a portrait"),
            "3": N("PreviewAny", source=L(2, 2)),
            "4": N("PreviewAny", source=L(2, 3)),
            "_expect": {"3": "first word, third word, a portrait", "4": f"{clean} + {clean}"},
        }
        g["wxSeed+wxLoraStack"] = {
            "1": N("wxSeed", value=3, control="fixed", step=1),
            "2": N("wxLoraStack", loras=L(1, 0), lora_1=lora, lora_2=lora, lora_3=lora, picked_3='["third"]', prompt="p"),
            "3": N("PreviewAny", source=L(2, 2)),
            "_expect": {"3": "third, p"},
        }
        g["wxLoraStack newline"] = {
            "1": N("wxLoraStack", loras=2, separator="\\n", lora_1=lora, picked_1='["a"]', lora_2=lora, picked_2='["b"]', prompt="p"),
            "2": N("PreviewAny", source=L(1, 2)),
            "_expect": {"2": "a\nb\np"},
        }
        # twenty blocks (27/10): the twelfth loads, `solo` and `carry` live in the interface; the carry output passes the name
        g["wxLoraStack twenty"] = {
            "1": N("wxLoraStack", loras=12, solo="increment", lora_12=lora, picked_12='["twelfth"]', prompt="p"),
            "2": N("PreviewAny", source=L(1, 2)),
            "3": N("PreviewAny", source=L(1, 4)),
            "_expect": {"2": "twelfth, p", "3": clean},
        }
        # an empty block (02/11): `None` passes validation, loads nothing, leaves out its words and its name
        g["wxLoraStack none"] = {
            "1": N("wxLoraStack", loras=2, lora_1="None", picked_1='["left out"]', lora_2=lora, picked_2='["b"]', prompt="p"),
            "2": N("PreviewAny", source=L(1, 2)),
            "3": N("PreviewAny", source=L(1, 3)),
            "_expect": {"2": "b, p", "3": clean},
        }
    else:
        print("   (no checkpoint or LoRA on the server: the loader run is skipped)")
    wckpt = first_model(oi, "wxCheckpointLoader", "ckpt_name")
    if wckpt:
        g["wxCheckpointLoader"] = {
            "1": N("wxCheckpointLoader", folder="(all)", ckpt_name=wckpt),
            "2": N("PreviewAny", source=L(1, 3)),   # the clean name
        }
    else:
        print("   (no checkpoint on the server: the WCheckpoint run is skipped)")
    if wckpt:   # one real step at 64x64: the two selectors cabled into the core KSampler's menus
        g["wxCheckpointLoader+wxSampler+wxScheduler+KSampler"] = {
            "1": N("wxCheckpointLoader", folder="(all)", ckpt_name=wckpt),
            "2": N("CLIPTextEncode", text="a probe", clip=L(1, 1)),
            "3": N("CLIPTextEncode", text="", clip=L(1, 1)),
            "4": N("EmptyLatentImage", width=64, height=64, batch_size=1),
            "5": N("wxSampler", sampler_name="euler"),
            "6": N("wxScheduler", scheduler="simple", carry=L(5, 2)),   # the odometer cable, sampler -> scheduler
            "7": N("KSampler", model=L(1, 0), seed=1, steps=1, cfg=1.0, sampler_name=L(5, 0), scheduler=L(6, 0),
                   positive=L(2, 0), negative=L(3, 0), latent_image=L(4, 0), denoise=1.0),
            "8": N("PreviewAny", source=L(5, 1)),   # the sampler's name as text
            "9": N("PreviewAny", source=L(7, 0)),
        }
    return g


def post(url, graph):
    body = json.dumps({"prompt": graph, "client_id": "wextraui-selftest"}).encode()
    req = urllib.request.Request(url + "/prompt", body, {"Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=30)), None
    except urllib.error.HTTPError as e:
        return None, json.loads(e.read().decode("utf-8", "replace"))


def check_runs(url, oi):
    print("4. run: one API graph per node family on /prompt")
    for name, graph in run_graphs(oi).items():
        expect = graph.pop("_expect", {})
        r, err = post(url, graph)
        if err:
            detail = json.dumps(err.get("node_errors") or err.get("error"), ensure_ascii=False)[:300]
            fail(f"{name}: refused by the server: {detail}")
            continue
        pid, t0, h = r["prompt_id"], time.time(), None
        while time.time() - t0 < 300:
            hist = get(url + f"/history/{pid}")
            if pid in hist:
                h = hist[pid]
                break
            time.sleep(1)
        if not h:
            fail(f"{name}: no result in 300 s")
            continue
        st = h.get("status", {})
        if st.get("status_str") == "success":
            wrong = []
            for nid, want in expect.items():   # a preview's text: outputs[nid]["text"][0]
                got = ((h.get("outputs", {}).get(nid) or {}).get("text") or [None])[0]
                if got != want:
                    wrong.append(f"node {nid}: {got!r} instead of {want!r}")
            if wrong:
                fail(f"{name}: " + "; ".join(wrong))
            else:
                print(f"   ok  {name}" + (f" ({len(expect)} outputs as expected)" if expect else ""))
        else:
            msg = "?"
            for m in st.get("messages", []):
                if m[0] == "execution_error":
                    msg = f"node {m[1].get('node_id')} {m[1].get('node_type')}: {m[1].get('exception_message')}"
            fail(f"{name}: {msg[:300]}")


def main(argv):
    url, comfy, run, files = "http://127.0.0.1:8188", None, True, []
    it = iter(argv)
    for a in it:
        if a == "--url":
            url = next(it)
        elif a == "--comfy":
            comfy = next(it)
        elif a == "--no-run":
            run = False
        else:
            files.append(a)
    check_registry(comfy)
    check_scanner()
    check_times()
    try:
        oi = get(url + "/object_info")
    except Exception as e:
        print("ComfyUI not reachable at", url, "-", e)
        return 1
    check_schema(oi)
    W = try_comfy_cli()
    check_cli_patch(W)
    for f in files:
        check_file(f, oi, W)
    if run:
        check_runs(url, oi)
    print("\n" + ("ALL GOOD" if not FAILS else f"{len(FAILS)} PROBLEM(S)"))
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
