from PIL import Image, ImageFilter, ImageDraw
import numpy as np

path = "/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/media_1787604505752.png"
original_pil = Image.open(path)
w, h = original_pil.size

mask = Image.new("L", (w, h), 0)
draw = ImageDraw.Draw(mask)

# Ultimate coordinates based on math and tailwind classes
start_x = 246
start_y = 125
card_w = 176
card_h = 270
gap_x = 18
gap_y = 20

for row in range(3):
    for col in range(4):
        x1 = start_x + col * (card_w + gap_x)
        y1 = start_y + row * (card_h + gap_y)
        x2 = x1 + card_w
        y2 = y1 + card_h
        
        if x2 < w and y1 < h:
            draw.rounded_rectangle([x1, y1, min(x2, w-2), min(y2, h-2)], radius=12, fill=255)

blurred_pil = original_pil.filter(ImageFilter.GaussianBlur(radius=25))
final_img = Image.composite(blurred_pil, original_pil, mask)

final_img.save("public/screenshot.png")
final_img.save("/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/screenshot.png")
print("Done grid blur 3.")
