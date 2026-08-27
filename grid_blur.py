from PIL import Image, ImageFilter, ImageDraw
import numpy as np

path = "/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/media_1787604505752.png"
original_pil = Image.open(path)
w, h = original_pil.size

# We want to blur specific rectangular areas that correspond to the cards.
# Based on the UI, let's create a mask.
mask = Image.new("L", (w, h), 0)
draw = ImageDraw.Draw(mask)

# The grid usually has cards. Let's make a grid of rounded rectangles for the mask.
# Card width: ~210px. Card height: ~320px.
# Starting X: ~55. Starting Y: ~135. Gap X: ~25. Gap Y: ~25.
start_x = 55
start_y = 135
card_w = 215
card_h = 320
gap = 24

for row in range(2):
    for col in range(4):
        x1 = start_x + col * (card_w + gap)
        y1 = start_y + row * (card_h + gap)
        x2 = x1 + card_w
        y2 = y1 + card_h
        
        # Only draw if within bounds
        if x2 < w and y1 < h:
            draw.rounded_rectangle([x1, y1, min(x2, w-10), min(y2, h-10)], radius=12, fill=255)

# Now apply blur using PIL where mask is white
blurred_pil = original_pil.filter(ImageFilter.GaussianBlur(radius=25))
final_img = Image.composite(blurred_pil, original_pil, mask)

# Save
final_img.save("public/screenshot.png")
print("Done grid blur.")
