# WRatio

The ratio of a size, and its two numbers out. This is 1480 × 832: what ratio is it? The answer is written large at the foot of the node, and its two numbers go out as INT, ready for another node.

## Inputs
- **width**, **height**: a size, typed or from two INT cables (a WReso, a WInt🌱, a resolution node, a Primitive).

## The line
- Large, the ratio: `16:9` when it is exact, `≈ 16:9` when a known ratio is within 1%, the reduced fraction (`11:7`) otherwise. The known ratios are those of WReso's menu, either way round (`9:16` is 16:9 upright).
- Small under it, the fraction and the decimal: `185:104 | 1.78:1`.
- On the right, when the ratio is a known one, the nearest sizes that are that ratio exactly with both sides multiples of 8: one bigger (↑) and one smaller (↓).

## Outputs
- **ratio_width**, **ratio_height**: the two numbers of the ratio written large, as whole numbers. `16:9` and `≈ 16:9` give 16 and 9; `11:7` gives 11 and 7.
- A known ratio with a decimal goes out made whole, the same ratio: `1.85:1` is 37 and 20, `19.5:9` is 13 and 6. The line then says it small: `out 37 : 20`.
- A side at 0 gives 0 and 0.

## Good to know
- Two cables into the **custom** ratio of a WReso (Define): the ratio of one picture becomes the size of another. 1480 × 832 goes out as 16 and 9; a height of 1080 at that ratio reads `1920 × 1080`.
- `≈ 16:9` goes out as 16 and 9, not as the exact fraction (185 and 104): the ratio named is the one passed on. For the exact numbers, wire the width and height themselves.
- A cable on a box is read up the cable as WReso reads its own; what the graph cannot tell reads `?` until the run. The node runs with nothing on its outputs, like a Preview: the line fills at every Run.
- Through the API the node is only the two INT outputs: the line is drawn by the interface.
