with open("src/App.tsx", "r") as f:
    app = f.read()

# Add is_dir to interface
app = app.replace("size_bytes?: number;", "size_bytes?: number;\n  is_dir?: boolean;")

# Re-add formatBytes function at the top level
format_bytes_fn = """
function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

"""
app = app.replace("export default function App() {", format_bytes_fn + "export default function App() {")


# Inject folder size fetching after setFiles(result);
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
app = app.replace("      setFiles(result);", folder_size_code)


# Compute total size and display it next to ITEMS
total_size_code = """          <span className="text-xs text-slate-500 font-mono bg-slate-900 px-2 py-1 rounded-md border border-slate-800">
            {files.length} ITEMS • {formatBytes(files.reduce((acc, f) => acc + (f.size_bytes || 0), 0))}
          </span>"""

app = app.replace("""          <span className="text-xs text-slate-500 font-mono bg-slate-900 px-2 py-1 rounded-md border border-slate-800">
            {files.length} ITEMS
          </span>""", total_size_code)

with open("src/App.tsx", "w") as f:
    f.write(app)

print("Added async folder size and total size indicator.")
