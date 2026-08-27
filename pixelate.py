from PIL import Image
import glob

# Load the grid image (second most recent, right before the about modal)
img_path = "/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/media_1787604505752.png"
img = Image.open(img_path)
w, h = img.size

# Sidebar is ~250px on left, Topbar is ~60px
# We will pixelate the grid where the game covers are (x > 260, y > 80)
box = (260, 80, w-20, h-20)
ic = img.crop(box)

# Pixelate: shrink then resize back
pixel_size = 15
ic_small = ic.resize((ic.size[0] // pixel_size, ic.size[1] // pixel_size), resample=Image.NEAREST)
ic_pixelated = ic_small.resize(ic.size, Image.NEAREST)

img.paste(ic_pixelated, box)

# Save to public folder so it can be in the repo
out_path = "public/screenshot.png"
img.save(out_path)
print(f"Saved pixelated image to {out_path}")
