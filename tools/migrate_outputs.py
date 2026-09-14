"""WextraUI — output order changed on some nodes. This rewrites a saved workflow so its links follow.
Usage:  python tools/migrate_outputs.py <workflow.json> [...]   (a .bak copy is written next to each file)
Stages, applied in order and only once (marker `wextraui_outputs` in the file):
  0.3.2 — WDifference, WScene Composer H3, WLoop Start H3 reordered; WRoute outputs renamed true/false.
  0.3.4 — WSave Image: new first output `images`; `prefix` / `name` move to slots 1 and 2.
        WLoad Lora & Trigger: `lora_name` gained a control-after-generate widget (fixed / increment / ...): the saved
        widgets_values get a "fixed" inserted right after the LoRA name, so the strengths stay where they were."""
import json, sys, shutil

STAGES = [  # (version, {node type: {old slot: new slot}}, {node type: [output names]}, {node type: [(new pin name, type)]})
    ("0.3.2",
     {"h3PromptComposer": {1: 2, 2: 1}, "h3LoopRange": {3: 5, 4: 3, 5: 4}, "wxRunDiff": {0: 2, 1: 3, 2: 0, 3: 4, 4: 1}},
     {"h3PromptComposer": ["prompt", "duration", "timing_table", "frames"],
      "h3LoopRange": ["run_count", "start_scene", "start_frame", "start_clip", "start_audio", "resuming"],
      "wxRunDiff": ["passthrough", "tag", "changes", "count", "key"]},
     {}),
    ("0.3.4",
     {"saveWimage": {0: 1, 1: 2}},
     {"saveWimage": ["images", "prefix", "name"]},
     {"saveWimage": [("images", "IMAGE")]}),
]
ORDER = [s[0] for s in STAGES]


def apply(d, version, MAP, NAMES, ADD):
    types = {n["id"]: n["type"] for n in d["nodes"]}
    n_links = 0
    for l in d.get("links", []):
        m = MAP.get(types.get(l[1]))
        if m and l[2] in m:
            l[2] = m[l[2]]; n_links += 1
    for n in d["nodes"]:
        m = MAP.get(n["type"])
        if not m or not n.get("outputs"): continue
        old = n["outputs"]
        new = list(old) + [{"name": nm, "type": tp, "links": None} for nm, tp in ADD.get(n["type"], [])]
        for o, nw in m.items():
            if o < len(old): new[nw] = old[o]
        vacated = set(m.keys()) - set(m.values())          # slots nobody moved into: the new pins live there
        for i, (nm, tp) in zip(sorted(vacated), ADD.get(n["type"], [])):
            new[i] = {"name": nm, "type": tp, "links": None}
        for i, o in enumerate(new):
            if i < len(NAMES[n["type"]]): o["name"] = NAMES[n["type"]][i]
        n["outputs"] = new
    if version == "0.3.4":  # WLoad Lora & Trigger: control-after-generate value inserted after lora_name
        CTRL = ("fixed", "increment", "decrement", "randomize", "increment-wrap")
        for n in d["nodes"]:
            wv = n.get("widgets_values")
            if n["type"] == "wxLoraLoaderTrigger" and isinstance(wv, list) and len(wv) >= 2 and wv[1] not in CTRL:
                wv.insert(1, "fixed")
    if version == "0.3.2":  # WRoute: output names only
        for n in d["nodes"]:
            if n["type"] == "wxRoute" and n.get("outputs"):
                for o, nm in zip(n["outputs"], ("true", "false")): o["name"] = nm
    return n_links


def migrate(path):
    d = json.load(open(path, encoding="utf-8"))
    done = d.get("wextraui_outputs")
    start = ORDER.index(done) + 1 if done in ORDER else 0
    if start >= len(STAGES):
        print("already migrated:", path); return
    total = 0
    for version, MAP, NAMES, ADD in STAGES[start:]:
        total += apply(d, version, MAP, NAMES, ADD)
        d["wextraui_outputs"] = version
    shutil.copy(path, path + ".bak")
    json.dump(d, open(path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"migrated: {path}  ({total} links)")


if __name__ == "__main__":
    for p in sys.argv[1:]: migrate(p)
