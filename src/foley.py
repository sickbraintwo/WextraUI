"""Nodi Foley (Sick, 16/10/2026): il suono di un video intero con LTX-2.3 + LoRA Foley V2A, a finestre, in un Run solo,
con un prompt per ogni scena. Lo schema e' quello dei nodi loop H3, sul For Loop di Easy-Use:

- **WLoop Start Foley** (fuori dal loop): il video caricato intero + la timeline delle scene (`tempo | prompt | seed`)
  -> il piano delle finestre (al massimo `window` frame, 169 = 7 s a 24 fps), quante sono (il `total` del For Loop) e il
  mix vuoto (initial_value1).
- **WLoop Window Foley** (dentro): piano + indice -> i frame della finestra (ridimensionati a `megapixels`, lati
  multipli di 32), quanti sono (1+8n), il prompt e il seed della sua scena.
- **WLoop End Foley** (dentro, in fondo): l'audio appena generato entra nel mix al suo posto, con le dissolvenze:
  lunga (`overlap`) fra due finestre della stessa scena, corta (`cut_fade`) sul taglio fra due scene, perche' a un
  taglio di immagine risponde un taglio di suono. All'ultima finestra il mix scende di volume se supera `ceiling_db`.
- **WAonV** (dopo il loop): l'audio intero montato su un file video (anche quello in alta definizione), il video
  copiato com'e', senza ricodifica.

Timeline: una riga per scena, `tempo | prompt` o `tempo | prompt | seed`; il tempo in secondi (`6`, `6.5`, `6,5`),
in minuti (`1:02.5`) o in frame (`144f`). Una riga senza `|` continua il prompt della scena sopra; `#` = commento.
La prima scena parte sempre da 0. Un tempo con `+` davanti (`+16.5 | ...`) e' una **battuta** (Sick, 19/10): cambia cio'
che suona ma il piano e' lo stesso, quindi l'entrata non e' il taglio corto (`cut_fade`) ma la dissolvenza lunga
(`overlap`) delle finestre di una stessa scena. Per il resto conta come una scena (ha il suo numero per `redo_scenes`).

Rifare solo alcune scene (Sick, 17/10): `redo_scenes` (`4` · `4, 7` · `4-6`) + `previous_audio`, il suono intero di un
giro prima: il loop genera solo le finestre di quelle scene e le mette nel vecchio audio, che li' si spegne con le
stesse dissolvenze con cui le nuove entrano (nella dissolvenza resta un filo della scena vecchia)."""
import math
import re

import torch

FPS_DEFAULT = 24
WINDOW_DEFAULT = 169            # 1 + 8*21: 7 s at 24 fps, the longest the Foley LoRA was shown
CANVAS_MULTIPLE = 32
SAMPLE_RATE = 48000             # the LTX-2.3 audio VAE; the real one comes with the first window
TIME = re.compile(r"^(?:(\d+):)?(\d+(?:[.,]\d+)?)\s*(f?)$")
PLAN = "FOLEY_PLAN"


