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
