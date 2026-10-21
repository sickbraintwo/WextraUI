# WAonV

Audio on video: puts a sound on a video file without encoding the picture again. The sound the video had is left out; the picture is copied as it is, so the high-definition version can take the sound made on a small one.

## Inputs
- **audio**: the sound to put on the video: the mix of WMixer, the `value1` of the Foley loop's For Loop End, a Load Audio.
- **video_file**: the video, from ComfyUI's input folder, then from the output folder (marked `[output]`). Videos saved after ComfyUI started show up when you click the node. Not used when a video comes from the cable.
- **video** (optional): a video from a node (Load Video, for one): when connected it is used instead of the menu. A video made of frames is written out once, so its picture can be copied.
- **filename_prefix**: where the mp4 is saved, inside ComfyUI's output folder (`Foley/video` by default).
- **bitrate**: the quality of the sound (AAC): how many bits a second it may use. The picture is not touched by it.
- **length**: how long the file is.
  - **video**: the sound is cut, or padded with silence, to the video.
  - **audio**: the whole sound; a longer video is cut, a shorter one ends first (no picture is made for the rest: most players hold its last frame, some show black).
  - **shortest**: the shorter of the two.

## Output
- **path**: the file written. On the node, a line with the length of the video, of the sound and of the file.

## Good to know
- Uses the PyAV that ComfyUI ships: no ffmpeg to install.
- The picture stream is copied packet by packet: a long 4K video takes seconds, not minutes, and loses nothing.
