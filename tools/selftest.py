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
import json
import os
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
    if len(nodes) < 20:
        fail(f"expected 20 nodes, found {len(nodes)}: {nodes}")
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
        "wxFloat": {"1": N("wxFloat", value=0.5, control="increment", step=0.1),
                    "2": N("PreviewAny", source=L(1, 0)),
                    "3": N("wxFloat", value=1.0, control="fixed", step=0.5, until=2.0, start="1", carry=L(1, 1)),   # the odometer cable: a type of its own, a string
                    "4": N("PreviewAny", source=L(3, 0))},
        "wxSeed": {"1": N("wxSeed", value=7, control="increment", step=1, until=9, start="7"),
                   "2": N("wxSeed", value=100, control="fixed", step=10, until=100, start="", carry=L(1, 1)),
                   "3": N("PreviewAny", source=L(2, 0))},
        # slot 2 on: out_1 carries the second float; the branch behind slot 1 (node 1) is lazy and must not run
        "wxFloat+wxSwitch": {"1": N("wxFloat", value=0.25, control="fixed", step=0.1),
                             "2": N("wxFloat", value=0.75, control="fixed", step=0.1),
                             "3": N("wxSwitch", inputs_per_slot=1, on_1=False, on_2=True, in1_1=L(1, 0), in2_1=L(2, 0)),
                             "4": N("PreviewAny", source=L(3, 1)),
                             "5": N("PreviewAny", source=L(3, 0))},   # index = 1 (the second slot, counted from 0)
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
            "2": N("wxFrame", image=L(1), new_width=320, new_height=320, crop_to="none", crop_width=256, crop_height=192,
                   crop_anchor="center", resize_to="fit new size", resize_value=320, method="lanczos", pad_anchor="center",
                   offset_x=0, offset_y=0, pad_color="#ff0000", feathering=8),
            "3": N("PreviewAny", source=L(2, 4)),
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
    ckpt = first_model(oi, "CheckpointLoaderSimple", "ckpt_name")
    lora = first_model(oi, "wxLoraLoaderTrigger", "lora_name")
    if ckpt and lora:
        g["CheckpointLoaderSimple+wxLoraLoaderTrigger"] = {
            "1": N("CheckpointLoaderSimple", ckpt_name=ckpt),
            "2": N("wxLoraLoaderTrigger", lora_name=lora, strength_model=0.7, strength_clip=0.7, rgthree_info=True,
                   where="prefix", separator=", ", picked="", model=L(1, 0), clip=L(1, 1), prompt="a portrait"),
            "3": N("PreviewAny", source=L(2, 2)),   # the merged prompt
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
            print(f"   ok  {name}")
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
