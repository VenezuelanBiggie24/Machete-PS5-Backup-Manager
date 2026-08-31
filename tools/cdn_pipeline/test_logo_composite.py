import urllib.request
import json
from PIL import Image
import io

# 1. Fetch images for PPSA01557
api_url = "https://api.serialstation.com/v1/store/products?title_id_search=PPSA01557"
req = urllib.request.Request(api_url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as res:
    data = json.loads(res.read().decode('utf-8'))

# Main product
prod = None
for item in data.get("items", []):
    if "Gold Edition" in (item.get("name_en") or ""):
        prod = item
        break
if not prod:
    prod = data["items"][0]

art_url = None
logo_url = None

for img in prod["localization"]["images"]:
    t = img.get("type")
    if t == "PORTRAIT_BANNER" and not art_url:
        art_url = img["url"]
    elif t == "BACKGROUND" and not art_url:
        art_url = img["url"]
    elif t == "LOGO":
        logo_url = img["url"]

print(f"Artwork: {art_url}")
print(f"Logo: {logo_url}")

# Download Art
art_req = urllib.request.Request(art_url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(art_req) as res:
    art_img = Image.open(io.BytesIO(res.read())).convert("RGB")

# Download Logo
logo_req = urllib.request.Request(logo_url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(logo_req) as res:
    logo_img = Image.open(io.BytesIO(res.read())).convert("RGBA")

# 4K Canvas: 1200 x 1600
WIDTH = 1200
HEIGHT = 1600
HEADER_HEIGHT = 154

canvas = Image.new("RGB", (WIDTH, HEIGHT), color=(255, 255, 255))

# 1. Artwork below header
art_height = HEIGHT - HEADER_HEIGHT
art_w, art_h = art_img.size
target_ratio = WIDTH / art_height
src_ratio = art_w / art_h

if src_ratio > target_ratio:
    new_w = int(art_h * target_ratio)
    left = (art_w - new_w) // 2
    cropped = art_img.crop((left, 0, left + new_w, art_h))
else:
    new_h = int(art_w / target_ratio)
    top = (art_h - new_h) // 4
    cropped = art_img.crop((0, top, art_w, top + new_h))

resized_art = cropped.resize((WIDTH, art_height), Image.Resampling.LANCZOS)
canvas.paste(resized_art, (0, HEADER_HEIGHT))

# 2. Paste 4K Master PS5 Header
header = Image.open("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/ps5_header_4k_clean.png").convert("RGB")
canvas.paste(header, (0, 0))

# 3. Paste the Official Title Logo PNG onto the artwork!
# Calculate proportional width for title logo (e.g. 70% of box width = 840px)
lw, lh = logo_img.size
target_lw = 850
target_lh = int(lh * (target_lw / lw))
logo_resized = logo_img.resize((target_lw, target_lh), Image.Resampling.LANCZOS)

# Position logo in the lower-middle half (similar to retail cover box)
logo_x = (WIDTH - target_lw) // 2
logo_y = HEADER_HEIGHT + int(art_height * 0.55) # ~60% down the cover

canvas.paste(logo_resized, (logo_x, logo_y), logo_resized)

# Save test
canvas.save("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/re8_with_logo.webp", quality=95)
print("Saved re8_with_logo.webp!")

# Also upload to Cloudflare R2 as PPSA01557.webp to test live!
import boto3
s3 = boto3.client('s3', endpoint_url='https://95434973a53fa65e0a4e76829c70635c.r2.cloudflarestorage.com', aws_access_key_id='bfe2ee169600ee8069cd871043ed82a4', aws_secret_access_key='698266512cc6301144875f5b92396b10b67cf168c24af45ef85561f4f7260819')
out_io = io.BytesIO()
canvas.save(out_io, format="WEBP", quality=95)
s3.put_object(
    Bucket="machete-covers",
    Key="PPSA01557.webp",
    Body=out_io.getvalue(),
    ContentType="image/webp",
    CacheControl="public, max-age=31536000, immutable",
)
print("Uploaded PPSA01557.webp with official Title Logo to Cloudflare R2!")
