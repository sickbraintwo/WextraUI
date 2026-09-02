from .tag import Tag
from .loraName import LoraName
from .saveWimage import SaveWimage
from .h3PromptComposer import H3PromptComposer
from .h3Scene import H3Scene
from .h3CollectScenes import H3CollectScenes
from .h3LoopRange import H3LoopRange
from .h3Conditioning import H3ConditioningAllInOne
from .h3SceneConditioning import H3SceneConditioning
from .h3HandoffTail import H3HandoffTail

# Retired (kept in src/legacy/, not registered): h3ImageToVideo (switchable),
# h3HandoffGate, h3SceneListBuilder — all absorbed by H3SceneConditioning (26/08/2026).

NODE_CLASS_MAPPINGS = {
    "tag": Tag,
    "loraName": LoraName,
    "saveWimage": SaveWimage,
    "h3PromptComposer": H3PromptComposer,
    "h3Scene": H3Scene,
    "h3CollectScenes": H3CollectScenes,
    "h3LoopRange": H3LoopRange,
    "h3Conditioning": H3ConditioningAllInOne,
    "h3SceneConditioning": H3SceneConditioning,
    "h3HandoffTail": H3HandoffTail,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "tag": "Extract Tag from list",
    "loraName": "Extract Lora Name",
    "saveWimage": "Save Wimage",
    "h3PromptComposer": "MM H3 Scene Prompt Time Composer",
    "h3Scene": "MM H3 Scene",
    "h3CollectScenes": "MM H3 Collect Scenes",
    "h3LoopRange": "MM H3 Loop Range (start / count)",
    "h3Conditioning": "MM H3 Conditioning (all-in-one: first/last + guide + refs)",
    "h3SceneConditioning": "MM H3 Scene Conditioning (loop body)",
    "h3HandoffTail": "MM H3 Handoff Tail (loop end)",
}
