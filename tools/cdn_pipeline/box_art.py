from PIL import Image, ImageDraw, ImageFont
import io

def create_ps5_boxed_cover(game_image_bytes: bytes) -> bytes:
    """Composites a game cover with the official white PS5 retail case header."""
    with Image.open(io.BytesIO(game_image_bytes)) as raw_img:
        if raw_img.mode in ("RGBA", "P"):
            raw_img = raw_img.convert("RGB")
        
        # Target dimensions: 600 x 900
        canvas = Image.new("RGB", (600, 900), color=(248, 249, 250))
        draw = ImageDraw.Draw(canvas)
        
        # 1. White / silver glossy header bar (Height: 70px)
        draw.rectangle([(0, 0), (600, 70)], fill=(255, 255, 255))
        # Subtle bottom border line for the header
        draw.line([(0, 69), (600, 69)], fill=(220, 224, 230), width=2)
        
        # 2. PlayStation Text & PS5 Logo on Header
        try:
            font_ps5 = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 28)
            font_sub = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 13)
        except Exception:
            font_ps5 = ImageFont.load_default()
            font_sub = ImageFont.load_default()
            
        # Draw "PS5"
        draw.text((32, 20), "PS5", fill=(0, 0, 0), font=font_ps5)
        # Draw "PlayStation" small label on the right
        draw.text((470, 26), "PLAYSTATION", fill=(100, 110, 120), font=font_sub)
        
        # 3. Resize and paste game artwork below header (from y=70 to y=900, height 830px)
        resized_game = raw_img.resize((600, 830), Image.Resampling.LANCZOS)
        canvas.paste(resized_game, (0, 70))
        
        out = io.BytesIO()
        canvas.save(out, format="WEBP", quality=85, method=6)
        return out.getvalue()

if __name__ == "__main__":
    print("PS5 Box Cover Generator ready.")
