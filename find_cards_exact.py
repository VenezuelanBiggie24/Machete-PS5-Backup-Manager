import cv2
import numpy as np

path = "/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/media_1787604505752.png"
img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)

# Take a horizontal slice across the middle of the first row of cards
slice_y = img[180:200, :]
col_sums = np.sum(slice_y, axis=0)

# Smooth it
kernel = np.ones(5)/5
smoothed = np.convolve(col_sums, kernel, mode='same')

# Threshold
thresh = (smoothed > np.max(smoothed) * 0.2).astype(int)

# Find where it changes from 0 to 1 (start of card) and 1 to 0 (end of card)
diff = np.diff(thresh)
starts = np.where(diff == 1)[0]
ends = np.where(diff == -1)[0]

print("Starts:", starts)
print("Ends:", ends)

# Filter out noise (cards should be > 100px wide)
real_starts = []
real_ends = []

for s in starts:
    # find first end after this start
    valid_ends = ends[ends > s]
    if len(valid_ends) > 0:
        e = valid_ends[0]
        if e - s > 100:
            # avoid duplicates
            if len(real_starts) == 0 or s - real_starts[-1] > 50:
                real_starts.append(s)
                real_ends.append(e)

print("Real Card Starts:", real_starts)
print("Real Card Ends:", real_ends)
