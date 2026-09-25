"""WextraUI — bring a saved workflow in line with the current nodes. Safe to run again: every fix looks at the node
as saved and touches it only if it is in an old layout (a file saved with the current nodes comes out unchanged).
Usage:  python tools/migrate_outputs.py <workflow.json> [...]   (a .bak copy is written next to each changed file)

What it fixes:
  outputs — WDifference, WScene Composer H3, WLoop Start H3 were reordered (0.3.2); WSave Image gained a first output
        `images` (0.3.4); WRoute outputs are named true/false. Links follow the outputs to their new slot. Old layout is
        recognised by the saved output names, or, when the frontend already renamed them, by a link whose target type
        fits the old slot and not the new one. A node whose outputs match neither (a file the 0.3.5 script hit twice)
        is rebuilt when it has no links, and reported when it has.
  subgraphs — every fix runs inside the subgraphs of the file as well.
  WLoad Lora & Trigger — widgets_values: 7 values (before the control-after-generate) or 8 (before `lora scope` and
        the strength walk, 0.3.4) are expanded to the 12 of 0.3.6-0.4.x; a true/false left in strength_model or
        strength_clip by older layouts becomes 1.0, a strength that slid into the control slot goes back to
        strength_model. Then the layout of 0.5.0, nine values: [folder, lora_name, control, strength_model,
        strength_clip, rgthree_info, where, separator, picked] — `folder` comes first ("(all)"), `lora scope`,
        `strength_control`, `strength_step` and `strength_until` are gone (a walk or a scope that was on is reported:
        cable a WFloat on the strength, pick the folder in `folder`), the switch of the official words is called
        `rgthree_info` (same slot, same value); widgets_values_named (the frontend's own copy by name) is rewritten to match.
        Outputs: eight become four (MODEL, CLIP, prompt, name): `name` moves from slot 6 to 3 with its links, the links
        of the four outputs that are gone are removed (and reported).
  WSwitch — a node saved before the `index` output gets it in front, its cables move one slot further.
  WFloat — the four values of 0.4.0 lose the last one (`until`, gone in 0.5.0), in widgets_values_named too.
  holes — widgets the scripts add (buttons, pickers, tables) took a slot in widgets_values until 0.3.5: the nulls are
        dropped (WSave Image, WScene Composer H3, WFrame, WScenes Collection H3), the loader's trailing picker value too;
        the WFrame colour pad and the WScene Composer table saved a copy of the value they mirror, dropped as well.
The file gets the marker `wextraui_outputs` = "0.5.0" (informational: the checks above do not rely on it)."""
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


LOADER_NAMES = ["folder", "lora_name", "fixed", "strength_model", "strength_clip", "rgthree_info", "where", "separator",
                "picked"]                                                     # `fixed` = the frontend's name for the control
LOADER_GONE = ("rg3info", "lora_scope", "strength_control", "strength_step", "strength_until", "civitai")   # names of 0.4.x that are not there any more
LOADER_OUT_OLD = ["MODEL", "CLIP", "prompt", "trigger_words", "civitai_list", "tags_list", "name", "info"]
LOADER_OUT = (["MODEL", "CLIP", "prompt", "name", "carry"], ["MODEL", "CLIP", "STRING", "STRING", "WX_CARRY"])   # `carry` since 0.6.0
WALK = ("fixed", "increment", "decrement")
SCOPE = ("any", "folder")


def loader_todays(wv):
    """The layout of 0.5.0, nine values: [folder, lora_name, control, strength_model, strength_clip, rgthree_info, where, separator,
    picked] — told by the switch (a bool) in slot 5 and `where` in slot 6."""
    return len(wv) >= 9 and isinstance(wv[0], str) and isinstance(wv[5], bool) and wv[6] in ("prefix", "suffix")


def loader_d(wv):
    """The 12 values of the first `folder` build (never released): `lora scope` and `strength control` in slots 3 and 5."""
    return len(wv) >= 12 and isinstance(wv[0], str) and wv[3] in SCOPE and wv[5] in WALK


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


