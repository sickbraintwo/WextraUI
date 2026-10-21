# WMount

Joins videos into one mp4. The clips of a folder, in the order of their names, then the connected ones; each clip has its own row of rules, so every joint can be cut its own way.

## The clips
- **folder**: the folders of ComfyUI's input and output (subfolders included) that hold videos, marked `[input]` / `[output]`. Its clips are joined in the order of their names (`scene_2` comes before `scene_10`). Folders made after ComfyUI started show up when you click the node. **none**: only the sockets.
- **video_1**, **video_2**…: clips from other nodes: a video (Load Video, for one) or frames (IMAGE). Frames have no pace of their own: they take the frames per second of the first video, 24 when there are only frames. Connect the last socket and a new one appears under it, up to 32. They come after the clips of the folder, in the order of the sockets.
- Every clip must have the size and the frames per second of the first: if one does not, the node says which, instead of joining them wrong.

## The rows
One row per clip: its number, its name and, for the clips of the folder, how many frames it has. Under it:
- **in**: frames dropped from the head of the clip. 22 by default (0 on the first clip): the clip starts by repeating the last 22 frames of the one before, as a scene continued from the previous one does.
- **out**
  - **drop** with its frames: frames dropped from the tail of the clip. `drop 1` on a clip that ends on the picture it starts with (a loop): the same picture does not show twice. On the last clip, it lets the whole mount loop.
  - **blend** with its frames: the last frames of this clip are mixed with the first frames of the clip after (counted after its `in`), from one to the other; the sound fades across the same stretch. For a scene continued from the previous one: `blend 22` here and `in 0` on the clip after. On the last clip there is no clip after: nothing is mixed.
- The sound loses or blends the same stretches, so it stays on the picture.
- A new folder starts with new rows: the rules of the old one go.

## Output
- **filename_prefix**: where the mp4 is saved, inside ComfyUI's output folder. The preview plays in the node.
- **path**: the file written.

## Good to know
- The frames go through one at a time, from the clips to the new file: a long 1080p mount does not fill the memory. The picture is encoded again (H.264, high quality); the sound in AAC.
- A clip without sound gives silence for its stretch; if no clip has sound, the file has none.
- Uses the PyAV that ComfyUI ships: no ffmpeg to install.
