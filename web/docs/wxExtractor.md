# WExtractor

One frame of a video, or every frame between two. Pick the video, move the pointer on the timeline under the preview: the frame where you leave it goes out of `images`.

## The video
- **video**: the menu lists the input folder (as Load Video does), then the videos of the output folder, marked `[output]`. Videos saved after ComfyUI started show up when you click the node.
- **choose video to upload**: puts a video from your PC into the input folder and picks it. Dragging a video onto the node does the same.

## The timeline
- Drag the pointer: the preview follows it. Under the bar, the frame number (counted from 0) and its time; on the right, how many frames the video has and how long it lasts.
- With the node selected (a click on the preview or the timeline selects it): **←** / **→** one frame (**Shift**: ten), **Home** / **End** the first / last frame, **space** play / pause, **F** full screen.
- **⛶** at the end of the timeline: the preview and the timeline on the whole screen, with the video's name and a `multiple` chip on top. **F** or **Esc** to come back; **Ctrl+S** there saves the workflow.
- **▶** plays from the pointer and moves it with the video: pause, and the frame you stopped on is the one that goes out.

## multiple
- **false**: one frame, the one under the pointer.
- **true**: a second pointer comes up at the end of the timeline. Every frame from the first pointer to the second goes out, both included; their number is written between them. **▶** plays that stretch over and over, the pointers stay where they are.
- Many frames take a lot of memory: a 1080p frame is about 25 MB once in ComfyUI. Over 2 GB the number turns orange and says how much.

## Outputs
- **images**: the frame, or the frames.
- **frames**: which frames went out, counted from 0, as text: `4` for one frame, `4-10` for a stretch.
- **fps**: the frames per second of the video, to put the frames back together at the same pace.

## Good to know
- The frame picked is the frame that goes out: both are counted from the video's own timestamps at its own rate.
- The preview is a light copy of the video (at most 720 px high), made once in ComfyUI's temp folder so that it follows the pointer at once; the frames that go out are read from the video itself, at full size.
