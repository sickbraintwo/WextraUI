from .src.node import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

WEB_DIRECTORY = "./web"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']

# Two lines in the ComfyUI console, set apart by a blank line above and below, a little to the right.
# Plain text on purpose: no ANSI codes, no ctypes (the Registry scanner does not like console tricks).
# Version read from pyproject, nodes counted for real.
import os as _os, re as _re
try:
    _v = _re.search(r'^version\s*=\s*"([^"]+)"', open(_os.path.join(_os.path.dirname(__file__), "pyproject.toml"), encoding="utf-8").read(), _re.M).group(1)
except Exception:
    _v = "?"
_PAD = " " * 32
print(f"\n{_PAD}Winteraction Lab presents:\n{_PAD}[WextraUI] {_v} · {len(NODE_CLASS_MAPPINGS)} nodes\n")
