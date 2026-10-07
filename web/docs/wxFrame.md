# WFrame (a stack of actions: crop · pad · resize)

One node for the outpaint prep and every framing job. Under the node, a **stack of actions** done in order, each one a coloured rectangle in the preview: crop a detail, then pad it to 1:1; pad for an outpaint; resize and pad; as many steps as the job needs (up to 8).

## The line above
What was done, as the run will write it in a **WSave Image** name: `c800x1000_p100x0` (below, *Into the file name*); with no picture yet, the numbers of the stack (`p1024x1024`, `c1-1`); `(no change)` when the stack does nothing.

## The stack
- The menu picks the action (`crop`, `pad`, `resize`), **`+`** adds it after the open one, **`−`** removes the open one; drag a row by its handle **`≡`** to move it. Click a row to open its settings; click again to fold it.
- Every action sees the picture **as the actions before it left it**, and its numbers are in that picture's pixels.
- The row tells what the action does with the picture of now (`2 · pad 100·0·100·0`), and `(no change)` when it does nothing.

## crop — the box that stays
- **width** × **height**: 0 = the whole side. **aspect**: locks width : height; picked, the biggest box of that aspect inside the picture.
- **anchor**: which part of the picture stays; **shift x / y** move the box from there. Native resolution, no resampling.

## pad — a bigger (or smaller) canvas
- **width** × **height** of the canvas: 0 = keep that side. **aspect**: picked, the smallest canvas of that aspect around the picture (`1:1` = make it square by padding).
- **anchor**: where the picture sits on the canvas; **shift x / y** move it from there. What is missing is padded with the **colour**, what sticks out is cut (a canvas smaller than the picture is a cut: `right` keeps the right edge).
- **left / top / right / bottom**: the border on each side in px, typed by hand (− = cut). They need the picture.
- **feather**: soft edge of the pad *mask*, in px inward, like *ImagePadForOutpaint*.

## resize — aspect kept
- **mode**: `width`, `height`, `long side`, `short side` = that side to the px; `scale %` = the percent (50 = half); `fit in box` / `cover box` = the whole picture inside the box, or the picture filling it.
- **method** (above the stack): the resampling of every resize.

## The preview
- The **final frame in red**; every crop and pad is a rectangle in the colour of its row; a resize has no rectangle (it scales everything: see its row). The border a pad adds is filled with its colour and, when the pad is open, measured on each side in px; what is cropped, cut or covered stays outside, dimmed, the cut in the pad's colour with a `−`. A thread joins each corner of the open pad to the corner of what it wraps: inward = border, outward = cut.
- **Click** a rectangle to open its action; **drag** it to move it (a crop moves over the picture; a pad moves the canvas around it); **pull a corner or a side** to size it (the aspect, if locked, holds). **Double-click** puts the open action's shift back to 0. The **arrow keys** move the open rectangle by 1 px of its picture, 10 with Shift (click the drawing first: it takes the keys).
- **`mask`**, top right, shows the pad mask as the run makes it: black all around, the picture where it comes out, **fuchsia** where the pads add pixels (as far as that reaches the end), the feather fading into the picture. Press it again for the colours.
- Every number box in the settings **slides**: press it and drag sideways, 1 per px, 10 with Shift (the arrows and typing still work).
- The button at the corner **zooms** on the open action's rectangle (the final frame when none is open); press it again for the whole.
- The picture comes from the last run (its true input); before the first run, from the Load Image up the cable.

## Outputs
- `image`; an input `mask` follows the same geometry.
- `pad_mask`: 1 where the stack added pixels, feathered inward, summed over the pads and following the crops and resizes after them. Wire it to the outpaint conditioning. All zeros when nothing was added.

## Into the file name
What was done, short and file-name-safe, one letter per action: `c800x1000_p100x0`, `r1024x683_p0-170-0-171`. `c` = crop (its size), `p` = pad (the border added: `p100` the same on every side, `p100x0` left = right and top = bottom, else the four sides), a leading `-` = cut (`-40x0`), `r` = resize (its size). No cable: in **WSave Image**, `from Wnodes on graph` lists the WFrame and makes a part with text `_fr_` and value `{#id}` (the same line the node shows above its stack). The run reads what this node did in its last run, while the stack is the one it ran with; a WFrame that has not run yet, or whose stack changed since, gives the numbers of the stack (`p1024x1024`, `c1-1`, `r1024`, `r50pct`).

## Examples (picture 1500×1000)
- A detail, square: crop 800 × 1000 at `left` → pad, aspect `1:1` → 1000×1000, 100 px on each side: `c800x1000_p100x0`.
- Outpaint to 1536×1024, centred: pad 1536 × 1024 → `p18x12`.
- Extend the sky by 400 px: pad, height 1400, anchor `bottom` (or `top` 400 in the sides).
- Portrait 1024×1536 from a landscape: resize `fit in box` 1024 × 1536 → 1024×683, then pad 1024 × 1536: borders top and bottom.

## A workflow saved with the WFrame of before
The fixed boxes of 0.6 (new size · crop · resize · place) become a stack when the workflow loads: the crop, the resize, then a pad of the new size with its anchor, offsets, colour and feather. The run is the same; save the workflow once and it is in the new form. An API prompt now takes `ops` (the stack as JSON) and `method`.
