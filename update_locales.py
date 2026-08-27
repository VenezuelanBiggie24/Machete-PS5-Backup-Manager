import json
import os
import glob

en_v2 = [
    "Cyberpunk UI rewrite (3D Cards, Hacker Console, Holographic Disk).",
    "Async I/O engine powered by Tokio.",
    "Blake3 Bit-Rot hashing support added.",
    "Total folder size dynamically calculated."
]

es_v2 = [
    "Nueva interfaz Cyberpunk (Tarjetas 3D, Consola Hacker, Disco Holográfico).",
    "Motor I/O asíncrono impulsado por Tokio.",
    "Cálculo de hashes Blake3 Anti Bit-Rot.",
    "Cálculo dinámico del tamaño total del directorio."
]

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
    
    data["changelog_v200_title"] = "v2.0.0-alpha.1"
    data["changelog_v200_items"] = es_v2 if is_es else en_v2
    
    data["changelog_v123_title"] = "v1.2.3"
    data["changelog_v123_items"] = es_v123 if is_es else en_v123
    
    with open(file, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

print("Locales updated.")
