from PIL import Image
import urllib.request
import io
import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="https://95434973a53fa65e0a4e76829c70635c.r2.cloudflarestorage.com",
    aws_access_key_id="bfe2ee169600ee8069cd871043ed82a4",
    aws_secret_access_key="698266512cc6301144875f5b92396b10b67cf168c24af45ef85561f4f7260819",
)

HEADER_IMG = Image.open("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/ps5_header_4k_clean.png").convert("RGB")

# Solo standalone Resident Evil Village official box art (Chris Redfield facing forward with Lycan half)
# Direct official HD artwork URL:
art_url = "https://image.api.playstation.com/vulcan/ap/rnd/202101/0812/NMu5EEmFLFUsuzOW4jGw2KOj.jpg"

req = urllib.request.Request(art_url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as res:
    raw_img = Image.open(io.BytesIO(res.read())).convert("RGB")

# Target 4K: 1200 x 1600
WIDTH = 1200
HEIGHT = 1600
HEADER_HEIGHT = 154

canvas = Image.new("RGB", (WIDTH, HEIGHT), color=(255, 255, 255))

# 1. Full-bleed solo artwork below header (1200 x 1446)
art_height = HEIGHT - HEADER_HEIGHT
art_w, art_h = raw_img.size
target_ratio = WIDTH / art_height
src_ratio = art_w / art_h

# Center-crop Chris Redfield's face
new_w = int(art_h * target_ratio)
left = (art_w - new_w) // 2
cropped = raw_img.crop((left, 0, left + new_w, art_h))

resized_art = cropped.resize((WIDTH, art_height), Image.Resampling.LANCZOS)
canvas.paste(resized_art, (0, HEADER_HEIGHT))

# 2. Paste 4K Master PS5 Header
canvas.paste(HEADER_IMG, (0, 0))

out_io = io.BytesIO()
canvas.save(out_io, format="WEBP", quality=96, method=6)
webp_bytes = out_io.getvalue()

for key in ["PPSA01556.webp", "PPSA01557.webp", "re8_solo_official.webp"]:
    s3.put_object(
        Bucket="machete-covers",
        Key=key,
        Body=webp_bytes,
        ContentType="image/webp",
        CacheControl="public, max-age=31536000, immutable",
    )
    print(f"✅ Subida carátula individual 100% oficial: {key}")
