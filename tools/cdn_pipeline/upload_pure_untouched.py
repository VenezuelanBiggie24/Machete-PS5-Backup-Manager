import urllib.request
import json
import boto3
from PIL import Image
import io

s3 = boto3.client(
    "s3",
    endpoint_url="https://95434973a53fa65e0a4e76829c70635c.r2.cloudflarestorage.com",
    aws_access_key_id="bfe2ee169600ee8069cd871043ed82a4",
    aws_secret_access_key="698266512cc6301144875f5b92396b10b67cf168c24af45ef85561f4f7260819",
)

def upload_untouched_sample(ppsa_id, img_url):
    print(f"Downloading untouched official artwork for {ppsa_id}: {img_url}")
    req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as res:
        raw = res.read()
        
    with Image.open(io.BytesIO(raw)) as img:
        img = img.convert("RGB")
        # Target 3:4 / 2:3 clean resolution (600x900)
        resized = img.resize((600, 900), Image.Resampling.LANCZOS)
        out_io = io.BytesIO()
        resized.save(out_io, format="WEBP", quality=95, method=6)
        webp_bytes = out_io.getvalue()
        
    s3.put_object(
        Bucket="machete-covers",
        Key=f"{ppsa_id}.webp",
        Body=webp_bytes,
        ContentType="image/webp",
        CacheControl="public, max-age=31536000, immutable",
    )
    print(f"✅ Subida carátula limpia original intacta: {ppsa_id}.webp")

# Resident Evil Village (PPSA01556) - Pure untouched portrait
upload_untouched_sample("PPSA01556", "https://image.api.playstation.com/vulcan/ap/rnd/202101/0812/DGW5xHgDXbWaEvssZRG0QeCl.png")

# Spider-Man Miles Morales (PPSA01411) - Pure untouched portrait
upload_untouched_sample("PPSA01411", "https://image.api.playstation.com/vulcan/ap/rnd/202008/1423/drpqL1O7aD0VvT9lWvhM5q1b.jpg")

# God of War Ragnarok (PPSA08330) - Pure untouched portrait
upload_untouched_sample("PPSA08330", "https://image.api.playstation.com/vulcan/ap/rnd/202503/2016/1e48e3b7d11fc2da3de62ad8a2a2d3c2882e1bb4ce6caadb.jpg")
