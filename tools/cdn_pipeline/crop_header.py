from PIL import Image

img = Image.open("/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/media_1788155061321.png")

# Let's find the exact bounds of the white header
# Coordinates of the white header box on the left:
# X: 71 to 445 (width ~374)
# Y: 160 to 238 (height ~78)
header = img.crop((71, 160, 445, 238))
header.save("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/ps5_real_header_template.png")
print("Header saved:", header.size)
