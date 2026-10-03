# WFrame (a stack of actions: crop · pad · resize)

One node for the outpaint prep and every framing job. Under the node, a **stack of actions** done in order, each one a coloured rectangle in the preview: crop a detail, then pad it to 1:1; pad for an outpaint; resize and pad; as many steps as the job needs (up to 8).

## The stack
- The menu picks the action (`crop`, `pad`, `resize`), **`+`** adds it after the open one, **`−`** removes the open one, **`↑` `↓`** move it. Click a row to open its settings; click again to fold it.
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
- **Click** a rectangle to open its action; **drag** it to move it (a crop moves over the picture; a pad moves the canvas around it); **pull a corner or a side** to size it (the aspect, if locked, holds). **Double-click** puts the open action's shift back to 0.
- The button top right **zooms** on the open action's rectangle (the final frame when none is open); press it again for the whole.
- The picture comes from the last run (its true input); before the first run, from the Load Image up the cable. The line under the drawing lists the steps as the run will do them.

## Outputs
- `image`, `width`, `height`; an input `mask` follows the same geometry.
- `pad_mask`: 1 where the stack added pixels, feathered inward, summed over the pads and following the crops and resizes after them. Wire it to the outpaint conditioning. All zeros when nothing was added.
- `info`: what was done, short and file-name-safe: `crop800x1000_pad100-0-100-0_1000x1000`, `rs1024x683_pad0-170-0-171_1024x1024`. Add it as a *string* part in **WSave Image**.

## Examples (picture 1500×1000)
- A detail, square: crop 800 × 1000 at `left` → pad, aspect `1:1` → 1000×1000, 100 px on each side.
- Outpaint to 1536×1024, centred: pad 1536 × 1024 → `pad18-12-18-12`.
- Extend the sky by 400 px: pad, height 1400, anchor `bottom` (or `top` 400 in the sides).
- Portrait 1024×1536 from a landscape: resize `fit in box` 1024 × 1536 → 1024×683, then pad 1024 × 1536: borders top and bottom.

## A workflow saved with the WFrame of before
The fixed boxes of 0.6 (new size · crop · resize · place) become a stack when the workflow loads: the crop, the resize, then a pad of the new size with its anchor, offsets, colour and feather. The run is the same; save the workflow once and it is in the new form. An API prompt now takes `ops` (the stack as JSON) and `method`.
