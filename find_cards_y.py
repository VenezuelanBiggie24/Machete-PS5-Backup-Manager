import cv2
import numpy as np

path = "/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/media_1787604505752.png"
img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)

# Take a vertical slice down the middle of the first card (x=100 to 150)
slice_x = img[:, 100:150]
row_sums = np.sum(slice_x, axis=1)

kernel = np.ones(5)/5
smoothed = np.convolve(row_sums, kernel, mode='same')
thresh = (smoothed > np.max(smoothed) * 0.2).astype(int)

diff = np.diff(thresh)
starts = np.where(diff == 1)[0]
ends = np.where(diff == -1)[0]

print("Y Starts:", starts)
print("Y Ends:", ends)

real_starts = []
real_ends = []

for s in starts:
    valid_ends = ends[ends > s]
    if len(valid_ends) > 0:
        e = valid_ends[0]
        if e - s > 100:
            if len(real_starts) == 0 or s - real_starts[-1] > 50:
                real_starts.append(s)
                real_ends.append(e)

print("Real Y Starts:", real_starts)
print("Real Y Ends:", real_ends)
