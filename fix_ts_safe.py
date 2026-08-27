with open("src/App.tsx", "r") as f:
    app = f.read()

app = app.replace("HardDrive, ", "")
app = app.replace("Trash2, ", "")
app = app.replace("Edit2, ", "")
app = app.replace("Image as ImageIcon, ", "")

app = app.replace("onRename={(ppsa, defaultTitle) => openRenameModal(ppsa, defaultTitle)}", 
                  "onRename={(ppsa: string, defaultTitle: string) => openRenameModal(ppsa, defaultTitle)}")

app = app.replace("""function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}""", "")

with open("src/App.tsx", "w") as f:
    f.write(app)

print("Safely fixed TS.")
