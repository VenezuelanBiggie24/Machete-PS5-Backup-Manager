from PIL import Image

img = Image.open("/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/media_1788155061321.png").convert("RGB")
width, height = img.size

# Find all pixels that are near-pure white (R > 240, G > 240, B > 240) in the left region (x < 500)
min_x, min_y, max_x, max_y = width, height, 0, 0
white_pixels = []

for y in range(80, 250):
    for x in range(50, 500):
        r, g, b = img.getpixel((x, y))
        if r > 245 and g > 245 and b > 245:
            white_pixels.append((x, y))

if white_pixels:
    xs = [p[0] for p in white_pixels]
    ys = [p[1] for p in white_pixels]
    print(f"White Header Bounds: X ({min(xs)} to {max(xs)}), Y ({min(ys)} to {max(ys)})")
    
    # Crop the exact header
    header_crop = img.crop((min(xs), min(ys), max(xs), max(ys)))
    header_crop.save("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/true_ps5_header.png")
    print("true_ps5_header.png saved!")
