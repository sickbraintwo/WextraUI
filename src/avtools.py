"""Il video senza ffmpeg esterno: tutto con PyAV, la libreria che ComfyUI porta sempre con se' (il suo ffmpeg e' dentro).
Tre lavori: mettere un suono su un video copiando l'immagine com'e' (mux), tirare fuori il suono di un video in un flac
(audio_to_flac), farne una copia leggera da sfogliare (proxy)."""
import fractions
import os

import av
import numpy as np

AAC_RATES = (96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000)


def _layout(ch):
    return "mono" if ch == 1 else "stereo"


def video_length(c, vs):
    """The length of video stream `vs` of container `c`, in seconds (the stream's own, else the file's)."""
    if vs.duration and vs.time_base:
        return float(vs.duration * vs.time_base)
    if c.duration:
        return c.duration / av.time_base
    if vs.frames and vs.average_rate:
        return vs.frames / float(vs.average_rate)
    raise ValueError("cannot tell how long the video is")


def source_audio_bitrate(path):
    """The bitrate of the first sound of a video file, in bits per second, or None when it has no sound."""
    with av.open(path) as c:
        if not c.streams.audio:
            return None
        a = c.streams.audio[0]
        return a.bit_rate or a.codec_context.bit_rate or None


def mux(src, wav, sr, out, bitrate, length="video"):
    """The picture of video `src`, copied as it is (not encoded again), with sound `wav` (channels x samples, float,
    -1..1, at `sr` Hz) encoded in AAC at `bitrate` bits per second, into the mp4 `out`. The sound the video had is left
    out: only the picture is taken. `length` decides how long the file is: "video" (the sound is cut, or padded with
    silence, to the video), "audio" (the whole sound; a longer video is cut, a shorter one simply ends first: no new
    picture is made, most players hold its last frame, some show black), "shortest" (the shorter of the two).
    Written to a .part file first, so a failure leaves nothing half done. -> (video s, sound s, file s)."""
    wav = np.ascontiguousarray(np.clip(np.asarray(wav, dtype=np.float32)[:2], -1, 1))
    ch = wav.shape[0]
    rate = sr if sr in AAC_RATES else 48000
    alen = wav.shape[1] / sr
    part = out[:-4] + ".part.mp4"
    try:
        with av.open(src) as inp:
            if not inp.streams.video:
                raise ValueError("the video has no picture")
            vin = inp.streams.video[0]
            vlen = video_length(inp, vin)
            total = {"video": vlen, "audio": alen, "shortest": min(vlen, alen)}[length]
            n = int(round(total * sr))
            wav = wav[:, :n] if wav.shape[1] >= n else np.pad(wav, ((0, 0), (0, n - wav.shape[1])))
            with av.open(part, "w", format="mp4", options={"movflags": "+faststart"}) as o:
                vout = o.add_stream_from_template(vin)
                aout = o.add_stream("aac", rate=rate, layout=_layout(ch))
                aout.bit_rate = int(bitrate)
                # the sound first, all of it (a minute of AAC is a few MB): then it goes in between the pictures by time
                rs = av.AudioResampler(format="fltp", layout=_layout(ch), rate=rate)
                pkts = []
                step = 4096
                for i in range(0, n, step):
                    fr = av.AudioFrame.from_ndarray(wav[:, i:i + step], format="fltp", layout=_layout(ch))
                    fr.sample_rate = sr
                    fr.pts = i
                    fr.time_base = fractions.Fraction(1, sr)
                    for f in rs.resample(fr):
                        pkts += aout.encode(f)
                for f in rs.resample(None):
                    pkts += aout.encode(f)
                pkts += aout.encode(None)
                k = 0
                for p in inp.demux(vin):
                    if p.dts is None:
                        continue
                    if p.pts is not None and float(p.pts * p.time_base) >= total - 1e-6:
                        continue   # the picture past the end of the file
                    t = float(p.dts * p.time_base)
                    while k < len(pkts) and pkts[k].dts is not None and float(pkts[k].dts * pkts[k].time_base) <= t:
                        o.mux(pkts[k])
                        k += 1
                    p.stream = vout
                    o.mux(p)
                for q in pkts[k:]:
                    o.mux(q)
        os.replace(part, out)
        return vlen, alen, total
    finally:
        if os.path.exists(part):
            os.remove(part)


def audio_to_flac(src, out):
    """The first sound of video `src` into the flac `out` (as it is: same rate, at most two channels). False when the
    video has no sound."""
    part = out[:-5] + ".part.flac"
    try:
        with av.open(src) as inp:
            if not inp.streams.audio:
                return False
            ain = inp.streams.audio[0]
            ch = min(2, ain.codec_context.channels or 2)
            rate = ain.codec_context.sample_rate or 48000
            with av.open(part, "w", format="flac") as o:
                aout = o.add_stream("flac", rate=rate, layout=_layout(ch))
                rs = av.AudioResampler(format="s32", layout=_layout(ch), rate=rate)
                for fr in inp.decode(ain):
                    fr.pts = None
                    for f in rs.resample(fr):
                        for p in aout.encode(f):
                            o.mux(p)
                for f in rs.resample(None):
                    for p in aout.encode(f):
                        o.mux(p)
                for p in aout.encode(None):
                    o.mux(p)
        os.replace(part, out)
        return True
    finally:
        if os.path.exists(part):
            os.remove(part)


def _h264():
    for name in ("libx264", "h264", "libopenh264"):
        try:
            av.codec.Codec(name, "w")
            return name
        except Exception:
            continue
    raise RuntimeError("this ComfyUI's PyAV has no H.264 encoder")


def proxy(src, out, max_h=720, gop=4):
    """A light copy of video `src` for a player: at most `max_h` high, no sound, a keyframe every `gop` frames (a jump
    anywhere shows its frame at once). Returns the frames per second of the video."""
    part = out[:-4] + ".part.mp4"
    try:
        with av.open(src) as inp:
            vin = inp.streams.video[0]
            vin.thread_type = "AUTO"
            fps = vin.average_rate or vin.guessed_rate or fractions.Fraction(24)
            w, h = vin.codec_context.width, vin.codec_context.height
            if h > max_h:
                w, h = int(round(w * max_h / h / 2)) * 2, max_h
            w, h = w - w % 2, h - h % 2
            name = _h264()
            with av.open(part, "w", format="mp4", options={"movflags": "+faststart"}) as o:
                vs = o.add_stream(name, rate=fps)
                vs.width, vs.height, vs.pix_fmt = w, h, "yuv420p"
                vs.codec_context.gop_size = gop
                vs.codec_context.max_b_frames = 0
                if name == "libx264":
                    vs.options = {"crf": "20", "preset": "veryfast"}
                else:
                    vs.bit_rate = 8_000_000
                i = 0
                for fr in inp.decode(vin):
                    f = fr.reformat(width=w, height=h, format="yuv420p")
                    f.pts = i
                    f.time_base = 1 / fractions.Fraction(fps)
                    i += 1
                    for p in vs.encode(f):
                        o.mux(p)
                for p in vs.encode(None):
                    o.mux(p)
        os.replace(part, out)
        return float(fps)
    finally:
        if os.path.exists(part):
            os.remove(part)
