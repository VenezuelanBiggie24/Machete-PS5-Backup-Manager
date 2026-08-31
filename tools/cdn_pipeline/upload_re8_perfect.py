from PIL import Image
import boto3
import io

s3 = boto3.client(
    "s3",
    endpoint_url="https://95434973a53fa65e0a4e76829c70635c.r2.cloudflarestorage.com",
    aws_access_key_id="bfe2ee169600ee8069cd871043ed82a4",
    aws_secret_access_key="698266512cc6301144875f5b92396b10b67cf168c24af45ef85561f4f7260819",
)

HEADER_IMG = Image.open("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/ps5_header_4k_clean.png").convert("RGB")
art_img = Image.open("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/portrait_DGW5xHgDXbWaEvssZRG0QeCl.png").convert("RGB")

WIDTH = 1200
HEIGHT = 1600
HEADER_HEIGHT = 154

canvas = Image.new("RGB", (WIDTH, HEIGHT), color=(255, 255, 255))

# The portrait banner (1440x2160) is ALREADY native vertical!
# Crop only the tiny excess on height to match 1200 x 1446 without cutting any text or face!
art_height = HEIGHT - HEADER_HEIGHT
art_w, art_h = art_img.size
target_ratio = WIDTH / art_height # 1200 / 1446 = 0.8298
src_ratio = art_w / art_h # 1440 / 2160 = 0.6666

# Source is narrower than target, crop slightly from top/bottom
new_h = int(art_w / target_ratio) # 1440 / 0.8298 = 1735
top = (art_h - new_h) // 6 # Keep entire face & title in view
cropped = art_img.crop((0, top, art_w, top + new_h))

resized_art = cropped.resize((WIDTH, art_height), Image.Resampling.LANCZOS)
canvas.paste(resized_art, (0, HEADER_HEIGHT))

# Paste 4K Clean PS5 Header
canvas.paste(HEADER_IMG, (0, 0))

out_io = io.BytesIO()
canvas.save(out_io, format="WEBP", quality=96, method=6)
webp_bytes = out_io.getvalue()

for key in ["PPSA01556.webp", "PPSA01557.webp", "re8_perfect_portrait.webp"]:
    s3.put_object(
        Bucket="machete-covers",
        Key=key,
        Body=webp_bytes,
        ContentType="image/webp",
        CacheControl="public, max-age=31536000, immutable",
    )
    print(f"✅ Subida carátula vertical perfecta 100%: {key}")
