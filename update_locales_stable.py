import json
import glob

en_v123 = [
    "Fixed '0 GB' bug for folder sizes.",
    "Added Total GB calculation to the top bar."
]

es_v123 = [
    "Corregido error de '0 GB' en el peso de carpetas.",
    "Añadido cálculo total de GB en la barra superior."
]

for file in glob.glob("src/locales/*.json"):
    with open(file, "r") as f:
        data = json.load(f)
    
    is_es = "es" in file
    data["changelog_v124_title"] = "v1.2.4"
    data["changelog_v124_items"] = es_v123 if is_es else en_v123
    
    with open(file, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

print("Locales updated.")
