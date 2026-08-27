import re

def update_readme(file_path, new_feature_text):
    with open(file_path, "r") as f:
        content = f.read()

    # Find the Key Features section and insert the new feature at the top
    # We will look for "### ⚙️ Key Features:" or "### ⚙️ Características Principales:"
    
    if "Key Features:" in content:
        target = "### ⚙️ Key Features:\n"
    elif "Características Principales:" in content:
        target = "### ⚙️ Características Principales:\n"
    else:
        return
        
    content = content.replace(target, target + new_feature_text)
    
    # Also update the version in the title if it exists
    content = content.replace("v1.1.0", "v1.2.0")

    with open(file_path, "w") as f:
        f.write(content)

update_readme("README.md", "* 📥 **Drag & Drop Transfers:** Drop files or folders directly into the app to transfer them to your backup drive. Features a beautiful Cyberpunk progress UI with real-time ETA and speed calculation.\n")
update_readme("README_es.md", "* 📥 **Transferencias Drag & Drop:** Suelta archivos o carpetas directamente en la app para copiarlos a tu disco de respaldo. Cuenta con una hermosa interfaz Cyberpunk de progreso con cálculo de ETA y velocidad en tiempo real.\n")
update_readme("/Users/thebigmike/.gemini/antigravity/brain/87e018b7-3ba5-4e01-ac9d-e51efca97571/forum_launch_post.md", "* 📥 **Drag & Drop Transfers:** Drop files or folders directly into the app to transfer them to your backup drive. Features a beautiful Cyberpunk progress UI with real-time ETA and speed calculation.\n")

print("READMEs updated.")
