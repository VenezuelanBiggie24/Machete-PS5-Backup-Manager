from PIL import Image

img = Image.open("/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/media_1788155483063.jpg").convert("RGB")
w, h = img.size

# Let's inspect column 500 (middle) from y=50 to 250 to see colors
for y in range(50, 250, 5):
    print(f"y={y}: {img.getpixel((500, y))}")

# And let's find the left edge of the white paper insert (at y=120)
for x in range(50, 250, 5):
    print(f"x={x}: {img.getpixel((x, 120))}")
