"""WMount (wxMount) — several videos joined into one mp4 (Sick, 19/10/2026). The clips come from a folder picked in the
menu (the folders of ComfyUI's input and output that hold videos; its clips in the order of their names) and from the
`video_n` sockets (one more appears each time one is connected; a video, or the frames of an IMAGE, which take
the pace of the mount). Every clip has its own rule, one row each in the node
(web/wxMount.js, kept in the hidden `specs` box): `in` frames dropped from its head; `out` drop = frames dropped from
its tail, or blend = its last frames mixed with the first ones of the clip after (the hand-off of MM H3: the next clip
starts by repeating the last 22 frames of the one before). A loop in the middle = `out drop 1` on that clip. Only the
file goes out, with its preview in the node.

All with PyAV, the library ComfyUI ships: the frames go through one at a time, file to file, so a long 1080p mount does
not fill the memory. The sound is built first (it is light), then the pictures are encoded and the sound goes in
between them by time, as WAonV does."""
import fractions
import io
import json
import os
import re
import tempfile

import av
import numpy as np

import folder_paths

VIDEO_EXT = (".mp4", ".mov", ".webm", ".mkv", ".m4v")
MAX_VIDEOS = 32
MAX_FOLDERS = 2000
SR = 48000
HANDOFF = 22   # the default `in` of every clip but the first: the MM H3 hand-off


def _natural(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def _is_video(name):
    return name.lower().endswith(VIDEO_EXT) and ".part." not in name.lower()


def folder_choices():
    """`none`, then the folders of the input and of the output folder (subfolders included) that hold at least one
    video, as `sub/dir [input]` / `sub/dir [output]`."""
    out = ["none"]
    for typ, base in (("input", folder_paths.get_input_directory()), ("output", folder_paths.get_output_directory())):
        found = []
        for root, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if not d.startswith(".") and not d.startswith("_")]
            if root != base and any(_is_video(f) for f in files):
                found.append(os.path.relpath(root, base).replace(os.sep, "/"))
                if len(found) >= MAX_FOLDERS:
                    break
        out += [f"{f} [{typ}]" for f in sorted(found, key=_natural)]
    return out


def folder_path(choice):
    """`sub/dir [output]` -> the absolute path, only inside ComfyUI's input or output folder; None for `none`."""
    choice = str(choice or "").strip()
    if not choice or choice == "none":
        return None
    m = re.match(r"^(.*?)\s*\[(input|output)\]$", choice)
    if not m:
        raise ValueError(f"WMount: `{choice}` is not a folder of the input or output folder.")
    base = folder_paths.get_input_directory() if m.group(2) == "input" else folder_paths.get_output_directory()
    path = os.path.abspath(os.path.join(base, m.group(1)))
    if os.path.commonpath([os.path.abspath(base), path]) != os.path.abspath(base) or not os.path.isdir(path):
        raise ValueError(f"WMount: no folder `{choice}`.")
    return path


def folder_clips(choice):
    """The videos of the folder picked, in the order of their names (`scene_2` before `scene_10`): [(name, path)]."""
    path = folder_path(choice)
    if path is None:
        return []
    names = [f for f in os.listdir(path) if _is_video(f) and os.path.isfile(os.path.join(path, f))]
    return [(f, os.path.join(path, f)) for f in sorted(names, key=_natural)]


def _rewind(src):
    if isinstance(src, io.BytesIO):
        src.seek(0)
    return src


def _fps(vs):
    return vs.average_rate or vs.guessed_rate or fractions.Fraction(24)


def _is_frames(src):
    return hasattr(src, "shape") and len(getattr(src, "shape", ())) == 4


def probe(src):
    """{w, h, fps (Fraction, None for frames), frames, sound (stereo float at SR Hz, aligned to the first picture, or
    None)}."""
    if _is_frames(src):   # IMAGE: frames x height x width x channels, no pace, no sound
        return {"w": int(src.shape[2]), "h": int(src.shape[1]), "fps": None, "frames": int(src.shape[0]), "sound": None}
    with av.open(_rewind(src)) as c:
        if not c.streams.video:
            raise ValueError("no picture")
        vs = c.streams.video[0]
        fps = _fps(vs)
        n = sum(1 for p in c.demux(vs) if p.size and p.pts is not None) or int(vs.frames or 0)
        r = {"w": vs.codec_context.width, "h": vs.codec_context.height, "fps": fps, "frames": n, "sound": None}
        if c.streams.audio:
            v0 = float((vs.start_time or 0) * vs.time_base) if vs.time_base else 0.0
            c.seek(0)
            a = c.streams.audio[0]
            a0 = float((a.start_time or 0) * a.time_base) if a.time_base else 0.0
            rs = av.AudioResampler(format="fltp", layout="stereo", rate=SR)
            parts = []
            for fr in c.decode(a):
                fr.pts = None
                parts += [f.to_ndarray() for f in rs.resample(fr)]
            parts += [f.to_ndarray() for f in rs.resample(None)]
            if parts:
                snd = np.concatenate(parts, axis=1).astype(np.float32)
                off = int(round((a0 - v0) * SR))   # the sound starting later than the picture: silence in front
                snd = np.pad(snd, ((0, 0), (off, 0))) if off > 0 else snd[:, -off:]
                r["sound"] = snd
    return r


