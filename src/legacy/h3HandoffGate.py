class H3HandoffGate:
    """Picks the conditioning for the current scene of the loop.

    Scene 0 has no previous clip, so its hand-off anchor (MiniMaxH3AddGuide
    fed with the keyframe + silence) must NOT be used: pass the plain
    conditioning. Every later scene (including the first one of a resumed
    run, whose anchor comes from the resume clip) uses the anchored one.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "scene_index": ("INT", {"forceInput": True}),
                "plain": ("CONDITIONING",),
                "anchored": ("CONDITIONING",),
            },
        }

    RETURN_TYPES = ("CONDITIONING", "BOOLEAN")
    RETURN_NAMES = ("positive", "handoff_used")
    FUNCTION = "pick"
    CATEGORY = "WextraX"

    def pick(self, scene_index, plain, anchored):
        if int(scene_index) == 0:
            return (plain, False)
        return (anchored, True)
