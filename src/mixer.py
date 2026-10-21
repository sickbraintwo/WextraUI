"""WMixer (Sick, 17/10/2026): un mixer a timeline, nel nodo, come i livelli di After Effects. Ogni traccia e' un file audio
(della cartella input o output di ComfyUI) con volume, muto, solo e spostamento; su ogni traccia i tratti accesi (clip),
ciascuno con la sua dissolvenza d'entrata e d'uscita. Il frontend (web/wxMixer.js) disegna le tracce con la forma
d'onda, i tagli delle scene (dalla timeline di WLoop Start Foley) e la griglia delle battute (bpm), e le suona dal vivo
mentre le modifichi, col video accanto; questo file, al Run, fa lo stesso mix in alta qualita' e lo da' come AUDIO.

Lo stato vive in un widget nascosto, `mix_state`, in JSON:
    {"duration": 0, "dur_eff": 60.8, "video": {"name": "...", "type": "output"}, "bpm": 113, "beat": 0,
     "tracks": [{"name": "Archi", "file": {"name": "MM_ACE/archi_00001_.flac", "type": "output"},
                 "gain": -6, "mute": false, "solo": false, "offset": 0,
                 "clips": [{"s": 0, "e": 18.2, "fi": 0, "fo": 0.5}],
                 "env": [{"t": 20, "v": 0.7071, "c": 0}, {"t": 20.5, "v": 0.3, "c": 0}]}]}
`o` di un clip (facoltativo) e' il suo spostamento del suono in piu' di quello della traccia: il clip spostato col
tasto centrale si porta dietro il suo pezzo di suono.
`env` e' la linea del volume della traccia (punti nel tempo, con curva fra un punto e l'altro: env_gain).
Tempi in secondi; `duration` 0 = quella che il frontend ha calcolato (`dur_eff`: il video, o la traccia piu' lunga).
Una traccia con `"source": "video"` al posto di `file` suona l'audio del video scelto (estratto una volta in un flac
della cartella temp di ComfyUI)."""
import json
import math
import os

import torch

SR = 48000
AUDIO_EXT = (".flac", ".wav", ".mp3", ".ogg", ".m4a", ".aac", ".opus")
VIDEO_EXT = (".mp4", ".mov", ".webm", ".mkv")
MAX_FILES = 3000


def _roots():
    import folder_paths
    return {"input": folder_paths.get_input_directory(), "output": folder_paths.get_output_directory()}


def resolve(f):
    """{"name": "sub/x.flac", "type": "output"} -> the absolute path, only inside ComfyUI's input or output folder."""
    if not isinstance(f, dict) or not f.get("name"):
        raise ValueError("WMixer: a track without a file.")
    roots = _roots()
    root = roots.get(f.get("type", "output"))
    if root is None:
        raise ValueError(f"WMixer: unknown folder `{f.get('type')}`.")
    p = os.path.normpath(os.path.join(root, f["name"]))
    if os.path.commonpath([os.path.abspath(root), os.path.abspath(p)]) != os.path.abspath(root):
        raise ValueError(f"WMixer: `{f['name']}` is outside the {f.get('type')} folder.")
    if not os.path.isfile(p):
        raise ValueError(f"WMixer: no file `{f['name']}` in {f.get('type')}.")
    return p


def video_audio(v):
    """The sound of video v as a flac in ComfyUI's temp folder, made once per version of the file: (relative name, path),
    or (None, None) when the video has no sound."""
    import hashlib
    import folder_paths
    from .avtools import audio_to_flac
    src = resolve(v)
    st = os.stat(src)
    h = hashlib.sha1(f"{src}|{st.st_mtime}|{st.st_size}".encode()).hexdigest()[:16]
    rel = f"wextraui_mixer/{h}.flac"
    out = os.path.join(folder_paths.get_temp_directory(), rel)
    if os.path.isfile(out):
        return rel, out
    os.makedirs(os.path.dirname(out), exist_ok=True)
    try:
        if not audio_to_flac(src, out):
            return None, None
    except Exception as e:
        raise RuntimeError(f"WMixer: cannot take the sound out of {v.get('name')}: {e}")
    return rel, out


def video_proxy(v):
    """A light copy of video v for the player of the timeline, in ComfyUI's temp folder, made once per version of the
    file: at most 720 px high, no sound, a keyframe every 4 frames, so a jump anywhere shows its frame at once (a
    video with a keyframe every few seconds has to be decoded from there at every jump). -> (relative name, fps)."""
    import hashlib
    import av
    import folder_paths
    from .avtools import proxy
    src = resolve(v)
    st = os.stat(src)
    h = hashlib.sha1(f"{src}|{st.st_mtime}|{st.st_size}".encode()).hexdigest()[:16]
    rel = f"wextraui_mixer/{h}_scrub.mp4"
    out = os.path.join(folder_paths.get_temp_directory(), rel)
    with av.open(src) as c:
        if not c.streams.video:
            raise ValueError(f"WMixer: {v.get('name')} has no picture.")
        fps = float(c.streams.video[0].average_rate or 0) or 24.0
    if os.path.isfile(out):
        return rel, fps
    os.makedirs(os.path.dirname(out), exist_ok=True)
    try:
        proxy(src, out)
    except Exception as e:
        raise RuntimeError(f"WMixer: cannot make the light copy of {v.get('name')}: {e}")
    return rel, fps


