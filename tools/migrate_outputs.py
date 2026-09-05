"""WextraUI 0.3.2 — output order changed on three nodes. This rewrites a saved workflow so its links follow.
Usage:  python tools/migrate_outputs.py <workflow.json> [...]   (a .bak copy is written next to each file)"""
import json, sys, shutil
MAP = {  # node type -> {old output slot: new output slot}
    "h3PromptComposer": {1: 2, 2: 1},
    "h3LoopRange": {3: 5, 4: 3, 5: 4},
    "wxRunDiff": {0: 2, 1: 3, 2: 0, 3: 4, 4: 1},
}
NAMES = {
    "h3PromptComposer": ["prompt", "duration", "timing_table", "frames"],
    "h3LoopRange": ["run_count", "start_scene", "start_frame", "start_clip", "start_audio", "resuming"],
    "wxRunDiff": ["passthrough", "tag", "changes", "count", "key"],
}

def migrate(path):
    d = json.load(open(path, encoding="utf-8"))
    if d.get("wextraui_outputs") == "0.3.2":
        print("already migrated:", path); return
    types = {n["id"]: n["type"] for n in d["nodes"]}
    n_links = 0
    for l in d.get("links", []):
        m = MAP.get(types.get(l[1]))
        if m and l[2] in m:
            l[2] = m[l[2]]; n_links += 1
    for n in d["nodes"]:
        m = MAP.get(n["type"])
        if not m or not n.get("outputs"): continue
        old = n["outputs"]; new = list(old)
        for o, nw in m.items():
            if o < len(old): new[nw] = old[o]
        for i, o in enumerate(new):
            if i < len(NAMES[n["type"]]): o["name"] = NAMES[n["type"]][i]
        n["outputs"] = new
    # WRoute: output names only
    for n in d["nodes"]:
        if n["type"] == "wxRoute" and n.get("outputs"):
            for o, nm in zip(n["outputs"], ("true", "false")): o["name"] = nm
    d["wextraui_outputs"] = "0.3.2"
    shutil.copy(path, path + ".bak")
    json.dump(d, open(path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"migrated: {path}  ({n_links} links)")

if __name__ == "__main__":
    for p in sys.argv[1:]: migrate(p)
