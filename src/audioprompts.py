"""WAudio Prompts (wxAudioPrompts; called WScene Prompts until 21/10/2026) — the sound prompt of every scene, written by Qwen3-VL looking at the frames (Sick, 17/10/2026: the prompts of
the Foley clips without going mad over the rules). After WCutScene: its `cuts` say where
each scene starts; for each one a few frames, in time order, go to the vision model together with the rules learned
on the Foley LoRA (only sounds whose source is seen, material and timbre, what changes on screen, no invented events,
no speech, no music). Out comes the timeline `time | prompt` for WLoop Start Foley.

The model is Comfy's own: a Load CLIP with a Qwen3-VL file (text_encoders, type the default one), the same way the core
node Generate Text uses it. No server, nothing outside Comfy.

The `prompts` box: empty = every scene is written here, and the frontend (web/wxSceneBoxes.js) puts the result into
the box; filled = the lines there are kept as they are, and only the scenes with no line, or with nothing after the
`|`, are written again (a new `seed` gives a new text). A line whose time is no longer the start of a scene is kept at
the bottom as a comment, so nothing typed is lost.

A beat (a `+` time from WCutScene, Sick 19/10/2026) is not a new shot: the model is told the same shot goes on and is
given the prompt of the stretch before, so the place and its sounds stay the same and only what changes is added. Its
line keeps the `+` (`+16.50 | ...`), which WLoop Start Foley reads as a long fade instead of a cut.

The `custom` box (Sick, 19/10/2026): prompts written by hand, the same `time | prompt` lines. A scene with a line
there takes it, and the model is not asked for it; its own line in the `prompts` box, if any, stays there unused. The
node never writes into `custom`: empty a line there and the scene goes back to the model's text."""
import os
import uuid

import torch.nn.functional as F
from PIL import Image, ImageDraw

import comfy.model_management
import comfy.utils
import folder_paths

from .cutscene import _font, _thumb, parse_marks
from .foley import FPS_DEFAULT, parse_mark, parse_time

RULES = """You write sound prompts for a video-to-audio model that adds foley to a silent shot.
You see frames of ONE shot, in time order from its start to its end; their times are given.
Rules:
- Only sounds whose source is visible in the frames. Name the source and its material, and say how it sounds: wet, dry, metallic, glassy, fleshy, airy, deep, crackling, soft.
- Describe what moves or changes across the frames (a head turns, jaws open, fire swells, liquid pours, wings beat) and the sound of that change, in the order it happens.
- Never invent what you cannot see: no rain, fire, impacts, footsteps, beeps, chimes, chains or clicks unless the frames clearly show them. When unsure, leave it out.
- A glow, a light, a colour or mist makes no sound: fire only where flames are seen, rain only where drops are seen falling.
- The camera is not a sound source: never mention it.
- If almost nothing moves, describe the quiet air of the place and the small movement that is there.
- No speech, no singing, no music. A person or a creature breathes, gasps, screams, growls or roars only if its mouth or body clearly does it.
- One or two short sentences, plain English, no lists, no quotes, no names of films, characters or artists."""
SIDE = 448                  # the longer side of the frames given to the model (fewer image tokens, same content)
COLS, THUMB_W, TEXT_W, PAD, LABEL_H, LINE_H, MAX_LINES = 2, 192, 440, 10, 22, 17, 7


def scene_frames(images, a, b, n):
    """`n` frames spread inside scene [a, b), away from its edges (a fade or a cut frame says little), shrunk so the
    longer side is SIDE. -> (batch, their indices)."""
    count = b - a
    idx = sorted({a + min(count - 1, int((j + 0.5) * count / n)) for j in range(n)})
    x = images[idx, :, :, :3]
    H, W = x.shape[1], x.shape[2]
    k = SIDE / max(H, W)
    if k < 1:
        h, w = max(32, int(round(H * k / 32)) * 32), max(32, int(round(W * k / 32)) * 32)
        x = F.interpolate(x.movedim(-1, 1).float(), size=(h, w), mode="area").movedim(1, -1)
    return x, idx


