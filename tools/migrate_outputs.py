"""WextraUI — bring a saved workflow in line with the current nodes. Safe to run again: every fix looks at the node
as saved and touches it only if it is in an old layout (a file saved with the current nodes comes out unchanged).
Usage:  python tools/migrate_outputs.py <workflow.json> [...]   (a .bak copy is written next to each changed file)

What it fixes:
  outputs — WDifference, WScene Composer H3, WLoop Start H3 were reordered (0.3.2); WSave Image gained a first output
        `images` (0.3.4); WRoute outputs are named true/false. Links follow the outputs to their new slot. Old layout is
        recognised by the saved output names, or, when the frontend already renamed them, by a link whose target type
        fits the old slot and not the new one. A node whose outputs match neither (a file the 0.3.5 script hit twice)
        is rebuilt when it has no links, and reported when it has.
  WLoad Lora & Trigger — widgets_values: 7 values (before the control-after-generate) or 8 (before `lora scope` and
        the strength walk, 0.3.4) are expanded to the 12 of today; a true/false left in strength_model or strength_clip
        by older layouts becomes 1.0, a strength that slid into the control slot goes back to strength_model, and
        widgets_values_named (the frontend's own copy by name) is rewritten to match.
  holes — widgets the scripts add (buttons, pickers, tables) took a slot in widgets_values until 0.3.5: the nulls are
        dropped (WSave Image, WScene Composer H3, WFrame, WScenes Collection H3), the loader's trailing picker value too;
        the WFrame colour pad and the WScene Composer table saved a copy of the value they mirror, dropped as well.
The file gets the marker `wextraui_outputs` = "0.3.6" (informational: the checks above do not rely on it)."""
import json, sys, shutil

ANY = "*"
# node type: new output names, new output types, {old slot: new slot} (slots not listed keep their index)
NEW = {
    "saveWimage": (["images", "prefix", "name"], ["IMAGE", "STRING", "STRING"], {0: 1, 1: 2}),
    "wxRunDiff": (["passthrough", "tag", "changes", "count", "key"], [ANY, "STRING", "STRING", "INT", "STRING"], {0: 2, 1: 3, 2: 0, 3: 4, 4: 1}),
    "h3PromptComposer": (["prompt", "duration", "timing_table", "frames"], ["STRING", "FLOAT", "STRING", "INT"], {1: 2, 2: 1}),
    "h3LoopRange": (["run_count", "start_scene", "start_frame", "start_clip", "start_audio", "resuming"],
                    ["INT", "INT", "IMAGE", "IMAGE", "AUDIO", "BOOLEAN"], {3: 5, 4: 3, 5: 4}),
    "wxRoute": (["true", "false"], [ANY, ANY], {}),
}
HOLED = {"saveWimage", "wxLoraLoaderTrigger", "h3PromptComposer", "wxFrame", "h3CollectScenes"}
CTRL = ("fixed", "increment", "decrement", "randomize", "increment-wrap")


LOADER_NAMES = ["lora_name", "fixed", "lora_scope", "strength_model", "strength_control", "strength_step", "strength_until",
                "strength_clip", "civitai", "where", "separator", "picked"]   # `fixed` = the frontend's name for the control


