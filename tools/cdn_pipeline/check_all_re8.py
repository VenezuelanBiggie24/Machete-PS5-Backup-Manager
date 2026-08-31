import urllib.request
import json
from PIL import Image
import io

urls = [
    ("NMu5EEmFLFUsuzOW4jGw2KOj", "https://image.api.playstation.com/vulcan/ap/rnd/202101/0812/NMu5EEmFLFUsuzOW4jGw2KOj.jpg"),
    ("aatVgzgwgsZgeEeTT2LTiwXU", "https://image.api.playstation.com/vulcan/ap/rnd/202101/0812/aatVgzgwgsZgeEeTT2LTiwXU.png"),
    ("QDaRpXJyMxLjNvrNbpTgXf41", "https://image.api.playstation.com/vulcan/ap/rnd/202101/0812/QDaRpXJyMxLjNvrNbpTgXf41.png"),
    ("uAhJNbCgYUmUOuCDiMNXtYBC", "https://image.api.playstation.com/vulcan/ap/rnd/202101/0812/uAhJNbCgYUmUOuCDiMNXtYBC.png"),
    ("KBfrJBhO4DJvknZnrefsIigv", "https://image.api.playstation.com/vulcan/ap/rnd/202207/0706/KBfrJBhO4DJvknZnrefsIigv.jpg"),
    ("nByF0tIdHr6jeiK7fE5epEHR", "https://image.api.playstation.com/vulcan/ap/rnd/202207/0706/nByF0tIdHr6jeiK7fE5epEHR.png"),
]

for name, url in urls:
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as res:
            img = Image.open(io.BytesIO(res.read()))
            print(f"[{name}] size={img.size}, format={img.format}")
            img.save(f"/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/check_{name}.png")
    except Exception as e:
        print(f"Error {name}: {e}")