def fresh_gpu_state():
    """What Comfy does after every node when its dynamic VRAM is on (execution.py): drop the prefetch queues and the CUDA
    graphs recorded while the model ran. Here the model runs once per scene inside one node: a graph recorded on one
    scene, replayed on the next (other frames, another length), stops the GPU with a device-side assert and Comfy has
    to be restarted (17/10/2026). Older Comfy without these parts: nothing to do."""
    try:
        import comfy.memory_management
        if not getattr(comfy.memory_management, "aimdo_enabled", False):
            return
        import comfy.model_prefetch
        comfy.model_prefetch.cleanup_prefetch_queues()
        comfy.model_management.reset_cast_buffers()
        import comfy_aimdo.model_vbar
        comfy_aimdo.model_vbar.vbars_reset_watermark_limits()
    except (ImportError, AttributeError):
        pass


def ask(clip, frames, idx, a, b, fps, seed, context, before=None):
    """The sound prompt of one scene. `before`: the prompt of the stretch before, when this scene is a beat (the same
    shot going on, no cut)."""
    when = ", ".join(f"{(i - a) / fps:.1f} s" for i in idx)
    if before is None:
        text = f"A shot of {(b - a) / fps:.1f} seconds. Frames at {when}."
    else:
        # 19/10: «keep what still sounds and add what starts now» made the model copy the prompt before whole and add a
        # line, so every beat carried all the ones before it. Now: the stretch before is only context, never repeated.
        text = (f"A stretch of {(b - a) / fps:.1f} seconds of a shot that goes on without a cut. Frames at {when}. "
                f"Only as context, the stretch before sounded like this: {before.strip() or 'quiet air'} Do not repeat "
                "it and do not describe what is over: write only what is heard in this stretch, above all the sound that "
                "starts or changes now.")
    if context.strip():
        text += f" About the whole video: {context.strip()}"
    text += " Write its sound prompt."
    try:
        tokens = clip.tokenize(text, image=frames, min_length=1, thinking=False, system_prompt=RULES)
        ids = clip.generate(tokens, do_sample=True, max_length=160, temperature=0.6, top_k=50, top_p=0.9, min_p=0.05,
                            repetition_penalty=1.05, seed=seed)
    except (AttributeError, TypeError) as e:
        raise ValueError("WAudio Prompts: the clip must be a Qwen3-VL (Load CLIP, a qwen3vl file from text_encoders, "
                         f"type stable_diffusion): {e}")
    finally:
        fresh_gpu_state()
    out = clip.decode(ids)
    out = out.split("</think>")[-1]
    out = " ".join(out.replace("|", ",").replace("#", "").split()).strip().strip('"')
    if before:   # a model that copies the prompt before anyway: what it copied goes
        prev = " ".join(before.split())
        if prev and out.startswith(prev):
            out = out[len(prev):].strip() or out
    return out


def _wrap(dr, text, font, width):
    lines, line = [], ""
    for word in text.split():
        t = f"{line} {word}".strip()
        if dr.textlength(t, font=font) <= width:
            line = t
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    if len(lines) > MAX_LINES:
        lines = lines[:MAX_LINES]
        lines[-1] += " …"
    return lines