def _num_val(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _num(v):
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False


def old_layout(names, types, m):
    n_old = max(len(m) and max(m) + 1, len(names) - len(set(m.values()) - set(m)))
    return [names[m.get(i, i)] for i in range(n_old)], [types[m.get(i, i)] for i in range(n_old)]


def concrete(t):
    return isinstance(t, str) and t not in ("", ANY)


def classify(node, links_from, by_id, names, types, m):
    """'old' / 'new' / 'rebuild' / 'manual' for one node's outputs."""
    saved = [o.get("name") for o in node.get("outputs") or []]
    onames, otypes = old_layout(names, types, m)
    if saved == onames and onames != names:
        return "old"
    if not m and len(saved) == len(names) and saved != names:
        return "old"                              # same slots, only the names changed (WRoute): rename, keep the links
    if saved == names:
        for l in links_from:                      # renamed by the frontend, but are the links still on the old slots?
            s = l[2]
            t = by_id.get(str(l[3]))
            tin = (t.get("inputs") or [])[l[4]].get("type") if t and l[4] < len(t.get("inputs") or []) else None
            for want in (tin, l[5]):
                if concrete(want) and s < len(types) and concrete(types[s]) and want != types[s] \
                        and s < len(otypes) and (want == otypes[s] or not concrete(otypes[s])):
                    return "old"
        return "new"
    return "rebuild" if not links_from else "manual"


def fix_outputs(d):
    by_id = {str(n.get("id")): n for n in d["nodes"]}
    links = d.get("links") or []
    changed = []
    for n in d["nodes"]:
        spec = NEW.get(n.get("type"))
        if not spec or not isinstance(n.get("outputs"), list):
            continue
        names, types, m = spec
        mine = [l for l in links if str(l[1]) == str(n.get("id"))]
        kind = classify(n, mine, by_id, names, types, m)
        if kind == "new":                          # right slots; a wrong saved type (file hit twice) is put back in place
            fixed = False
            for o, tp in zip(n["outputs"], types):
                if o.get("type") != tp:
                    o["type"] = tp
                    fixed = True
            if fixed: changed.append(f"{n.get('id')}:{n['type']}:retype")
            continue
        if kind == "manual":
            print(f"  ! node {n.get('id')} ({n['type']}): outputs {[o.get('name') for o in n['outputs']]} match neither layout and carry links — check it by hand")
            continue
        old = n["outputs"]
        new = [{"name": nm, "type": tp, "links": None} for nm, tp in zip(names, types)]
        if kind == "old":
            for i, o in enumerate(old):
                j = m.get(i, i)
                if j < len(new) and o.get("links"):
                    new[j]["links"] = o["links"]
            for l in mine:
                if l[2] in m:
                    l[2] = m[l[2]]
        n["outputs"] = new
        changed.append(f"{n.get('id')}:{n['type']}:{kind}")
    return changed


def fix_widgets(d):
    changed = []
    for n in d["nodes"]:
        t, wv = n.get("type"), n.get("widgets_values")
        if not isinstance(wv, list):
            continue
        before = list(wv)
        if t == "wxLoraLoaderTrigger":
            # layouts: A = [name, sm, sc, civ, where, sep, picked, (picker)] (before the control, 7-8 values);
            # B = [name, ctl, sm, sc, civ, where, sep, picked, (picker)] (0.3.4 file, 8-9); C = today's 12 (+ picker / holes).
            # C is told by `lora scope` and `strength control` in their slots: the control slot may hold rubbish
            # (a file in layout A opened by 0.3.5 and saved put the strength there, and true/false in strength_model).
            TAIL = [1.0, 1.0, True, "prefix", ", ", ""]           # sm, sc, civ, where, sep, picked
            if len(wv) >= 12 and wv[2] in ("any", "folder") and wv[4] in ("fixed", "increment", "decrement"):   # C
                wv[:] = [v for v in wv if v is not None]
                del wv[12:]
                if wv[1] not in CTRL:
                    if _num_val(wv[1]) and not _num_val(wv[3]):
                        wv[3] = wv[1]                                                   # the strength that slid into the control slot
                    wv[1] = "fixed"
                if isinstance(wv[7], str) and wv[7].startswith("[") and wv[11] == "":
                    wv[11] = wv[7]                                                      # the picked list that slid into strength_clip
            elif len(wv) > 1 and wv[1] in CTRL:                                        # B
                rest = (wv[2:8] + TAIL[len(wv) - 2:])[:6]
                wv[:] = [wv[0], wv[1], "any", rest[0], "fixed", 0.1, 1.0] + rest[1:]
            elif len(wv) >= 1:                                                         # A
                rest = (wv[1:7] + TAIL[len(wv) - 1:])[:6]
                wv[:] = [wv[0], "fixed", "any", rest[0], "fixed", 0.1, 1.0] + rest[1:]
            for i, dflt in ((3, 1.0), (7, 1.0), (5, 0.1), (6, 1.0)):
                if i < len(wv) and not _num_val(wv[i]):
                    wv[i] = dflt
            if len(wv) > 2 and wv[2] not in ("any", "folder"):
                wv[2] = "any"
            if len(wv) > 4 and wv[4] not in ("fixed", "increment", "decrement"):
                wv[4] = "fixed"
            if len(wv) > 8 and not isinstance(wv[8], bool):
                wv[8] = True
            if len(wv) > 9 and wv[9] not in ("prefix", "suffix"):
                wv[9] = "prefix"
            if len(wv) > 10 and not isinstance(wv[10], str):
                wv[10] = ", "
            if len(wv) > 11 and not isinstance(wv[11], str):
                wv[11] = ""
            named = n.get("widgets_values_named")
            if isinstance(named, dict) and len(wv) == 12:                             # the names must tell the same story
                named.update(zip(LOADER_NAMES, wv))
        elif t in HOLED:
            wv[:] = [v for v in wv if v is not None]
            if t == "wxFrame" and len(wv) > 14 and isinstance(wv[13], str):        # the colour pad saved a copy of pad_color
                del wv[13]
            if t == "h3PromptComposer" and len(wv) > 5 and isinstance(wv[2], str) and not _num(wv[2]):
                del wv[2]                                                          # the beats table saved a copy of beats_json
        if wv != before:
            changed.append(f"{n.get('id')}:{t}")
    return changed


def migrate(path):
    d = json.load(open(path, encoding="utf-8"))
    if not isinstance(d.get("nodes"), list):
        print("not a workflow:", path)
        return
    out = fix_outputs(d)
    wid = fix_widgets(d)
    if not out and not wid and d.get("wextraui_outputs") == "0.3.6":
        print("already in line:", path)
        return
    d["wextraui_outputs"] = "0.3.6"
    shutil.copy(path, path + ".bak")
    json.dump(d, open(path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"updated: {path}  (outputs: {len(out)} node(s) {out}; widgets: {len(wid)} node(s) {wid})")


if __name__ == "__main__":
    for p in sys.argv[1:]: migrate(p)
