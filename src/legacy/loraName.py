class LoraName:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "loraName": ("STRING",),
                "split_char": ("STRING", {
                    "multiline": False,
                    "default": "\\",
                    "lazy": True
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "extractLoraName"
    CATEGORY = "WextraX"
    DESCRIPTION = "Extracts a clean LoRA name from a path: last path segment, without extension."

    def extractLoraName(self, loraName, split_char):
        # Suddivide la stringa in base al carattere specificato
        parts1 = loraName.split(split_char)

        # Prende l'ultima parte dell'array ottenuto
        last_part = parts1[-1]
        print(f"""Your last string1 contains: {parts1[-1]} """)
        # Suddivide nuovamente l'ultima parte in base al carattere "."
        parts2 = last_part.split('.')
        print(f"""Your last string2 contains: {parts2[0]} """)
        # Restituisce la prima parte dell'ultimo array ottenuto
        return (parts2[0],)