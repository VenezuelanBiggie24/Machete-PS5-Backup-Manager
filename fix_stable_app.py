with open("src/App.tsx", "r") as f:
    app = f.read()

# Add is_dir to interface
if "is_dir?: boolean;" not in app:
    app = app.replace("size_bytes?: number;", "size_bytes?: number;\n  is_dir?: boolean;")

folder_size_code = """      setFiles(result);
      
      // Async folder size fetch
      result.forEach(async (file) => {
        if (file.is_dir) {
          try {
            const size = await invoke<number>('get_folder_size', { path: file.path });
            setFiles(prev => prev.map(f => f.path === file.path ? { ...f, size_bytes: size } : f));
          } catch (e) {
            console.error("Error getting folder size for", file.path, e);
          }
        }
      });
"""
if "Async folder size fetch" not in app:
    app = app.replace("      setFiles(result);", folder_size_code)

total_size_code = """          <span className="text-xs text-slate-500 font-mono bg-slate-900 px-2 py-1 rounded-md border border-slate-800">
            {files.length} ITEMS • {formatBytes(files.reduce((acc, f) => acc + (f.size_bytes || 0), 0))}
          </span>"""
app = app.replace("""          <span className="text-xs text-slate-500 font-mono bg-slate-900 px-2 py-1 rounded-md border border-slate-800">
            {files.length} ITEMS
          </span>""", total_size_code)

with open("src/App.tsx", "w") as f:
    f.write(app)

print("Stable App.tsx patched.")
