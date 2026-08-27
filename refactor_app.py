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

# 4. Replace Disk Info Header
old_disk_info = r'<div className="glass-panel px-6 py-4 rounded-xl border border-slate-700 flex items-center gap-4">.*?</div>\s*</div>'
new_disk_info = '<HolographicDisk diskInfo={diskInfo} t={t} />\n        </div>'
app = re.sub(old_disk_info, new_disk_info, app, flags=re.DOTALL)

# 5. Replace mapped Game Cards
old_grid_regex = r'\{files\.map\(\(file\) => \{\s*const meta = metadata\[file\.ppsa \|\| \'\'\];\s*return \(\s*<motion\.div[\s\S]*?className="p-4 flex-1 flex flex-col justify-between relative bg-slate-900/60"[\s\S]*?</motion\.div>\s*\);\s*\}\)\}'
new_grid = """{files.map((file) => {
              const meta = metadata[file.ppsa || ''];
              return (
                <GameCard 
                  key={file.path} 
                  file={file} 
                  meta={meta} 
                  t={t} 
                  onDelete={handleDelete} 
                  onRename={submitRename} 
                  onChangeCover={handleChangeCover} 
                />
              );
            })}"""
app = re.sub(old_grid_regex, new_grid, app)

# 6. Inject Hacker Console
app = app.replace("export default function App() {", "export default function App() {")
app = app.replace("</AnimatePresence>\n    </div>\n  );\n}", "</AnimatePresence>\n      <HackerConsole logs={logs} />\n    </div>\n  );\n}")

# 7. Add log calls
app = app.replace("setIsLoading(true);", "setIsLoading(true);\n    playScanSound();\n    addLog(`[INFO] Scanning directory: ${dir}`);")
app = app.replace("setFiles(mappedFiles);", "setFiles(mappedFiles);\n      addLog(`[SUCCESS] Found ${items.length} items`);")
app = app.replace("setTransferActive(false);", "setTransferActive(false);\n      playSuccessSound();\n      addLog(`[SUCCESS] Transfer completed`);")

with open("src/App.tsx", "w") as f:
    f.write(app)

print("App.tsx refactored for V2 UI.")
