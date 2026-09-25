class Tag:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "tag_list": ("LIST", {"items": ("STRING",), "default": []}),
                "index": ("INT", {"default": 0, "min": 0, "max": 400})
            }
        }

    RETURN_TYPES = ("STRING", "STRING")  # Due output: "Single Tag" e "Console Log"
    RETURN_NAMES = ('Single Tag', 'Console Log')
    FUNCTION = "process"
    CATEGORY = "WextraX"
    OUTPUT_NODE = True
    DESCRIPTION = "Picks one tag from a list of strings by index; the second output lists the whole tag list for the console."

    def process(self, tag_list, index):
        content = "Console Log"

        # Gestione errore: lista vuota
        if not tag_list:
            content = "Tot tag: 0"
            display_text = ""
            selected_item = display_text
        else:
            # Gestione errore: indice fuori range
            if index >= len(tag_list):
                content = "Error: Index out of bounds"
            else:
                # Seleziona l'elemento e genera display_text
                selected_item = tag_list[index]
                display_text = f"Tot tag: {len(tag_list)}\n"
                for i, item in enumerate(tag_list):
                    display_text += f"{i} : {item}\n"
                content = display_text

        # Restituisci entrambi gli output
        return (selected_item, content)