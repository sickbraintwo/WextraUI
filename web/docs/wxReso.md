# WReso

The size of a picture, one section each. **Read**: how big is this picture? **Define**: the height is 832 and I want 16:9, how wide is it? **Multiply**: this is 1024 × 576, how big is it at 1.5 times? The answer is written large at the foot of the node. The ratio of a size (this is 1480 × 832, what ratio is it?) is **WRatio**, a node of its own.

## Sections
Each section has a head with ▸ / ▾: click it to open or close. One section is open at a time (opening one closes the other); a closed section shows its name only. The outputs (`width`, `height`) are the numbers of the section **open**, or of the last one opened: its head is the bright one. A new node, a WReso saved with 0.8.0, and one saved on the Ratio Finding of 0.9.0 (now WRatio) open with Read.

## Read
- **image**: a picture. Its width and height are the resolution shown and passed on; the two numbers below are then left aside.
- **width**, **height**: two INT cables, when there is no picture: the outputs of a resolution node, a WInt🌱, a Primitive, another WReso.
- The three sockets sit inside the section, one row each under its head: open the section to plug a cable.
- The line follows the graph as you wire: a picture shown up the cable (a Load Image, a node with a preview), the widget of the node at the far end of an INT cable (through Reroute and Set / Get; a menu that reads `1024 x 1024` is split in two, by the name of the output it comes from; Comfy's Resolution Selector is summed the way its backend does it, to the pixel). What the graph cannot tell reads `?`: a picture still to be made, a number still to be computed. After a run the line shows what the node used, and keeps it while the cables are the same ones.

## Define
- **width**, **height**: type the side you know, leave the other at 0: the one at 0 is worked out. While one side is above 0 the box of the other one is greyed out; put it back to 0 to type the other side instead.
- **aspect_ratio**: width : height, every landscape one in use, `1:1`, `5:4`, `4:3`, `1.37:1`, `7:5`, `1.414:1`, `1.43:1`, `3:2`, `16:10`, `1.66:1`, `16:9`, `1.85:1`, `1.9:1`, `1.91:1`, `2:1`, `19.5:9`, `2.2:1`, `21:9`, `2.35:1`, `64:27`, `2.39:1`, `2.4:1`, `2.76:1`, `32:9`, or **custom**: two boxes come up under the menu for the two numbers of your own (16 and 9 to start).
- **multiple**: the side worked out goes to the nearest multiple of this: **1, 2, 4, 8, 16, 32 or 64**. 8 for models (16, 32, 64 for some video models), 2 for an even size, 1 for the nearest pixel. A number box, so it takes a cable: the arrows step from one of the seven to the next, a number typed or from a cable goes to the nearest of them (12 is 16, 6 is 8).
- **invert**: turns the result round: 832 at 16:9 is `1480 × 832`, inverted `832 × 1480`, the upright frame. The number you typed goes to the other side.

## Multiply
- **width**, **height**: a size, typed or by cable.
- **multiply by**: both sides times this number, with one decimal, 1.0 to start: `1.5` makes 1024 × 576 into `1536 × 864`, `0.5` halves it. Each side goes to the nearest pixel.
- The line reads the result; small under it, what was multiplied (`1024 × 576 × 1.5`).

## Good to know
- The side worked out is rounded to the **nearest multiple** you pick: the ratio can move by a hair. 832 at 16:9 is 1479.1, it becomes 1480; 1480 × 832 is then `≈ 16:9`, not `16:9`. An exact 16:9 needs a height that 9 divides: 864 gives 1536 × 864.
- **Every number takes a cable**: the two sides, `multiple`, the two numbers of a `custom` ratio, the three numbers of Multiply (a WRatio's two outputs fit them as they are). A cable on a box counts as typed: its number is read up the cable the way the reading reads its own; what the graph cannot tell (a Video Info, a sum) reads `?` until the run. The node runs with nothing on its outputs, like a Preview: the line fills at every Run.
- A picture and two numbers plugged together: the picture wins. Both sides of Define set (two cables, an API prompt): the width wins.
- The numbers of a picture are a batch's width and height: every picture of a batch has the same ones.
- Through the API the node is only the two INT outputs: the line is drawn by the interface.