def fix_loader_outputs(d):
    """WLoad Lora & Trigger, eight outputs -> five: `name` 6 -> 3 with its links, `carry` (0.6.0) last and empty, the links of the outputs that are gone removed."""
    by_id = {str(n.get("id")): n for n in d["nodes"]}
    changed = []
    for n in d["nodes"]:
        outs = n.get("outputs")
        if n.get("type") != "wxLoraLoaderTrigger" or not isinstance(outs, list) or [o.get("name") for o in outs] != LOADER_OUT_OLD:
            continue
        dropped = []
        for l in list(d.get("links") or []):
            if str(l[1]) != str(n.get("id")):
                continue
            if l[2] == 6:
                l[2] = 3
            elif l[2] in (3, 4, 5, 7):
                t = by_id.get(str(l[3]))
                tin = (t.get("inputs") or []) if t else []
                if l[4] < len(tin) and tin[l[4]].get("link") == l[0]:
                    tin[l[4]]["link"] = None
                d["links"].remove(l)
                dropped.append(f"{LOADER_OUT_OLD[l[2]]} -> node {l[3]}")
        keep = [outs[0], outs[1], outs[2], outs[6], {"name": "carry", "type": "WX_CARRY", "links": None}]
        for o, nm, tp in zip(keep, *LOADER_OUT):
            o["name"], o["type"] = nm, tp
            if "slot_index" in o: o["slot_index"] = keep.index(o)
        n["outputs"] = keep
        if dropped:
            print(f"  ! node {n.get('id')} (wxLoraLoaderTrigger): cables removed with the outputs that are gone: {dropped}")
        changed.append(f"{n.get('id')}:wxLoraLoaderTrigger:outputs")
    return changed


def fix_loader_inputs(d):
    """WLoad Lora & Trigger, the sockets of the widgets: the switch takes today's name, the sockets of the boxes that are
    gone are dropped (a cable on one of them is removed and reported), the cables after them move up."""
    changed = []
    for n in d["nodes"]:
        ins = n.get("inputs")
        if n.get("type") != "wxLoraLoaderTrigger" or not isinstance(ins, list):
            continue
        touched = False
        for i in ins:
            if i.get("name") in ("rg3info", "civitai") and isinstance(i.get("widget"), dict):
                i["name"] = i["widget"]["name"] = "rgthree_info"
                if "localized_name" in i:
                    i["localized_name"] = "rgthree_info"
                touched = True
        for idx in range(len(ins) - 1, -1, -1):
            i = ins[idx]
            if i.get("name") not in LOADER_GONE or not isinstance(i.get("widget"), dict):
                continue
            if i.get("link") is not None:
                print(f"  ! node {n.get('id')} (wxLoraLoaderTrigger): the cable on `{i.get('name')}` is removed with its box")
                d["links"][:] = [l for l in d.get("links") or [] if l[0] != i["link"]]
            del ins[idx]
            for l in d.get("links") or []:
                if str(l[3]) == str(n.get("id")) and l[4] > idx:
                    l[4] -= 1
            touched = True
        if touched:
            changed.append(f"{n.get('id')}:wxLoraLoaderTrigger:inputs")
    return changed


def fix_switch_outputs(d):
    """WSwitch saved before the `index` output: `index` goes in front, every cable of the node moves one slot further."""
    changed = []
    for n in d["nodes"]:
        outs = n.get("outputs")
        if n.get("type") != "wxSwitch" or not isinstance(outs, list) or any(o.get("name") == "index" for o in outs):
            continue
        for l in d.get("links") or []:
            if str(l[1]) == str(n.get("id")):
                l[2] += 1
        for j, o in enumerate(outs):
            o["name"] = f"out_{j + 1}"
            if "slot_index" in o:
                o["slot_index"] = j + 1
        outs.insert(0, {"name": "index", "type": "INT", "links": None})
        changed.append(f"{n.get('id')}:wxSwitch:outputs")
    return changed


