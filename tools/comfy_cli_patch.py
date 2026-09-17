# Copy of the local patch WextraUI runs in its comfy-mcp venv (loaded by a one-line .pth: `import wx_comfy_cli_patch`).
# Kept here as the reference for the upstream issue on Comfy-Org/comfy-cli; not imported by the node pack.
"""WextraUI / MMM — local patch for comfy-cli in this venv. Loaded at interpreter start by `wextraui_patch.pth`
(so it applies to `comfy.exe` and to every subprocess comfy-mcp spawns). See `ComfyUI\\comfy-mcp\\PATCH.md`.

comfy-cli 1.18.0 (and `main` on 2026-09-15) skips only the frontend's own virtual nodes when it translates a UI
workflow to API format (Note, MarkdownNote, PrimitiveNode, GetNode, SetNode, Reroute). rgthree's decorative nodes
(Bookmark, Label, Fast Groups Muter...) have no Python class and Comfy never executes them, yet the translator emits
them and `validate` / `run` stop on `unknown_class_type`. Two fixes, both harmless once upstream adopts them:
  1. rgthree's virtual types join the two UI-only sets (translator and workflow_ops);
  2. any node absent from object_info that has neither inputs nor outputs is dropped before conversion
     (decorative by construction), with one log line naming it.
"""
import logging

_log = logging.getLogger("wextraui.comfy_cli_patch")
RGTHREE_VIRTUAL = frozenset({
    "Bookmark (rgthree)", "Label (rgthree)", "Fast Groups Muter (rgthree)", "Fast Groups Bypasser (rgthree)",
    "Fast Muter (rgthree)", "Fast Bypasser (rgthree)", "Fast Actions Button (rgthree)",
})

try:
    from comfy_cli import workflow_ops as _ops
    from comfy_cli import workflow_to_api as _wta

    _wta._UI_ONLY_NODE_TYPES = frozenset(_wta._UI_ONLY_NODE_TYPES | RGTHREE_VIRTUAL)
    _ops.UI_ONLY_NODE_TYPES = frozenset(_ops.UI_ONLY_NODE_TYPES | RGTHREE_VIRTUAL)

    _orig_convert = _wta.convert_ui_to_api

    def convert_ui_to_api(workflow, object_info):
        if (isinstance(workflow, dict) and isinstance(workflow.get("nodes"), list)
                and isinstance(object_info, dict) and not _wta.is_api_format(workflow)):
            keep, dropped = [], []
            for n in workflow["nodes"]:
                t = n.get("type") if isinstance(n, dict) else None
                if (t and t not in object_info and t not in _wta._UI_ONLY_NODE_TYPES
                        and not n.get("inputs") and not n.get("outputs") and not _wta.is_subgraph_uuid(t)):
                    dropped.append(f"{n.get('id')}:{t}")
                    continue
                keep.append(n)
            if dropped:
                _log.info("wextraui patch: skipping %d decorative node(s) unknown to object_info: %s",
                          len(dropped), ", ".join(dropped))
                workflow = dict(workflow, nodes=keep)
        return _orig_convert(workflow, object_info)

    convert_ui_to_api.__doc__ = _orig_convert.__doc__
    convert_ui_to_api.__wrapped__ = _orig_convert
    _wta.convert_ui_to_api = convert_ui_to_api
    WEXTRAUI_PATCHED = True
except Exception as e:  # never break the interpreter because of a patch
    WEXTRAUI_PATCHED = False
    _log.debug("wextraui patch not applied: %s", e)


# ---- patch 2 (2026-09-17, ZProject on Sick's order — see PATCH.md § Toppa n.2): two more gaps of the UI→API translator,
# both measured on Sick's k2_t2i_int8 against the frontend's own "Save (API)" export ----
try:
    from comfy_cli import workflow_to_api as _wta2

    _T = _wta2._Tracers
    _orig_trace_get_set = _T.trace_get_set
    _orig_trace_bypassed = _T.trace_bypassed

    def _wx_set_var(node):
        w = node.get("widgets_values") if isinstance(node, dict) else None
        return w[0] if isinstance(w, list) and w and isinstance(w[0], str) and w[0] else None

    def _wx_out_type(self, nid, slot):
        node = self.node_by_id.get(str(nid))
        outs = (node or {}).get("outputs") or []
        try:
            i = int(slot) if slot is not None else 0
        except (TypeError, ValueError):
            i = 0
        return outs[i].get("type") if 0 <= i < len(outs) and isinstance(outs[i], dict) else None

    def trace_get_set(self, src_id, src_slot):
        # (A) a link that leaves a SetNode's pass-through OUTPUT: hop to the value the SetNode publishes
        # (upstream only hops GetNode -> SetNode -> source, so such a consumer ends up with no input at all).
        seen = set()
        while True:
            src_id, src_slot = _orig_trace_get_set(self, src_id, src_slot)
            node = self.node_by_id.get(str(src_id))
            var = _wx_set_var(node) if isinstance(node, dict) and node.get("type") == "SetNode" else None
            key = str(src_id)
            if var is None or var not in self.set_sources or key in seen:
                return src_id, src_slot
            seen.add(key)
            src_id, src_slot = self.set_sources[var]

    def trace_bypassed(self, src_id, src_slot):
        # (B) a bypassed node whose output type has no input of a compatible type: the frontend leaves that output
        # unplugged (the consumer keeps its widget default); upstream's rule 4 forwards "the first linked input
        # regardless of type", which the executor then rejects (received_type mismatch) and drops the whole output.
        want = _wx_out_type(self, src_id, src_slot)
        rid, rslot = _orig_trace_bypassed(self, src_id, src_slot)
        if want is None or str(rid) in self.bypassed or str(rid) not in self.node_by_id:
            return rid, rslot
        got = _wx_out_type(self, rid, rslot)
        if got is None or _wta2._is_valid_connection(got, want):
            return rid, rslot
        _log.info("wextraui patch2: bypassed node %s output %s (%s) has no input of that type: left unplugged "
                  "instead of %s:%s (%s)", src_id, src_slot, want, rid, rslot, got)
        return src_id, src_slot  # still the bypassed node: the caller drops the link, the widget default applies

    trace_get_set.__wrapped__ = _orig_trace_get_set
    trace_bypassed.__wrapped__ = _orig_trace_bypassed
    _T.trace_get_set = trace_get_set
    _T.trace_bypassed = trace_bypassed
    WEXTRAUI_PATCH2 = True
except Exception as e:  # never break the interpreter because of a patch
    WEXTRAUI_PATCH2 = False
    _log.debug("wextraui patch2 not applied: %s", e)
