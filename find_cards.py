import cv2
import numpy as np
from PIL import Image

path = "/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/media_1787604505752.png"
img = cv2.imread(path)

# Convert to HSV to find red color (MACHETEAR button)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

# Red has two ranges in HSV
lower_red1 = np.array([0, 150, 100])
upper_red1 = np.array([10, 255, 255])
lower_red2 = np.array([170, 150, 100])
upper_red2 = np.array([180, 255, 255])

mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
mask2 = cv2.inRange(hsv, lower_red2, upper_red2)
mask = mask1 + mask2

# Find contours of the red text
contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

buttons = []
for cnt in contours:
    x, y, w, h = cv2.boundingRect(cnt)
    if w > 20 and h > 5: # Filter out noise
        buttons.append((x, y, w, h))

# Group buttons that belong to the same card (since text might be broken into multiple contours)
# We can just look at the Y coordinates to find the rows, and X coordinates to find columns
print(f"Found {len(buttons)} red contours.")
for b in buttons:
    print(f"Red contour at x={b[0]}, y={b[1]}, w={b[2]}, h={b[3]}")
