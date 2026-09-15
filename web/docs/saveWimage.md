# WSave Image

Saves PNGs composing the file name from a folder/subject plus free parts, with a counter of chosen width, and the usual ComfyUI metadata (prompt + workflow) embedded.


A new node opens with **no part**: add them with «+».

`images` is optional: with nothing plugged in, the node writes no file and only composes the name (`prefix` / `name` outputs) — handy to feed a video or JSON save.

The `images` output (first pin) passes the input batch through untouched: save here and keep going (upscale, video, a second save) without a Reroute. Unplugged input → empty output.

Two placeholders work in any text field (`folder`, `subject`, a part's text): `{batch}` = how many images in this run, `{index}` = the number of *this* image, from 1, zero-padded to the width of `{batch}` (batch 4 → 1…4, batch 12 → 01…12). The **write batch** switch under the buttons (on by default) appends `_B{batch}{index}` for you: `image_S_0` → `image_S_0_B41`, `_B42`… Switch it off and place the placeholders yourself if you want them elsewhere. The `preview` shows the placeholders as written; after a run it shows the first image's name, and so do `prefix` / `name`.

The `preview` box follows every field while you type or rewire. A field driven by a link shows the upstream value when the source node keeps it in a widget (Primitive, String, Int…), otherwise a placeholder like `{subject}` or `{int}`; after a run it shows the exact name the backend used.

If folder + name + counter would exceed what Windows accepts (259 characters of full path), the name is cut and the counter keeps the files apart: the save never fails for a long name.

**image preview** (last switch, off by default) shows the saved images inside the node after the run, like Comfy's Save Image; off keeps the node compact. Either way the files are declared in `/history` as `images` (`filename`, `subfolder`, `type`), like the standard Save Image, so scripts can fetch them through `/view`.