def grid(n):
    """The largest 1+8k not above n (the frame counts LTX takes)."""
    return 1 + 8 * ((int(n) - 1) // 8)


def grid_up(n):
    """The smallest 1+8k not under n."""
    return 1 + 8 * max(1, math.ceil((int(n) - 1) / 8))


def parse_time(tok, fps):
    """`6` / `6.5` / `6,5` seconds, `1:02.5` minutes, `144f` frames -> a frame index; None if it is not a time."""
    m = TIME.match(tok.strip())
    if not m:
        return None
    minutes, value, frames = m.groups()
    value = float(value.replace(",", "."))
    if frames:
        return None if minutes else int(round(value))
    return int(round((int(minutes or 0) * 60 + value) * fps))


def parse_mark(tok):
    """`+16.5` -> (True, `16.5`): a beat, the same shot going on; `16.5` -> (False, `16.5`): a cut."""
    tok = tok.strip()
    return (True, tok[1:].strip()) if tok.startswith("+") else (False, tok)


def parse_timeline(text, fps):
    """The lines of the timeline -> [(frame, prompt, seed or None, beat)], sorted, the first one at frame 0 (and never
    a beat: there is nothing before it to go on from)."""
    scenes = []
    for no, raw in enumerate(str(text or "").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "|" not in line:
            if not scenes:
                raise ValueError(f"WLoop Start Foley: line {no} has no time. Write `time | prompt` (e.g. `0 | metal clank`).")
            f, p, s, bt = scenes[-1]
            scenes[-1] = (f, f"{p} {line}".strip(), s, bt)
            continue
        parts = [x.strip() for x in line.split("|")]
        beat, tok = parse_mark(parts[0])
        frame = parse_time(tok, fps)
        if frame is None:
            raise ValueError(f"WLoop Start Foley: line {no}, `{parts[0]}` is not a time (6 · 6.5 · 1:02.5 · 144f · +6.5).")
        seed = None
        if len(parts) > 2 and parts[2]:
            try:
                seed = int(parts[2])
            except ValueError:
                raise ValueError(f"WLoop Start Foley: line {no}, the seed `{parts[2]}` is not a whole number.")
        scenes.append((frame, parts[1], seed, beat))
    scenes.sort(key=lambda x: x[0])
    for x, y in zip(scenes, scenes[1:]):
        if x[0] == y[0]:
            raise ValueError(f"WLoop Start Foley: two scenes start at frame {x[0]}.")
    if scenes:
        scenes[0] = (0, scenes[0][1], scenes[0][2], False)
    return scenes


def plan_windows(total, fps, scenes, window=WINDOW_DEFAULT, overlap=1.0, cut_fade=0.1, seed=0, common=""):
    """Cut each scene into windows of at most `window` frames (1+8n), overlapping by `overlap` seconds at least,
    spread evenly. Every window says which part of its audio goes in the mix (use_from..use_to, frames of the video)
    and how long its fades are: the overlap inside a scene, `cut_fade` across a cut (the earlier scene's last window
    runs `cut_fade` past the cut and fades out while the next one fades in from the cut), the overlap again across a
    beat (the same shot goes on: a short fade there would sound like a seam). A scene is (frame, prompt, seed[, beat])."""
    total = int(total)
    if total < 9:
        raise ValueError(f"WLoop Start Foley: the video has {total} frames, at least 9 are needed.")
    W = min(grid(max(9, window)), grid(total))
    O = min(max(1, int(round(overlap * fps))), (W - 1) // 2)
    C = max(0, int(round(cut_fade * fps)))
    scenes = [tuple(s) + (False,) * (4 - len(s)) for s in scenes if s[0] < total] or [(0, "", None, False)]
    common = str(common or "").strip()
    windows, spans, prev_end = [], [], 0
    for k, (a, prompt, sseed, beat) in enumerate(scenes):
        b = scenes[k + 1][0] if k + 1 < len(scenes) else total
        last_scene = k + 1 == len(scenes)
        e = total if last_scene else min(total, b + (O if scenes[k + 1][3] else C))
        spans.append({"from": a, "to": b, "end": e, "prompt": f"{prompt} {common}".strip(), "beat": bool(beat)})
        span = e - a
        n = 1 if span <= W else math.ceil((span - O) / (W - O))
        need = span if n == 1 else math.ceil((span - O) / n) + O
        L = min(W, grid_up(need))
        starts = [a] if n == 1 else [a + (j * (span - L)) // (n - 1) for j in range(n)]
        starts = [min(max(0, s), total - L) for s in starts]
        text = f"{prompt} {common}".strip()
        for j, s in enumerate(starts):
            u = a if j == 0 else s
            v = e if j == n - 1 else s + L
            fade_in = (prev_end - a) if (j == 0 and k > 0) else (0 if j == 0 else starts[j - 1] + L - s)
            fade_out = (e - b) if j == n - 1 else s + L - starts[j + 1]
            windows.append({"index": len(windows), "scene": k, "start": s, "frames": L, "use_from": u, "use_to": v,
                            "fade_in": max(0, fade_in), "fade_out": max(0, fade_out), "prompt": text,
                            "seed": int(sseed if sseed is not None else seed) + j, "scene_from": a, "scene_to": b,
                            "beat": bool(beat) and j == 0})
        prev_end = e
    return {"fps": int(fps), "total": total, "windows": windows, "scenes": len(scenes), "spans": spans}


def parse_redo(text, count):
    """`4` · `4, 7` · `4-6` -> the sorted scene numbers (0 = the first scene); empty -> []."""
    out = set()
    for part in re.split(r"[,\s;]+", str(text or "").strip()):
        if not part:
            continue
        m = re.match(r"^(\d+)(?:-(\d+))?$", part)
        if not m:
            raise ValueError(f"WLoop Start Foley: redo_scenes, `{part}` is not a scene number (4 · 4, 7 · 4-6).")
        a = int(m.group(1))
        b = int(m.group(2) or a)
        for k in range(min(a, b), max(a, b) + 1):
            if k >= count:
                raise ValueError(f"WLoop Start Foley: redo_scenes, there is no scene {k} (they go 0..{count - 1}).")
            out.add(k)
    return sorted(out)


def base_gain(plan, redo, sr):
    """How much of the previous audio stays, sample by sample: 0 inside the scenes made again, a constant-power fade
    where they meet a scene that stays (the same fade the new windows come in and go out with), 1 elsewhere."""
    fps, spans = plan["fps"], plan["spans"]
    P = lambda f: int(round(f * sr / fps))
    g = torch.ones(P(plan["total"]))
    redo = set(redo)
    for k in redo:
        s = spans[k]
        a = s["from"]
        z0 = a
        if k > 0 and k - 1 not in redo:          # the scene before stays: the old audio fades out while the new comes in
            p0, p1 = P(a), P(spans[k - 1]["end"])
            if p1 > p0:
                g[p0:p1] = ramp(p1 - p0, False)
            z0 = spans[k - 1]["end"]
        z1 = s["end"] if (k + 1 in redo or k + 1 == len(spans)) else s["to"]
        g[P(z0):P(z1)] = 0
        if k + 1 < len(spans) and k + 1 not in redo:   # the scene after stays: the old audio comes back as the new goes
            p0, p1 = P(s["to"]), P(s["end"])
            if p1 > p0:
                g[p0:p1] = ramp(p1 - p0, True)
    return g


def window_line(w, fps):
    t = lambda f: f"{f / fps:.2f}"
    return (f"#{w['index']} scene {w['scene']}{' (beat)' if w.get('beat') else ''} · frames {w['start']}-{w['start'] + w['frames'] - 1} "
            f"({t(w['start'])}-{t(w['start'] + w['frames'])} s) · in the mix {t(w['use_from'])}-{t(w['use_to'])} s "
            f"· fades {t(w['fade_in'])}/{t(w['fade_out'])} s · seed {w['seed']} · {w['prompt'][:70]}")


def canvas(h, w, megapixels):
    """The window's size: the video's aspect at `megapixels` (0 = its own size), sides to the nearest multiple of 32."""
    scale = math.sqrt(megapixels * 1_000_000 / (w * h)) if megapixels > 0 else 1.0
    tw = max(CANVAS_MULTIPLE, round(w * scale / CANVAS_MULTIPLE) * CANVAS_MULTIPLE)
    th = max(CANVAS_MULTIPLE, round(h * scale / CANVAS_MULTIPLE) * CANVAS_MULTIPLE)
    return int(th), int(tw)


def ramp(n, rising, device=None):
    """Constant-power fade of n samples: sin rising, cos falling (their squares sum to 1, the level does not dip)."""
    x = (torch.arange(n, dtype=torch.float32, device=device) + 0.5) / max(1, n)
    return torch.sin(x * math.pi / 2) if rising else torch.cos(x * math.pi / 2)


def place(mix, sr, wav, w, fps):
    """Add one window's audio (channels x samples) to the mix (channels x samples), where the plan says, with its fades."""
    P = lambda f: int(round(f * sr / fps))
    p0, p1 = P(w["use_from"]), P(w["use_to"])
    off = P(w["use_from"] - w["start"])
    n = max(0, min(p1, mix.shape[-1]) - p0)
    seg = torch.zeros((mix.shape[0], n), dtype=mix.dtype, device=mix.device)
    src = wav[:, off:off + n]
    if src.shape[0] != mix.shape[0]:
        src = src.mean(0, keepdim=True).expand(mix.shape[0], -1)
    seg[:, :src.shape[-1]] = src.to(mix.dtype)
    fi = min(n, P(w["use_from"] + w["fade_in"]) - p0)
    fo = min(n, p1 - P(w["use_to"] - w["fade_out"]))
    if fi > 0:
        seg[:, :fi] *= ramp(fi, True, seg.device)
    if fo > 0:
        seg[:, n - fo:] *= ramp(fo, False, seg.device)
    mix[:, p0:p0 + n] += seg
    return mix


def _window(plan, index, who):
    i = int(index)
    ws = plan["windows"]
    if i < 0 or i >= len(ws):
        raise ValueError(f"{who}: window {i} out of range (0..{len(ws) - 1}). The For Loop total must be the `windows` of WLoop Start Foley.")
    return ws[i]


class FoleyLoopStart:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {"tooltip": "The whole video, loaded at the fps below (Load Video: force_rate 24). Load it small "
                                                "(custom width 512 or so): the windows are scaled anyway, and a long video in high "
                                                "definition fills the memory."}),
                "timeline": ("STRING", {"multiline": True, "default": "",
                                        "placeholder": "One line per scene: time | prompt. From WAudio Prompts, or by hand; +time = a beat.",
                                        "tooltip": "One line per scene: `time | prompt` or `time | prompt | seed`. Time in seconds (6 · 6.5), "
                                                   "minutes (1:02.5) or frames (144f). A line without `|` goes on with the prompt above; "
                                                   "# = a comment. The first scene always starts at 0. `+` before the time (+16.5) = "
                                                   "a beat: the sound changes but the shot goes on, so it fades in over `overlap`, "
                                                   "not `cut_fade`."}),
                "common": ("STRING", {"multiline": True, "default": "No speech is present. No music is present.",
                                      "placeholder": "Added at the end of every scene's prompt.",
                                      "tooltip": "Added at the end of every scene's prompt."}),
                "fps": ("INT", {"default": FPS_DEFAULT, "min": 1, "max": 120,
                                "tooltip": "The frame rate the video is loaded at; the audio latent and the mask must say the same."}),
                "window": ("INT", {"default": WINDOW_DEFAULT, "min": 9, "max": 1001, "step": 8,
                                   "tooltip": "The longest window, in frames (1+8n). 169 = 7 s at 24 fps, the longest clip the "
                                              "Foley LoRA was trained on; longer ones drift."}),
                "overlap": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 3.0, "step": 0.1,
                                      "tooltip": "Seconds two windows of the same scene share: the cross-fade between them, "
                                                 "and into a beat (+)."}),
                "cut_fade": ("FLOAT", {"default": 0.1, "min": 0.0, "max": 2.0, "step": 0.05,
                                       "tooltip": "Seconds of cross-fade between two scenes. On a cut, short (0.1): a cut in the "
                                                  "picture is a cut in the sound; 0 = a hard cut. When one material melts into "
                                                  "the next, longer (0.5 or more)."}),
                "seed": ("INT", {"default": 42, "min": 0, "max": 0xFFFFFFFF,
                                 "tooltip": "The seed of the scenes that do not write their own; each window of a scene adds 1."}),
                "redo_scenes": ("STRING", {"default": "",
                                           "tooltip": "Empty = every scene. `4` · `4, 7` · `4-6` = only those scenes (numbered from 0, "
                                                      "as in the info), put into previous_audio in place of the old ones, with the "
                                                      "same fades. Change their prompt or seed in the timeline first."}),
            },
            "optional": {
                "previous_audio": ("AUDIO", {"tooltip": "The whole sound of an earlier run (Load Audio of its flac), for redo_scenes."}),
            },
        }

    RETURN_TYPES = (PLAN, "INT", "AUDIO", "STRING")
    RETURN_NAMES = ("plan", "windows", "mix", "info")
    OUTPUT_TOOLTIPS = (
        "The windows: where each starts, how long it is, its prompt, seed and fades. For WLoop Window and WLoop End Foley.",
        "How many windows, for the For Loop's total.",
        "The empty mix, for the For Loop's initial_value1.",
        "One line per window, for a Show Anything node.",
    )
    FUNCTION = "plan"
    CATEGORY = "WextraUI/Foley"
    DESCRIPTION = ("The sound of a whole video in one Run: a timeline of scenes (a prompt each) cut into windows the "
                   "Foley LoRA can take (7 s), overlapping, for an Easy-Use For Loop.")

    def plan(self, images, timeline, common, fps, window, overlap, cut_fade, seed, redo_scenes="", previous_audio=None):
        scenes = parse_timeline(timeline, fps)
        if not scenes and not str(common).strip():
            raise ValueError("WLoop Start Foley: the timeline is empty. Write at least `0 | what you hear`.")
        p = plan_windows(images.shape[0], fps, scenes, window, overlap, cut_fade, seed, common)
        p["size"] = (int(images.shape[1]), int(images.shape[2]))
        redo = parse_redo(redo_scenes, p["scenes"])
        mix = {"waveform": torch.zeros((1, 2, 0)), "sample_rate": SAMPLE_RATE}
        head = f"{p['total']} frames ({p['total'] / fps:.2f} s) · {p['scenes']} scenes · {len(p['windows'])} windows"
        if redo:
            if previous_audio is None:
                raise ValueError("WLoop Start Foley: redo_scenes needs previous_audio, the whole sound of the earlier run "
                                 "(Load Audio of its flac).")
            sr = int(previous_audio["sample_rate"])
            old = previous_audio["waveform"][0].float().cpu()
            length = int(round(p["total"] * sr / fps))
            if abs(old.shape[-1] - length) > sr:   # more than a second apart: not the sound of this video
                raise ValueError(f"WLoop Start Foley: previous_audio lasts {old.shape[-1] / sr:.2f} s, the video "
                                 f"{p['total'] / fps:.2f} s. It must be the sound of this same video.")
            buf = torch.zeros((max(2, old.shape[0]), length))
            n = min(length, old.shape[-1])
            buf[:, :n] = old[:, :n] if old.shape[0] == buf.shape[0] else old[:1, :n].expand(buf.shape[0], -1)
            buf *= base_gain(p, redo, sr)
            mix = {"waveform": buf.unsqueeze(0), "sample_rate": sr}
            p["windows"] = [dict(w, index=i) for i, w in enumerate(w for w in p["windows"] if w["scene"] in redo)]
            head += f" · redo scenes {', '.join(map(str, redo))}: {len(p['windows'])} windows"
        t = lambda f: f"{f / fps:.2f}"
        scene_lines = [f"scene {k} · {t(s['from'])}-{t(s['to'])} s · {s['prompt'][:70]}" for k, s in enumerate(p["spans"])]
        info = "\n".join([head] + scene_lines + [""] + [window_line(w, fps) for w in p["windows"]])
        return (p, len(p["windows"]), mix, info)


