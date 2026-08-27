import json

# Update ES
with open("src/locales/es.json", "r") as f:
    es_data = json.load(f)

es_data["changelog_v120_title"] = "v1.2.0"
es_data["changelog_v120_items"] = [
    "Soporte para transferencia de archivos/carpetas (Drag & Drop y Click).",
    "UI de progreso de transferencia añadida (Velocidad y ETA).",
    "Corrección del padding de la cuadrícula para la generación de recortes."
]

with open("src/locales/es.json", "w") as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

# Update EN
with open("src/locales/en.json", "r") as f:
    en_data = json.load(f)

en_data["changelog_v120_title"] = "v1.2.0"
en_data["changelog_v120_items"] = [
    "Added file/folder transfer support via Drag & Drop and Click.",
    "Added transfer progress UI (Speed and ETA calculation).",
    "Fixed grid padding for perfect cover cropping."
]

with open("src/locales/en.json", "w") as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

print("Locales minimalist patch done.")
