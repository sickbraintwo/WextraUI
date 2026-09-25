"""WextraUI — the `folder` menu of the loaders (WLoRA, WCheckpoint).
The folders of a model list at every depth, as the menu shows them: (all), Krea2, Krea2 / Characters, Krea2 / Characters / Heroes, ...
The menu only lives in the node (it narrows the name menu and the walk of the control after generate, in the frontend):
the backend ignores it, a folder that is gone must never stop a run."""
import folder_paths

ALL_FOLDERS = "(all)"


def folders_of(kind):
    """`kind` is a model folder ComfyUI itself lists ("loras", "checkpoints"): the names go through folder_paths, never a path."""
    seen = set()
    for f in folder_paths.get_filename_list(kind):
        parts = f.replace("\\", "/").split("/")[:-1]
        for depth in range(1, len(parts) + 1):
            seen.add(" / ".join(parts[:depth]))
    return [ALL_FOLDERS] + sorted(seen, key=str.lower)


def clean_name(name):
    """The file name without folders and extension: `Krea2/Characters/hero_v2.safetensors` -> `hero_v2`."""
    return (name or "").replace("\\", "/").rsplit("/", 1)[-1].rsplit(".", 1)[0]
