from PIL import Image, ImageFilter
import sys

img = Image.open("original_test.png")
w, h = img.size

# The user's screenshot shows the games are almost full width. 
# Let's blur everything below the top bar (y > 70).
# We'll use a strong Gaussian Blur for a "Frosted Glass" look.
box = (0, 70, w, h)
ic = img.crop(box)
ic = ic.filter(ImageFilter.GaussianBlur(radius=30))
img.paste(ic, box)

img.save("public/screenshot.png")
print("Done")
