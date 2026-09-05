# WRoute

The **if the other way round**: one input, two outputs, a boolean decides which output carries the value. The branch not chosen **does not run at all** — every node downstream of it, Save nodes included, is skipped silently.

## Why this is rare
ComfyUI is pull-based: a node runs only when something downstream asks for its output. That is why almost every switch in the ecosystem picks an *input*. Picking an *output* needs the `ExecutionBlocker` the core provides for exactly this case: the unused output returns a blocker and the graph behind it is pruned.

## Use
- `value` — anything (image, latent, model, string, conditioning…).
- `route` — `true` → out of **A**, `false` → out of **B**. Connect a BOOLEAN (a Compare node, a toggle, an output of another node) to decide at run time.
- Each branch must be complete on its own, up to its Save / Preview node.

*WRouteIndex* is the same with a number.

## Joining the two branches again
Downstream of Route the two branches may be merged into ONE Save / Preview node — but only through a **lazy** switch driven by the *same* boolean: the core **If/Else Switch** (`utilities/logic`, ComfyUI ≥ 0.34) or Easy-Use **if-else**. These ask only for the branch the boolean picks, so the blocked one is never pulled.
A non-lazy "if" (e.g. ComfyUI-Logic **If**) evaluates *both* inputs, receives the blocker on the unused one and is skipped itself, together with everything after it — **no error, no file saved**. That is the core rule, not a bug of either node: a blocker on any evaluated input blocks the node.
