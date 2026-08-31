from PIL import Image

img = Image.open("/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/media_1788155483063.jpg").convert("RGB")
print("Image size:", img.size)

# Scan for the pure white banner at the top of the paper insert
# The paper insert starts right below the top blue plastic edge
# Let's find the boundary of the white rectangle with the black PS5 logo
# The blue case is around the edges.
# The white insert is approximately:
# X: from around 100 to 880
# Y: from around 75 to 170

width, height = img.size
white_pixels = []
for y in range(60, 200):
    for x in range(80, width - 80):
        r, g, b = img.getpixel((x, y))
        # White paper insert
        if r > 240 and g > 240 and b > 240:
            white_pixels.append((x, y))

xs = [p[0] for p in white_pixels]
ys = [p[1] for p in white_pixels]
print(f"White insert bounds: X: {min(xs)} to {max(xs)}, Y: {min(ys)} to {max(ys)}")

# Crop the exact white header
header_crop = img.crop((min(xs), min(ys), max(xs), max(ys)))
header_crop.save("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/wolverine_header_master.png")
print("Saved wolverine_header_master.png size:", header_crop.size)
