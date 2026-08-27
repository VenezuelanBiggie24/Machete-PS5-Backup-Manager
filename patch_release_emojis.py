import os

files = ["v1.0.0_notes.md", "v1.1.0_notes.md", "v1.2.0_notes.md"]

for file in files:
    if os.path.exists(file):
        with open(file, "r") as f:
            content = f.read()
        
        # Replace the flag
        content = content.replace("🇪🇸 **Español**", "🇻🇪 **Español**")
        
        with open(file, "w") as f:
            f.write(content)

print("Release notes patched.")