class FoleyLoopWindow:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "plan": (PLAN, {"tooltip": "From WLoop Start Foley."}),
                "index": ("INT", {"forceInput": True, "tooltip": "The For Loop's index."}),
                "images": ("IMAGE", {"tooltip": "The whole video, the same that goes into WLoop Start Foley."}),
                "megapixels": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 2.0, "step": 0.05,
                                         "tooltip": "The window's size: the video's aspect at this area, sides to multiples of 32. "
                                                    "0.5 is about 960 x 544, the size the Foley LoRA was trained at; "
                                                    "0 = the size it was loaded at (rounded to 32)."}),
            },
        }

    RETURN_TYPES = ("IMAGE", "INT", "STRING", "INT", "STRING")
    RETURN_NAMES = ("images", "frames", "prompt", "seed", "info")
    OUTPUT_TOOLTIPS = (
        "The frames of this window, for the VAE Encode of the frozen video.",
        "How many frames (1+8n), for the audio latent's frames_number.",
        "The prompt of this window's scene (with the common text), for the positive text encoder.",
        "This window's seed, for RandomNoise.",
        "Where this window is, for a Show Anything node.",
    )
    FUNCTION = "window"
    CATEGORY = "WextraUI/Foley"
    DESCRIPTION = "One window of the plan: its frames, its length, its scene's prompt and its seed."

    def window(self, plan, index, images, megapixels):
        w = _window(plan, index, "WLoop Window Foley")
        clip = images[w["start"]:w["start"] + w["frames"]]
        if clip.shape[0] != w["frames"]:
            raise ValueError(f"WLoop Window Foley: the plan wants frames {w['start']}-{w['start'] + w['frames'] - 1}, the video "
                             f"has {images.shape[0]}. The images must be the same that go into WLoop Start Foley.")
        th, tw = canvas(clip.shape[1], clip.shape[2], megapixels)
        if (th, tw) != (clip.shape[1], clip.shape[2]):
            import comfy.utils
            clip = comfy.utils.common_upscale(clip.movedim(-1, 1), tw, th, "bilinear", "center").movedim(1, -1)
        info = window_line(w, plan["fps"]) + f" · {tw}x{th}"
        return (clip, w["frames"], w["prompt"], w["seed"], info)


