"""WPrompt Rows - il prompt a righe (Sick, 12/09/2026). Ogni riga: un interruttore on/off, un'area di testo che
cresce col testo, e il puntino a sinistra dove collegare una STRING esterna (un altro prompt, i trigger di
WLoad Lora...): il testo collegato si accende e si spegne con lo stesso interruttore della riga. "+" sull'ultima
riga ne aggiunge una sotto, "-" sulle altre la toglie (web/promptRows.js). Il numero di righe vive nel widget
nascosto 'rows'. Uscita: le righe accese e non vuote, nell'ordine, unite con 'join' (comma = ", " · space ·
newline · none). Con 'comma' una riga che finisce gia' con la virgola non ne prende due. Il testo resta com'e':
gli a capo in testa o in coda a una riga arrivano nel prompt (Sick, 12/09) - salta solo la riga tutta vuota.
'prompt_to_divide' (facoltativo, Sick 30/10): un testo che il tasto Divide Input Prompt spezza alle virgole, una frase per
riga. Qui lo si rimanda al frontend dopo la run, per quando a monte non c'e' un widget da leggere. In uscita entra da
solo quando nessuna riga ha testo, accesa o spenta (Sick 02/11): il nodo vuoto o appena resettato lo lascia passare com'e'."""

MAX_ROWS = 60
JOINS = {"comma": ", ", "space": " ", "newline": "\n", "none": ""}


class PromptRows:
    @classmethod
    def INPUT_TYPES(cls):
        req = {
            "join": (list(JOINS), {"default": "comma", "tooltip": "Come unire le righe accese: comma = ', ' · space · newline · none."}),
            "rows": ("INT", {"default": 1, "min": 1, "max": MAX_ROWS, "hidden": True, "tooltip": "Righe attive (gestito dai tasti + / -)."}),
        }
        opt = {"prompt_to_divide": ("STRING", {"forceInput": True, "tooltip": "A text for the Divide Input Prompt button: one row for every phrase between commas. It comes out as it is while no row has text; with text in the rows it does not go into the prompt."})}
        for i in range(1, MAX_ROWS + 1):
            opt[f"on{i}"] = ("BOOLEAN", {"default": True, "tooltip": "Riga accesa (entra nel prompt) o spenta."})
            opt[f"text{i}"] = ("STRING", {"default": "", "multiline": True, "tooltip": "Testo della riga; oppure collega al puntino una STRING esterna."})
        return {"required": req, "optional": opt}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    OUTPUT_TOOLTIPS = ("The rows that are on and not empty, in order, joined as chosen. No row with text: the text on prompt_to_divide as it is.",)
    FUNCTION = "build"
    CATEGORY = "WextraUI"
    DESCRIPTION = "A prompt built from rows: each row has an on/off switch, a text area that grows with the text and a socket for an external string. Rows that are on are joined into one prompt. Drag a row by its handle to move it; a text on prompt_to_divide becomes rows, one per phrase between commas, with the Divide Input Prompt button; while no row has text that text comes out as it is."

    def build(self, join="comma", rows=1, prompt_to_divide=None, **kw):
        sep = JOINS.get(join, ", ")
        parts = []
        empty = True   # nessuna riga con testo: una spenta conta, spegnere le righe non fa passare l'ingresso
        for i in range(1, min(int(rows), MAX_ROWS) + 1):
            text = kw.get(f"text{i}")
            if isinstance(text, (list, tuple)):
                text = text[0] if text else ""
            text = str(text or "")
            if not text.strip():
                continue
            empty = False
            if not kw.get(f"on{i}", True):
                continue
            if join == "comma" and text.rstrip().endswith(","):
                text = text.rstrip().rstrip(",")
            parts.append(text)
        out = sep.join(parts)
        if isinstance(prompt_to_divide, (list, tuple)):
            prompt_to_divide = prompt_to_divide[0] if prompt_to_divide else None
        if prompt_to_divide is None:
            return (out,)
        text = str(prompt_to_divide)
        return {"ui": {"wx_divide": [text]}, "result": (text if empty else out,)}
