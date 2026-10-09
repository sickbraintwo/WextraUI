# WReso

The resolution, **written large on the node**, and nothing else. Plug a picture, or two numbers, and read `1024 × 1024` at a glance; the same two numbers go out as INT.

## Use
- **image**: a picture. Its width and height are the resolution shown and passed on; the two numbers below are then left aside.
- **width**, **height**: two INT cables, when there is no picture: the outputs of a resolution node, a WInt🌱, a Primitive, another WReso.
- **width**, **height** (outputs): the two numbers shown, as INT, for an Empty Latent, a resize, a WFrame, a WSave Image part.

No box to type in: the node is as small as it gets, three sockets, two pins and the line.

## Before the run, after the run
The line follows the graph as you wire: a picture shown up the cable (a Load Image, a node with a preview), the widget of the node at the far end of an INT cable (through Reroute and Set / Get; a menu that reads `1024 x 1024` is split in two, by the name of the output it comes from; Comfy's Resolution Selector is summed the way its backend does it, to the pixel). What the graph cannot tell reads `?`: a picture still to be made, a number still to be computed. After a run the line shows what the node used, and keeps it while the cables are the same ones. The node runs with nothing on its outputs, like a Preview: the line fills at every Run.

## Good to know
- A picture and two numbers plugged together: the picture wins.
- The numbers are a batch's width and height: every picture of a batch has the same ones.
- Through the API the node is only the two INT outputs: the line is drawn by the interface.
