"""Shared timing helpers for the MiniMax H3 nodes.

H3 works at 24 fps and only accepts frame counts on a 17k+5 grid
(5, 22, 39, ... 124 = ~5s, 481 = ~20s). The native ComfyUI nodes snap
UP to the next valid count, so a requested 20.0s actually renders as
481 frames = 20.04s. These helpers make that explicit so the rest of a
workflow (loops, file names, beat tables) can use the real numbers.

Duration limits (verified 25/08/2026):
- Model card / API: 4-15 s.
- Local ComfyUI node (EmptyMiniMaxH3LatentAV / MiniMaxH3ImageToVideo):
  accepts 5..3600 frames; tooltip says trained range ~124-362 frames
  (~5-15 s), "longer is untested".
- Measured on an RTX 3090 (int8 convrot + turbo 8-step LoRA, 0.6 MP):
  20 s clips (481 frames) generate fine, ~32 min each.
  Beyond 20 s: not yet tried.
"""

H3_FPS = 24
H3_FRAME_STEP = 17
H3_FRAME_OFFSET = 5
H3_MIN_FRAMES = 5
H3_MAX_FRAMES = 3600  # hard cap of the native node


def seconds_to_h3_frames(seconds):
    """Requested seconds -> frame count snapped UP to the 17k+5 grid."""
    frames = max(H3_MIN_FRAMES, int(round(float(seconds) * H3_FPS)))
    remainder = (frames - H3_FRAME_OFFSET) % H3_FRAME_STEP
    if remainder:
        frames += H3_FRAME_STEP - remainder
    return min(frames, H3_MAX_FRAMES)


def h3_frames_to_seconds(frames):
    """Frame count -> real clip duration in seconds."""
    return frames / float(H3_FPS)
