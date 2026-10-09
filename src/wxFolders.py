"""WextraUI — the menus that narrow a name menu: `folder` of the loaders (WLoRA, WCheckpoint) and `selection`
(WSampler, WScheduler, and the loaders under `folder`).
`folder`: the folders of a model list at every depth, as the menu shows them: (all), Krea2, Krea2 / Characters, Krea2 / Characters / Heroes, ...
`selection`: the names ticked in the drop-down, in the order given (a JSON list filled by the widget).
Both only live in the node (they narrow the name menu and the walk of the control after generate, in the frontend):
the backend ignores them, a folder that is gone must never stop a run."""
import folder_paths

ALL_FOLDERS = "(all)"
SELECTION = ("STRING", {"default": "", "tooltip": "The names ticked in the selection drop-down, in the order you gave them (JSON list, filled by the widget). Empty = all. Lives in the node: the backend ignores it."})


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
