# WPrompt Rows

The prompt built from rows. Each row is a text area that grows with what you type, with a **≡** at its left edge and the chips at its right edge. The height of the node comes from its rows: drag an edge to set the width, and the node closes under the last row, however the text wraps.

## The chips
- **on / off**: the row enters the prompt or not. It also switches a *linked* text: plug an external STRING (another prompt, the trigger words from WLoRA, a Primitive) into the row's socket on the left edge and turn it on and off from the same chip.
- **−** removes the row, **+** adds an empty row right below it (the rows around move, cables included). The only row left is emptied, not removed. They stay quiet until the pointer comes on the row.
- **≡**: drag it onto another row and the row moves there, with its text, its switch and its cable; the rows in between shift by one. A blue line above or below says where it lands.

## Divide Input Prompt
`prompt_to_divide` is an optional input: plug a text into it and a **Divide Input Prompt** button comes up at the top of the node. A click makes one new row for every phrase of that text, divided by the commas, after the last row that has text (empty rows at the end are used first). A comma inside brackets does not divide: `(red scarf, wool:1.2)` stays one phrase. The text is read from the node upstream when it shows it in a widget; when it is made by the run (an LLM, a captioner), queue once, then divide. While no row has text, on or off, the text of `prompt_to_divide` comes out of `prompt` as it is, so an empty or just reset node lets it through; with text in the rows it stays out. A row that is off and has text counts as text.

## Reset
**Reset**, always at the top of the node (under Divide Input Prompt when that is there), brings the node back to new: one empty row, on, `join` on `comma`, no cable on the rows, not collapsed. The cables on `prompt_to_divide` and `join` stay, so you can divide again at once, and so does the one on `prompt`. Ctrl+Z brings the rows back.

## Collapse and Expand
With more than 10 rows a **Collapse** button comes up under `join`. It keeps 10 rows in view and turns into **Expand**: the wheel over the rows, or the bar on the right edge, scrolls the others one row at a time; Expand shows them all again. Ctrl+wheel still zooms the canvas. The rows out of view are all there: their text, their switch and their cable stay and they go into the prompt as usual. A cable on a row out of view enters at the edge of the rows on the old canvas; in Nodes 2.0 that row stays in view, small, under the others. The node remembers the choice in the workflow. Dragging a **≡** to the top or bottom edge scrolls the rows, so a row can go anywhere.

## The join
`join` decides how the rows that are on are glued together: `comma` (`, `), `space`, `newline`, `none`. Empty rows are skipped; the text goes out as written, line breaks at the start or end included; with `comma` a row that already ends with a comma does not get a second one. A linked row shows the upstream text in italics, read-only, when the source node keeps it in a widget.

One output, `prompt`. Up to 60 rows.