class FoleyLoopEnd:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "plan": (PLAN, {"tooltip": "From WLoop Start Foley."}),
                "index": ("INT", {"forceInput": True, "tooltip": "The For Loop's index."}),
                "audio": ("AUDIO", {"tooltip": "The audio of this window, decoded."}),
                "mix": ("AUDIO", {"tooltip": "The mix so far: the For Loop's value1."}),
                "ceiling_db": ("FLOAT", {"default": -1.0, "min": -12.0, "max": 0.0, "step": 0.5,
                                         "tooltip": "At the last window, if the mix peaks above this the whole mix comes down "
                                                    "until it does not (a volume change, not a limiter: nothing is squashed). 0 = off."}),
            },
        }

    RETURN_TYPES = ("AUDIO", "STRING")
    RETURN_NAMES = ("mix", "info")
    OUTPUT_TOOLTIPS = ("The mix with this window in it: to the For Loop End's initial_value1. After the loop: the whole sound.",
                       "What went in and where, for a Show Anything node.")
    FUNCTION = "add"
    CATEGORY = "WextraUI/Foley"
    DESCRIPTION = ("Puts the window just made in the mix, at its place, with its fades; at the last window brings the "
                   "level under the ceiling.")

    def add(self, plan, index, audio, mix, ceiling_db):
        w = _window(plan, index, "WLoop End Foley")
        fps = plan["fps"]
        sr = int(audio["sample_rate"])
        wav = audio["waveform"][0].float().cpu()
        length = int(round(plan["total"] * sr / fps))
        old = mix["waveform"][0].float().cpu() if mix is not None else None
        if old is None or old.shape[-1] != length or int(mix["sample_rate"]) != sr:
            buf = torch.zeros((max(2, wav.shape[0]), length))
        else:
            buf = old.clone()
            if buf.shape[0] < wav.shape[0]:
                buf = buf.expand(wav.shape[0], -1).clone()
        place(buf, sr, wav, w, fps)
        info = window_line(w, fps)
        if w["index"] == len(plan["windows"]) - 1:
            peak = float(buf.abs().max()) if buf.numel() else 0.0
            info += f"\nlast window · peak {20 * math.log10(peak) if peak > 0 else -120:.1f} dB"
            if ceiling_db < 0 and peak > 0:
                lim = 10 ** (ceiling_db / 20)
                if peak > lim:
                    buf *= lim / peak
                    info += f" -> brought down to {ceiling_db:.1f} dB"
        return ({"waveform": buf.unsqueeze(0), "sample_rate": sr}, info)


