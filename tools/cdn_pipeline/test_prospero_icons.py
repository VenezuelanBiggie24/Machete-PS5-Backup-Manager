import urllib.request
from PIL import Image
import io

urls = [
    ("Spider-Man Miles Morales (PPSA01411)", "https://cdn.prosperopatches.com/titles/PPSA01411_d6a71c63818045f0c1c69aaa1a1f8fadb2d19ee3829dabadb5d0832514d66c6b/icon0.webp"),
    ("Resident Evil Village (PPSA01556)", "https://cdn.prosperopatches.com/titles/PPSA01556_e20f69c4bd6ce0adcc8ff3e4c3d6b90a0d1f136ac0f8f3c4d03cfbf897860a48/icon0.webp"),
    ("God of War Ragnarok (PPSA08330)", "https://cdn.prosperopatches.com/titles/PPSA08330_8251a11b47c7fba734914a25481b1f738ad0de8bfc69c6a71f4540828589bf15/icon0.webp"),
    ("Demon's Souls (PPSA01342)", "https://cdn.prosperopatches.com/titles/PPSA01342_d444846b079d8b81dad513ece3a2b1148f46fc6139622a7900e3984cbd7918c0/icon0.webp"),
]

for name, url in urls:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as res:
        raw = res.read()
        img = Image.open(io.BytesIO(raw))
        print(f"✅ {name}: size={img.size}, bytes={len(raw)}")
        img.save(f"/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/sample_{name[:12].strip()}.png")
