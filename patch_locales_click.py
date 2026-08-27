import json
import os

with open("src/locales/es.json", "r") as f:
    es_data = json.load(f)

es_data["changelog_v120_items"][0] = "Añadida función drag & drop (y click) para transferir archivos y carpetas al disco."

with open("src/locales/es.json", "w") as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

with open("src/locales/en.json", "r") as f:
    en_data = json.load(f)

en_data["changelog_v120_items"][0] = "Added drag & drop (and click) functionality to transfer files and folders."

with open("src/locales/en.json", "w") as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

print("Locales updated with click info.")
