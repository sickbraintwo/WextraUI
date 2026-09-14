"""WSimple Prompt H3 - a MiniMax H3 prompt without time-codes: the action in chronological order, plus the
things that must always be there (camera, sound, what is fixed and what moves, the final state, what to avoid).
The order of the sentences is the timeline; time-codes only when a beat must land at an exact second
(that is WScene Composer H3). Empty fields are skipped."""

SECTIONS = [
    # (input name, label in the prompt or None for bare text, tooltip)
    ("scene", None,
     "What we see before anything happens: place, subject, materials, light, look. Bare text, goes first."),
    ("action", None,
     "What happens, in chronological order, with connectives (first... then... finally...). "
     "The order is the timeline: no time-codes here."),
    ("camera", "Camera",
     "One camera idea for the whole clip. If it must not move, say it in full: "
     "'no camera movement whatsoever' (a single push-in makes H3 drift on the whole clip)."),
    ("sound", "Sound",
     "The sound born with the picture: timbre and texture (never 'a strange sound'), and what stays silent."),
    ("stays_fixed", "What stays fixed",
     "What must not move or change: H3 assumes the human scheme (head still, body still) unless told."),
    ("what_moves", "What moves",
     "What moves, and how: non-standard anatomies and mechanics (a jaw that stays while the skull bounces) are not deduced from the geometry, say them."),
    ("final_state", "Final state",
     "How the clip ends. With a last frame, declare the return: 'everything back to the exact pose of Image 1'."),
]


class H3SimplePrompt:
    @classmethod
    def INPUT_TYPES(cls):
        req = {}
        for name, _label, tip in SECTIONS:
            req[name] = ("STRING", {"multiline": True, "default": "", "tooltip": tip})
        for i in (1, 2, 3):
            req[f"avoid{i}"] = ("STRING", {"default": "", "tooltip": "One thing that must not appear. Naming a thing can evoke it: short, and no more than three."})
        return {"required": req}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "compose"
    CATEGORY = "WextraUI"
    OUTPUT_NODE = True
    DESCRIPTION = ("MiniMax H3 prompt without time-codes: scene + action in chronological order + Camera + Sound + "
                   "what is fixed / what moves + final state + up to three things to avoid. Empty fields are skipped.")

    def compose(self, **kw):
        parts = []
        for name, label, _tip in SECTIONS:
            text = (kw.get(name) or "").strip()
            if not text:
                continue
            parts.append(f"{label}: {text}" if label else text)
        avoid = [a.strip().rstrip(".") for a in (kw.get(f"avoid{i}") or "" for i in (1, 2, 3)) if a.strip()]
        if avoid:
            parts.append("Avoid: " + "; ".join(avoid) + ".")
        prompt = "\n\n".join(parts)
        return {"ui": {"prompt": [prompt]}, "result": (prompt,)}
