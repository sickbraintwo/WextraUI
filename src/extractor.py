"""WExtractor (wxExtractor) — one frame of a video, or every frame between two (Sick, 19/10/2026). The base is a Load
Video: the video from the menu (the input folder, then the output one, marked `[output]` as Load Image does), from the
upload button or dragged onto the node. The frontend (web/wxExtractor.js) shows it with a timeline under it: where the
pointer is left, that frame goes out of `images`; with `multiple` on, a second pointer, and every frame from the first
to the second, both included. The two pointers live in `start` and `end` (frame numbers from 0, hidden widgets).

The frames are counted from the file's own timestamps at its own rate (frame n = time n / fps), the way the player
of the frontend shows them, so the frame picked is the frame that goes out. All with PyAV, the library ComfyUI ships."""
import fractions
import os

import av
import numpy as np
import torch

import folder_paths

VIDEO_EXT = (".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v", ".gif")
MAX_FILES = 3000
_info_cache = {}


def video_files():
    """The videos the menu offers: the input folder as Load Video lists it, then the output folder with its
    subfolders, each name followed by ` [output]` (the annotation every ComfyUI loader understands)."""
    out = []
    ind = folder_paths.get_input_directory()
    if os.path.isdir(ind):
        out += sorted((f for f in os.listdir(ind) if f.lower().endswith(VIDEO_EXT) and os.path.isfile(os.path.join(ind, f))),
                      key=str.lower)
    outd = folder_paths.get_output_directory()
    found = []
    for root, dirs, files in os.walk(outd):
        dirs[:] = [d for d in dirs if not d.startswith(".") and not d.startswith("_")]
        for f in files:
            if f.lower().endswith(VIDEO_EXT):
                found.append(os.path.relpath(os.path.join(root, f), outd).replace(os.sep, "/"))
                if len(found) >= MAX_FILES:
                    break
        if len(found) >= MAX_FILES:
            break
    out += [f + " [output]" for f in sorted(found, key=str.lower)]
    return out


def resolve(video):
    """The menu's value (`clip.mp4`, `sub/clip.mp4 [output]`) -> the path, only inside the input or output folder."""
    name = str(video or "").strip()
    if not name:
        raise ValueError("WExtractor: no video picked.")
    path = folder_paths.get_annotated_filepath(name)
    base = folder_paths.get_output_directory() if name.endswith("[output]") else \
        folder_paths.get_temp_directory() if name.endswith("[temp]") else folder_paths.get_input_directory()
    if os.path.commonpath([os.path.abspath(base), os.path.abspath(path)]) != os.path.abspath(base):
        raise ValueError(f"WExtractor: `{name}` is outside its folder.")
    if not os.path.isfile(path):
        raise ValueError(f"WExtractor: no video `{name}`.")
    return path


def _fps(vs):
    return vs.average_rate or vs.guessed_rate or fractions.Fraction(24)


def info(path):
    """{fps, frames, width, height, seconds} of the video at `path`; the frames are its packets, counted once per
    version of the file (no decoding: a long video is counted in a moment)."""
    st = os.stat(path)
    key = (path, st.st_mtime, st.st_size)
    if key in _info_cache:
        return _info_cache[key]
    with av.open(path) as c:
        if not c.streams.video:
            raise ValueError("WExtractor: the file has no picture.")
        vs = c.streams.video[0]
        fps = _fps(vs)
        n = sum(1 for p in c.demux(vs) if p.size and p.pts is not None)
        if n <= 0:
            n = int(vs.frames or 0)
        r = {"fps": float(fps), "frames": n, "width": vs.codec_context.width, "height": vs.codec_context.height,
             "seconds": n / float(fps) if fps else 0.0}
    _info_cache[key] = r
    return r