def _frames(src, n):
    """The n pictures of the video, in order, as yuv420p arrays: exactly n (a file one short repeats its last)."""
    if _is_frames(src):
        for k in range(n):
            rgb = (src[k, :, :, :3].clamp(0, 1) * 255).round().to("cpu").numpy().astype(np.uint8)
            yield av.VideoFrame.from_ndarray(np.ascontiguousarray(rgb), format="rgb24").reformat(format="yuv420p").to_ndarray()
        return
    with av.open(_rewind(src)) as c:
        vs = c.streams.video[0]
        vs.thread_type = "AUTO"
        k, last = 0, None
        for fr in c.decode(vs):
            if k >= n:
                break
            last = fr.to_ndarray(format="yuv420p")
            yield last
            k += 1
        while k < n and last is not None:
            yield last
            k += 1


def _encoder():
    for name in ("libx264", "h264", "libopenh264"):
        try:
            av.codec.Codec(name, "w")
            return name
        except Exception:
            continue
    raise RuntimeError("this ComfyUI's PyAV has no H.264 encoder")


def rule(specs, key, index):
    """The rule of a clip: {in, out, n}. What the row does not say takes the default: `in` 22 (0 for the first clip),
    `out` drop 0."""
    s = specs.get(key) if isinstance(specs, dict) else None
    s = s if isinstance(s, dict) else {}
    try:
        cin = max(0, int(s.get("in", 0 if index == 0 else HANDOFF)))
    except (TypeError, ValueError):
        cin = 0 if index == 0 else HANDOFF
    out = s.get("out") if s.get("out") in ("drop", "blend") else "drop"
    try:
        n = max(0, int(s.get("n", 0)))
    except (TypeError, ValueError):
        n = 0
    return {"in": cin, "out": out, "n": n}


def plan(counts, rules):
    """For each clip: (first kept frame, end, frames blended with the clip before, frames blended with the clip after,
    where it starts in the mount); and the length of the mount, in frames. A blend on the last clip has no clip after:
    nothing is mixed."""
    out, pos = [], 0
    last = len(counts) - 1
    for i, (c, r) in enumerate(zip(counts, rules)):
        a = r["in"]
        e = c - (r["n"] if r["out"] == "drop" else 0)
        bi = out[-1][3] if i > 0 else 0
        bo = r["n"] if (r["out"] == "blend" and i < last) else 0
        pos -= bi
        out.append((a, e, bi, bo, pos))
        pos += e - a
    return out, pos


