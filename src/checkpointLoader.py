"""WCheckpoint — the core Load Checkpoint with a `folder` menu above the name, a `selection` drop-down under it and the
seed-style control under the name. Same load as the core node (MODEL, CLIP, VAE), plus the clean name as a string for
WSave Image. Queue several runs with `increment` and each one takes the next checkpoint of the folder chosen (or of the
names ticked in `selection`, in their order): one prompt, every model of a family, in one go."""
import nodes
import folder_paths
from .wxFolders import ALL_FOLDERS, SELECTION, folders_of, clean_name
from .wxCarry import CARRY, CARRY_IN, CARRY_OUT_TOOLTIP


class CheckpointLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            # All in `optional`, `folder` first, so that the menu sits above the name (widgets are drawn required then
            # optional, in declared order) and an API prompt written without `folder` is still valid as it is.
            # `selection` is declared after the name (its row is moved under `folder` by the frontend): a workflow saved
            # before it, read by position, still lines up.
            "optional": {
                "folder": (folders_of("checkpoints"), {"default": ALL_FOLDERS, "tooltip": "Narrows the checkpoint menu, and the walk of increment / decrement / randomize, to one folder and what is under it. The label shows where you are in that folder (3/12): the runs to queue. Lives in the node: the backend ignores it."}),
                "ckpt_name": (folder_paths.get_filename_list("checkpoints"), {"tooltip": "The checkpoint (model) to load. The control under it walks the folder across queued runs (increment / decrement / randomize); the selection drop-down above narrows the menu and the walk to the names you tick, in the order you give them.", "control_after_generate": "fixed"}),   # fixed / increment / decrement / randomize, like the seed
                "selection": SELECTION,
                "carry": CARRY_IN,
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "STRING", CARRY)
    RETURN_NAMES = ("MODEL", "CLIP", "VAE", "name", "carry")
    OUTPUT_TOOLTIPS = ("The model used for denoising latents (same code as the core Load Checkpoint).",
                       "The CLIP model used for encoding text prompts.",
                       "The VAE model used for encoding and decoding images to and from latent space.",
                       "Clean checkpoint name (no folder, no extension): a part for WSave Image.", CARRY_OUT_TOOLTIP)
    FUNCTION = "load"
    CATEGORY = "WextraUI"
    DESCRIPTION = ("The core Load Checkpoint with a folder menu above the name, a selection drop-down under it and the seed-style control under the name: "
                   "increment / decrement / randomize walk the checkpoints of the folder chosen (or the names you tick in the selection, in their order) across queued runs. "
                   "Same load as the core node (MODEL, CLIP, VAE), plus the clean name as a string.")

    @classmethod
    def VALIDATE_INPUTS(cls, folder=ALL_FOLDERS):   # naming `folder` here takes it out of the menu check: a folder that is gone must not stop a run
        return True

    def load(self, ckpt_name=None, **_):   # **_ = what lives in the node (folder, selection, carry): accepted, ignored
        if not ckpt_name:   # an API prompt without a name: say so, do not guess a model
            raise ValueError("WCheckpoint: no checkpoint named (ckpt_name is empty)")
        model, clip, vae = nodes.CheckpointLoaderSimple().load_checkpoint(ckpt_name)
        name = clean_name(ckpt_name)
        return (model, clip, vae, name, name)
