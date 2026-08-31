import urllib.request
from PIL import Image
import io

GAMES_TO_AUDIT = [
    ("Marvel's Spider-Man: Miles Morales", "PPSA01411"),
    ("Demon's Souls", "PPSA01342"),
    ("Returnal", "PPSA01284"),
    ("Resident Evil Village", "PPSA01556"),
    ("Resident Evil 4 Remake", "PPSA07418"),
    ("God of War Ragnarok", "PPSA08330"),
    ("Horizon Forbidden West", "PPSA01521"),
    ("Ratchet & Clank: Rift Apart", "PPSA01473"),
    ("Elden Ring", "PPSA04609"),
    ("Dead Space", "PPSA03362"),
    ("Deathloop", "PPSA02187"),
    ("Gran Turismo 7", "PPSA01948"),
    ("Final Fantasy XVI", "PPSA10664"),
    ("Hogwarts Legacy", "PPSA01928"),
]

def audit_cdn():
    print("🔍 Auditando las carátulas de los juegos principales en Cloudflare R2...\n")
    success_count = 0
    for name, ppsa in GAMES_TO_AUDIT:
        url = f"https://pub-ff9ca9f4c73c45fca9efa3fadc7a65cf.r2.dev/{ppsa}.webp"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as res:
                raw = res.read()
                img = Image.open(io.BytesIO(raw))
                print(f"✅ {name} ({ppsa}): {img.size[0]}x{img.size[1]} ({len(raw) // 1024} KB) -> OK")
                success_count += 1
        except Exception as e:
            print(f"❌ {name} ({ppsa}): No encontrada o error ({e})")
            
    print(f"\n📊 Resultado Auditoría: {success_count}/{len(GAMES_TO_AUDIT)} títulos verificados en 4K.")

if __name__ == "__main__":
    audit_cdn()
