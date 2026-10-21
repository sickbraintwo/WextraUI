# WReso

Every question about a size, one section each. **Resolution Reading**: how big is this picture? **Resolution Defining**: the height is 832 and I want 16:9, how wide is it? **Ratio Finding**: this is 1480 × 832, what ratio is it? The answer is written large at the foot of the node.

## Sections
Each section has a head with ▸ / ▾: click it to open or close. One section is open at a time (opening one closes the other); a closed section shows its name only. The outputs (`width`, `height`) are the numbers of the section **open**, or of the last one opened: its head is the bright one. A new node, and a WReso saved with 0.8.0, open with Resolution Reading.

## Resolution Reading
- **image**: a picture. Its width and height are the resolution shown and passed on; the two numbers below are then left aside.
- **width**, **height**: two INT cables, when there is no picture: the outputs of a resolution node, a WInt🌱, a Primitive, another WReso.
- The three sockets sit inside the section, one row each under its head: open the section to plug a cable.
- The line follows the graph as you wire: a picture shown up the cable (a Load Image, a node with a preview), the widget of the node at the far end of an INT cable (through Reroute and Set / Get; a menu that reads `1024 x 1024` is split in two, by the name of the output it comes from; Comfy's Resolution Selector is summed the way its backend does it, to the pixel). What the graph cannot tell reads `?`: a picture still to be made, a number still to be computed. After a run the line shows what the node used, and keeps it while the cables are the same ones.

## Resolution Defining
- **width**, **height**: type the side you know, leave the other at 0: the one at 0 is worked out. While one side is above 0 the box of the other one is greyed out; put it back to 0 to type the other side instead.
- **aspect_ratio**: width : height, every landscape one in use, `1:1`, `5:4`, `4:3`, `1.37:1`, `7:5`, `1.414:1`, `1.43:1`, `3:2`, `16:10`, `1.66:1`, `16:9`, `1.85:1`, `1.9:1`, `1.91:1`, `2:1`, `19.5:9`, `2.2:1`, `21:9`, `2.35:1`, `64:27`, `2.39:1`, `2.4:1`, `2.76:1`, `32:9`, or **custom**: two boxes come up under the menu for the two numbers of your own (16 and 9 to start).
- **multiple**: the side worked out goes to the nearest multiple of this: 8 for models (16, 32, 64 for some video models), 2 for an even size, 1 for the nearest pixel.
- **invert**: turns the result round: 832 at 16:9 is `1480 × 832`, inverted `832 × 1480`, the upright frame. The number you typed goes to the other side.

## Ratio Finding
- **width**, **height**: a size; they go out as they are.
- Under them, the ratio: `16:9` when it is exact, `≈ 16:9` when a known ratio is within 1%, the reduced fraction (`10:7`) otherwise. Small under it, the fraction and the decimal: `185:104 | 1.78:1`. On the right, when the ratio is a known one, the nearest sizes that are that ratio exactly with both sides multiples of 8: one bigger (↑) and one smaller (↓).

## Good to know
- The side worked out is rounded to the **nearest multiple** you pick: the ratio can move by a hair. 832 at 16:9 is 1479.1, it becomes 1480; 1480 × 832 is then `≈ 16:9`, not `16:9`. An exact 16:9 needs a height that 9 divides: 864 gives 1536 × 864.
- A cable on a box counts as typed: its number is read up the cable the way the reading reads its own; what the graph cannot tell (a Video Info, a sum) reads `?` until the run. The node runs with nothing on its outputs, like a Preview: the line fills at every Run.
- A picture and two numbers plugged together: the picture wins. Both sides of Resolution Defining set (two cables, an API prompt): the width wins.
- The numbers of a picture are a batch's width and height: every picture of a batch has the same ones.
- Through the API the node is only the two INT outputs: the line is drawn by the interface.
