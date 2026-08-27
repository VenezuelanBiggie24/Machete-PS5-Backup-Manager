import re

with open("src/App.tsx", "r") as f:
    app = f.read()

# 1. Update FileItem interface
app = app.replace(
    "interface FileItem {\n  name: string;\n  path: string;\n  ppsa: string | null;\n  size_bytes: number;\n}",
    "interface FileItem {\n  name: string;\n  path: string;\n  ppsa: string | null;\n  size_bytes: number;\n  is_dir: boolean;\n}"
)

# 2. In loadDirectory, after setFiles(mappedFiles), we want to fetch sizes for directories
old_load = """      const mappedFiles = items.map(item => ({
        ...item,
        ppsa: item.ppsa || extractPpsa(item.name)
      }));
      setFiles(mappedFiles);"""

new_load = """      const mappedFiles = items.map(item => ({
        ...item,
        ppsa: item.ppsa || extractPpsa(item.name)
      }));
      setFiles(mappedFiles);
      
      // Async fetch sizes for directories so UI doesn't block
      mappedFiles.filter(f => f.is_dir).forEach(async (dir) => {
        try {
          const size = await invoke<number>('get_folder_size', { path: dir.path });
          setFiles(prev => prev.map(f => f.path === dir.path ? { ...f, size_bytes: size } : f));
        } catch (e) {
          console.error("Failed to get size for", dir.path, e);
        }
      });"""
app = app.replace(old_load, new_load)

with open("src/App.tsx", "w") as f:
    f.write(app)

print("React fixed.")
