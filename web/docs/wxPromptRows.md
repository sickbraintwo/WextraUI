# WPrompt Rows

The prompt built from rows. Each row is a text area that grows with what you type, with two chips at its right edge.

## The chips
- **on / off**: the row enters the prompt or not. It also switches a *linked* text: plug an external STRING (another prompt, the trigger words from WLoRA, a Primitive) into the row's socket on the left edge and turn it on and off from the same chip.
- **−** removes the row, **+** adds an empty row right below it (the rows around move, cables included). The only row left is emptied, not removed.

## The join
`join` decides how the rows that are on are glued together: `comma` (`, `), `space`, `newline`, `none`. Empty rows are skipped; the text goes out as written, line breaks at the start or end included; with `comma` a row that already ends with a comma does not get a second one. A linked row shows the upstream text in italics, read-only, when the source node keeps it in a widget.

One output, `prompt`. Up to 60 rows.
