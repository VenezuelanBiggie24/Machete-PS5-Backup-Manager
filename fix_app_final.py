import re

with open("src/App.tsx", "r") as f:
    app = f.read()

# 1. Imports
imports = """import { GameCard } from './components/GameCard';
import { HolographicDisk } from './components/HolographicDisk';
import { HackerConsole } from './components/HackerConsole';
import { playScanSound, playSuccessSound } from './utils/audio';\n"""
app = app.replace("import { motion, AnimatePresence } from 'framer-motion';", "import { motion, AnimatePresence } from 'framer-motion';\n" + imports)

# 2. Add logs state
app = app.replace(
    "const [transferActive, setTransferActive] = useState(false);",
    "const [transferActive, setTransferActive] = useState(false);\n  const [logs, setLogs] = useState<string[]>([]);\n  const addLog = (msg: string) => setLogs(p => [...p, msg].slice(-50));"
)

# 3. Add CRT overlay to main wrapper
app = app.replace(
    '<div className="min-h-screen p-6 font-sans flex flex-col relative selection:bg-cyan-500/30">',
    '<div className="min-h-screen p-6 font-sans flex flex-col relative selection:bg-cyan-500/30">\n      <div className="crt-overlay fixed inset-0"></div>'
)

# 4. Replace Disk Info Bar (lines 399-425)
disk_info_start = app.find("{/* Disk Info Bar */}")
disk_info_end = app.find("{/* Drop Zone */}")
if disk_info_start != -1 and disk_info_end != -1:
    new_disk = """{/* Disk Info Bar */}
      <div className="mb-6 flex justify-between items-center">
        <HolographicDisk diskInfo={diskInfo} t={t} />
        {currentDir && (
            <button 
              onClick={handleRefresh}
              className="p-3 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors flex items-center gap-2 border border-slate-700"
              title="Recargar Directorio"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
        )}
      </div>

      """
    app = app[:disk_info_start] + new_disk + app[disk_info_end:]

# 5. Replace Grid mapping (lines 435-494)
grid_start = app.find("{files.map((file) => {")
grid_end = app.find("</AnimatePresence>\n        </div>\n")
if grid_start != -1 and grid_end != -1:
    new_grid = """{files.map((file) => {
              const meta = file.ppsa ? metadata[file.ppsa] : null;
              return (
                <GameCard 
                  key={file.path} 
                  file={file} 
                  meta={meta} 
                  t={t} 
                  onDelete={handleDelete} 
                  onRename={(ppsa, defaultTitle) => openRenameModal(ppsa, defaultTitle)} 
                  onChangeCover={handleChangeCover} 
                />
              );
            })}
          """
    app = app[:grid_start] + new_grid + app[grid_end:]

# 6. Inject Hacker Console right before the last closing div of the app
app = re.sub(r'(</AnimatePresence>\s*</div>\s*\)\s*;\s*\})', r'</AnimatePresence>\n      <HackerConsole logs={logs} />\n    </div>\n  );\n}', app)

# 7. Add log calls
app = app.replace("setIsLoading(true);", "setIsLoading(true);\n    playScanSound();\n    addLog(`[INFO] Scanning directory: ${dir}`);")
app = app.replace("setFiles(mappedFiles);", "setFiles(mappedFiles);\n      addLog(`[SUCCESS] Found ${items.length} items`);")
app = app.replace("setTransferActive(false);", "setTransferActive(false);\n      playSuccessSound();\n      addLog(`[SUCCESS] Transfer completed`);")

with open("src/App.tsx", "w") as f:
    f.write(app)

print("App.tsx refactored beautifully.")
