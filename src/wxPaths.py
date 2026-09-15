"""WextraUI — the only way a node turns a user string into a file path.
Everything a node reads or writes stays under ComfyUI's own folders (output, input): a relative path is resolved under
them, an absolute path is accepted only when it already points inside one of them, and `..` cannot climb out.
Registry policy: no arbitrary file read, no path traversal."""
import os

import folder_paths


def roots():
    """The folders a node may touch, real paths, in the order they are searched."""
    out = []
    for get in (folder_paths.get_output_directory, folder_paths.get_input_directory):
        try:
            out.append(os.path.realpath(get()))
        except Exception:
            pass
    return out


def inside(path, root):
    real = os.path.realpath(path)
    return real == root or real.startswith(root + os.sep)


def resolve_read(path):
    """A file to read, named by the user: under output/ or input/ (relative to them, or absolute inside them).
    Returns the real path, or None when the file is not there or not allowed."""
    path = (path or "").strip().strip('"').strip("'")
    if not path:
        return None
    allowed = roots()
    if os.path.isabs(path):
        return os.path.realpath(path) if os.path.isfile(path) and any(inside(path, r) for r in allowed) else None
    for r in allowed:
        cand = os.path.join(r, path)
        if os.path.isfile(cand) and inside(cand, r):
            return os.path.realpath(cand)
    return None


def clean_subfolder(folder):
    """A sub-folder name for output/: separators normalised, no drive, no leading slash, no `..` segment."""
    folder = (folder or "").strip().replace("\\", "/")
    if ":" in folder:
        folder = folder.split(":", 1)[1]
    parts = [p for p in folder.split("/") if p not in ("", ".", "..")]
    return "/".join(parts)


def output_dir(subfolder=""):
    """The output folder (or a sub-folder of it), created, guaranteed inside output/."""
    root = os.path.realpath(folder_paths.get_output_directory())
    target = os.path.join(root, *clean_subfolder(subfolder).split("/")) if clean_subfolder(subfolder) else root
    if not inside(target, root):
        raise ValueError(f"WextraUI: folder '{subfolder}' would leave ComfyUI/output")
    os.makedirs(target, exist_ok=True)
    return target
