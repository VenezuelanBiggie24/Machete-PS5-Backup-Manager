import urllib.request
from PIL import Image
import io

urls = [
    ("GAMEHUB_COVER_ART", "https://image.api.playstation.com/vulcan/ap/rnd/202101/0812/QDaRpXJyMxLjNvrNbpTgXf41.png"),
    ("EDITION_KEY_ART", "https://image.api.playstation.com/vulcan/ap/rnd/202101/0812/NMu5EEmFLFUsuzOW4jGw2KOj.jpg"),
    ("PORTRAIT_BANNER", "https://image.api.playstation.com/vulcan/ap/rnd/202101/0812/DGW5xHgDXbWaEvssZRG0QeCl.png"),
]

for name, url in urls:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as res:
        img = Image.open(io.BytesIO(res.read()))
        print(f"{name}: size={img.size}, format={img.format}")
        img.save(f"/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/sample_{name}.png")

print("Saved samples for comparison!")
