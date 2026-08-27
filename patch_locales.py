import json
import os

# Update EN
with open("src/locales/en.json", "r") as f:
    en_data = json.load(f)

en_data["changelog_v120_title"] = "v1.2.0 - Cyberpunk Transfers"
en_data["changelog_v120_items"] = [
    "Added drag & drop functionality to transfer backups.",
    "New real-time Cyberpunk progress UI (Speed & ETA).",
    "Fixed layout grid padding for perfect image blurring."
]

with open("src/locales/en.json", "w") as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

# Update ES
with open("src/locales/es.json", "r") as f:
    es_data = json.load(f)

es_data["changelog_v120_title"] = "v1.2.0 - Transferencias Cyberpunk"
es_data["changelog_v120_items"] = [
    "Añadida función drag & drop para transferir respaldos al disco.",
    "Nueva interfaz Cyberpunk de progreso en tiempo real (Velocidad y ETA).",
    "Arreglados los márgenes de la cuadrícula para el difuminado perfecto de carátulas."
]

with open("src/locales/es.json", "w") as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Locales updated.")
