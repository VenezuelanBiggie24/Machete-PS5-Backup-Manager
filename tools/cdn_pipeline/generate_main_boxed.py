import io
import urllib.request
import json
from PIL import Image
import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="https://95434973a53fa65e0a4e76829c70635c.r2.cloudflarestorage.com",
    aws_access_key_id="bfe2ee169600ee8069cd871043ed82a4",
    aws_secret_access_key="698266512cc6301144875f5b92396b10b67cf168c24af45ef85561f4f7260819",
)

# 4K Clean Header (No blue border, master Wolverine calque)
HEADER_IMG = Image.open("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/ps5_header_4k_clean.png").convert("RGB")

def create_4k_ps5_boxed_cover(image_bytes: bytes) -> bytes:
    with Image.open(io.BytesIO(image_bytes)) as raw_img:
        raw_img = raw_img.convert("RGB")
        
        WIDTH = 1200
        HEIGHT = 1600
        HEADER_HEIGHT = 154 # 9.6% exact proportion
        
        canvas = Image.new("RGB", (WIDTH, HEIGHT), color=(255, 255, 255))
        
        # 1. Full-bleed artwork below header
        art_height = HEIGHT - HEADER_HEIGHT
        art_w, art_h = raw_img.size
        target_ratio = WIDTH / art_height
        src_ratio = art_w / art_h
        
        if src_ratio > target_ratio:
            new_w = int(art_h * target_ratio)
            left = (art_w - new_w) // 2
            cropped = raw_img.crop((left, 0, left + new_w, art_h))
        else:
            new_h = int(art_w / target_ratio)
            top = (art_h - new_h) // 4
            cropped = raw_img.crop((0, top, art_w, top + new_h))
            
        resized_art = cropped.resize((WIDTH, art_height), Image.Resampling.LANCZOS)
        canvas.paste(resized_art, (0, HEADER_HEIGHT))
        
        # 2. Paste 4K Master Clean PS5 Header
        canvas.paste(HEADER_IMG, (0, 0))
        
        out_io = io.BytesIO()
        canvas.save(out_io, format="WEBP", quality=95, method=6)
        return out_io.getvalue()

def process_and_upload_game(ppsa_id):
    api_url = f"https://api.serialstation.com/v1/store/products?title_id_search={ppsa_id}"
    req = urllib.request.Request(api_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read().decode('utf-8'))
        
    img_url = None
    for img in data['items'][0]['localization']['images']:
        if img.get('type') in ('PORTRAIT_BANNER', 'GAMEHUB_COVER_ART'):
            img_url = img['url']
            break
            
    print(f"Downloading {ppsa_id} from {img_url}")
    art_req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(art_req) as res:
        raw_bytes = res.read()
        
    boxed_webp = create_4k_ps5_boxed_cover(raw_bytes)
    
    s3.put_object(
        Bucket="machete-covers",
        Key=f"{ppsa_id}.webp",
        Body=boxed_webp,
        ContentType="image/webp",
        CacheControl="public, max-age=31536000, immutable",
    )
    print(f"✅ Subida 4K Boxed: {ppsa_id}.webp ({len(boxed_webp) // 1024} KB)")

# Process key popular PS5 games
process_and_upload_game("PPSA01556") # RE Village
process_and_upload_game("PPSA01411") # Spider-Man Miles Morales
process_and_upload_game("PPSA08330") # God of War Ragnarok
process_and_upload_game("PPSA01342") # Demon's Souls
process_and_upload_game("PPSA01284") # Returnal
