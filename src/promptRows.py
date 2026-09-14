"""WPrompt Rows - il prompt a righe (Sick, 12/09/2026). Ogni riga: un interruttore on/off, un'area di testo che
cresce col testo, e il puntino a sinistra dove collegare una STRING esterna (un altro prompt, i trigger di
WLoad Lora...): il testo collegato si accende e si spegne con lo stesso interruttore della riga. "+" sull'ultima
riga ne aggiunge una sotto, "-" sulle altre la toglie (web/promptRows.js). Il numero di righe vive nel widget
nascosto 'rows'. Uscita: le righe accese e non vuote, nell'ordine, unite con 'join' (comma = ", " · space ·
newline · none). Con 'comma' una riga che finisce gia' con la virgola non ne prende due. Il testo resta com'e':
gli a capo in testa o in coda a una riga arrivano nel prompt (Sick, 12/09) - salta solo la riga tutta vuota."""

MAX_ROWS = 60
JOINS = {"comma": ", ", "space": " ", "newline": "\n", "none": ""}


class PromptRows:
    @classmethod
    def INPUT_TYPES(cls):
        req = {
            "join": (list(JOINS), {"default": "comma", "tooltip": "Come unire le righe accese: comma = ', ' · space · newline · none."}),
            "rows": ("INT", {"default": 1, "min": 1, "max": MAX_ROWS, "hidden": True, "tooltip": "Righe attive (gestito dai tasti + / -)."}),
        }
        opt = {}
        for i in range(1, MAX_ROWS + 1):
            opt[f"on{i}"] = ("BOOLEAN", {"default": True, "tooltip": "Riga accesa (entra nel prompt) o spenta."})
            opt[f"text{i}"] = ("STRING", {"default": "", "multiline": True, "tooltip": "Testo della riga; oppure collega al puntino una STRING esterna."})
        return {"required": req, "optional": opt}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    OUTPUT_TOOLTIPS = ("The rows that are on and not empty, in order, joined as chosen.",)
    FUNCTION = "build"
    CATEGORY = "WextraUI"
    DESCRIPTION = "A prompt built from rows: each row has an on/off switch, a text area that grows with the text and a socket for an external string. Rows that are on are joined into one prompt."

    def build(self, join="comma", rows=1, **kw):
        sep = JOINS.get(join, ", ")
        parts = []
        for i in range(1, min(int(rows), MAX_ROWS) + 1):
            if not kw.get(f"on{i}", True):
                continue
            text = kw.get(f"text{i}")
            if isinstance(text, (list, tuple)):
                text = text[0] if text else ""
            text = str(text or "")
            if not text.strip():
                continue
            if join == "comma" and text.rstrip().endswith(","):
                text = text.rstrip().rstrip(",")
            parts.append(text)
        return (sep.join(parts),)
