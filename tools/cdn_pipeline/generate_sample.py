from PIL import Image, ImageDraw, ImageFont
import io
import boto3
import urllib.request

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

def generate_boxed_sample():
    # 1. Download God of War Ragnarok from our live CDN
    url = "https://pub-ff9ca9f4c73c45fca9efa3fadc7a65cf.r2.dev/PPSA08330.webp"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as res:
        raw_bytes = res.read()

    with Image.open(io.BytesIO(raw_bytes)) as img:
        img = img.convert("RGB")
        
        # Target canvas size: 600 x 900
        canvas = Image.new("RGB", (600, 900), color=(255, 255, 255))
        draw = ImageDraw.Draw(canvas)
        
        # 1. Header background (Height: 70px) - pure white with subtle satin bottom border
        draw.rectangle([(0, 0), (600, 68)], fill=(255, 255, 255))
        draw.line([(0, 68), (600, 68)], fill=(210, 215, 222), width=2)
        draw.line([(0, 69), (600, 69)], fill=(240, 242, 245), width=1)
        
        # 2. PlayStation geometric glyph / PS5 text
        try:
            font_ps5 = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 34)
            font_ps = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 14)
        except Exception:
            font_ps5 = ImageFont.load_default()
            font_ps = ImageFont.load_default()
            
        # Draw PlayStation branding
        # PS icon shape (stylized P and S)
        # S bar
        draw.rounded_rectangle([(30, 20), (42, 48)], radius=3, fill=(0, 0, 0))
        draw.polygon([(42, 20), (55, 34), (42, 34)], fill=(0, 0, 0))
        draw.polygon([(30, 36), (48, 50), (30, 50)], fill=(0, 0, 0))
        
        draw.text((68, 16), "PS5", fill=(0, 0, 0), font=font_ps5)
        draw.text((450, 26), "PlayStation 5", fill=(110, 120, 130), font=font_ps)
        
        # 3. Game artwork (Height: 830px)
        resized_art = img.resize((600, 831), Image.Resampling.LANCZOS)
        canvas.paste(resized_art, (0, 70))
        
        # Save to WebP
        out_io = io.BytesIO()
        canvas.save(out_io, format="WEBP", quality=88, method=6)
        boxed_webp = out_io.getvalue()
        
        # Save local sample
        local_path = "/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/sample_boxed_ps5.webp"
        with open(local_path, "wb") as f:
            f.write(boxed_webp)
            
        # Upload to R2 Bucket
        s3.put_object(
            Bucket=R2_BUCKET,
            Key="sample_boxed_ps5.webp",
            Body=boxed_webp,
            ContentType="image/webp",
            CacheControl="public, max-age=31536000, immutable",
        )
        print("✅ Sample generated and uploaded to Cloudflare R2: sample_boxed_ps5.webp")
        print("🌐 Public URL: https://pub-ff9ca9f4c73c45fca9efa3fadc7a65cf.r2.dev/sample_boxed_ps5.webp")

if __name__ == "__main__":
    generate_boxed_sample()
