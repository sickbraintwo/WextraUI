"""`carry` — the odometer cable between the nodes that walk (WSampler, WScheduler, WCheckpoint, WLoRA,
WFloat). A node on `increment-wrap` turns by itself; each time it comes back from the last name to the first it sends one
beat down its `carry` output, and the node at the other end of the cable moves one step of its own. The whole mechanism
lives in the interface (web/wxCarry.js), between one queued run and the next, where the walk already lives: here the
cable is only a type of its own that passes a string, so that the backend, comfy-cli and an agent see an ordinary link."""

CARRY = "WX_CARRY"

CARRY_IN = (CARRY, {"tooltip": "The odometer: cable here the carry output of a node on increment-wrap, and this node moves one step (its control says how: fixed / increment = forward, decrement = back, randomize = a random one) each time that node comes round from the last name to the first. The label counts the runs of the whole chain. Lives in the interface: the backend only passes a string."})

CARRY_OUT_TOOLTIP = "The odometer: into the carry input of another node that walks. With this node on increment-wrap, the other one moves one step each time this one comes round from the last name to the first."
