import urllib.request
from PIL import Image
import io

urls = [
    ("DGW5xHgDXbWaEvssZRG0QeCl", "https://image.api.playstation.com/vulcan/ap/rnd/202101/0812/DGW5xHgDXbWaEvssZRG0QeCl.png"),
    ("D8YACd9U8RAcdtOVpXeXDpzg", "https://image.api.playstation.com/vulcan/ap/rnd/202207/0706/D8YACd9U8RAcdtOVpXeXDpzg.png"),
    ("BDUwvDZTuZalxHqQyYSOIL3Z", "https://image.api.playstation.com/vulcan/ap/rnd/202301/2006/BDUwvDZTuZalxHqQyYSOIL3Z.png"),
]

for name, url in urls:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as res:
        img = Image.open(io.BytesIO(res.read()))
        print(f"[{name}] size={img.size}, format={img.format}")
        img.save(f"/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/portrait_{name}.png")

print("Saved vertical portrait samples!")