def track_path(t, state):
    """The file a track plays: its own, or the sound of the state's video for the video's track (None if it has none)."""
    if t.get("source") == "video":
        return video_audio(state["video"])[1] if state.get("video") else None
    return resolve(t["file"])


def list_files():
    """Every audio and video file of input and output (temp excluded), newest first."""
    out = {"audio": [], "video": []}
    for typ, root in _roots().items():
        for dp, dn, fn in os.walk(root):
            dn[:] = [d for d in dn if not d.startswith(".")]
            for n in fn:
                low = n.lower()
                kind = "audio" if low.endswith(AUDIO_EXT) else "video" if low.endswith(VIDEO_EXT) else None
                if not kind:
                    continue
                full = os.path.join(dp, n)
                rel = os.path.relpath(full, root).replace("\\", "/")
                try:
                    st = os.stat(full)
                except OSError:
                    continue
                out[kind].append({"name": rel, "type": typ, "mtime": st.st_mtime, "size": st.st_size})
    for k in out:
        out[k].sort(key=lambda x: -x["mtime"])
        out[k] = out[k][:MAX_FILES]
    return out


def ramp(n, rising):
    x = (torch.arange(n, dtype=torch.float32) + 0.5) / max(1, n)
    return torch.sin(x * math.pi / 2) if rising else torch.cos(x * math.pi / 2)


def load_track(path):
    from comfy_extras.nodes_audio import load
    import comfy.audio
    wav, sr = load(path)
    wav = wav.float()
    if sr != SR:
        wav = comfy.audio.resample(wav, sr, SR)
    if wav.shape[0] == 1:
        wav = wav.expand(2, -1)
    return wav[:2].contiguous()


def env_gain(points, t):
    """The volume line of a track at times `t` (seconds, a tensor) -> the gain there, or None when it has no points.
    Points {t, v, c}: v is the height of the line (0 = silence, 1 = +6 dB; the gain is 2*v^2, so 0 dB = 1/sqrt 2); c bends
    the stretch to the next point (0 = straight, the stretch goes as u^(2^c)); before the first point and after the last
    the line stays at their height. The same reckoning as envV() in web/wxMixer.js."""
    p = sorted((x for x in points or [] if isinstance(x, dict) and "t" in x and "v" in x), key=lambda x: float(x["t"]))
    if not p:
        return None
    v = torch.full_like(t, float(p[0]["v"]))
    for a, b in zip(p, p[1:]):
        ta, tb = float(a["t"]), float(b["t"])
        m = (t >= ta) & (t < tb)
        if tb > ta and bool(m.any()):
            u = ((t[m] - ta) / (tb - ta)).clamp(0, 1)
            v[m] = float(a["v"]) + (float(b["v"]) - float(a["v"])) * u ** (2.0 ** float(a.get("c") or 0))
    v[t >= float(p[-1]["t"])] = float(p[-1]["v"])
    v = v.clamp(0, 1)
    return 2 * v * v


def render(state, load=load_track):
    """The mix of `state` -> (2 x samples tensor at SR, duration, lines of info)."""
    tracks = [t for t in state.get("tracks", []) if t.get("file") or t.get("source") == "video"]
    solo = any(t.get("solo") for t in tracks)
    live = [t for t in tracks if not t.get("mute") and (t.get("solo") or not solo)]
    waves = [(t, load(p)) for t, p in ((t, track_path(t, state)) for t in live) if p]
    dur = float(state.get("duration") or 0) or float(state.get("dur_eff") or 0)
    if dur <= 0:
        dur = max([float(t.get("offset") or 0) + w.shape[-1] / SR for t, w in waves] or [0])
    if dur <= 0:
        raise ValueError("WMixer: nothing to mix (no track, or every track muted).")
    N = int(round(dur * SR))
    out = torch.zeros((2, N))
    info = []
    for t, wav in waves:
        g = 10 ** (float(t.get("gain") or 0) / 20)
        off = int(round(float(t.get("offset") or 0) * SR))
        used = 0.0
        for c in t.get("clips", []):
            s, e = max(0.0, float(c["s"])), min(dur, float(c["e"]))
            if e <= s:
                continue
            p0, p1 = int(round(s * SR)), int(round(e * SR))
            n = p1 - p0
            seg = torch.zeros((2, n))
            co = off + int(round(float(c.get("o") or 0) * SR))   # the clip carries its own piece of sound: its shift on top
            q0, q1 = p0 - co, p1 - co                       # the same stretch, in the file's own samples
            a, b = max(q0, 0), min(q1, wav.shape[-1])
            if b > a:
                seg[:, a - q0:b - q0] = wav[:, a:b]
            fi = min(n, int(round(max(0.0, float(c.get("fi") or 0)) * SR)))
            fo = min(n - fi, int(round(max(0.0, float(c.get("fo") or 0)) * SR)))
            if fi > 0:
                seg[:, :fi] *= ramp(fi, True)
            if fo > 0:
                seg[:, n - fo:] *= ramp(fo, False)
            env = env_gain(t.get("env"), (torch.arange(n, dtype=torch.float32) + p0) / SR)
            if env is not None:
                seg *= env
            out[:, p0:p1] += seg * g
            used += e - s
        info.append(f"{t.get('name') or (t.get('file') or {}).get('name')}: {float(t.get('gain') or 0):+.1f} dB, offset {float(t.get('offset') or 0):+.2f} s, "
                    f"{len(t.get('clips', []))} clips, {used:.1f} s on" + (f", volume line of {len(t['env'])} points" if t.get("env") else ""))
    return out, dur, info