def sheet(images, cuts, prompts, new, fps, beats=(), mine=()):
    """One cell per scene, two per row: number and times (`+` and blue for a beat), the middle frame, the prompt
    beside it (marked `new` when it was written in this Run, `custom` when it comes from the custom box)."""
    total, H, W = images.shape[0], images.shape[1], images.shape[2]
    tw = THUMB_W
    th = max(40, min(int(round(tw * H / W)), 2 * tw))
    cw, ch = tw + 10 + TEXT_W, LABEL_H + max(th, MAX_LINES * LINE_H)
    rows = (len(cuts) + COLS - 1) // COLS
    img = Image.new("RGB", (COLS * cw + (COLS + 1) * PAD * 2, rows * ch + (rows + 1) * PAD), (24, 24, 24))
    dr, big, small = ImageDraw.Draw(img), _font(15), _font(14)
    ends = cuts[1:] + [total]
    for k, (a, b) in enumerate(zip(cuts, ends)):
        x = PAD * 2 + (k % COLS) * (cw + PAD * 2)
        y = PAD + (k // COLS) * (ch + PAD)
        beat = a in beats
        label = f"{k}   {'+' if beat else ''}{a / fps:.2f} - {b / fps:.2f} s" + \
            ("   custom" if k in mine else "   new" if k in new else "")
        dr.text((x + 2, y + 2), label, fill=(120, 190, 255) if beat else (235, 220, 120), font=big)
        img.paste(_thumb(images, (a + b - 1) // 2, tw, th), (x, y + LABEL_H))
        for j, line in enumerate(_wrap(dr, prompts[k] or "(empty)", small, TEXT_W)):
            dr.text((x + tw + 10, y + LABEL_H + j * LINE_H), line, fill=(225, 225, 225), font=small)
    return img


def read_box(text, fps, where="prompts"):
    """A prompts box -> {frame: (prompt, seed or None)}, by the time each line is written at (the same lines WLoop
    Start Foley reads: `time | prompt | seed`, a line without | goes on with the prompt above, # = a comment)."""
    out, last = {}, None
    for no, raw in enumerate(str(text or "").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "|" not in line:
            if last is not None:
                p, s = out[last]
                out[last] = (f"{p} {line}".strip(), s)
            continue
        parts = [x.strip() for x in line.split("|")]
        f = parse_time(parse_mark(parts[0])[1], fps)   # `+` or not: the scene is found by its time
        if f is None:
            raise ValueError(f"WAudio Prompts: {where}, line {no}, `{parts[0]}` is not a time (6 · 6.5 · 1:02.5 · 144f).")
        seed = None
        if len(parts) > 2 and parts[2]:
            try:
                seed = int(parts[2])
            except ValueError:
                raise ValueError(f"WAudio Prompts: {where}, line {no}, the seed `{parts[2]}` is not a whole number.")
        out[f], last = (parts[1], seed), f
    return out


def box_text(cuts, prompts, seeds, fps, total, lost, beats=(), mine=(), lost_note=None):
    """A prompts box: for each scene a comment with its number and times, then `time | prompt` (| seed when it has
    one; `+time` for a beat). `mine`: the scenes that take the custom box, marked in the comment; in the model's box
    their line is written only when the model has one."""
    out, ends = [], cuts[1:] + [total]
    for k, (a, b) in enumerate(zip(cuts, ends)):
        beat = a in beats
        out.append(f"# {k} · {a / fps:.2f}-{b / fps:.2f} s" + (" · same shot" if beat else "") + (" · custom" if k in mine else ""))
        if prompts[k] or k not in mine:
            out.append(f"{'+' if beat else ''}{a / fps:.2f} | {prompts[k]}" + (f" | {seeds[k]}" if seeds[k] is not None else ""))
    if lost:
        out.append("")
        out.append(lost_note or "# lines whose time is not the start of a scene any more (kept here, not used):")
        out += [f"# {f / fps:.2f} | {p}" for f, p in lost]
    return "\n".join(out)


class WAudioPrompts:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP", {"tooltip": "Qwen3-VL from a Load CLIP (a qwen3vl file in text_encoders, type stable_diffusion)."}),
                "images": ("IMAGE", {"tooltip": "The whole video, the same frames that went into WCutScene."}),
                "cuts": ("STRING", {"forceInput": True, "tooltip": "The cuts output of WCutScene: where each scene starts."}),
                "fps": ("FLOAT", {"default": FPS_DEFAULT, "min": 1, "max": 240, "step": 0.001,
                                  "tooltip": "The frames per second of the frames on the cable."}),
                "frames_per_scene": ("INT", {"default": 6, "min": 1, "max": 16,
                                             "tooltip": "How many frames of each scene the model looks at, spread over the scene."}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff,
                                 "tooltip": "Only for the scenes written in this Run: another seed, another text."}),
                "context": ("STRING", {"default": "", "multiline": False,
                                       "tooltip": "Optional: a few words about the whole video (e.g. a showreel of strange creatures). "
                                                  "Given to the model with every scene."}),
                "prompts": ("STRING", {"default": "", "multiline": True,
                                       "placeholder": "The model writes one line per scene: time | prompt. Empty a line to have it written again.",
                                       "tooltip": "Empty = every scene is written by the model and put here after the Run. Filled = the "
                                                  "lines are kept; a scene with no line, or nothing after |, is written again. "
                                                  "`time | prompt` (| seed), # = a comment."}),
            },
            "optional": {
                "custom": ("STRING", {"default": "", "multiline": True,
                                      "placeholder": "Your own prompts, time | prompt: the model skips these scenes.",
                                      "tooltip": "Prompts written by hand, `time | prompt` (| seed) like the box above. A scene with a "
                                                 "line here takes it and the model is not asked for it. Never rewritten by the node."}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("timeline",)
    OUTPUT_TOOLTIPS = ("`time | prompt` per scene, for the timeline of WLoop Start Foley.",)
    FUNCTION = "write"
    OUTPUT_NODE = True
    CATEGORY = "WextraUI/Foley"
    DESCRIPTION = ("The sound prompt of every scene, written by Qwen3-VL from a few frames of each, with the Foley rules "
                   "built in. On the node: each scene's middle frame with its prompt. The text goes into the prompts box, "
                   "where it can be fixed by hand; empty a line to have just that scene written again.")

    def write(self, clip, images, cuts, fps, frames_per_scene, seed, context="", prompts="", custom=""):
        total = int(images.shape[0])
        starts, beats = parse_marks(cuts, fps, total)
        ends = starts[1:] + [total]
        written = read_box(prompts, fps)
        hand = {f: v for f, v in read_box(custom, fps, "custom").items() if v[0].strip()}
        mine = {k for k, a in enumerate(starts) if a in hand}
        model_texts, model_seeds, texts, seeds, new = [], [], [], [], set()
        todo = [k for k, a in enumerate(starts) if k not in mine and not written.get(a, ("", None))[0].strip()]
        bar = comfy.utils.ProgressBar(max(1, len(todo)))
        for k, (a, b) in enumerate(zip(starts, ends)):
            p, s = written.get(a, ("", None))
            if k in todo:
                comfy.model_management.throw_exception_if_processing_interrupted()
                frames, idx = scene_frames(images, a, b, frames_per_scene)
                before = texts[k - 1] if (a in beats and k > 0) else None
                p = ask(clip, frames, idx, a, b, fps, seed + k, context, before)
                new.add(k)
                bar.update(1)
            model_texts.append(p.strip())
            model_seeds.append(s)
            hp, hs = hand.get(a, (p, s))
            texts.append(hp.strip())
            seeds.append(hs)
        at = set(starts)
        lost = [(f, p) for f, (p, _) in sorted(written.items()) if f not in at and p.strip()]
        lost_hand = [(f, p) for f, (p, _) in sorted(hand.items()) if f not in at]
        box = box_text(starts, model_texts, model_seeds, fps, total, lost, beats, mine)
        text = box_text(starts, texts, seeds, fps, total, lost_hand, beats, mine,
                        "# custom lines whose time is not the start of a scene (not used):")
        name = f"wxaudioprompts_{uuid.uuid4().hex[:10]}.jpg"
        sheet(images, starts, texts, new, fps, beats, mine).save(os.path.join(folder_paths.get_temp_directory(), name), quality=88)
        ui = {"images": [{"filename": name, "subfolder": "", "type": "temp"}], "wx_prompts": [box if new else ""]}
        return {"ui": ui, "result": (text,)}
