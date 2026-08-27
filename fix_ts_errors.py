import re

with open("src/App.tsx", "r") as f:
    app = f.read()

# Remove unused imports
app = re.sub(r'HardDrive,\s*', '', app)
app = re.sub(r'Trash2,\s*', '', app)
app = re.sub(r'Edit2,\s*', '', app)
app = re.sub(r'Image as ImageIcon,\s*', '', app)

# Fix parameter types
app = app.replace("onRename={(ppsa, defaultTitle) => openRenameModal(ppsa, defaultTitle)}", 
                  "onRename={(ppsa: string, defaultTitle: string) => openRenameModal(ppsa, defaultTitle)}")

with open("src/App.tsx", "w") as f:
    f.write(app)

print("TS errors fixed.")
