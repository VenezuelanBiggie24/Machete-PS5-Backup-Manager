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

def create_pixel_perfect_ps5_cover():
    # 1. Download official God of War Ragnarok artwork
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
        
        # Standard PS5 retail box aspect ratio: 600 x 800 (1500 x 2000)
        WIDTH = 600
        HEIGHT = 800
        HEADER_HEIGHT = 70
        
        canvas = Image.new("RGB", (WIDTH, HEIGHT), color=(255, 255, 255))
        
        # 1. Resize artwork to fill the entire remaining area under the header (600 x 730)
        art_height = HEIGHT - HEADER_HEIGHT
        # Center-crop or proportional fill to guarantee 0 whitespace
        art_w, art_h = game_art.size
        target_ratio = WIDTH / art_height
        src_ratio = art_w / art_h
        
        if src_ratio > target_ratio:
            # Source is wider -> crop sides
            new_w = int(art_h * target_ratio)
            left = (art_w - new_w) // 2
            cropped = game_art.crop((left, 0, left + new_w, art_h))
        else:
            # Source is taller -> crop top/bottom slightly
            new_h = int(art_w / target_ratio)
            top = (art_h - new_h) // 4
            cropped = game_art.crop((0, top, art_w, top + new_h))
            
        resized_art = cropped.resize((WIDTH, art_height), Image.Resampling.LANCZOS)
        canvas.paste(resized_art, (0, HEADER_HEIGHT))
        
        # 2. Draw White Header Bar
        draw = ImageDraw.Draw(canvas)
        draw.rectangle([(0, 0), (WIDTH, HEADER_HEIGHT - 1)], fill=(255, 255, 255))
        # Subtle 1px clean bottom border line
        draw.line([(0, HEADER_HEIGHT - 1), (WIDTH, HEADER_HEIGHT - 1)], fill=(225, 228, 232), width=1)
        
        # 3. Paste Official PS5 Logo on the LEFT with proper retail case scale
        logo_img = Image.open("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/ps5_logo_official.png").convert("RGBA")
        # Target logo dimensions in header: Width ~210px, Height ~46px
        logo_resized = logo_img.resize((210, 46), Image.Resampling.LANCZOS)
        
        # Position: Left = 22px, Centered vertically in 70px header -> Top = (70 - 46) // 2 = 12px
        canvas.paste(logo_resized, (22, 12), logo_resized)
        
        out_io = io.BytesIO()
        canvas.save(out_io, format="WEBP", quality=92, method=6)
        boxed_webp = out_io.getvalue()
        
        # Upload to R2 Bucket
        s3.put_object(
            Bucket=R2_BUCKET,
            Key="sample_boxed_ps5.webp",
            Body=boxed_webp,
            ContentType="image/webp",
            CacheControl="public, max-age=31536000, immutable",
        )
        print("✅ Fixed Pixel-Perfect Left-Aligned PS5 Retail Box uploaded to Cloudflare R2!")

if __name__ == "__main__":
    create_pixel_perfect_ps5_cover()
