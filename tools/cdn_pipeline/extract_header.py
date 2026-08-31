from PIL import Image

img = Image.open("/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/media_1788155061321.png")
print("Screenshot size:", img.size)

# The box art is visible on the left side of the eneba screenshot.
# Let's crop the exact box art and header!
# Find the white box header boundary
box_crop = img.crop((70, 160, 445, 650))
box_crop.save("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/eneba_box_crop.png")

# Now crop the exact header bar from the box art
header_crop = img.crop((70, 160, 445, 238))
header_crop.save("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/ps5_real_header_template.png")
print("Header template extracted successfully!")