def fix_widgets(d):
    changed = []
    for n in d["nodes"]:
        t, wv = n.get("type"), n.get("widgets_values")
        if not isinstance(wv, list):
            continue
        before = list(wv)
        named_before = json.dumps(n.get("widgets_values_named"), sort_keys=True)
        if t == "wxLoraLoaderTrigger":
            # layouts: A = [name, sm, sc, civ, where, sep, picked, (picker)] (before the control, 7-8 values);
            # B = [name, ctl, sm, sc, civ, where, sep, picked, (picker)] (0.3.4 file, 8-9); C = the 12 of 0.3.6-0.4.x (+ picker / holes).
            # C is told by `lora scope` and `strength control` in their slots: the control slot may hold rubbish
            # (a file in layout A opened by 0.3.5 and saved put the strength there, and true/false in strength_model).
            # D = the 12 of the first `folder` build (never released): [folder, name, ctl, scope, sm, walk, step, sc, rgthree_info,
            # where, sep, picked]. Every layout ends in today's 9: [folder, name, ctl, sm, sc, rgthree_info, where, sep, picked].
            kept = [v for v in wv if v is not None]
            now = next((c for c in (wv, kept) if loader_todays(c)), None)
            if now is not None:
                wv[:] = now[:9]
            elif loader_d(kept):
                wv[:] = kept[:12]
            else:
                if len(kept) >= 11 and kept[2] in SCOPE and kept[4] in WALK and (len(kept) == 11 or isinstance(kept[7], bool)):
                    wv[:] = kept                                                       # C': saved between the end of `until` and `folder`
                    wv.insert(6, 1.0)                                                  # (told from C by the switch in slot 7, a hole may follow)
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
                # C -> D: `folder` in front, `strength_until` (slot 6) out; the switch keeps its slot and its value
                wv[:] = ["(all)"] + wv[:6] + wv[7:12]
            if now is None:                                                            # D (12 values) -> today's 9
                wv += [None] * (12 - len(wv))
                for i, dflt in ((4, 1.0), (6, 0.1), (7, 1.0)):
                    if not _num_val(wv[i]):
                        wv[i] = dflt
                if wv[3] not in SCOPE: wv[3] = "any"
                if wv[5] not in WALK: wv[5] = "fixed"
                if wv[3] != "any" or wv[5] != "fixed":
                    print(f"  ! node {n.get('id')} (wxLoraLoaderTrigger): lora scope = {wv[3]}, strength walk = {wv[5]} (step {wv[6]}) are gone: "
                          f"cable a WFloat on strength_model for the walk, pick the folder in `folder` for the scope")
                wv[:] = [wv[0], wv[1], wv[2], wv[4], wv[7], wv[8], wv[9], wv[10], wv[11]]   # `lora scope`, walk and step out
            wv += [None] * (9 - len(wv))
            for i in (3, 4):
                if not _num_val(wv[i]):
                    wv[i] = 1.0
            if wv[2] not in CTRL: wv[2] = "fixed"
            if not isinstance(wv[5], bool): wv[5] = True
            if wv[6] not in ("prefix", "suffix"): wv[6] = "prefix"
            if not isinstance(wv[7], str): wv[7] = ", "
            if not isinstance(wv[8], str): wv[8] = ""
            named = n.get("widgets_values_named")
            if isinstance(named, dict) and len(wv) == 9:                              # the names must tell the same story
                named.update(zip(LOADER_NAMES, wv))
                for gone in LOADER_GONE:
                    named.pop(gone, None)
        elif t == "wxFloat":                                                       # 0.4.0 saved [value, control, step, until]: `until` is gone
            named = n.get("widgets_values_named")
            if len(wv) == 4 and wv[1] in WALK and _num_val(wv[3]):
                del wv[3]
            if isinstance(named, dict):
                named.pop("until", None)
        elif t in HOLED:
            wv[:] = [v for v in wv if v is not None]
            if t == "wxFrame" and len(wv) > 14 and isinstance(wv[13], str):        # the colour pad saved a copy of pad_color
                del wv[13]
            if t == "h3PromptComposer" and len(wv) > 5 and isinstance(wv[2], str) and not _num(wv[2]):
                del wv[2]                                                          # the beats table saved a copy of beats_json
        if wv != before or (t in ("wxLoraLoaderTrigger", "wxFloat") and json.dumps(n.get("widgets_values_named"), sort_keys=True) != named_before):
            changed.append(f"{n.get('id')}:{t}")
    return changed


def in_subgraphs(d, fix):
    """Run a fix inside every subgraph too. There the links are objects, not lists: the fix sees them as lists
    [id, origin_id, origin_slot, target_id, target_slot, type] and what it moved or removed is written back."""
    changed = []
    for sg in (d.get("definitions") or {}).get("subgraphs") or []:
        if not isinstance(sg.get("nodes"), list):
            continue
        objs = [l for l in sg.get("links") or [] if isinstance(l, dict)]
        view = {"nodes": sg["nodes"], "links": [[l.get("id"), l.get("origin_id"), l.get("origin_slot"), l.get("target_id"),
                                                 l.get("target_slot"), l.get("type")] for l in objs]}
        got = fix(view)
        left = {l[0]: l for l in view["links"]}
        for o in objs:
            if o.get("id") in left:
                o["origin_slot"], o["target_slot"] = left[o["id"]][2], left[o["id"]][4]
        if objs:
            sg["links"] = [l for l in sg["links"] if not isinstance(l, dict) or l.get("id") in left]
        changed += [f"{sg.get('name') or 'subgraph'}/{c}" for c in got]
    return changed


def migrate(path):
    d = json.load(open(path, encoding="utf-8"))
    if not isinstance(d.get("nodes"), list):
        print("not a workflow:", path)
        return
    out = (fix_outputs(d) + fix_loader_outputs(d) + fix_loader_inputs(d) + fix_switch_outputs(d) + in_subgraphs(d, fix_outputs)
           + in_subgraphs(d, fix_loader_outputs) + in_subgraphs(d, fix_loader_inputs) + in_subgraphs(d, fix_switch_outputs))
    wid = fix_widgets(d) + in_subgraphs(d, fix_widgets)
    if not out and not wid and d.get("wextraui_outputs") == "0.5.0":
        print("already in line:", path)
        return
    d["wextraui_outputs"] = "0.5.0"
    shutil.copy(path, path + ".bak")
    json.dump(d, open(path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"updated: {path}  (outputs: {len(out)} node(s) {out}; widgets: {len(wid)} node(s) {wid})")


if __name__ == "__main__":
    for p in sys.argv[1:]: migrate(p)
