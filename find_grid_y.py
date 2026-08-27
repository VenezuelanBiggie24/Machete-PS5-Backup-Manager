import cv2
import numpy as np

path = "/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/media_1787604505752.png"
img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)

# Crop to right side where cards are (x=300 to 800)
crop = img[:, 300:800]
row_sum = np.sum(crop, axis=1)
row_sum = row_sum - np.min(row_sum)
row_sum = row_sum / np.max(row_sum)

is_card = row_sum > 0.4
changes = np.where(is_card[:-1] != is_card[1:])[0]

print("Row edges detected at Y coordinates:")
print(changes.tolist())
