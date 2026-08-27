import cv2
import numpy as np
from PIL import Image, ImageFilter

# Load image
path = "/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/media_1787604505752.png"
img_cv = cv2.imread(path)
original_pil = Image.open(path)

gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)

# Threshold or Edge detection to find the cards
edges = cv2.Canny(gray, 50, 150)
dilated = cv2.dilate(edges, np.ones((5,5), np.uint8), iterations=2)

contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

# Create a mask for blurring
mask = np.zeros_like(gray)

for cnt in contours:
    x, y, w, h = cv2.boundingRect(cnt)
    # Filter for card-like sizes. 
    # A game cover in the grid is usually around 100-300px wide and 150-400px tall.
    if w > 80 and h > 80 and w < 400 and h < 500:
        # Also avoid the top bar
        if y > 80:
            # Draw rectangle on mask
            cv2.rectangle(mask, (x, y), (x+w, y+h), 255, -1)

# Now apply blur using PIL where mask is white
mask_pil = Image.fromarray(mask).convert("L")
blurred_pil = original_pil.filter(ImageFilter.GaussianBlur(radius=20))

# Composite
final_img = Image.composite(blurred_pil, original_pil, mask_pil)
final_img.save("public/screenshot.png")
print("Done smart blur.")