def video_choices():
    """The video files the menu offers: those of the input folder, then those of the output folder, each in alphabetical
    order, as `folder/name.mp4 [input]`; `none` first (= the video comes from the cable)."""
    from .mixer import list_files
    fl = list_files()["video"]
    out = ["none"]
    for typ in ("input", "output"):
        out += sorted((f"{f['name']} [{typ}]" for f in fl if f["type"] == typ), key=str.lower)
    return out


def resolve_choice(choice):
    """`folder/name.mp4 [output]` -> the absolute path, only inside ComfyUI's input or output folder."""
    import re
    from .mixer import resolve
    m = re.match(r"^(.*?)\s*\[(input|output)\]$", str(choice or "").strip())
    if not m:
        raise ValueError(f"WAonV: `{choice}` is not a video of the input or output folder.")
    return resolve({"name": m.group(1), "type": m.group(2)})


class AonV:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "audio": ("AUDIO", {"tooltip": "The sound to put on the video: the mix of WMixer, or the For Loop End's value1."}),
                "video_file": (video_choices(), {"tooltip": "The video to put the sound on: a file of ComfyUI's input folder, "
                                                            "then of the output folder. It can be the high-definition one: its "
                                                            "picture is copied as it is. Not used when a video comes from the cable."}),
                "filename_prefix": ("STRING", {"default": "Foley/video", "tooltip": "Where it is saved, inside ComfyUI's output folder."}),
                "bitrate": (["192k", "256k", "320k"], {"default": "256k", "tooltip": "The quality of the sound (AAC): how many "
                                                       "bits a second it may use. The picture is not touched by it: it is copied."}),
                "length": (["video", "audio", "shortest"], {"default": "video", "tooltip":
                           "How long the file is. video: the sound is cut, or padded with silence, to the video. audio: the "
                           "whole sound (a longer video is cut; a shorter one ends first: no picture is made, most players "
                           "hold its last frame, some show black). shortest: the shorter of the two."}),
            },
            "optional": {
                "video": ("VIDEO", {"tooltip": "A video from a node (Load Video, for one): when connected it is used instead of the menu."}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("path",)
    OUTPUT_TOOLTIPS = ("The file written.",)
    OUTPUT_NODE = True
    FUNCTION = "mux"
    CATEGORY = "WextraUI/Video"
    DESCRIPTION = ("Puts the sound on a video file without encoding the picture again; the sound the video had is left out. "
                   "`length` decides whether the video or the sound sets the length of the file. Uses the PyAV of ComfyUI: no "
                   "ffmpeg to install.")

    def mux(self, audio, video_file, filename_prefix, bitrate, length="video", video=None):
        import io
        import os
        import tempfile
        import folder_paths
        from .avtools import mux
        tmp = None
        try:
            if video is not None:
                src = video.get_stream_source() if hasattr(video, "get_stream_source") else None
                if isinstance(src, io.BytesIO):
                    src.seek(0)
                elif src is None:   # a video made of frames: written out once, so its picture can be copied
                    fd, tmp = tempfile.mkstemp(suffix=".mp4", prefix="wextraui_mux_")
                    os.close(fd)
                    video.save_to(tmp)
                    src = tmp
            elif video_file and video_file != "none":
                src = resolve_choice(video_file)
            else:
                raise ValueError("WAonV: pick the video in the menu, or connect one to `video`.")
            outdir = folder_paths.get_output_directory()
            folder, name, counter, _, _ = folder_paths.get_save_image_path(filename_prefix, outdir)
            out = os.path.join(folder, f"{name}_{counter:05}_.mp4")
            wav = audio["waveform"][0].float().cpu().numpy()
            vlen, alen, total = mux(src, wav, int(audio["sample_rate"]), out, int(bitrate.rstrip("k")) * 1000, length)
        finally:
            if tmp and os.path.exists(tmp):
                os.remove(tmp)
        info = f"{os.path.relpath(out, outdir)} · video {vlen:.2f} s · sound {alen:.2f} s · file {total:.2f} s"
        if total > vlen + 0.05:
            info += f" · the last {total - vlen:.2f} s have sound and no picture"
        print(f"[WAonV] {info}")
        return {"ui": {"text": [info]}, "result": (out,)}
