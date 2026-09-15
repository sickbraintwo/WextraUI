from .src.node import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

WEB_DIRECTORY = "./web"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']

# Two lines in the ComfyUI console, set apart by a blank line above and below, a little to the right.
# Colours of the logo: W red, "interaction" white, the rest blue. Basic ANSI codes only.
# On Windows the text goes straight to the console (CONOUT$): ComfyUI and ComfyUI-Manager wrap stdout and the
# colour codes do not survive the trip. Version read from pyproject, nodes counted for real.
import os as _os, re as _re, sys as _sys
try:
    _v = _re.search(r'^version\s*=\s*"([^"]+)"', open(_os.path.join(_os.path.dirname(__file__), "pyproject.toml"), encoding="utf-8").read(), _re.M).group(1)
except Exception:
    _v = "?"
_RED, _WHITE, _BLUE, _OFF, _PAD = "\033[91m", "\033[97m", "\033[94m", "\033[0m", " " * 32
_BANNER = (f"\n{_PAD}{_RED}W{_WHITE}interaction{_BLUE} Lab presents:{_OFF}\n"
           f"{_PAD}{_BLUE}[{_RED}W{_BLUE}extraUI] {_v} · {len(NODE_CLASS_MAPPINGS)} nodes{_OFF}\n\n")

def _say(text):
    if _sys.platform == "win32":
        try:
            import ctypes as _ct
            _k = _ct.windll.kernel32
            _h = _k.GetStdHandle(-11)
            _m = _ct.c_uint32()
            if _k.GetConsoleMode(_h, _ct.byref(_m)):
                _k.SetConsoleMode(_h, _m.value | 0x0004)      # ENABLE_VIRTUAL_TERMINAL_PROCESSING
            with open("CONOUT$", "w", encoding="utf-8") as _con:
                _con.write(text)
            return
        except Exception:
            pass
    print(text, end="")

_say(_BANNER)
