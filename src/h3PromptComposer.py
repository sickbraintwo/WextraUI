import json

from .h3_timing import seconds_to_h3_frames, h3_frames_to_seconds, H3_MAX_FRAMES, H3_FPS


BASE_REFERENCE_SECONDS = 10.0


class H3PromptComposer:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "intro": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "tooltip": "The part every beat shares: world, subject, camera, style. Goes first, untouched.",
                }),
                "beats_json": ("STRING", {
                    "multiline": True,
                    "tooltip": "The beats as JSON: [{name, base_duration (seconds on a 10 s reference), locked, text}]. Locked beats keep their seconds, the others scale with total_duration, the last unlocked one absorbs the remainder. Edited through the table.",
                    "default": json.dumps([
                        {"name": "BEAT1", "base_duration": 10.0, "locked": False, "text": ""},
                    ], indent=2),
                }),
                "total_duration": ("FLOAT", {
                    "default": 10.0,
                    # No artificial cap: the native H3 node accepts up to
                    # 3600 frames (150 s). Trained range is ~5-15 s; 20 s
                    # verified on a 3090 (25/08/2026); longer is untested.
                    "min": 1.0,
                    "max": H3_MAX_FRAMES / float(H3_FPS),
                    "step": 0.1,
                    "tooltip": "Clip length in seconds. H3 trained range ~5-15 s; 20 s verified locally; "
                               "longer untested. Snapped up to the 17k+5 frame grid (see 'frames' output).",
                }),
                "sound": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "tooltip": "Global sound design, appended to the prompt as 'Sound: ...'. Leave empty to skip.",
                }),
                "avoid": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "tooltip": "What must not appear, appended as 'Avoid: ...'. It is not a negative prompt: naming a thing can evoke it, keep it short.",
                }),
            },
        }

    RETURN_TYPES = ("STRING", "FLOAT", "STRING", "INT")
    RETURN_NAMES = ("prompt", "duration", "timing_table", "frames")
    OUTPUT_TOOLTIPS = (
        "The composed prompt with a time-code per beat, ready for WScene H3.",
        "The requested clip length in seconds, before snapping to the frame grid.",
        "A readable table of the beats with their seconds and locked/scaled/flex flag.",
        "The real H3 frame count, snapped up to the 17k+5 grid.",
    )
    FUNCTION = "compose"
    CATEGORY = "WextraUI"
    OUTPUT_NODE = True
    DESCRIPTION = ("Storyboard -> MiniMax H3 prompt with a time-code per beat: intro + beats (SOUND/IMAGE written together, "
                   "locked or scaled to total_duration) + Sound + Avoid. Outputs the prompt, the duration, a readable timing table "
                   "and the real frame count (H3 accepts 17k+5 frames at 24 fps).")

    def compose(self, intro, beats_json, total_duration, sound, avoid):
        frames = seconds_to_h3_frames(total_duration)

        try:
            beats = json.loads(beats_json)
        except json.JSONDecodeError as e:
            error = f"beats_json is not valid JSON: {e}"
            raise ValueError("WScene Composer H3: " + error)

        if not beats:
            error = "beats_json is empty: at least one beat is required."
            raise ValueError("WScene Composer H3: " + error)

        locked_indices = [i for i, b in enumerate(beats) if b.get("locked")]
        unlocked_indices = [i for i, b in enumerate(beats) if not b.get("locked")]

        if not unlocked_indices:
            error = "All beats are locked: at least one beat must stay unlocked to absorb the remaining duration."
            raise ValueError("WScene Composer H3: " + error)

        # The LAST unlocked beat is the flex beat: it absorbs whatever time is
        # left after locked beats (fixed) and the other unlocked beats (scaled
        # from the 10s base reference) are accounted for, so the total always
        # matches total_duration exactly.
        flex_index = unlocked_indices[-1]
        scale_indices = unlocked_indices[:-1]

        sum_locked = sum(beats[i]["base_duration"] for i in locked_indices)
        scale_factor = total_duration / BASE_REFERENCE_SECONDS

        durations = {}
        for i in locked_indices:
            durations[i] = beats[i]["base_duration"]
        for i in scale_indices:
            durations[i] = round(beats[i]["base_duration"] * scale_factor, 2)

        sum_scaled = sum(durations[i] for i in scale_indices)
        flex_duration = round(total_duration - sum_locked - sum_scaled, 2)
        durations[flex_index] = flex_duration

        if flex_duration < 0:
            error = (
                f"Impossible configuration: locked + scaled beats already take "
                f"{sum_locked + sum_scaled:.2f}s, more than the {total_duration:.2f}s total. "
                f"Unlock more beats, raise total_duration, or shorten a locked beat."
            )
            raise ValueError("WScene Composer H3: " + error)

        prompt_parts = [intro.strip()]
        table_rows = []
        t = 0.0
        for i, beat in enumerate(beats):
            d = durations[i]
            start, end = t, t + d
            tag = f"[{start:.1f}-{end:.1f}s]"
            text = beat.get("text", "").strip()
            prompt_parts.append(f"{tag} {text}")
            flag = "locked" if beat.get("locked") else ("flex" if i == flex_index else "scaled")
            name = beat.get("name", f"beat{i}")
            table_rows.append(f"{name:<10} {start:6.2f}-{end:<6.2f}  {d:5.2f}s  ({flag})")
            t = end

        if sound.strip():
            prompt_parts.append(f"Sound: {sound.strip()}")
        if avoid.strip():
            prompt_parts.append(f"Avoid: {avoid.strip()}")

        prompt = "\n\n".join(p for p in prompt_parts if p)

        header = (
            f"Total: {total_duration:.2f}s  "
            f"(base reference: {BASE_REFERENCE_SECONDS:.0f}s, scale factor: {scale_factor:.3f})\n"
            f"H3 frames: {frames} @ {H3_FPS} fps = {h3_frames_to_seconds(frames):.2f}s real clip length"
        )
        timing_table = header + "\n" + "\n".join(table_rows)

        return (prompt, total_duration, timing_table, frames)
