# WMixer

A timeline mixer inside the node, as the layers of After Effects: audio files as tracks, each with its volume, mute, solo and offset; on every track the stretches that play (clips), each the room under its roof: the fades are the two slopes, the volume over time is the top. It plays live while you edit, with the video next to it, in step; Run makes the same mix in high quality and gives it as AUDIO.

## Tracks
- **+ track…**: an audio file of ComfyUI's input or output folder (the input folder first, then output, each in alphabetical order). Or drag an audio file from your desktop onto the node: it is uploaded into the input folder, then added.
- On the left of each track: its name (editable), **dB** (volume), **s** (the offset: the track slides by these seconds under its clips), **M** mute, **S** solo, **V** the roof of the track, **✕** to remove it (it shows with the pointer on the track). Drag the handle up or down to reorder the tracks.
- **video**: the video to watch while it plays, muted, in step (the menu, or a video dragged onto the node). A video with a sound of its own brings it as the first track, `🎬 video sound`: a track like the others, ✕ takes it away for that video. The handle under the video gives it more or less room.
- The waveform stands in the room of the clip, at the track's dB: a peak at 0 dB touches the roof, and the roof turns red where the sound goes over 0 dB. Outside the clips the file shows grey: it is there, and silent.

## Clips
A clip is a stretch of a track that plays; outside its clips the track is silent.
- **Double-click** on empty: a clip filling the scene under the mouse (the scenes come from the timeline of a WLoop Start Foley in the same graph, when there is one; otherwise the whole track).
- **Drag** a clip to move it; drag its **edges** to trim; drag the **white circles** on its roof to set the fades.
- **Ctrl+click** cuts the clip there; **Alt+click** deletes it.
- **Middle button + drag** on a clip moves that clip alone with its own piece of sound; on empty (or with Shift) the whole track with its clips. **Shift+drag** slides the sound under the clips (the offset), the clips stay.
- Edges snap to the scene cuts, the beats and the other clips (`scenes` and `beats`, after `snap` in the bar, switch it).
- **Ctrl+Z / Ctrl+Y**: the mixer's own undo and redo.

## The roof
The roof of a clip is its volume over time: it climbs with the fade in, falls with the fade out, and between them it is the volume line of the track.

With **V** off the roof is only the shape of the clip: the mouse moves the clip, also taken on the roof. With **V** on the roof of that track opens: its points show, with a dashed line at 0 dB, and the top of each clip takes the mouse.
- Drag the roof: the volume of that stretch, between two points, or the whole top of a clip that has none (the other clips of the track stay as they are).
- Click on the roof: a point. Drag a point: when and how loud (it sticks to 0 dB, to the cuts and the beats).
- Drag the small circle of a stretch: bend it into a curve. Double-click a point or a circle: remove it, straight again.
- A point over a fade or between two clips shows on the faint part of the line, and takes the mouse as the others.

## The map
The strip over the ruler is the whole mix: the clips of every track as small dashes, the cuts, the playhead, and the white frame of the part in view. Drag the frame to slide the view, its ends to zoom, click outside it to bring the view there. Drag on the strip while the whole mix is in view: a frame, from where you start to where you let go. Double-click, or `whole` beside it: the whole mix.

## The ruler and the grid
- The ruler: **wheel** = zoom around the mouse, also on a track; **middle button** = drag the view; two **yellow handles** = the play range (only what is between them plays; the Run renders the whole mix).
- **bpm** and **beat 1**: a beat grid over the tracks, for music; the clips snap to it.
- **length**: the length of the mix, in seconds; empty = the video, or the longest track, and the box says which.
- Every number (dB, s, length, bpm, beat 1) also changes by dragging the mouse up and down on it (Shift: finer).

## Playing
With the node selected (a click in the mixer selects it): **space** play / pause, **F** (or ⛶ in the bar) the full screen of the whole mixer, **←** / **→** back and forward without sound (a tap = one frame), **↑** the start. `?` in the bar opens a card with all of this.

## Run
- **ceiling_db**: if the mix peaks above this, the whole mix comes down until it does not (a volume change, nothing is squashed). 0 = off.
- **audio** (output): the mix, as long as the timeline, 48 kHz stereo. For WAonV, or a Save Audio.
- **info**: what went in, track by track.

## Good to know
- The state of the mixer (tracks, clips, fades, volumes) is saved with the workflow, not the switches **V**, the zoom or the play range; the audio files stay where they are, in the input or output folder, and are read again at the Run. A file rewritten under the same name counts as a change.
- The sound of a video and its light copy for the player are made once, in ComfyUI's temp folder.
- Double-click on a clip or on the track's name: that track over the whole room of the tracks (again = back).
