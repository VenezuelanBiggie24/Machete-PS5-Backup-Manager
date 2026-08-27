with open("src/App.tsx", "r") as f:
    lines = f.readlines()

# 1. Add imports at line 14 (after react imports)
imports = """import { GameCard } from './components/GameCard';
import { HolographicDisk } from './components/HolographicDisk';
import { HackerConsole } from './components/HackerConsole';
import { playScanSound, playSuccessSound } from './utils/audio';\n"""
for i, line in enumerate(lines):
    if "import { motion, AnimatePresence } from 'framer-motion';" in line:
        lines.insert(i + 1, imports)
        break

# 2. Add logs state at line 110ish
for i, line in enumerate(lines):
    if "const [transferActive, setTransferActive] = useState(false);" in line:
        lines.insert(i + 1, "  const [logs, setLogs] = useState<string[]>([]);\n  const addLog = (msg: string) => setLogs(p => [...p, msg].slice(-50));\n")
        break

# 3. Add CRT overlay
for i, line in enumerate(lines):
    if '<div className="min-h-screen p-6 font-sans flex flex-col relative selection:bg-cyan-500/30">' in line:
        lines[i] = '<div className="min-h-screen p-6 font-sans flex flex-col relative selection:bg-cyan-500/30">\n      <div className="crt-overlay fixed inset-0"></div>\n'
        break

# 4. Replace Disk Info Bar (lines 387 to 411 roughly)
start_disk = -1
end_disk = -1
for i, line in enumerate(lines):
    if "{/* Disk Info Bar */}" in line:
        start_disk = i
    if start_disk != -1 and "      )}" in line and i > start_disk:
        end_disk = i
        break

if start_disk != -1 and end_disk != -1:
    new_disk = """      {/* Disk Info Bar */}
      <div className="mb-6 flex justify-between items-center z-10">
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
      </div>\n"""
    lines[start_disk:end_disk+1] = [new_disk]

# 5. Replace Grid mapping
start_grid = -1
end_grid = -1
for i, line in enumerate(lines):
    if "{files.map((file) => {" in line:
        start_grid = i
    if start_grid != -1 and "            })}" in line:
        end_grid = i
        break

if start_grid != -1 and end_grid != -1:
    new_grid = """            {files.map((file) => {
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
            })}\n"""
    lines[start_grid:end_grid+1] = [new_grid]

# 6. Inject Hacker Console
for i in range(len(lines)-1, -1, -1):
    if "</AnimatePresence>" in lines[i]:
        lines.insert(i + 1, "      <HackerConsole logs={logs} />\n")
        break

# 7. Add log calls
for i, line in enumerate(lines):
    if "setIsLoading(true);" in line:
        lines[i] = '      setIsLoading(true);\n      playScanSound();\n      addLog(`[INFO] Scanning directory: ${dir}`);\n'
    if "setFiles(mappedFiles);" in line:
        lines[i] = '      setFiles(mappedFiles);\n      addLog(`[SUCCESS] Found ${items.length} items`);\n'
    if "setTransferActive(false);" in line:
        lines[i] = '      setTransferActive(false);\n      playSuccessSound();\n      addLog(`[SUCCESS] Transfer completed`);\n'

with open("src/App.tsx", "w") as f:
    f.writelines(lines)

print("App.tsx refactored with python line-by-line.")
