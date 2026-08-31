from PIL import Image

img = Image.open("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/check_NMu5EEmFLFUsuzOW4jGw2KOj.png")
w, h = img.size

# In 16:9 key art (3840x2160), the iconic portrait of Chris Redfield is centered!
# Crop a vertical 3:4 rectangle from the center:
# Width: 1620, Height: 2160, centered at X = (3840 - 1620) // 2 = 1110
cropped = img.crop((1110, 0, 1110 + 1620, 2160))
cropped.save("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/re8_true_portrait.png")
print("Saved re8_true_portrait.png")
