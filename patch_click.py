import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# 1. Create a reusable transfer function
transfer_function = """  const startTransfer = async (payload: string[]) => {
    if (!currentDirRef.current) return;
    setTransferProgress({ percent: 0, current_file: "Starting...", speed_bytes_per_sec: 0, eta_seconds: 0 });
    try {
      await invoke('transfer_items', {
        sources: payload,
        targetDir: currentDirRef.current
      });
      setTransferProgress(null);
      loadDirectory(currentDirRef.current);
    } catch (e) {
      console.error(e);
      message("Error transfering files: " + String(e), { title: "Error", kind: 'error' });
      setTransferProgress(null);
    }
  };

  const handleDropzoneClick = async () => {
    try {
      const selected = await open({
        multiple: true,
      });
      if (selected && Array.isArray(selected) && selected.length > 0) {
        startTransfer(selected);
      } else if (selected && typeof selected === 'string') {
        startTransfer([selected]);
      }
    } catch (e) {
      console.error(e);
    }
  };
"""

# Insert it before handleSelectDirectory
content = content.replace("  const handleSelectDirectory = async () => {", transfer_function + "\n  const handleSelectDirectory = async () => {")


# 2. Update the tauri://file-drop listener to use startTransfer
old_drop_logic = """          setTransferProgress({ percent: 0, current_file: "Starting...", speed_bytes_per_sec: 0, eta_seconds: 0 });
          try {
            await invoke('transfer_items', {
              sources: payload,
              targetDir: currentDirRef.current
            });
            setTransferProgress(null);
            loadDirectory(currentDirRef.current);
          } catch (e) {
            console.error(e);
            message("Error transfering files: " + String(e), { title: "Error", kind: 'error' });
            setTransferProgress(null);
          }"""
content = content.replace(old_drop_logic, "          startTransfer(payload);")


# 3. Add onClick to the Drop Zone
old_dropzone = """<div className="mt-8 border-2 border-dashed border-cyan-500/50 rounded-xl p-12 flex flex-col items-center justify-center text-cyan-400/70 hover:bg-cyan-500/5 hover:border-cyan-400 transition-all cursor-pointer neon-border">"""
new_dropzone = """<div onClick={handleDropzoneClick} className="mt-8 border-2 border-dashed border-cyan-500/50 rounded-xl p-12 flex flex-col items-center justify-center text-cyan-400/70 hover:bg-cyan-500/5 hover:border-cyan-400 transition-all cursor-pointer neon-border">"""
content = content.replace(old_dropzone, new_dropzone)

# 4. Update translation string text (visually tell them they can click)
# We can't change the translation key dynamically here easily without parsing json, 
# but the text is t("drag_drop"). Let's add a subtext in the UI.
old_dropzone_text = """<span className="text-xl font-bold">{t("drag_drop")}</span>"""
new_dropzone_text = """<span className="text-xl font-bold">{t("drag_drop")}</span>
          <span className="text-sm mt-2 text-cyan-500/60 font-mono">...or click here to open Finder</span>"""
content = content.replace(old_dropzone_text, new_dropzone_text)


with open("src/App.tsx", "w") as f:
    f.write(content)

print("App.tsx Dropzone click patched.")
