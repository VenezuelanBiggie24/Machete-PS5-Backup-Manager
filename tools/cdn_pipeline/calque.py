from PIL import Image

img = Image.open("/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/media_1788155483063.jpg").convert("RGB")

# Exact coordinates of the genuine master white PS5 header
header_calque = img.crop((83, 78, 798, 170))
header_calque.save("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/ps5_calque_master.png")
print("✅ ps5_calque_master.png saved successfully! Size:", header_calque.size)
