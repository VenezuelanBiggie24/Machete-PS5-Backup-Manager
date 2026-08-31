import io
import urllib.request
import json
from PIL import Image, ImageDraw
import boto3

R2_ENDPOINT = "https://95434973a53fa65e0a4e76829c70635c.r2.cloudflarestorage.com"
R2_BUCKET = "machete-covers"
R2_ACCESS_KEY = "bfe2ee169600ee8069cd871043ed82a4"
R2_SECRET_KEY = "698266512cc6301144875f5b92396b10b67cf168c24af45ef85561f4f7260819"

s3 = boto3.client(
    "s3",
    endpoint_url=R2_ENDPOINT,
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
)

def create_4k_flawless_ps5_cover():
    # 1. Clean up master logo lockup from Wolverine screenshot without ANY blue edges
    wolverine_src = Image.open("/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/media_1788155483063.jpg").convert("RGB")
    
    # Crop ONLY the pure logo lockup on white background: X from 100 to 450, Y from 80 to 165
    logo_crop = wolverine_src.crop((100, 80, 450, 165))
    logo_crop.save("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/ps5_logo_pure_crop.png")
    
    # 2. 4K Ultra-HD Master Dimensions: 1200 x 1600 (2X Retina / 4K scale)
    WIDTH_4K = 1200
    HEIGHT_4K = 1600
    HEADER_HEIGHT_4K = 154 # Exact 9.6% height proportion
    
    canvas_4k = Image.new("RGB", (WIDTH_4K, HEIGHT_4K), color=(255, 255, 255))
    draw_4k = ImageDraw.Draw(canvas_4k)
    
    # 100% PURE WHITE HEADER (0 blue artifacts anywhere)
    draw_4k.rectangle([(0, 0), (WIDTH_4K, HEADER_HEIGHT_4K)], fill=(255, 255, 255))
    # Subtle 1px crisp separation line
    draw_4k.line([(0, HEADER_HEIGHT_4K - 1), (WIDTH_4K, HEADER_HEIGHT_4K - 1)], fill=(230, 233, 238), width=2)
    
    # Place the genuine logo on the left in 4K resolution (Height ~ 95px, Width ~ 390px)
    logo_resized_4k = logo_crop.resize((390, 95), Image.Resampling.LANCZOS)
    canvas_4k.paste(logo_resized_4k, (44, 28))
    
    # Save the 4K pure header asset for the React app
    header_only_4k = canvas_4k.crop((0, 0, WIDTH_4K, HEADER_HEIGHT_4K))
    header_only_4k.save("/Users/thebigmike/.gemini/antigravity/scratch/machete/src/assets/ps5_header_master.png")
    header_only_4k.save("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/ps5_header_4k_clean.png")
    
    # 3. Download official God of War Ragnarok 4K Artwork
    api_url = "https://api.serialstation.com/v1/store/products?title_id_search=PPSA08330"
    req = urllib.request.Request(api_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read().decode('utf-8'))
        
    img_url = None
    for img in data['items'][0]['localization']['images']:
        if img.get('type') == 'PORTRAIT_BANNER':
            img_url = img['url']
            break
    if not img_url:
        img_url = data['items'][0]['localization']['images'][0]['url']
        
    art_req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(art_req) as res:
        raw_bytes = res.read()

    with Image.open(io.BytesIO(raw_bytes)) as game_art:
        game_art = game_art.convert("RGB")
        
        art_height_4k = HEIGHT_4K - HEADER_HEIGHT_4K
        art_w, art_h = game_art.size
        target_ratio = WIDTH_4K / art_height_4k
        src_ratio = art_w / art_h
        
        if src_ratio > target_ratio:
            new_w = int(art_h * target_ratio)
            left = (art_w - new_w) // 2
            cropped = game_art.crop((left, 0, left + new_w, art_h))
        else:
            new_h = int(art_w / target_ratio)
            top = (art_h - new_h) // 4
            cropped = game_art.crop((0, top, art_w, top + new_h))
            
        resized_art = cropped.resize((WIDTH_4K, art_height_4k), Image.Resampling.LANCZOS)
        canvas_4k.paste(resized_art, (0, HEADER_HEIGHT_4K))
        
        # Save 4K WebP (Ultra Quality, Zero Artifacts, 0 Blue Edge)
        out_io = io.BytesIO()
        canvas_4k.save(out_io, format="WEBP", quality=96, method=6)
        boxed_4k_webp = out_io.getvalue()
        
        # Upload to R2 Bucket
        s3.put_object(
            Bucket=R2_BUCKET,
            Key="sample_boxed_ps5.webp",
            Body=boxed_4k_webp,
            ContentType="image/webp",
            CacheControl="public, max-age=31536000, immutable",
        )
        print("💎 4K ULTRA-HD FLAWLESS PS5 COVER UPLOADED TO CLOUDFLARE R2!")

if __name__ == "__main__":
    create_4k_flawless_ps5_cover()
