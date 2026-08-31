from PIL import Image

img = Image.open("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/wolverine_header_master.png").convert("RGB")
w, h = img.size

# Find the bottom of the pure white header before yellow starts
# Let's inspect rows from top to bottom
for y in range(h):
    # Sample pixels near the right side where there is no logo
    r, g, b = img.getpixel((w - 50, y))
    # Yellow has low blue (e.g. b < 200)
    if b < 230:
        print(f"White header ends at y={y}")
        header_clean = img.crop((0, 10, w, y))
        header_clean.save("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/ps5_master_header_clean.png")
        print("Clean header saved, size:", header_clean.size)
        break
