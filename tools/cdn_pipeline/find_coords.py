from PIL import Image

img = Image.open("/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/.user_uploaded/media_1788155061321.png")
print("Dimensions:", img.size)

# The box art is on the left side.
# Let's crop the actual top of the box art:
# The white header bar is around X: 71 to 445, but Y was around 100 to 160!
# Let's crop a strip from Y=80 to Y=250 to locate it precisely!
test_strip = img.crop((70, 80, 450, 200))
test_strip.save("/Users/thebigmike/.gemini/antigravity/scratch/machete/tools/cdn_pipeline/test_strip.png")
print("Saved test_strip.png")
