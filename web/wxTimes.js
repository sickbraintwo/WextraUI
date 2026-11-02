// WextraUI — the times of the boxes, read in the page as the backend reads them: parse_time and parse_mark in src/foley.py,
// parse_marks and cut() in src/cutscene.py. No import here, so tools/selftest.py can run the same lines through both and
// compare them. WCutScene draws its strip with this, WAudio Prompts finds the scene of a line.
const TIME = /^(?:(\d+):)?(\d+(?:[.,]\d+)?)\s*(f?)$/;

const pyRound = (x) => { const r = Math.round(x); return Math.abs(x % 1) === 0.5 && r % 2 ? r - 1 : r; };   // round() of Python: a tie goes to the even one

/** `6` / `6.5` / `6,5` / `1:02.5` / `144f`, with or without `+`, -> a frame; null if it is not a time. */
export function frameOf(tok, fps) {
    const m = TIME.exec(String(tok).trim().replace(/^\+\s*/, ""));
    if (!m) return null;
    const v = Number(m[2].replace(",", "."));
    if (m[3]) return m[1] ? null : pyRound(v);
    return pyRound((Number(m[1] || 0) * 60 + v) * fps);
}

/** A box of times -> { cuts, beats, err }: two sets of frames, 0 always among the cuts, and the first error in words.
 *  `total` null: the length is not known, nothing is past the end. A wrong line is left out and the rest is read. */
export function parseMarks(text, fps, total, allBeats, where) {
    const cuts = new Set([0]), beats = new Set();
    let err = "";
    String(text || "").split(/\r\n|\r|\n/).forEach((raw, k) => {
        const line = raw.split("#")[0].trim();
        if (!line) return;
        const f = frameOf(line, fps);
        if (f === null) { err ||= `${where}, line ${k + 1}: not a time`; return; }
        if (total != null && f >= total) { err ||= `${where}, line ${k + 1}: past the end`; return; }
        (line.startsWith("+") || allBeats ? beats : cuts).add(f);
    });
    return { cuts, beats, err };
}

/** The two boxes of WCutScene -> { starts (sorted), beats (set), err }, as cut() in src/cutscene.py: a time written both
 *  ways is a cut, 0 is never a beat. `found`: the cuts box is empty, its cuts come with the Run. */
export function scenesOf(cutsText, beatsText, fps, total) {
    const found = !String(cutsText || "").trim();
    const a = found ? parseMarks("", fps, total, false, "cuts") : parseMarks(cutsText, fps, total, false, "cuts");
    const b = parseMarks(beatsText, fps, total, true, "beats");
    const beats = new Set([...a.beats, ...b.beats].filter((f) => !a.cuts.has(f)));
    return { starts: [...new Set([...a.cuts, ...beats])].sort((x, y) => x - y), beats, err: a.err || b.err, found };
}
