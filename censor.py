from PIL import Image, ImageFilter
import sys
import glob

# Find the best image
images = glob.glob("/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/*.png")
if not images:
    print("No images found")
    sys.exit(1)

# Pick the latest one
img_path = sorted(images)[-1]
print(f"Processing {img_path}")
img = Image.open(img_path)
w, h = img.size

# Assuming UI layout: Sidebar is left ~250px, top header is ~60px.
# We want to blur the area with game covers. Let's blur from x=280 to w, and y=80 to h.
box = (280, 80, w-20, h-20)
ic = img.crop(box)
# Blur it heavily to censor game covers and titles
ic = ic.filter(ImageFilter.GaussianBlur(radius=15))
img.paste(ic, box)

out_path = "screenshot.png"
img.save(out_path)
print(f"Saved censored image to {out_path}")
