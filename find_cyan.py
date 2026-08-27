import cv2
import numpy as np

path = "/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/media_1787604505752.png"
img = cv2.imread(path)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

# Cyan range in HSV (Hue for Cyan is around 90-100 in OpenCV's 0-179 scale)
lower_cyan = np.array([85, 100, 100])
upper_cyan = np.array([105, 255, 255])
mask = cv2.inRange(hsv, lower_cyan, upper_cyan)

contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

badges = []
for cnt in contours:
    x, y, w, h = cv2.boundingRect(cnt)
    if w > 10 and h > 5:
        badges.append((x, y, w, h))

print(f"Found {len(badges)} cyan contours.")
for b in sorted(badges, key=lambda x: (x[1]//50, x[0])): # Sort roughly by row then column
    print(f"Cyan contour at x={b[0]}, y={b[1]}, w={b[2]}, h={b[3]}")
