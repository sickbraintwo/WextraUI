import json


class H3SceneListBuilder:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "scenes_json": ("STRING", {
                    "multiline": True,
                    "default": json.dumps([
                        {"name": "SCENE1", "prompt": "", "duration": 8.0, "seed": 0, "use_last_frame": False},
                        {"name": "SCENE2", "prompt": "", "duration": 8.0, "seed": 0, "use_last_frame": True},
                    ], indent=2),
                }),
            },
        }

    RETURN_TYPES = ("STRING", "FLOAT", "INT", "INT", "INT")
    RETURN_NAMES = ("prompts", "durations", "seeds", "use_last_frame", "total_scenes")
    OUTPUT_IS_LIST = (True, True, True, True, False)
    FUNCTION = "build"
    CATEGORY = "WextraX"

    def build(self, scenes_json):
        try:
            scenes = json.loads(scenes_json)
        except json.JSONDecodeError as e:
            raise ValueError(f"scenes_json is not valid JSON: {e}")

        if not scenes:
            raise ValueError("scenes_json is empty: at least one scene is required.")

        prompts = [s.get("prompt", "") for s in scenes]
        durations = [float(s.get("duration", 0)) for s in scenes]
        seeds = [int(s.get("seed", 0)) for s in scenes]
        use_last_frame = [1 if s.get("use_last_frame") else 0 for s in scenes]

        return (prompts, durations, seeds, use_last_frame, len(scenes))