def frames_between(path, a, b):
    """Frames a..b (both included, counted from 0) of the video at `path`, as RGB uint8 arrays, and its fps. The
    frame number of a picture is its time at the file's rate; the decoder starts from the keyframe before `a`."""
    with av.open(path) as c:
        vs = c.streams.video[0]
        vs.thread_type = "AUTO"
        fps = _fps(vs)
        tb = vs.time_base
        t0 = vs.start_time or 0

        def index(fr, k):
            if fr.pts is None or not tb:
                return k
            return int(round(float((fr.pts - t0) * tb * fps)))

        def run(seek):
            if seek and a > 0 and tb:
                c.seek(int(t0 + fractions.Fraction(a) / fps / tb), stream=vs, backward=True, any_frame=False)
            got, first = [], None
            for k, fr in enumerate(c.decode(vs)):
                i = index(fr, k)
                if first is None:
                    first = i
                if i < a:
                    continue
                if i > b:
                    break
                got.append(fr.to_ndarray(format="rgb24"))
            return got, first

        got, first = run(True)
        if first is not None and first > a:   # the seek landed past the frame: once more from the top
            c.seek(0)
            got, _ = run(False)
        return got, float(fps)


class WExtractor:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "video": (video_files(), {"tooltip": "The video: the input folder, then the output one (`[output]`). "
                                                     "The button under it uploads one; a video dragged onto the node does the same."}),
                "multiple": ("BOOLEAN", {"default": False, "label_on": "true", "label_off": "false",
                                         "tooltip": "false: one frame, where the pointer is. true: a second pointer, and every frame "
                                                    "from the first to the second, both included."}),
                "start": ("INT", {"default": 0, "min": 0, "max": 1 << 24, "step": 1,
                                  "tooltip": "The frame of the first pointer, counted from 0 (the timeline moves it)."}),
                "end": ("INT", {"default": 0, "min": 0, "max": 1 << 24, "step": 1,
                                "tooltip": "The frame of the second pointer, with multiple on (the timeline moves it)."}),
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING", "FLOAT")
    RETURN_NAMES = ("images", "frames", "fps")
    OUTPUT_TOOLTIPS = ("The frame under the pointer; with multiple on, every frame between the two pointers, both included.",
                       "Which frames went out, counted from 0: `4` for one, `4-10` for a stretch (for a file name, a note).",
                       "The frames per second of the video (to put the frames back together at the same pace).")
    FUNCTION = "extract"
    CATEGORY = "WextraUI/Video"
    DESCRIPTION = ("One frame of a video, or every frame between two. Pick the video (or drag it onto the node), move "
                   "the pointer on the timeline under the preview: that frame goes out. With multiple on, a second "
                   "pointer: every frame from the first to the second, both included. Also which frames (`4`, `4-10`) "
                   "and the video's fps.")

    @classmethod
    def VALIDATE_INPUTS(cls, video):
        if not folder_paths.exists_annotated_filepath(video):
            return f"WExtractor: no video `{video}`."
        return True

    @classmethod
    def IS_CHANGED(cls, video, **_):
        try:
            st = os.stat(resolve(video))
            return f"{st.st_mtime}|{st.st_size}"
        except Exception:
            return float("nan")

    def extract(self, video, multiple=False, start=0, end=0):
        path = resolve(video)
        n = info(path)["frames"]
        a = max(0, min(int(start), n - 1))
        b = max(0, min(int(end), n - 1)) if multiple else a
        if b < a:
            a, b = b, a
        got, fps = frames_between(path, a, b)
        if not got:
            raise ValueError(f"WExtractor: no frame {a} in `{video}` ({n} frames).")
        x = torch.from_numpy(np.stack(got)).float().div_(255.0)
        b = a + len(got) - 1   # the frames that really came (the end of a file can be one short of its count)
        return (x, f"{a}-{b}" if multiple else str(a), fps)


# ---- GET /wextraui/extractor_info?video=...: what the timeline needs (fps, frames, size) -----------------------------
try:
    from server import PromptServer
    from aiohttp import web

    @PromptServer.instance.routes.get("/wextraui/extractor_info")
    async def _wx_extractor_info(request):
        import asyncio
        try:
            r = await asyncio.to_thread(lambda: info(resolve(request.query.get("video", ""))))
        except Exception as e:
            return web.json_response({"error": str(e)}, status=400)
        return web.json_response(r)

    @PromptServer.instance.routes.get("/wextraui/extractor_files")
    async def _wx_extractor_files(request):
        return web.json_response(video_files())
except Exception:
    pass