class WMixer:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mix_state": ("STRING", {"default": "{}", "tooltip": "The tracks and their clips (written by the timeline)."}),
                "ceiling_db": ("FLOAT", {"default": -1.0, "min": -12.0, "max": 0.0, "step": 0.5,
                                         "tooltip": "If the mix peaks above this, the whole mix comes down until it does not "
                                                    "(a volume change, nothing is squashed). 0 = off."}),
            },
        }

    RETURN_TYPES = ("AUDIO", "STRING")
    RETURN_NAMES = ("audio", "info")
    OUTPUT_TOOLTIPS = ("The mix, as long as the timeline (48 kHz stereo).", "What went in, track by track.")
    OUTPUT_NODE = True
    FUNCTION = "mix"
    CATEGORY = "WextraUI/Audio"
    DESCRIPTION = ("A timeline mixer: audio files as tracks, with volume, mute, solo and offset; on each track the "
                   "stretches that play, with their fades. It plays live in the node, next to the video; Run renders it.")

    @classmethod
    def IS_CHANGED(cls, mix_state, ceiling_db):
        """A file rewritten under the same name counts as a change."""
        stamp = []
        try:
            st = json.loads(mix_state or "{}")
            for t in st.get("tracks", []):
                try:
                    stamp.append(os.path.getmtime(resolve(st["video"] if t.get("source") == "video" else t.get("file"))))
                except Exception:
                    stamp.append(None)
        except Exception:
            pass
        return f"{mix_state}|{ceiling_db}|{stamp}"

    def mix(self, mix_state, ceiling_db):
        try:
            state = json.loads(mix_state or "{}")
        except json.JSONDecodeError as e:
            raise ValueError(f"WMixer: mix_state is not readable ({e}).")
        out, dur, info = render(state)
        peak = float(out.abs().max()) if out.numel() else 0.0
        db = 20 * math.log10(peak) if peak > 0 else -120.0
        line = f"{dur:.2f} s · peak {db:.1f} dB"
        if ceiling_db < 0 and peak > 10 ** (ceiling_db / 20):
            out *= 10 ** (ceiling_db / 20) / peak
            line += f" -> brought down to {ceiling_db:.1f} dB"
        text = "\n".join([line] + info)
        return {"ui": {"wx_mix": [{"duration": dur, "peak_db": round(db, 1), "info": text}]},
                "result": ({"waveform": out.unsqueeze(0), "sample_rate": SR}, text)}


# ---- GET /wextraui/media_files: the audio and video files the timeline can pick ----------------------------------
try:
    from server import PromptServer
    from aiohttp import web

    @PromptServer.instance.routes.get("/wextraui/media_files")
    async def _wx_media_files(request):
        return web.json_response(list_files())

    @PromptServer.instance.routes.get("/wextraui/video_audio")
    async def _wx_video_audio(request):
        import asyncio
        v = {"name": request.query.get("name", ""), "type": request.query.get("type", "output")}
        try:
            rel, _ = await asyncio.to_thread(video_audio, v)
        except Exception as e:
            return web.json_response({"file": None, "error": str(e)}, status=400)
        return web.json_response({"file": {"name": rel, "type": "temp"} if rel else None})

    @PromptServer.instance.routes.get("/wextraui/video_proxy")
    async def _wx_video_proxy(request):
        import asyncio
        v = {"name": request.query.get("name", ""), "type": request.query.get("type", "output")}
        try:
            rel, fps = await asyncio.to_thread(video_proxy, v)
        except Exception as e:
            return web.json_response({"file": None, "error": str(e)}, status=400)
        return web.json_response({"file": {"name": rel, "type": "temp"}, "fps": fps})
except Exception:
    pass
