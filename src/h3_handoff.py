"""Hand-off between scenes — shared helpers.

The last N frames of a clip (and their audio) are anchored at frame 0 of the
next scene with a MiniMaxH3 keyframe (like Add Guide), so motion and sound
continue instead of restarting from a frozen still. N is chosen PER SCENE on
the WScene H3 node (handoff_frames): it says how much of the previous clip
that scene inherits. Valid H3 clip lengths only (17k+5): 5, 22, 39, 56, ...
22 = 0.92 s is the safe default (enough audio for the audio VAE, real motion
context); longer = more music continuity across the join, at the price of a
longer "already seen" head in the new clip.

Where the tail comes from is also per scene (previous_from):
  loop = the clip rendered just before, inside the same run;
  file = the clip named in resume_from_video (relative to ComfyUI/output or input, or absolute inside them;
         ComfyUI/output) — scene-by-scene work, or any clip as a starting point.
"""
import os

import numpy as np
import torch

H3_FPS = 24
HANDOFF_DEFAULT = 22
HANDOFF_CHOICES = [str(17 * k + 5) for k in range(8)]   # 5 .. 124 (~5 s)
PREVIOUS_FROM = ["loop", "file"]


def handoff_seconds(n_frames):
    return int(n_frames) / float(H3_FPS)


def resolve_path(path):
    """The clip a scene resumes from: relative to ComfyUI/output (or input), or absolute inside one of them.
    Anything else is not a file for us (registry policy: no arbitrary file read)."""
    from .wxPaths import resolve_read
    return resolve_read(path) or ""


def silence(seconds, rate=32000):
    return {"waveform": torch.zeros((1, 2, max(1, int(rate * seconds)))), "sample_rate": rate}


def audio_tail(audio, seconds):
    """Last `seconds` of an AUDIO dict (like TrimAudioDuration with a negative start)."""
    if audio is None:
        return silence(seconds)
    rate = int(audio["sample_rate"])
    n = max(1, int(rate * seconds))
    wave = audio["waveform"]
    return {"waveform": wave[..., -n:], "sample_rate": rate}


def video_tail(images, n_frames):
    """Last n_frames of an IMAGE batch (the whole batch if shorter)."""
    n = int(n_frames)
    return images[-n:] if images.shape[0] > n else images


def decode_tail(path, n_frames, audio_seconds, who="H3 hand-off"):
    """Last n_frames video frames of a file as (n, H, W, 3) float tensor + last audio_seconds as AUDIO."""
    import av  # ships with ComfyUI (used by its own video nodes)
    frames = []
    chunks, rate = [], None
    with av.open(path) as container:
        vstream = container.streams.video[0]
        for frame in container.decode(vstream):
            frames.append(frame)
            if len(frames) > n_frames:
                frames.pop(0)
        if container.streams.audio:
            astream = container.streams.audio[0]
            resampler = av.AudioResampler(format="fltp", layout="stereo")
            container.seek(0)
            for frame in container.decode(astream):
                for rf in resampler.resample(frame):
                    chunks.append(rf.to_ndarray())
                    rate = rf.sample_rate
            for rf in resampler.resample(None):
                chunks.append(rf.to_ndarray())
                rate = rf.sample_rate
    if not frames:
        raise ValueError(f"{who}: no video frames found in {path}")
    video = np.stack([f.to_ndarray(format="rgb24") for f in frames]).astype(np.float32) / 255.0
    video = torch.from_numpy(video)
    if chunks and rate:
        wave = np.concatenate(chunks, axis=1)  # (channels, samples)
        tail = wave[:, -int(rate * audio_seconds):]
        audio = {"waveform": torch.from_numpy(tail.astype(np.float32)).unsqueeze(0), "sample_rate": rate}
    else:
        audio = silence(audio_seconds)
    return video, audio


def tail_from_file(scene, index, who):
    """The tail (clip, audio) of the file a scene says it resumes from."""
    n = int(scene.get("handoff", HANDOFF_DEFAULT))
    raw = scene.get("resume_path", "")
    path = resolve_path(raw)
    if not path or not os.path.isfile(path):
        raise ValueError(f"{who}: scene {index} has previous_from = file but resume_from_video is not a file: '{raw}' "
                         "(relative to ComfyUI/output or ComfyUI/input, e.g. MM_H3_Loop/scene_4_S_1_00003-audio.mp4; "
                         "an absolute path is accepted only inside those folders).")
    clip, audio = decode_tail(path, n, handoff_seconds(n), who)
    return clip, audio
