"""MM H3 Collect Scenes — the ordered list of H3_SCENE objects for the loop.

The loop body indexes this list with its scene index (MM H3 Scene
Conditioning does that itself), so no per-field lists / indexAnything
nodes are needed any more. `summary` is a human-readable table for a
show-text node (and for the technical diary).
"""
from .h3_timing import seconds_to_h3_frames, h3_frames_to_seconds

MAX_SCENES = 20


def scene_line(i, s):
    frames = seconds_to_h3_frames(s["duration"])
    parts = [f"first_frame={ {'previous': 'previous_scene', 'image': 'first_frame'}.get(s['start'], s['start']) }"]
    if s.get("end_image") is not None:
        parts.append("last_frame=image")
    if s.get("guide_image") is not None or s.get("guide_audio") is not None:
        what = "+".join(k for k in ("image", "audio") if s.get(f"guide_{k}") is not None)
        parts.append(f"guide={what}@{s['guide_at']:g}s")
    if s.get("ref_images"):
        parts.append(f"refs={len(s['ref_images'])}")
    if s.get("ref_audio") is not None:
        parts.append("ref_audio")
    return (f"scene {i}: {s['duration']:g}s -> {frames} frames ({h3_frames_to_seconds(frames):.2f}s), "
            f"seed {s['seed']}, " + ", ".join(parts))


class H3CollectScenes:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                ("scene%d" % i): ("H3_SCENE",) for i in range(1, MAX_SCENES + 1)
            },
        }

    RETURN_TYPES = ("H3_SCENES", "INT", "STRING")
    RETURN_NAMES = ("scenes", "total_scenes", "summary")
    FUNCTION = "collect"
    CATEGORY = "WextraX"
    DESCRIPTION = "Collects MM H3 Scene objects, in socket order, into the list the loop runs over."

    def collect(self, **kwargs):
        scenes = [kwargs[("scene%d" % i)] for i in range(1, MAX_SCENES + 1) if kwargs.get("scene%d" % i) is not None]
        if not scenes:
            raise ValueError("No scenes connected: wire in at least one MM H3 Scene node.")
        summary = "\n".join(scene_line(i, s) for i, s in enumerate(scenes))
        return (scenes, len(scenes), summary)
