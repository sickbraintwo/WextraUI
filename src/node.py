from .saveWimage import SaveWimage
from .h3PromptComposer import H3PromptComposer
from .h3Scene import H3Scene
from .h3CollectScenes import H3CollectScenes
from .h3LoopRange import H3LoopRange
from .h3SceneConditioning import H3SceneConditioning
from .h3HandoffTail import H3HandoffTail
from .route import Route, RouteIndex
from .runDiff import RunDiff
from .loraLoader import LoraLoaderTrigger
from .frame import Frame

# Retired (kept in src/legacy/, not registered): h3ImageToVideo (switchable), h3HandoffGate, h3SceneListBuilder
# — absorbed by H3SceneConditioning (26/08/2026); h3Conditioning (all-in-one, out of the loop) — never used, the loop
# body does it (04/09/2026; the file stays: h3SceneConditioning imports its builder); tag, loraName, loraInfo (the node,
# now in legacy/loraInfo_node.py) — replaced by Lora Loader Trigger (04/09/2026).

NODE_CLASS_MAPPINGS = {
    "saveWimage": SaveWimage,
    "h3PromptComposer": H3PromptComposer,
    "h3Scene": H3Scene,
    "h3CollectScenes": H3CollectScenes,
    "h3LoopRange": H3LoopRange,
    "h3SceneConditioning": H3SceneConditioning,
    "h3HandoffTail": H3HandoffTail,
    "wxRoute": Route,
    "wxRouteIndex": RouteIndex,
    "wxRunDiff": RunDiff,
    "wxLoraLoaderTrigger": LoraLoaderTrigger,
    "wxFrame": Frame,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "saveWimage": "WSave Image",
    "h3PromptComposer": "WScene Composer H3",
    "h3Scene": "WScene H3",
    "h3CollectScenes": "WScenes Collection H3",
    "h3LoopRange": "WLoop Start H3",
    "h3SceneConditioning": "WLoop Scene Conditioning H3",
    "h3HandoffTail": "WLoop End H3",
    "wxRoute": "WRoute",
    "wxRouteIndex": "WRouteIndex",
    "wxRunDiff": "WDifference",
    "wxLoraLoaderTrigger": "WLoad Lora & Trigger",
    "wxFrame": "WFrame",
}
