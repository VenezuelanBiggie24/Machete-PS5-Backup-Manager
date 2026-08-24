from PIL import Image, ImageDraw

def round_corners(image_path, output_path, radius):
    # Open the image and convert to RGBA
    img = Image.open(image_path).convert("RGBA")
    
    # Create a mask with the same size
    mask = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(mask)
    
    # Draw a rounded rectangle on the mask
    draw.rounded_rectangle((0, 0, img.size[0], img.size[1]), radius=radius, fill=255)
    
    # Create a transparent image to place the masked result
    output = Image.new("RGBA", img.size, (0, 0, 0, 0))
    output.paste(img, (0, 0), mask)
    
    # Save as PNG to preserve transparency
    output.save(output_path, "PNG")

# For macOS icons, the squircle radius is typically ~22.5% of the width
# 1024 * 0.225 = 230
round_corners("src/assets/logo.jpg", "src/assets/logo_rounded.png", 230)
