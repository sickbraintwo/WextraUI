# WIndex

The **switch that picks an input by number**, the mirror of *WRoute Index*: up to twenty inputs, one output, the input of `index` (counted from 0) goes out. As Easy-Use **Any Index Switch**: the inputs are **lazy**, so only the branch chosen runs. The inputs show as you use them: connect the last one and another appears. The `index` output of WSwitch fits as it is.

A **line inside the node** goes from the input chosen to the output, curving up to the row of `value` in the middle of the node. When the input chosen has no cable the line turns red and dashed, and under the output the node reads **nothing runs**; an `index` past the inputs shown reads `in 7: nothing runs`. Nothing downstream runs then (no error). With `index` on a cable the line shows when the graph can tell the number before the run (a WInt🌱, for instance, also through Reroute and Set / Get).

The node is born as narrow as it can. See *Wif* for the boolean version.
