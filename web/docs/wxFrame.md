# WFrame (new size · crop · resize · place)

One node for the outpaint prep and every framing job. **`new_width` × `new_height` on top is the master**: the final resolution (0 = keep the picture's). Then, in order: crop, resize, place on the canvas.

## CROP
- **crop_to** — `none`, an aspect (`16:9`, `1:1`… the node computes the box), or `custom`: then **crop_width** × **crop_height** appear.
- **crop_anchor** — which part of the picture stays. Native resolution, no resampling.

## RESIZE (aspect kept)
- **resize_to** — relative to the new size, no number needed: `fit new size` = whole picture inside it · `cover new size` = picture fills it · `long side` / `short side` = that side of the picture matches the new size's. With **resize_value**: `width`, `height` (px), `scale %` (50 = half, 200 = double).
- **method** — resampling.

## PLACE / PAD
- **pad_anchor** — where the picture sits on the `new_width` × `new_height` canvas; the border goes on the other sides (`center` = equal borders, `bottom` = all on top…).
- **offset_x**, **offset_y** — shift the picture from the anchor, in px (+ = right / down). What sticks out of the canvas is cut.
- **pad_color** — colour of the added area; the picker under it writes into it. **feathering** — soft edge of the pad *mask*, in px inward, like *ImagePadForOutpaint*.

## Outputs
- `image`, `width`, `height`; an input `mask` follows the same geometry.
- `pad_mask` — 1 where the node added pixels, feathered inward: wire it to the outpaint conditioning. All zeros when nothing was added.
- `info` — what was done, short and file-name-safe: `pad18-12-18-12_1536x1024`, `crop16-9_fit_pad0-256-0-256_1024x1536`. Add it as a *string* part in **WSave Image**.

## Examples (picture 1500×1000)
- Outpaint to 1536×1024, centred: new 1536 × 1024 → `pad18-12-18-12`.
- 360 px each side at native height: new_width 2220, new_height 0.
- Extend the sky: new_height 1400, pad_anchor `bottom` → all 400 px on top.
- Portrait 1024×1536 from a landscape: resize_to `fit new size` → picture 1024×683, borders top and bottom.
