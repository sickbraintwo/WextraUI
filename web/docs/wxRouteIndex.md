# WRoute Index

One input, up to twenty outputs: the value goes out of `out<index>` (counted from 0), the other branches are skipped, their nodes do not run. The outputs show as you use them: connect the last one and another appears, like the slots of WSwitch, whose `index` output fits here as it is. See *WRoute* for the mechanism and for how to join the branches again.

A **line inside the node** goes from `value` to the output the value goes out of: along the row of `value`, then down from the middle of the node. On an output with no cable it turns red and dashed, and under `value` the node reads **nothing runs**: every branch is skipped. An `index` past the outputs shown reads `out 7: nothing runs`. With `index` on a cable the line shows when the graph can tell the number before the run (a WInt🌱, for instance, also through Reroute and Set / Get).