class WMount:
    @classmethod
    def INPUT_TYPES(cls):
        opt = {"specs": ("STRING", {"default": "{}", "tooltip": "The rule of each clip (the rows of the node): kept as text."})}
        opt.update({f"video_{i}": ("VIDEO,IMAGE", {"tooltip": "A clip from a node: a video (Load Video, for one) or frames "
                                                              "(IMAGE: they take the pace of the mount). They follow the clips "
                                                              "of the folder, in the order of the sockets; one more socket "
                                                              "appears each time the last one is connected."})
                    for i in range(1, MAX_VIDEOS + 1)})
        return {
            "required": {
                "folder": (folder_choices(), {"tooltip": "A folder of clips, joined in the order of their names (`scene_2` "
                           "before `scene_10`): the folders of ComfyUI's input and output that hold videos. none: only the "
                           "sockets."}),
                "filename_prefix": ("STRING", {"default": "Mount/video", "tooltip": "Where it is saved, inside ComfyUI's output folder."}),
            },
            "optional": opt,
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("path",)
    OUTPUT_TOOLTIPS = ("The file written.",)
    OUTPUT_NODE = True
    FUNCTION = "mount"
    CATEGORY = "WextraUI/Video"
    DESCRIPTION = ("Joins videos into one mp4: the clips of a folder in the order of their names, then the connected ones. "
                   "Each clip has its own row: frames dropped from its head (`in`), and from its tail or blended with the "
                   "head of the clip after (`out`). The sound follows the pictures. Uses the PyAV of ComfyUI, one frame at "
                   "a time: no ffmpeg to install, no memory filled.")

    @classmethod
    def IS_CHANGED(cls, folder="none", **kw):
        try:
            return "|".join(f"{n}:{os.stat(p).st_mtime}:{os.stat(p).st_size}" for n, p in folder_clips(folder))
        except Exception:
            return float("nan")

    def mount(self, folder, filename_prefix, specs="{}", **videos):
        import comfy.model_management as mm
        import comfy.utils
        try:
            specs = json.loads(specs or "{}")
        except Exception:
            specs = {}
        tmps = []
        part = None
        try:
            clips = [(name, src, f"f:{name}") for name, src in folder_clips(folder)]
            for i in range(1, MAX_VIDEOS + 1):
                v = videos.get(f"video_{i}")
                if v is None:
                    continue
                if _is_frames(v):
                    clips.append((f"video_{i}", v, f"video_{i}"))
                    continue
                src = v.get_stream_source() if hasattr(v, "get_stream_source") else None
                if src is None:   # a video made of frames: written out once
                    fd, t = tempfile.mkstemp(suffix=".mp4", prefix="wextraui_mount_")
                    os.close(fd)
                    v.save_to(t)
                    tmps.append(t)
                    src = t
                clips.append((f"video_{i}", src, f"video_{i}"))
            if not clips:
                raise ValueError("WMount: no clip — pick a folder, or connect a video.")
            rules = [rule(specs, key, i) for i, (_, _, key) in enumerate(clips)]

            info = []
            for name, src, _ in clips:
                try:
                    info.append(probe(src))
                except Exception as e:
                    raise ValueError(f"WMount: cannot read `{name}`: {e}")
            w, h = info[0]["w"], info[0]["h"]
            fps = next((p["fps"] for p in info if p["fps"]), fractions.Fraction(24))   # frames only: 24
            bad = [f"`{nm}` {p['w']}x{p['h']}" + (f" {float(p['fps']):g} fps" if p["fps"] else "") for (nm, _, _), p in zip(clips, info)
                   if (p["w"], p["h"]) != (w, h) or (p["fps"] and abs(float(p["fps"]) - float(fps)) > 0.01)]
            if bad:
                raise ValueError(f"WMount: every clip must have the size and the pace of the first ({w}x{h}, {float(fps):g} fps): "
                                 + ", ".join(bad) + ".")
            if w % 2 or h % 2:
                raise ValueError(f"WMount: {w}x{h} — width and height must be even for an mp4.")
            counts = [p["frames"] for p in info]
            spans, total = plan(counts, rules)
            for (nm, _, _), c, (a, e, bi, bo, _) in zip(clips, counts, spans):
                if e - a < bi + bo + 1:
                    raise ValueError(f"WMount: `{nm}` has {c} frames: after its rule ({a} off the head, {c - e} off the tail) "
                                     f"too few are left for its blends ({bi} with the clip before, {bo} with the clip after).")

            # the sound, all of it, before the pictures: each clip's own, cut or padded to its pictures, at its place
            ratio = SR / float(fps)
            has_sound = any(p["sound"] is not None for p in info)
            if has_sound:
                mix = np.zeros((2, int(round(total * ratio))), np.float32)
                for i, (p, (a, e, bi, bo, pos)) in enumerate(zip(info, spans)):
                    s = p["sound"] if p["sound"] is not None else np.zeros((2, 0), np.float32)
                    want = int(round(counts[i] * ratio))
                    s = s[:, :want] if s.shape[1] >= want else np.pad(s, ((0, 0), (0, want - s.shape[1])))
                    s = s[:, int(round(a * ratio)):int(round(e * ratio))].copy()
                    for k, at_head in ((int(round(bi * ratio)), True), (int(round(bo * ratio)), False)):
                        if k <= 0:
                            continue
                        ramp = ((np.arange(k) + 0.5) / k).astype(np.float32)   # in + out = 1 all along the joint
                        if at_head:
                            s[:, :k] *= ramp
                        else:
                            s[:, s.shape[1] - k:] *= 1 - ramp
                    at = int(round(pos * ratio))
                    seg = mix[:, at:at + s.shape[1]]
                    seg += s[:, :seg.shape[1]]
                np.clip(mix, -1, 1, out=mix)

            outdir = folder_paths.get_output_directory()
            fold, fname, counter, sub, _ = folder_paths.get_save_image_path(filename_prefix, outdir)
            out = os.path.join(fold, f"{fname}_{counter:05}_.mp4")
            part = out[:-4] + ".part.mp4"
            enc = _encoder()
            tb = 1 / fractions.Fraction(fps)
            pbar = comfy.utils.ProgressBar(total)
            with av.open(part, "w", format="mp4", options={"movflags": "+faststart"}) as o:
                vs = o.add_stream(enc, rate=fps)
                vs.width, vs.height, vs.pix_fmt = w, h, "yuv420p"
                if enc == "libx264":
                    vs.options = {"crf": "16", "preset": "medium"}
                else:
                    vs.bit_rate = 20_000_000
                apk = []
                if has_sound:
                    aus = o.add_stream("aac", rate=SR, layout="stereo")
                    aus.bit_rate = 256_000
                    for i in range(0, mix.shape[1], 4096):
                        fr = av.AudioFrame.from_ndarray(np.ascontiguousarray(mix[:, i:i + 4096]), format="fltp", layout="stereo")
                        fr.sample_rate = SR
                        fr.pts = i
                        fr.time_base = fractions.Fraction(1, SR)
                        apk += aus.encode(fr)
                    apk += aus.encode(None)
                ak = 0
                idx = 0

                def put(arr):
                    nonlocal ak, idx
                    f = av.VideoFrame.from_ndarray(arr, format="yuv420p")
                    f.pts = idx
                    f.time_base = tb
                    idx += 1
                    for p in vs.encode(f):
                        t = float(p.dts * p.time_base) if p.dts is not None else 0.0
                        while ak < len(apk) and apk[ak].dts is not None and float(apk[ak].dts * apk[ak].time_base) <= t:
                            o.mux(apk[ak])
                            ak += 1
                        o.mux(p)
                    pbar.update_absolute(idx, total)

                tail = []
                for i, ((nm, src, _), (a, e, bi, bo, pos)) in enumerate(zip(clips, spans)):
                    hold_from = e - bo
                    new_tail = []
                    for k, arr in enumerate(_frames(src, counts[i])):
                        mm.throw_exception_if_processing_interrupted()
                        if k < a or k >= e:
                            continue
                        j = k - a
                        if j < bi:
                            t = (j + 1) / (bi + 1)
                            arr = np.round(tail[j].astype(np.float32) * (1 - t) + arr.astype(np.float32) * t).astype(np.uint8)
                        if k >= hold_from:
                            new_tail.append(arr)
                            continue
                        put(arr)
                    tail = new_tail
                for p in vs.encode(None):
                    while ak < len(apk) and apk[ak].dts is not None and p.dts is not None and \
                            float(apk[ak].dts * apk[ak].time_base) <= float(p.dts * p.time_base):
                        o.mux(apk[ak])
                        ak += 1
                    o.mux(p)
                for q in apk[ak:]:
                    o.mux(q)
            os.replace(part, out)
            part = None
        finally:
            if part and os.path.exists(part):
                os.remove(part)
            for t in tmps:
                if os.path.exists(t):
                    os.remove(t)
        msg = (f"{os.path.relpath(out, outdir)} · {len(clips)} clips · {idx} frames · {idx / float(fps):.2f} s · "
               f"{w}x{h} {float(fps):g} fps{'' if has_sound else ' · no sound'}")
        print(f"[WMount] {msg}")
        return {"ui": {"images": [{"filename": os.path.basename(out), "subfolder": sub, "type": "output"}], "animated": (True,)},
                "result": (out,)}


# ---- GET /wextraui/mount_clips?folder=...: the clips of a folder for the rows; /wextraui/mount_folders: the menu ---------
try:
    from server import PromptServer
    from aiohttp import web

    @PromptServer.instance.routes.get("/wextraui/mount_clips")
    async def _wx_mount_clips(request):
        import asyncio
        from .extractor import info

        def run():
            return [{"name": n, "frames": info(p)["frames"]} for n, p in folder_clips(request.query.get("folder", ""))]
        try:
            return web.json_response(await asyncio.to_thread(run))
        except Exception as e:
            return web.json_response({"error": str(e)}, status=400)

    @PromptServer.instance.routes.get("/wextraui/mount_folders")
    async def _wx_mount_folders(request):
        import asyncio
        return web.json_response(await asyncio.to_thread(folder_choices))
except Exception:
    pass
