# Wif

The **if that picks an input**, the mirror of *WRoute*: one boolean decides, for one or more pairs, which input of the pair goes out. As Easy-Use **If else**: the inputs are **lazy**, so only the branches chosen run; the nodes behind the others are not even asked for (no VRAM, no seconds).

## Use
- `count`: how many **pairs** the same `if` drives, 1 to 20. Each pair has a `true`, a `false` and its own output; the inputs follow the number, each pair in a frame of its own (`true k` over `false k`). Lowering it takes the last pairs away, with their cables.
- `if`: `true` → every `true k` goes out of output `k`, `false` → every `false k`. Connect a BOOLEAN to decide at run time.
- `true k`, `false k`: anything (image, latent, model, string, conditioning…). With one pair they read `true`, `false` and the output `value`.
- It joins again the branches of a *WRoute* driven by the same boolean: the blocked branch is never pulled. With more pairs, one switch carries the model, the prompt and the size of the same choice together.

A **line inside the node** goes from each input chosen to its output, curving up from its frame. When an input chosen has no cable its line turns red and dashed, and under the last output the node reads **nothing runs** (with more pairs, the outputs that get nothing: `2, 4: nothing runs`): nothing downstream of that output runs, no error. With `if` on a cable the lines show when the graph can tell the boolean before the run (a Boolean box, also through Reroute and Set / Get).

The node is born as narrow as it can; *WIndex* is the same with a number.
